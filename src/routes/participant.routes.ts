/**
 * Participant Routes
 * 
 * Routes for authenticated participants to interact with meetings
 * Participants are non-organizer users who join via invite/access code
 */

import express from 'express';
import { requireAuth, optionalAuth } from '../middlewares/auth.middleware';
import {
  getMeetingJoinInfo,
  joinMeeting,
  checkIn,
  getAttendance,
  getMyTasks,
  submitTask,
  getUploadUrl,
  completeUpload,
  getMyStatus,
} from '../controllers/participant.controller';

const router = express.Router();

/**
 * @route   GET /api/participant/meetings/:meetingId/join
 * @desc    Get meeting info for join page (public - for displaying meeting info)
 * @access  Public
 */
router.get('/meetings/:meetingId/join', getMeetingJoinInfo);

/**
 * @route   POST /api/participant/meetings/:meetingId/join
 * @desc    Join a meeting as authenticated participant
 * @access  Authenticated
 */
router.post('/meetings/:meetingId/join', requireAuth, joinMeeting);

/**
 * @route   POST /api/participant/meetings/:meetingId/attendance
 * @desc    Check in to a meeting (attendance)
 * @access  Authenticated
 */
router.post('/meetings/:meetingId/attendance', requireAuth, checkIn);

/**
 * @route   GET /api/participant/meetings/:meetingId/attendance
 * @desc    Get attendance list for a meeting
 * @access  Authenticated (participant or owner)
 */
router.get('/meetings/:meetingId/attendance', requireAuth, getAttendance);

/**
 * @route   GET /api/participant/meetings/:meetingId/my-status
 * @desc    Get current user's status in the meeting
 * @access  Authenticated
 */
router.get('/meetings/:meetingId/my-status', requireAuth, getMyStatus);

/**
 * @route   GET /api/participant/meetings/:meetingId/tasks/me
 * @desc    Get tasks assigned to the current participant
 * @access  Authenticated (participant only)
 */
router.get('/meetings/:meetingId/tasks/me', requireAuth, getMyTasks);

/**
 * @route   POST /api/participant/tasks/:taskId/submit
 * @desc    Submit a task (without file)
 * @access  Authenticated (assigned participant only)
 */
router.post('/tasks/:taskId/submit', requireAuth, submitTask);

/**
 * @route   POST /api/participant/tasks/:taskId/upload-url
 * @desc    Get presigned URL for file upload
 * @access  Authenticated (assigned participant only)
 */
router.post('/tasks/:taskId/upload-url', requireAuth, getUploadUrl);

/**
 * @route   POST /api/participant/tasks/:taskId/upload-complete
 * @desc    Complete file upload and attach to task submission
 * @access  Authenticated (assigned participant only)
 */
router.post('/tasks/:taskId/upload-complete', requireAuth, completeUpload);

export default router;
