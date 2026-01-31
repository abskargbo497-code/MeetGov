import express from 'express';
import { checkIn, getAttendance, getMeetingInfoForCheckIn } from '../controllers/attendance.controller';

const router = express.Router();

/**
 * @route   POST /attendance/check-in
 * @desc    Check in to a meeting (public, no auth required)
 * @access  Public
 */
router.post('/check-in', checkIn);

/**
 * @route   GET /attendance/meeting/:meetingId
 * @desc    Get meeting info for check-in page (public, minimal data)
 * @access  Public
 */
router.get('/meeting/:meetingId', getMeetingInfoForCheckIn);

export default router;

// Also export the getAttendance handler for use in meeting routes
export { getAttendance };
