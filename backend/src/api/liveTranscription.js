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

    // Allow transcription for in-progress and scheduled meetings
    // Also allow for completed meetings if they want to add transcription later
    if (meeting.status === 'cancelled') {
      return errorResponse(res, 400, 'Cannot start transcription for cancelled meeting');
    }
    
    // If meeting is completed, log a warning but allow transcription
    if (meeting.status === 'completed') {
      log.warn('Starting transcription for completed meeting', { meetingId });
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
    const { audioData, mimeType = 'audio/webm', isTranscriptionChunk = false } = req.body;

    // Check if live transcription is active, if not, auto-start it
    let activeSession = activeTranscriptions.get(meetingId);
    if (!activeSession) {
      log.info('No active session found, auto-starting transcription', { meetingId });
      
      // Verify meeting exists
      const meeting = await Meeting.findByPk(meetingId);
      if (!meeting) {
        return errorResponse(res, 404, 'Meeting not found');
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
      activeSession = {
        transcriptId: transcript.id,
        accumulatedText: transcript.raw_text || '',
        startTime: Date.now(),
        lastUpdate: Date.now(),
        audioChunks: [], // Store all audio chunks for saving complete file
      };
      activeTranscriptions.set(meetingId, activeSession);
      log.info('Auto-started transcription session', { meetingId, transcriptId: transcript.id });
    }
    
    // Always save audio chunk to session for complete file
    if (!activeSession.audioChunks) {
      activeSession.audioChunks = [];
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
        
        // Save audio chunk to session for complete file
        activeSession.audioChunks.push(audioBuffer);
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
        isTranscriptionChunk,
      });

      // Only transcribe if this is a 2-minute chunk (isTranscriptionChunk = true)
      let transcribedText = '';
      if (isTranscriptionChunk) {
        try {
          transcribedText = await transcribeAudioChunk(audioBuffer, mimeType);
          log.info('Transcribed 2-minute audio chunk', {
            meetingId,
            transcribedLength: transcribedText.length,
          });
        } catch (transcriptionError) {
          log.error('Transcription service error', {
            meetingId,
            error: transcriptionError.message,
          });
          // Continue with empty transcription - don't fail the request
          transcribedText = '';
        }
      } else {
        log.debug('Skipping transcription for non-transcription chunk', { meetingId });
      }

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

        // Note: Live transcription WebSocket updates are disabled
        // Transcription is only sent in 2-minute chunks or when recording stops
        // No real-time streaming updates

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

/**
 * @route   POST /api/meetings/:id/live-transcription/save-audio
 * @desc    Save complete audio file from live recording
 * @access  Private (super_admin, secretary)
 */
router.post(
  '/:id/live-transcription/save-audio',
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

    try {
      // Verify meeting exists
      const meeting = await Meeting.findByPk(meetingId);
      if (!meeting) {
        return errorResponse(res, 404, 'Meeting not found');
      }

      // Convert base64 to buffer
      const audioBuffer = Buffer.from(audioData, 'base64');
      
      // Determine file extension
      let fileExtension = 'webm';
      if (mimeType.includes('ogg')) {
        fileExtension = 'ogg';
      } else if (mimeType.includes('mp3') || mimeType.includes('mpeg')) {
        fileExtension = 'mp3';
      } else if (mimeType.includes('wav')) {
        fileExtension = 'wav';
      }

      // Save audio file
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const { dirname } = await import('path');
      
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const uploadsDir = path.join(__dirname, '../../uploads/audio');
      
      // Create meeting-specific directory
      const meetingDir = path.join(uploadsDir, `meeting-${meetingId}`);
      if (!fs.existsSync(meetingDir)) {
        fs.mkdirSync(meetingDir, { recursive: true });
      }

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `recording-${timestamp}.${fileExtension}`;
      const filePath = path.join(meetingDir, filename);

      // Write file
      fs.writeFileSync(filePath, audioBuffer);
      
      // Get relative path for database
      const projectRoot = path.join(__dirname, '../..');
      const relativePath = path.relative(projectRoot, filePath);

      // Update meeting with audio file path
      meeting.audio_file_path = relativePath;
      await meeting.save();

      log.info('Audio file saved', {
        meetingId,
        filePath: relativePath,
        fileSize: audioBuffer.length,
      });

      return successResponse(res, 200, {
        meetingId,
        audioFilePath: relativePath,
        fileSize: audioBuffer.length,
      }, 'Audio file saved successfully');
    } catch (error) {
      log.error('Error saving audio file', {
        meetingId,
        error: error.message,
      });
      return errorResponse(res, 500, `Failed to save audio file: ${error.message}`);
    }
  })
);

/**
 * @route   GET /api/meetings/:id/audio/list
 * @desc    List all audio files for a meeting
 * @access  Private (meeting participants)
 */
router.get(
  '/:id/audio/list',
  authenticateToken,
  allowMeetingParticipants,
  asyncHandler(async (req, res) => {
    const meetingId = parseInt(req.params.id);

    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    try {
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const { dirname } = await import('path');
      
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const uploadsDir = path.join(__dirname, '../../uploads/audio');
      const meetingDir = path.join(uploadsDir, `meeting-${meetingId}`);

      const audioFiles = [];

      if (fs.existsSync(meetingDir)) {
        const files = fs.readdirSync(meetingDir);
        
        for (const file of files) {
          const filePath = path.join(meetingDir, file);
          const stats = fs.statSync(filePath);
          
          // Only include audio files
          if (stats.isFile() && /\.(webm|ogg|mp3|wav|m4a)$/i.test(file)) {
            const projectRoot = path.join(__dirname, '../..');
            const relativePath = path.relative(projectRoot, filePath);
            
            audioFiles.push({
              filename: file,
              path: relativePath,
              size: stats.size,
              createdAt: stats.birthtime,
              modifiedAt: stats.mtime,
              url: `/api/meetings/${meetingId}/audio/${encodeURIComponent(file)}`,
            });
          }
        }
        
        // Sort by creation time (newest first)
        audioFiles.sort((a, b) => b.createdAt - a.createdAt);
      }

      return successResponse(res, 200, {
        meetingId,
        audioFiles,
        count: audioFiles.length,
      });
    } catch (error) {
      log.error('Error listing audio files', {
        meetingId,
        error: error.message,
      });
      return errorResponse(res, 500, `Failed to list audio files: ${error.message}`);
    }
  })
);

/**
 * @route   GET /api/meetings/:id/audio/:filename
 * @desc    Get a specific audio file for a meeting
 * @access  Private (meeting participants)
 */
router.get(
  '/:id/audio/:filename',
  authenticateToken,
  allowMeetingParticipants,
  asyncHandler(async (req, res) => {
    const meetingId = parseInt(req.params.id);
    const filename = decodeURIComponent(req.params.filename);

    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    try {
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const { dirname } = await import('path');
      
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const uploadsDir = path.join(__dirname, '../../uploads/audio');
      const meetingDir = path.join(uploadsDir, `meeting-${meetingId}`);
      const audioFilePath = path.join(meetingDir, filename);

      // Security: Ensure file is within meeting directory
      if (!audioFilePath.startsWith(meetingDir)) {
        return errorResponse(res, 403, 'Invalid file path');
      }

      if (!fs.existsSync(audioFilePath)) {
        return errorResponse(res, 404, 'Audio file not found');
      }

      // Determine content type
      const ext = path.extname(audioFilePath).toLowerCase();
      const contentTypeMap = {
        '.webm': 'audio/webm',
        '.ogg': 'audio/ogg',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
      };
      const contentType = contentTypeMap[ext] || 'audio/webm';

      // Send file
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      const fileBuffer = fs.readFileSync(audioFilePath);
      res.send(fileBuffer);
    } catch (error) {
      log.error('Error serving audio file', {
        meetingId,
        filename,
        error: error.message,
      });
      return errorResponse(res, 500, `Failed to serve audio file: ${error.message}`);
    }
  })
);

/**
 * @route   GET /api/meetings/:id/audio
 * @desc    Get the latest audio file for a meeting (backward compatibility)
 * @access  Private (meeting participants)
 */
router.get(
  '/:id/audio',
  authenticateToken,
  allowMeetingParticipants,
  asyncHandler(async (req, res) => {
    const meetingId = parseInt(req.params.id);

    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    try {
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const { dirname } = await import('path');
      
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const uploadsDir = path.join(__dirname, '../../uploads/audio');
      const meetingDir = path.join(uploadsDir, `meeting-${meetingId}`);

      let audioFilePath = null;

      // Try to get from meeting.audio_file_path first
      if (meeting.audio_file_path) {
        const projectRoot = path.join(__dirname, '../..');
        audioFilePath = path.resolve(projectRoot, meeting.audio_file_path);
        
        if (!fs.existsSync(audioFilePath)) {
          audioFilePath = null;
        }
      }

      // If not found, get the latest file from meeting directory
      if (!audioFilePath && fs.existsSync(meetingDir)) {
        const files = fs.readdirSync(meetingDir)
          .filter(file => /\.(webm|ogg|mp3|wav|m4a)$/i.test(file))
          .map(file => {
            const filePath = path.join(meetingDir, file);
            return {
              file,
              path: filePath,
              stats: fs.statSync(filePath),
            };
          })
          .sort((a, b) => b.stats.mtime - a.stats.mtime);

        if (files.length > 0) {
          audioFilePath = files[0].path;
        }
      }

      if (!audioFilePath || !fs.existsSync(audioFilePath)) {
        return errorResponse(res, 404, 'Audio file not found for this meeting');
      }

      // Determine content type
      const ext = path.extname(audioFilePath).toLowerCase();
      const contentTypeMap = {
        '.webm': 'audio/webm',
        '.ogg': 'audio/ogg',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
      };
      const contentType = contentTypeMap[ext] || 'audio/webm';

      // Send file
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(audioFilePath)}"`);
      
      const fileBuffer = fs.readFileSync(audioFilePath);
      res.send(fileBuffer);
    } catch (error) {
      log.error('Error serving audio file', {
        meetingId,
        error: error.message,
      });
      return errorResponse(res, 500, `Failed to serve audio file: ${error.message}`);
    }
  })
);

/**
 * @route   POST /api/meetings/:id/audio/:filename/transcribe
 * @desc    Transcribe an existing audio file
 * @access  Private (super_admin, secretary)
 */
router.post(
  '/:id/audio/:filename/transcribe',
  authenticateToken,
  allowOnlyAdminOrSecretary,
  asyncHandler(async (req, res) => {
    const meetingId = parseInt(req.params.id);
    const filename = decodeURIComponent(req.params.filename);

    try {
      // Verify meeting exists
      const meeting = await Meeting.findByPk(meetingId);
      if (!meeting) {
        return errorResponse(res, 404, 'Meeting not found');
      }

      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const { dirname } = await import('path');
      
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const uploadsDir = path.join(__dirname, '../../uploads/audio');
      const meetingDir = path.join(uploadsDir, `meeting-${meetingId}`);
      const audioFilePath = path.join(meetingDir, filename);

      // Security: Ensure file is within meeting directory
      if (!audioFilePath.startsWith(meetingDir)) {
        return errorResponse(res, 403, 'Invalid file path');
      }

      if (!fs.existsSync(audioFilePath)) {
        return errorResponse(res, 404, 'Audio file not found');
      }

      // Read audio file
      const audioBuffer = fs.readFileSync(audioFilePath);
      const fileStats = fs.statSync(audioFilePath);
      
      // Validate file size
      if (audioBuffer.length === 0) {
        log.error('Audio file is empty', { meetingId, filename });
        return errorResponse(res, 400, 'Audio file is empty');
      }
      
      // Log file details for debugging
      log.info('Audio file details', {
        meetingId,
        filename,
        fileSize: audioBuffer.length,
        fileSizeMB: (audioBuffer.length / (1024 * 1024)).toFixed(2),
        fileStats: {
          size: fileStats.size,
          created: fileStats.birthtime,
          modified: fileStats.mtime,
        },
      });
      
      // Determine mime type from extension
      const ext = path.extname(audioFilePath).toLowerCase();
      const mimeTypeMap = {
        '.webm': 'audio/webm',
        '.ogg': 'audio/ogg',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
      };
      const mimeType = mimeTypeMap[ext] || 'audio/webm';

      log.info('Transcribing audio file', {
        meetingId,
        filename,
        fileSize: audioBuffer.length,
        fileSizeMB: (audioBuffer.length / (1024 * 1024)).toFixed(2),
        mimeType,
        extension: ext,
      });

      // Transcribe the audio file
      const { transcribeAudioChunk } = await import('../services/liveTranscriptionService.js');
      
      let transcribedText;
      try {
        transcribedText = await transcribeAudioChunk(audioBuffer, mimeType);
        
        log.info('Transcription service returned', {
          meetingId,
          filename,
          hasText: !!transcribedText,
          textLength: transcribedText?.length || 0,
          textPreview: transcribedText?.substring(0, 100) || 'empty',
        });
      } catch (transcriptionError) {
        log.error('Transcription service threw an error', {
          meetingId,
          filename,
          error: transcriptionError.message,
          stack: transcriptionError.stack,
        });
        return errorResponse(res, 500, `Transcription service error: ${transcriptionError.message}`);
      }

      if (!transcribedText || transcribedText.trim() === '') {
        log.warn('Transcription returned empty result', {
          meetingId,
          filename,
          fileSize: audioBuffer.length,
          mimeType,
        });
        return errorResponse(res, 400, 'No transcription generated. The audio file may be empty or contain no speech. Please check the backend logs for more details.');
      }

      // Get or create transcript
      let transcript = await Transcript.findOne({ where: { meeting_id: meetingId } });
      if (!transcript) {
        transcript = await Transcript.create({
          meeting_id: meetingId,
          raw_text: transcribedText,
          processing_status: 'completed',
        });
        meeting.transcript_id = transcript.id;
        await meeting.save();
      } else {
        // Append to existing transcript
        transcript.raw_text = (transcript.raw_text || '') + '\n\n' + transcribedText;
        transcript.processing_status = 'completed';
        await transcript.save();
      }

      log.info('Audio file transcribed successfully', {
        meetingId,
        filename,
        transcribedLength: transcribedText.length,
        transcriptId: transcript.id,
      });

      return successResponse(res, 200, {
        meetingId,
        filename,
        transcriptId: transcript.id,
        transcribedText,
        transcriptLength: transcribedText.length,
      }, 'Audio file transcribed successfully');
    } catch (error) {
      log.error('Error transcribing audio file', {
        meetingId,
        filename,
        error: error.message,
        stack: error.stack,
      });
      return errorResponse(res, 500, `Failed to transcribe audio file: ${error.message}`);
    }
  })
);

export default router;

