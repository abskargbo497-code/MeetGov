import express from 'express';
import { 
  createMeeting, 
  getMeeting, 
  joinMeeting, 
  checkInToMeeting,
  startMeeting,
  pauseMeeting,
  resumeMeeting,
  endMeeting,
  getMeetingState,
  getMeetingByAccessCode,
  getMeetingProcessingStatus,
  sendParticipantInvites
} from '../controllers/meeting.controller';
import { getAttendance } from '../controllers/attendance.controller';

const router = express.Router();

/**
 * @route   POST /meetings
 * @desc    Create a new meeting
 * @access  Public (guest users)
 */
router.post('/', createMeeting);

/**
 * @route   GET /meetings/:meetingId
 * @desc    Get meeting details by ID
 * @access  Public
 */
router.get('/:meetingId', getMeeting);

/**
 * @route   POST /meetings/:meetingId/join
 * @desc    Join an existing meeting
 * @access  Public
 */
router.post('/:meetingId/join', joinMeeting);

/**
 * @route   POST /meetings/:meetingId/check-in
 * @desc    Check in to a meeting via QR code
 * @access  Public (no auth required)
 */
router.post('/:meetingId/check-in', checkInToMeeting);

/**
 * @route   GET /meetings/:meetingId/attendance
 * @desc    Get attendance list for a meeting
 * @access  Public
 */
router.get('/:meetingId/attendance', getAttendance);

/**
 * @route   GET /meetings/:meetingId/state
 * @desc    Get current meeting state (for frontend sync)
 * @access  Public
 */
router.get('/:meetingId/state', getMeetingState);

/**
 * @route   POST /meetings/:meetingId/start
 * @desc    Start meeting recording
 * @access  Owner only
 */
router.post('/:meetingId/start', startMeeting);

/**
 * @route   POST /meetings/:meetingId/pause
 * @desc    Pause meeting recording
 * @access  Owner only
 */
router.post('/:meetingId/pause', pauseMeeting);

/**
 * @route   POST /meetings/:meetingId/resume
 * @desc    Resume paused meeting recording
 * @access  Owner only
 */
router.post('/:meetingId/resume', resumeMeeting);

/**
 * @route   POST /meetings/:meetingId/end
 * @desc    End meeting
 * @access  Owner only
 */
router.post('/:meetingId/end', endMeeting);

/**
 * @route   GET /meetings/access/:accessCode
 * @desc    Resolve meeting by access code (single source of truth for routing)
 * @access  Public
 */
router.get('/access/:accessCode', getMeetingByAccessCode);

/**
 * @route   GET /meetings/:meetingId/processing-status
 * @desc    Get meeting processing status for polling
 * @access  Public
 */
router.get('/:meetingId/processing-status', getMeetingProcessingStatus);

/**
 * @route   POST /meetings/:meetingId/send-invites
 * @desc    Send participant invite emails
 * @access  Owner only
 */
router.post('/:meetingId/send-invites', sendParticipantInvites);

/**
 * @route   POST /meetings/:meetingId/retry-transcription
 * @desc    Retry failed transcription job
 * @access  Owner only
 */
router.post('/:meetingId/retry-transcription', async (req, res) => {
  const { meetingId } = req.params;
  const { enqueueTranscriptionJob } = await import('../queues/processing.queue');
  const { PrismaClient } = await import('@prisma/client');
  const Logger = (await import('../logger')).default;
  
  const prisma = new PrismaClient();
  
  try {
    // Get the meeting and latest recording
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        recordings: {
          orderBy: { uploadedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    if (meeting.processingStatus !== 'FAILED') {
      res.status(400).json({ error: 'Meeting is not in failed state' });
      return;
    }

    const recording = meeting.recordings[0];
    if (!recording) {
      res.status(400).json({ error: 'No recording found for this meeting' });
      return;
    }

    // Reset processing status
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        processingStatus: 'PROCESSING',
        processingError: null,
      },
    });

    await prisma.recording.update({
      where: { id: recording.id },
      data: { processingStatus: 'PROCESSING' },
    });

    // Re-queue transcription job
    const jobId = await enqueueTranscriptionJob(meetingId, recording.id, recording.fileUrl);

    Logger.info(`[RetryTranscription] Re-queued transcription job ${jobId} for meeting ${meetingId}`);

    res.status(200).json({
      success: true,
      meetingId,
      jobId,
      message: 'Transcription job re-queued successfully',
    });
  } catch (error) {
    Logger.error('[RetryTranscription] Error retrying transcription:', error);
    res.status(500).json({ error: 'Failed to retry transcription' });
  }
});

export default router;
