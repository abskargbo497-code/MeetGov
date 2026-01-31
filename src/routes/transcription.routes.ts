/**
 * Transcription Routes
 * 
 * Routes for manual transcription control (user-initiated)
 */

import express from 'express';
import {
  startTranscription,
  getTranscriptionStatus,
  retryTranscription
} from '../controllers/transcription.controller';

const router = express.Router();

/**
 * @route   POST /meetings/:meetingId/transcription/start
 * @desc    Start transcription for a meeting (USER-INITIATED)
 * @access  Owner only
 */
router.post('/meetings/:meetingId/transcription/start', startTranscription);

/**
 * @route   GET /meetings/:meetingId/transcription/status
 * @desc    Get transcription status for a meeting
 * @access  Public
 */
router.get('/meetings/:meetingId/transcription/status', getTranscriptionStatus);

/**
 * @route   POST /meetings/:meetingId/transcription/retry
 * @desc    Retry failed transcription
 * @access  Owner only
 */
router.post('/meetings/:meetingId/transcription/retry', retryTranscription);

export default router;
