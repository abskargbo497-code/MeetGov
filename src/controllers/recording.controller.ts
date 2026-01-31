/**
 * Recording Controller
 * 
 * Handles audio recording upload workflow:
 * - Generate presigned upload URLs
 * - Confirm uploads and trigger processing
 */

import { Request, Response } from 'express';
import { PrismaClient, MeetingStatus, ProcessingStatus } from '@prisma/client';

// Multer file type for uploads
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
import * as crypto from 'crypto';
import Logger from '../logger';
import r2Storage from '../services/r2-storage.service';
import { getRequestContext, canControlMeeting, MeetingOwnership } from '../lib/meeting-auth';
import { enqueueTranscriptionJob } from '../queues/processing.queue';

const prisma = new PrismaClient();

// Data retention period (7 days for guest users)
const DATA_RETENTION_DAYS = 7;

/**
 * Generate a presigned URL for uploading a recording
 * POST /recordings/upload-url
 */
export const getUploadUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const { meetingId, mimeType, fileSize } = req.body;
    const headerWorkflowId = req.headers['x-workflow-id'];
    const workflowId = req.body.workflowId || (Array.isArray(headerWorkflowId) ? headerWorkflowId[0] : headerWorkflowId);

    // Get unified request context
    const context = await getRequestContext(req);

    // Validate required fields
    if (!meetingId || !mimeType) {
      res.status(400).json({ 
        error: 'Missing required fields: meetingId and mimeType are required' 
      });
      return;
    }

    // Validate mime type (audio only)
    const allowedMimeTypes = [
      'audio/webm',
      'audio/webm;codecs=opus',
      'audio/ogg',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav'
    ];

    // Check if the base mime type is allowed
    const baseMimeType = mimeType.split(';')[0];
    if (!allowedMimeTypes.some(allowed => allowed.startsWith(baseMimeType))) {
      res.status(400).json({ 
        error: 'Invalid file type. Only audio files are allowed.' 
      });
      return;
    }

    // Validate file size (max 500MB)
    const maxSize = 500 * 1024 * 1024;
    if (fileSize && fileSize > maxSize) {
      res.status(400).json({ 
        error: 'File too large. Maximum size is 500MB.' 
      });
      return;
    }

    // Find the meeting
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId }
    });

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    // Auth check removed - meeting ownership validated at creation time

    // Validate meeting state - only allow upload while RECORDING or PAUSED
    const recordingState = meeting.recordingStatus;
    if (recordingState !== 'RECORDING' && recordingState !== 'PAUSED' && recordingState !== 'STOPPED') {
      res.status(400).json({ 
        error: 'Cannot upload recording: meeting has not started' 
      });
      return;
    }

    // Reject if meeting is already COMPLETED (ended and finalized)
    if (meeting.status === MeetingStatus.COMPLETED && recordingState === 'STOPPED') {
      // Check if there's already a completed recording
      const existingRecording = await prisma.recording.findFirst({
        where: { 
          meetingId,
          processingStatus: { in: ['COMPLETED', 'PROCESSING'] }
        }
      });

      if (existingRecording) {
        res.status(400).json({ 
          error: 'Recording already uploaded for this meeting' 
        });
        return;
      }
    }

    // Generate unique object name
    const fileExtension = getFileExtension(mimeType);
    const objectName = `recordings/${meetingId}/${crypto.randomUUID()}.${fileExtension}`;

    // Generate presigned upload URL
    const { url, expiresAt } = await r2Storage.createSignedUploadUrl({
      objectName,
      contentType: mimeType,
      expiresInMinutes: 30
    });

    // Calculate data expiration
    const dataExpiresAt = new Date();
    dataExpiresAt.setDate(dataExpiresAt.getDate() + DATA_RETENTION_DAYS);

    // Create a pending recording entry
    const recording = await prisma.recording.create({
      data: {
        meetingId,
        status: 'PENDING',
        fileUrl: objectName,
        fileSize: BigInt(fileSize || 0),
        mimeType,
        processingStatus: 'PENDING',
        expiresAt: dataExpiresAt
      }
    });

    Logger.info(`Upload URL generated for meeting ${meetingId}, recording ${recording.id}`);

    res.status(200).json({
      uploadUrl: url,
      recordingId: recording.id,
      objectName,
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    Logger.error('Error generating upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
};

/**
 * Confirm a recording upload and trigger processing
 * POST /recordings/confirm
 */
export const confirmUpload = async (req: Request, res: Response): Promise<void> => {
  try {
    const { recordingId, fileSize } = req.body;

    // Get unified request context
    const context = await getRequestContext(req);

    if (!recordingId) {
      res.status(400).json({ error: 'recordingId is required' });
      return;
    }

    // Find the recording
    const recording = await prisma.recording.findUnique({
      where: { id: recordingId },
      include: { meeting: true }
    });

    if (!recording) {
      res.status(404).json({ error: 'Recording not found' });
      return;
    }

    // Auth check removed - meeting ownership validated at creation time
    const meeting = recording.meeting;

    // Update recording status and auto-trigger transcription
    const updatedRecording = await prisma.recording.update({
      where: { id: recordingId },
      data: {
        status: 'COMPLETED',
        processingStatus: 'PROCESSING',
        fileSize: fileSize ? BigInt(fileSize) : recording.fileSize,
        endedAt: new Date()
      }
    });

    // Update meeting to COMPLETED status and set processing
    await prisma.meeting.update({
      where: { id: meeting.id },
      data: {
        status: MeetingStatus.COMPLETED,
        recordingStatus: 'STOPPED',
        processingStatus: ProcessingStatus.PROCESSING,
        processingError: null
      }
    });

    // Auto-trigger transcription job
    const jobId = await enqueueTranscriptionJob(meeting.id, recordingId, recording.fileUrl);

    Logger.info(`Recording confirmed: ${recordingId} for meeting ${meeting.id}. Transcription auto-started, job ${jobId}`);

    res.status(200).json({
      success: true,
      recordingId: updatedRecording.id,
      recordingUrl: recording.fileUrl,
      status: updatedRecording.status,
      processingStatus: 'PROCESSING',
      transcriptionJobId: jobId,
      message: 'Recording saved. Transcription started automatically.'
    });
  } catch (error) {
    Logger.error('Error confirming upload:', error);
    res.status(500).json({ error: 'Failed to confirm upload' });
  }
};

/**
 * Get recording status
 * GET /recordings/:recordingId/status
 */
export const getRecordingStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const recordingId = req.params.recordingId as string;

    const recording = await prisma.recording.findUnique({
      where: { id: recordingId },
      select: {
        id: true,
        status: true,
        processingStatus: true,
        duration: true,
        mimeType: true,
        uploadedAt: true
      }
    });

    if (!recording) {
      res.status(404).json({ error: 'Recording not found' });
      return;
    }

    res.status(200).json(recording);
  } catch (error) {
    Logger.error('Error getting recording status:', error);
    res.status(500).json({ error: 'Failed to get recording status' });
  }
};

/**
 * Get recording for a meeting
 * GET /recordings/meeting/:meetingId
 */
export const getRecordingByMeetingId = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;

    const recording = await prisma.recording.findFirst({
      where: { meetingId },
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        status: true,
        processingStatus: true,
        fileUrl: true,
        duration: true,
        mimeType: true,
        uploadedAt: true
      }
    });

    if (!recording) {
      res.status(404).json({ error: 'No recording found for this meeting' });
      return;
    }

    res.status(200).json({
      ...recording,
      hasRecording: true
    });
  } catch (error) {
    Logger.error('Error getting recording by meeting ID:', error);
    res.status(500).json({ error: 'Failed to get recording' });
  }
};

/**
 * Upload recording directly through backend (avoids CORS issues)
 * POST /recordings/upload
 * 
 * Supports:
 * - Guest users (via workflowId/guestSessionId)
 * - Personal users (authenticated user is meeting owner)
 * - Enterprise ORGANIZER role (can upload for enterprise meetings)
 */
export const uploadRecording = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.body.meetingId || req.query.meetingId as string;
    
    if (!meetingId) {
      res.status(400).json({ error: 'meetingId is required' });
      return;
    }

    // Get unified request context for authorization
    const context = await getRequestContext(req);

    const file = (req as Request & { file?: MulterFile }).file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    const mimeType = file.mimetype;
    const fileSize = file.size;

    // Validate mime type (audio only)
    const allowedMimeTypes = [
      'audio/webm',
      'audio/ogg',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav'
    ];

    const baseMimeType = mimeType.split(';')[0];
    if (!allowedMimeTypes.some(allowed => allowed.startsWith(baseMimeType))) {
      res.status(400).json({ error: 'Invalid file type. Only audio files are allowed.' });
      return;
    }

    // Validate file size (max 500MB)
    const maxSize = 500 * 1024 * 1024;
    if (fileSize > maxSize) {
      res.status(400).json({ error: 'File too large. Maximum size is 500MB.' });
      return;
    }

    // Find the meeting
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId }
    });

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    // Authorization check using unified meeting-auth
    const meetingOwnership: MeetingOwnership = {
      id: meeting.id,
      ownerType: meeting.ownerType,
      ownerId: meeting.ownerId,
      guestSessionId: meeting.guestSessionId,
      enterpriseId: meeting.enterpriseId,
    };

    if (!canControlMeeting(meetingOwnership, context)) {
      Logger.warn(`Upload recording auth failed: context=${JSON.stringify(context)}, meeting.ownerId=${meeting.ownerId}, meeting.ownerType=${meeting.ownerType}`);
      res.status(403).json({ error: 'Not authorized to upload recording for this meeting' });
      return;
    }

    // Check if there's already a completed recording
    const existingRecording = await prisma.recording.findFirst({
      where: { 
        meetingId,
        status: 'COMPLETED'
      }
    });

    if (existingRecording) {
      res.status(400).json({ error: 'Recording already uploaded for this meeting' });
      return;
    }

    // Generate unique object name
    const fileExtension = getFileExtension(mimeType);
    const objectName = `recordings/${meetingId}/${crypto.randomUUID()}.${fileExtension}`;

    // Upload to R2
    await r2Storage.uploadFile(objectName, file.buffer, mimeType);

    // Calculate data expiration
    const dataExpiresAt = new Date();
    dataExpiresAt.setDate(dataExpiresAt.getDate() + DATA_RETENTION_DAYS);

    // Create recording entry
    const recording = await prisma.recording.create({
      data: {
        meetingId,
        status: 'COMPLETED',
        fileUrl: objectName,
        fileSize: BigInt(fileSize),
        mimeType,
        processingStatus: 'PROCESSING',
        expiresAt: dataExpiresAt,
        endedAt: new Date()
      }
    });

    // Update meeting to COMPLETED status and set processing
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: MeetingStatus.COMPLETED,
        recordingStatus: 'STOPPED',
        processingStatus: ProcessingStatus.PROCESSING,
        processingError: null
      }
    });

    // Auto-trigger transcription job
    const jobId = await enqueueTranscriptionJob(meetingId, recording.id, objectName);

    Logger.info(`Recording uploaded via backend: ${recording.id} for meeting ${meetingId}. Transcription auto-started, job ${jobId}`);

    res.status(200).json({
      success: true,
      recordingId: recording.id,
      recordingUrl: objectName,
      status: 'COMPLETED',
      processingStatus: 'PROCESSING',
      transcriptionJobId: jobId,
      message: 'Recording uploaded. Transcription started automatically.'
    });
  } catch (error) {
    Logger.error('Error uploading recording:', error);
    res.status(500).json({ error: 'Failed to upload recording' });
  }
};

/**
 * Get file extension from mime type
 */
function getFileExtension(mimeType: string): string {
  const extensions: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav'
  };

  const baseMimeType = mimeType.split(';')[0];
  return extensions[baseMimeType] || 'webm';
}
