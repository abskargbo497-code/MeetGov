/**
 * Live Transcription API Routes
 * Handles real-time audio streaming and transcription
 */

import express from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../utils/jwt.js';
import { allowOnlyAdminOrSecretary, allowMeetingParticipants } from '../utils/authorization.js';
import { asyncHandler, errorResponse, successResponse } from '../utils/helpers.js';
import { log } from '../utils/logger.js';
import Meeting from '../models/Meeting.js';
import Transcript from '../models/Transcript.js';
import {
  transcribeAudioChunk,
  generateRealtimeSummary,
  extractRealtimeActionItems,
} from '../services/liveTranscriptionService.js';
import { emitLiveTranscription } from '../services/socketService.js';
import { startMeeting, stopMeeting } from '../services/meetingStatusService.js';
import { generateAutoSummaryAndTickets } from '../services/autoSummaryService.js';

const router = express.Router();

// Store active transcriptions in memory (in production, use Redis or similar)
const activeTranscriptions = new Map();

/**
 * @route   POST /api/meetings/:id/live-transcription/start
 * @desc    Start live transcription for a meeting
 * @access  Private (super_admin, secretary)
 */
router.post(
  '/:id/live-transcription/start',
  authenticateToken,
  allowOnlyAdminOrSecretary,
  asyncHandler(async (req, res) => {
    const meetingId = parseInt(req.params.id);

    // Verify meeting exists
    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    // Auto-start meeting if it's still scheduled
    if (meeting.status === 'scheduled') {
      try {
        // startMeeting already saves the meeting to database, so use the returned instance
        meeting = await startMeeting(meetingId, req.user.userId);
        log.info('Meeting auto-started when live transcription began', { meetingId });
      } catch (error) {
        log.warn('Failed to auto-start meeting', { meetingId, error: error.message });
        // If auto-start fails, we should still allow transcription if meeting is in-progress
        // Reload meeting to get current status
        meeting = await Meeting.findByPk(meetingId);
      }
    }

    // Check if meeting can be transcribed
    if (meeting.status === 'completed' || meeting.status === 'cancelled') {
      return errorResponse(res, 400, 'Cannot start transcription for completed or cancelled meeting');
    }

    // Initialize or get existing transcript
    let transcript = await Transcript.findOne({ where: { meeting_id: meetingId } });
    if (!transcript) {
      transcript = await Transcript.create({
        meeting_id: meetingId,
        raw_text: '',
        processing_status: 'processing',
      });
      meeting.transcript_id = transcript.id;
      await meeting.save();
    }

    // Initialize active transcription session
    activeTranscriptions.set(meetingId, {
      transcriptId: transcript.id,
      accumulatedText: transcript.raw_text || '',
      startTime: Date.now(),
      lastUpdate: Date.now(),
    });

    log.info('Live transcription started', { meetingId, transcriptId: transcript.id });

    return successResponse(res, 200, {
      meetingId,
      transcriptId: transcript.id,
      status: 'started',
    }, 'Live transcription started');
  })
);

/**
 * @route   POST /api/meetings/:id/live-transcription/chunk
 * @desc    Process audio chunk for live transcription
 * @access  Private (super_admin, secretary)
 */
router.post(
  '/:id/live-transcription/chunk',
  authenticateToken,
  allowOnlyAdminOrSecretary,
  [
    body('audioData').notEmpty().withMessage('Audio data is required'),
    body('mimeType').optional().isString(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 400, 'Validation failed', errors.array());
    }

    const meetingId = parseInt(req.params.id);
    const { audioData, mimeType = 'audio/webm' } = req.body;

    // Check if live transcription is active
    const activeSession = activeTranscriptions.get(meetingId);
    if (!activeSession) {
      return errorResponse(res, 400, 'Live transcription not started. Please start transcription first.');
    }

    try {
      // Validate audio data
      if (!audioData || audioData.length === 0) {
        log.warn('Empty audio data received', { meetingId });
        return successResponse(res, 200, {
          transcribed: '',
          message: 'Empty audio chunk received',
        });
      }

      // Convert base64 audio data to buffer
      let audioBuffer;
      try {
        audioBuffer = Buffer.from(audioData, 'base64');
        if (audioBuffer.length === 0) {
          log.warn('Empty audio buffer after conversion', { meetingId });
          return successResponse(res, 200, {
            transcribed: '',
            message: 'Invalid audio data',
          });
        }
      } catch (bufferError) {
        log.error('Error converting base64 to buffer', {
          meetingId,
          error: bufferError.message,
        });
        return errorResponse(res, 400, 'Invalid audio data format');
      }

      log.debug('Processing audio chunk', {
        meetingId,
        bufferSize: audioBuffer.length,
        mimeType,
      });

      // Transcribe audio chunk
      const transcribedText = await transcribeAudioChunk(audioBuffer, mimeType);

      if (transcribedText && transcribedText.trim()) {
        const timestamp = new Date();
        // Accumulate transcript with timestamp
        activeSession.accumulatedText += ' ' + transcribedText;
        activeSession.lastUpdate = Date.now();

        // Update transcript in database (async, don't wait)
        Transcript.update(
          { 
            raw_text: activeSession.accumulatedText,
            updated_at: timestamp,
          },
          { where: { id: activeSession.transcriptId } }
        ).catch((err) => {
          log.error('Error updating transcript', { error: err.message });
        });

        // Generate real-time summary every 30 seconds or when significant text is added
        const timeSinceLastSummary = Date.now() - (activeSession.lastSummaryTime || 0);
        let summary = null;

        if (timeSinceLastSummary > 30000 || activeSession.accumulatedText.length > 1000) {
          try {
            summary = await generateRealtimeSummary(
              activeSession.accumulatedText,
              (await Meeting.findByPk(meetingId))?.title || 'Meeting'
            );
            activeSession.lastSummaryTime = Date.now();
          } catch (err) {
            log.error('Error generating real-time summary', { error: err.message });
          }
        }

        // Emit live transcription to all meeting participants via WebSocket
        emitLiveTranscription(meetingId, transcribedText, summary);

        log.debug('Audio chunk transcribed successfully', {
          meetingId,
          chunkLength: transcribedText.length,
          totalLength: activeSession.accumulatedText.length,
        });

        return successResponse(res, 200, {
          transcribed: transcribedText,
          summary,
          accumulatedLength: activeSession.accumulatedText.length,
        }, 'Audio chunk transcribed successfully');
      } else {
        log.debug('No speech detected in audio chunk', { meetingId });
        return successResponse(res, 200, {
          transcribed: '',
          message: 'No speech detected in audio chunk',
        });
      }
    } catch (error) {
      log.error('Error transcribing audio chunk', {
        meetingId,
        error: error.message,
        stack: error.stack,
      });
      return errorResponse(res, 500, `Transcription failed: ${error.message}`);
    }
  })
);

/**
 * @route   POST /api/meetings/:id/live-transcription/stop
 * @desc    Stop live transcription and generate final summary
 * @access  Private (super_admin, secretary)
 */
router.post(
  '/:id/live-transcription/stop',
  authenticateToken,
  allowOnlyAdminOrSecretary,
  asyncHandler(async (req, res) => {
    const meetingId = parseInt(req.params.id);

    // Check if live transcription is active
    const activeSession = activeTranscriptions.get(meetingId);
    if (!activeSession) {
      return errorResponse(res, 400, 'Live transcription not active');
    }

    try {
      // Get transcript
      const transcript = await Transcript.findByPk(activeSession.transcriptId);
      if (!transcript) {
        return errorResponse(res, 404, 'Transcript not found');
      }

      // Update final transcript
      transcript.raw_text = activeSession.accumulatedText;
      transcript.processing_status = 'completed';
      await transcript.save();

      // Remove active session
      activeTranscriptions.delete(meetingId);

      // Auto-stop meeting if it's still in-progress
      const updatedMeeting = await Meeting.findByPk(meetingId);
      if (updatedMeeting && updatedMeeting.status === 'in-progress') {
        try {
          await stopMeeting(meetingId, req.user.userId);
          
          // Trigger auto-summary and ticket generation
          try {
            await generateAutoSummaryAndTickets(meetingId);
          } catch (error) {
            log.error('Failed to generate auto-summary after transcription stop', {
              meetingId,
              error: error.message,
            });
          }
          
          log.info('Meeting auto-stopped when live transcription ended', { meetingId });
        } catch (error) {
          log.warn('Failed to auto-stop meeting', { meetingId, error: error.message });
        }
      }

      log.info('Live transcription stopped', {
        meetingId,
        transcriptId: transcript.id,
        finalLength: activeSession.accumulatedText.length,
      });

      return successResponse(res, 200, {
        meetingId,
        transcriptId: transcript.id,
        finalLength: activeSession.accumulatedText.length,
        status: 'stopped',
      }, 'Live transcription stopped and saved. Meeting completed and summary generated.');
    } catch (error) {
      log.error('Error stopping live transcription', {
        meetingId,
        error: error.message,
      });
      return errorResponse(res, 500, `Failed to stop transcription: ${error.message}`);
    }
  })
);

/**
 * @route   GET /api/meetings/:id/live-transcription/status
 * @desc    Get live transcription status
 * @access  Private (meeting participants)
 */
router.get(
  '/:id/live-transcription/status',
  authenticateToken,
  allowMeetingParticipants,
  asyncHandler(async (req, res) => {
    const meetingId = parseInt(req.params.id);

    const activeSession = activeTranscriptions.get(meetingId);
    const transcript = await Transcript.findOne({ where: { meeting_id: meetingId } });

    return successResponse(res, 200, {
      isActive: !!activeSession,
      transcriptId: transcript?.id || null,
      accumulatedLength: activeSession?.accumulatedText.length || 0,
      startTime: activeSession?.startTime || null,
      lastUpdate: activeSession?.lastUpdate || null,
    });
  })
);

export default router;

