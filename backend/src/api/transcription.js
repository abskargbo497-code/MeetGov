import express from 'express';
import multer from 'multer';
import Transcript from '../models/Transcript.js';
import Meeting from '../models/Meeting.js';
import { transcribeAudio } from '../services/whisperService.js';
import { summarizeTranscript, extractActionItems, formatMeetingMinutes } from '../services/minutesService.js';
import { asyncHandler, errorResponse, successResponse } from '../utils/helpers.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/webm'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
  },
});

/**
 * @route   POST /api/transcription/upload/:meetingId
 * @desc    Upload audio file and transcribe
 * @access  Private
 */
router.post(
  '/upload/:meetingId',
  upload.single('audio'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return errorResponse(res, 400, 'Audio file is required');
    }

    const meetingId = parseInt(req.params.meetingId);

    // Verify meeting exists
    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    // Check if transcript already exists
    let transcript = await Transcript.findOne({ where: { meeting_id: meetingId } });

    if (transcript) {
      transcript.processing_status = 'processing';
      await transcript.save();
    } else {
      transcript = await Transcript.create({
        meeting_id: meetingId,
        processing_status: 'processing',
        raw_text: '', // Temporary, will be updated
      });
    }

    try {
      // Pass file buffer directly to transcription service
      log.info('Starting transcription', { meetingId });
      const rawText = await transcribeAudio(req.file);

      // Update transcript
      transcript.raw_text = rawText;
      transcript.processing_status = 'completed';
      await transcript.save();

      // Update meeting with transcript reference
      meeting.transcript_id = transcript.id;
      await meeting.save();

      log.info('Transcription completed successfully', { meetingId, transcriptId: transcript.id });

      return successResponse(res, 200, {
        transcript: {
          id: transcript.id,
          meeting_id: meetingId,
          raw_text: rawText,
          processing_status: transcript.processing_status,
        },
      }, 'Audio transcribed successfully');
    } catch (error) {
      transcript.processing_status = 'failed';
      await transcript.save();

      log.error('Transcription failed', { meetingId, error: error.message });
      return errorResponse(res, 500, `Transcription failed: ${error.message}`);
    }
  })
);

/**
 * @route   POST /api/transcription/generate-minutes/:meetingId
 * @desc    Generate meeting minutes from transcript
 * @access  Private
 */
router.post(
  '/generate-minutes/:meetingId',
  asyncHandler(async (req, res) => {
    const meetingId = parseInt(req.params.meetingId);

    // Find meeting and transcript
    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    const transcript = await Transcript.findOne({ where: { meeting_id: meetingId } });
    if (!transcript || !transcript.raw_text) {
      return errorResponse(res, 404, 'Transcript not found or empty');
    }

    try {
      log.info('Generating meeting minutes', { meetingId });

      // Generate summary
      const summary = await summarizeTranscript(transcript.raw_text);

      // Extract action items
      const actionItems = await extractActionItems(transcript.raw_text);

      // Format meeting minutes
      const minutesFormatted = await formatMeetingMinutes(
        meeting,
        transcript.raw_text,
        summary,
        actionItems
      );

      // Update transcript
      transcript.summary_text = summary;
      transcript.action_items_json = actionItems;
      transcript.minutes_formatted = minutesFormatted;
      await transcript.save();

      log.info('Meeting minutes generated successfully', { meetingId });

      return successResponse(res, 200, {
        transcript: {
          id: transcript.id,
          summary: transcript.summary_text,
          actionItems: transcript.action_items_json,
          minutes: transcript.minutes_formatted,
        },
      }, 'Meeting minutes generated successfully');
    } catch (error) {
      log.error('Failed to generate meeting minutes', { meetingId, error: error.message });
      return errorResponse(res, 500, `Failed to generate minutes: ${error.message}`);
    }
  })
);

/**
 * @route   GET /api/transcription/:meetingId
 * @desc    Get transcript for a meeting
 * @access  Private
 */
router.get(
  '/:meetingId',
  asyncHandler(async (req, res) => {
    const meetingId = parseInt(req.params.meetingId);

    const transcript = await Transcript.findOne({ where: { meeting_id: meetingId } });

    if (!transcript) {
      return errorResponse(res, 404, 'Transcript not found');
    }

    return successResponse(res, 200, { transcript });
  })
);

export default router;
