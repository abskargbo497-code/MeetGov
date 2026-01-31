/**
 * Personal Meeting Routes
 * 
 * Routes for authenticated personal users to manage their meetings
 */

import express from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import {
  createMeeting,
  listMeetings,
  getMeeting,
  updateMeeting,
  deleteMeeting,
  resendInvites,
  getMeetingStats,
} from '../controllers/personal-meeting.controller';

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

/**
 * @route   POST /api/personal/meetings
 * @desc    Create a new meeting
 * @access  Authenticated personal users
 */
router.post('/', createMeeting);

/**
 * @route   GET /api/personal/meetings/stats
 * @desc    Get meeting statistics for dashboard
 * @access  Authenticated personal users
 */
router.get('/stats', getMeetingStats);

/**
 * @route   GET /api/personal/meetings
 * @desc    List all meetings for the authenticated user
 * @access  Authenticated personal users
 */
router.get('/', listMeetings);

/**
 * @route   GET /api/personal/meetings/:meetingId
 * @desc    Get meeting details by ID
 * @access  Authenticated personal users (owner only)
 */
router.get('/:meetingId', getMeeting);

/**
 * @route   PUT /api/personal/meetings/:meetingId
 * @desc    Update a meeting
 * @access  Authenticated personal users (owner only)
 */
router.put('/:meetingId', updateMeeting);

/**
 * @route   DELETE /api/personal/meetings/:meetingId
 * @desc    Delete a meeting
 * @access  Authenticated personal users (owner only)
 */
router.delete('/:meetingId', deleteMeeting);

/**
 * @route   POST /api/personal/meetings/:meetingId/invite
 * @desc    Resend invites to participants
 * @access  Authenticated personal users (owner only)
 */
router.post('/:meetingId/invite', resendInvites);

export default router;
