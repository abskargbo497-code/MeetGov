/**
 * Transcription Controller
 * 
 * Handles manual transcription start and status endpoints.
 * Transcription is USER-INITIATED, not auto-triggered on recording end.
 * 
 * Supports:
 * - Personal users (meeting owner)
 * - Enterprise ORGANIZER role (can manage meetings)
 * - Enterprise ADMIN role (read-only access)
 */

import { Request, Response } from 'express';
import { PrismaClient, MeetingStatus, ProcessingStatus, EnterpriseRole, OwnerType } from '@prisma/client';
import Logger from '../logger';
import { enqueueTranscriptionJob } from '../queues/processing.queue';
import { getRequestContext, canControlMeeting, canViewMeeting, MeetingOwnership, RequestContext } from '../lib/meeting-auth';

const prisma = new PrismaClient();

/**
 * Helper to build MeetingOwnership from meeting record
 */
function buildMeetingOwnership(meeting: any): MeetingOwnership {
  return {
    id: meeting.id,
    ownerType: meeting.ownerType,
    ownerId: meeting.ownerId,
    guestSessionId: meeting.guestSessionId,
    enterpriseId: meeting.enterpriseId,
  };
}

/**
 * Start transcription for a meeting (USER-INITIATED)
 * POST /meetings/:meetingId/transcription/start
 * 
 * This is the ONLY way to start transcription - it is never auto-triggered.
 */
export const startTranscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;
    const context = await getRequestContext(req);

    // Find the meeting
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        recordings: {
          where: { status: 'COMPLETED' },
          orderBy: { uploadedAt: 'desc' },
          take: 1
        }
      }
    });

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    // Check authorization using unified auth
    const meetingOwnership = buildMeetingOwnership(meeting);
    
    // Enterprise ADMIN has read-only access - check role before canControlMeeting
    if (context.enterpriseRole === EnterpriseRole.ADMIN && 
        meeting.ownerType === OwnerType.ENTERPRISE &&
        context.enterpriseId === meeting.enterpriseId) {
      res.status(403).json({ error: 'Admin users have read-only access. Only meeting owners and organizers can start transcription.' });
      return;
    }
    
    if (!canControlMeeting(meetingOwnership, context)) {
      Logger.warn(`Start transcription auth failed: context=${JSON.stringify(context)}, meeting.ownerId=${meeting.ownerId}, meeting.ownerType=${meeting.ownerType}`);
      res.status(403).json({ error: 'Not authorized to start transcription for this meeting' });
      return;
    }

    // Check if meeting has a recording
    if (meeting.recordings.length === 0) {
      res.status(400).json({ 
        error: 'No recording found. Recording must be uploaded before starting transcription.',
        code: 'NO_RECORDING'
      });
      return;
    }

    const recording = meeting.recordings[0];

    // Check if transcription is already in progress or completed
    if (meeting.processingStatus === 'PROCESSING') {
      res.status(400).json({ 
        error: 'Transcription is already in progress',
        code: 'ALREADY_PROCESSING'
      });
      return;
    }

    // Check if transcript already exists
    const existingTranscript = await prisma.transcript.findFirst({
      where: { meetingId }
    });

    if (existingTranscript) {
      res.status(400).json({ 
        error: 'Transcript already exists for this meeting',
        code: 'TRANSCRIPT_EXISTS'
      });
      return;
    }

    // Update meeting status to PROCESSING
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        processingStatus: 'PROCESSING',
        processingError: null
      }
    });

    // Update recording processingStatus
    await prisma.recording.update({
      where: { id: recording.id },
      data: {
        processingStatus: 'PROCESSING'
      }
    });

    // Enqueue transcription job to BullMQ
    const jobId = await enqueueTranscriptionJob(meetingId, recording.id, recording.fileUrl);

    Logger.info(`Transcription started for meeting ${meetingId}, job ${jobId}`);

    res.status(202).json({
      success: true,
      meetingId,
      jobId,
      status: 'PROCESSING',
      message: 'Transcription started. This may take a few minutes.'
    });
  } catch (error) {
    Logger.error('Error starting transcription:', error);
    res.status(500).json({ error: 'Failed to start transcription' });
  }
};

/**
 * Get transcription status for a meeting
 * GET /meetings/:meetingId/transcription/status
 */
export const getTranscriptionStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        processingStatus: true,
        processingError: true,
        recordings: {
          select: {
            id: true,
            status: true,
            processingStatus: true
          },
          orderBy: { uploadedAt: 'desc' },
          take: 1
        }
      }
    });

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    // Check if transcript exists
    const transcript = await prisma.transcript.findFirst({
      where: { meetingId },
      select: { id: true, createdAt: true }
    });

    // Check segment count
    const segmentCount = await prisma.transcriptSegment.count({
      where: { meetingId }
    });

    const hasRecording = meeting.recordings.length > 0 && meeting.recordings[0].status === 'COMPLETED';

    res.status(200).json({
      meetingId,
      hasRecording,
      hasTranscript: !!transcript,
      transcriptId: transcript?.id || null,
      segmentCount,
      processingStatus: meeting.processingStatus,
      processingError: meeting.processingError,
      canStartTranscription: hasRecording && !transcript && meeting.processingStatus !== 'PROCESSING'
    });
  } catch (error) {
    Logger.error('Error getting transcription status:', error);
    res.status(500).json({ error: 'Failed to get transcription status' });
  }
};

/**
 * Retry failed transcription
 * POST /meetings/:meetingId/transcription/retry
 */
export const retryTranscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;
    const context = await getRequestContext(req);

    // Find the meeting
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        recordings: {
          where: { status: 'COMPLETED' },
          orderBy: { uploadedAt: 'desc' },
          take: 1
        }
      }
    });

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    // Check authorization using unified auth
    const meetingOwnership = buildMeetingOwnership(meeting);
    
    // Enterprise ADMIN has read-only access
    if (context.enterpriseRole === EnterpriseRole.ADMIN && 
        meeting.ownerType === OwnerType.ENTERPRISE &&
        context.enterpriseId === meeting.enterpriseId) {
      res.status(403).json({ error: 'Admin users have read-only access' });
      return;
    }
    
    if (!canControlMeeting(meetingOwnership, context)) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }

    // Can only retry if failed
    if (meeting.processingStatus !== 'FAILED') {
      res.status(400).json({ 
        error: 'Can only retry failed transcriptions',
        currentStatus: meeting.processingStatus
      });
      return;
    }

    if (meeting.recordings.length === 0) {
      res.status(400).json({ error: 'No recording found' });
      return;
    }

    const recording = meeting.recordings[0];

    // Clear any existing transcript data
    await prisma.transcriptSegment.deleteMany({ where: { meetingId } });
    await prisma.transcript.deleteMany({ where: { meetingId } });

    // Update statuses
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        processingStatus: 'PROCESSING',
        processingError: null
      }
    });

    await prisma.recording.update({
      where: { id: recording.id },
      data: { processingStatus: 'PROCESSING' }
    });

    // Enqueue new transcription job
    const jobId = await enqueueTranscriptionJob(meetingId, recording.id, recording.fileUrl);

    Logger.info(`Transcription retry started for meeting ${meetingId}, job ${jobId}`);

    res.status(202).json({
      success: true,
      meetingId,
      jobId,
      status: 'PROCESSING',
      message: 'Transcription retry started'
    });
  } catch (error) {
    Logger.error('Error retrying transcription:', error);
    res.status(500).json({ error: 'Failed to retry transcription' });
  }
};

export default {
  startTranscription,
  getTranscriptionStatus,
  retryTranscription
};
