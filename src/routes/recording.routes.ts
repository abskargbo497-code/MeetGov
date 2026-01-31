import express from 'express';
import multer from 'multer';
import { getUploadUrl, confirmUpload, getRecordingStatus, getRecordingByMeetingId, uploadRecording } from '../controllers/recording.controller';

const router = express.Router();

// Configure multer for memory storage (files stored in buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max
  },
});

/**
 * @route   POST /recordings/upload
 * @desc    Upload recording directly through backend (avoids CORS)
 * @access  Owner only
 */
router.post('/upload', upload.single('audio'), uploadRecording);

/**
 * @route   POST /recordings/upload-url
 * @desc    Generate a presigned URL for uploading a recording
 * @access  Owner only
 */
router.post('/upload-url', getUploadUrl);

/**
 * @route   POST /recordings/confirm
 * @desc    Confirm a recording upload (does NOT auto-start transcription)
 * @access  Owner only
 */
router.post('/confirm', confirmUpload);

/**
 * @route   GET /recordings/:recordingId/status
 * @desc    Get recording processing status
 * @access  Public
 */
router.get('/:recordingId/status', getRecordingStatus);

/**
 * @route   GET /recordings/meeting/:meetingId
 * @desc    Get recording for a meeting
 * @access  Public
 */
router.get('/meeting/:meetingId', getRecordingByMeetingId);

export default router;
