import express from 'express';
import Transcript from '../models/Transcript.js';
import Meeting from '../models/Meeting.js';
import { transcribeAudio } from '../services/whisperService.js';
import { 
  generateStructuredSummary, 
  summarizeTranscript, 
  extractActionItems, 
  formatMeetingMinutes 
} from '../services/minutesService.js';
import { 
  uploadAudio, 
  uploadAudioMemory, 
  getRelativeFilePath 
} from '../utils/fileStorage.js';
import { asyncHandler, errorResponse, successResponse } from '../utils/helpers.js';
import { authenticateToken } from '../utils/jwt.js';
import {
  allowOnlyAdminOrSecretary,
  allowMeetingParticipants,
} from '../utils/authorization.js';
import { log } from '../utils/logger.js';
import fs from 'fs/promises';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const router = express.Router();

/**
 * @route   POST /api/meetings/:id/audio
 * @desc    Upload audio file for a meeting (saves to disk)
 * @access  Private (administrator, secretary)
 */
router.post(
  '/:id/audio',
  authenticateToken,
  allowOnlyAdminOrSecretary,
  uploadAudio.single('audio'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return errorResponse(res, 400, 'Audio file is required');
    }

    const meetingId = parseInt(req.params.id);

    // Verify meeting exists
    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      // Delete uploaded file if meeting doesn't exist
      if (req.file.path) {
        try {
          unlinkSync(req.file.path);
        } catch (err) {
          log.error('Error deleting uploaded file:', err);
        }
      }
      return errorResponse(res, 404, 'Meeting not found');
    }

    // Save file path to meeting
    const relativePath = getRelativeFilePath(req.file.path);
    meeting.audio_file_path = relativePath;
    await meeting.save();

    log.info('Audio file uploaded successfully', { 
      meetingId, 
      filename: req.file.filename,
      filePath: relativePath 
    });

    return successResponse(res, 200, {
      meeting: {
        id: meeting.id,
        audio_file_path: relativePath,
        audio_file_name: req.file.filename,
        audio_file_size: req.file.size,
      },
    }, 'Audio file uploaded successfully');
  })
);

/**
 * @route   POST /api/transcription/upload/:meetingId
 * @desc    Upload audio file and transcribe (uses memory storage)
 * @access  Private (administrator, secretary)
 */
router.post(
  '/upload/:meetingId',
  authenticateToken,
  allowOnlyAdminOrSecretary,
  uploadAudioMemory.single('audio'),
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
 * @route   POST /api/meetings/:id/transcribe
 * @desc    Transcribe audio file for a meeting (requires audio to be uploaded first)
 * @access  Private (administrator, secretary)
 */
router.post(
  '/:id/transcribe',
  authenticateToken,
  allowOnlyAdminOrSecretary,
  asyncHandler(async (req, res) => {
    const meetingId = parseInt(req.params.id);

    // Verify meeting exists
    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    if (!meeting.audio_file_path) {
      return errorResponse(res, 400, 'No audio file uploaded for this meeting. Please upload audio first.');
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
        raw_text: '',
      });
    }

    try {
      // Read audio file from disk
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const projectRoot = path.join(__dirname, '../../..');
      const audioFilePath = path.resolve(projectRoot, meeting.audio_file_path);

      if (!existsSync(audioFilePath)) {
        throw new Error('Audio file not found on server');
      }

      // Create file-like object for Whisper API
      const fileBuffer = readFileSync(audioFilePath);
      const fileObj = {
        buffer: fileBuffer,
        originalname: path.basename(audioFilePath),
        mimetype: 'audio/mpeg', // Default, adjust if needed
      };

      log.info('Starting transcription', { meetingId, audioFilePath });
      const rawText = await transcribeAudio(fileObj);

      // Update transcript
      transcript.raw_text = rawText;
      transcript.processing_status = 'completed';
      transcript.audio_file_url = meeting.audio_file_path;
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
 * @route   POST /api/meetings/:id/summarize
 * @desc    Generate structured summary and meeting minutes using GPT-4o-mini
 * @access  Private
 */
router.post(
  '/:id/summarize',
  asyncHandler(async (req, res) => {
    const meetingId = parseInt(req.params.id);

    // Find meeting and transcript
    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    const transcript = await Transcript.findOne({ where: { meeting_id: meetingId } });
    if (!transcript || !transcript.raw_text) {
      return errorResponse(res, 404, 'Transcript not found or empty. Please transcribe the audio first.');
    }

    try {
      log.info('Generating structured meeting summary', { meetingId });

      // Generate structured summary using GPT-4o-mini
      const structuredSummary = await generateStructuredSummary(
        transcript.raw_text,
        meeting.title
      );

      // Extract action items (already included in structured summary, but keep for compatibility)
      let actionItems = structuredSummary.action_items || [];
      if (actionItems.length === 0) {
        // Fallback to separate extraction if not in structured summary
        actionItems = await extractActionItems(transcript.raw_text);
      }

      // Format meeting minutes
      const minutesFormatted = await formatMeetingMinutes(
        meeting,
        transcript.raw_text,
        structuredSummary,
        actionItems
      );

      // Update transcript with structured summary
      transcript.summary_text = structuredSummary.abstract; // Keep for backward compatibility
      transcript.summary_json = structuredSummary;
      transcript.action_items_json = actionItems;
      transcript.minutes_formatted = minutesFormatted;
      await transcript.save();

      log.info('Meeting summary generated successfully', { 
        meetingId,
        keyPoints: structuredSummary.key_points?.length || 0,
        decisions: structuredSummary.decisions?.length || 0,
        actionItems: actionItems.length 
      });

      return successResponse(res, 200, {
        summary: {
          abstract: structuredSummary.abstract,
          key_points: structuredSummary.key_points,
          decisions: structuredSummary.decisions,
          action_items: actionItems,
        },
        minutes: minutesFormatted,
      }, 'Meeting summary generated successfully');
    } catch (error) {
      log.error('Failed to generate meeting summary', { meetingId, error: error.message });
      return errorResponse(res, 500, `Failed to generate summary: ${error.message}`);
    }
  })
);

/**
 * @route   GET /api/meetings/:id/summary
 * @desc    Get meeting summary and minutes
 * @access  Private (participants can view their own meetings)
 */
router.get(
  '/:id/summary',
  authenticateToken,
  allowMeetingParticipants,
  asyncHandler(async (req, res) => {
    const meetingId = parseInt(req.params.id);

    // Find meeting and transcript
    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    const transcript = await Transcript.findOne({ where: { meeting_id: meetingId } });
    if (!transcript) {
      return errorResponse(res, 404, 'Transcript not found');
    }

    // Return structured summary if available, otherwise return legacy format
    if (transcript.summary_json) {
      return successResponse(res, 200, {
        summary: {
          abstract: transcript.summary_json.abstract || transcript.summary_text,
          key_points: transcript.summary_json.key_points || [],
          decisions: transcript.summary_json.decisions || [],
          action_items: transcript.action_items_json || [],
        },
        minutes: transcript.minutes_formatted,
        transcript_id: transcript.id,
      });
    } else if (transcript.summary_text || transcript.minutes_formatted) {
      // Legacy format support
      return successResponse(res, 200, {
        summary: {
          abstract: transcript.summary_text,
          action_items: transcript.action_items_json || [],
        },
        minutes: transcript.minutes_formatted,
        transcript_id: transcript.id,
      });
    } else {
      return errorResponse(res, 404, 'Summary not yet generated. Please generate summary first.');
    }
  })
);

/**
 * @route   POST /api/transcription/generate-minutes/:meetingId
 * @desc    Generate meeting minutes from transcript (legacy endpoint)
 * @access  Private
 * @deprecated Use POST /api/meetings/:id/summarize instead
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
      log.info('Generating meeting minutes (legacy endpoint)', { meetingId });

      // Generate summary
      const summary = await summarizeTranscript(transcript.raw_text);

      // Extract action items
      const actionItems = await extractActionItems(transcript.raw_text);

      // Format meeting minutes
      const minutesFormatted = await formatMeetingMinutes(
        meeting,
        transcript.raw_text,
        { abstract: summary, key_points: [], decisions: [], action_items: actionItems },
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
 * @route   GET /api/meetings/:id/transcript
 * @desc    Get raw transcript for a meeting
 * @access  Private (participants can view their own meetings)
 */
router.get(
  '/:id/transcript',
  authenticateToken,
  allowMeetingParticipants,
  asyncHandler(async (req, res) => {
    const meetingId = parseInt(req.params.id);

    const transcript = await Transcript.findOne({ where: { meeting_id: meetingId } });

    if (!transcript) {
      return errorResponse(res, 404, 'Transcript not found');
    }

    return successResponse(res, 200, { 
      transcript: {
        id: transcript.id,
        meeting_id: meetingId,
        raw_text: transcript.raw_text,
        processing_status: transcript.processing_status,
        created_at: transcript.created_at,
        updated_at: transcript.updated_at,
      }
    });
  })
);

/**
 * @route   GET /api/transcription/:meetingId
 * @desc    Get transcript for a meeting (legacy endpoint)
 * @access  Private (participants can view their own meetings)
 */
router.get(
  '/:meetingId',
  authenticateToken,
  allowMeetingParticipants,
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
