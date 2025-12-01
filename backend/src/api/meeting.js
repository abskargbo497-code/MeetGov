import express from 'express';
import { body, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import Meeting from '../models/Meeting.js';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import Transcript from '../models/Transcript.js';
import { generateQRCode, generateQRToken } from '../services/qrService.js';
import { asyncHandler, errorResponse, successResponse } from '../utils/helpers.js';
import { log } from '../utils/logger.js';

const router = express.Router();

/**
 * @route   POST /api/meetings
 * @desc    Create a new meeting
 * @access  Private (admin, secretary)
 */
router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('Meeting title is required'),
    body('datetime').isISO8601().withMessage('Valid datetime is required'),
    body('location').optional().trim(),
    body('description').optional().trim(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 400, 'Validation failed', errors.array());
    }

    const { title, datetime, location, description } = req.body;

    // Generate QR token and code
    const qrToken = generateQRToken();
    const qrCodeUrl = await generateQRCode(req.user.userId, qrToken);

    // Create meeting
    const meeting = await Meeting.create({
      title,
      datetime: new Date(datetime),
      location,
      description,
      organizer_id: req.user.userId,
      qr_code_token: qrToken,
      qr_code_url: qrCodeUrl,
    });

    log.info('Meeting created successfully', { meetingId: meeting.id, organizerId: req.user.userId });

    return successResponse(res, 201, {
      meeting,
      qrCodeUrl,
    }, 'Meeting created successfully');
  })
);

/**
 * @route   GET /api/meetings
 * @desc    Get all meetings
 * @access  Private
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, organizer_id } = req.query;
    const where = {};

    if (status) {
      where.status = status;
    }

    if (organizer_id) {
      where.organizer_id = organizer_id;
    }

    const meetings = await Meeting.findAll({
      where,
      include: [{
        model: User,
        as: 'organizer',
        attributes: ['id', 'name', 'email'],
      }],
      order: [['datetime', 'DESC']],
    });

    return successResponse(res, 200, { meetings });
  })
);

/**
 * @route   GET /api/meetings/:id
 * @desc    Get meeting by ID
 * @access  Private
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const meeting = await Meeting.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'organizer',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: Transcript,
          as: 'transcript',
        },
      ],
    });

    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    return successResponse(res, 200, { meeting });
  })
);

/**
 * @route   GET /api/meetings/:id/qr
 * @desc    Get meeting QR code
 * @access  Private
 */
router.get(
  '/:id/qr',
  asyncHandler(async (req, res) => {
    const meeting = await Meeting.findByPk(req.params.id);

    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    // Regenerate QR code if needed
    if (!meeting.qr_code_url) {
      const qrCodeUrl = await generateQRCode(meeting.id, meeting.qr_code_token);
      meeting.qr_code_url = qrCodeUrl;
      await meeting.save();
    }

    return successResponse(res, 200, {
      qrCodeUrl: meeting.qr_code_url,
      qrToken: meeting.qr_code_token,
    });
  })
);

/**
 * @route   POST /api/meetings/:id/attendance
 * @desc    Log attendance for a meeting
 * @access  Private
 */
router.post(
  '/:id/attendance',
  [
    body('qrToken').optional().trim(),
    body('location').optional().trim(),
  ],
  asyncHandler(async (req, res) => {
    const { qrToken, location } = req.body;
    const meetingId = parseInt(req.params.id);

    // Find meeting
    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    // Verify QR token if provided
    if (qrToken && qrToken !== meeting.qr_code_token) {
      return errorResponse(res, 401, 'Invalid QR token');
    }

    // Check if attendance already exists
    const existingAttendance = await Attendance.findOne({
      where: {
        meeting_id: meetingId,
        user_id: req.user.userId,
      },
    });

    if (existingAttendance) {
      return errorResponse(res, 400, 'Attendance already logged');
    }

    // Determine if user is late
    const isLate = new Date() > new Date(meeting.datetime);
    const status = isLate ? 'late' : 'present';

    // Create attendance record
    const attendance = await Attendance.create({
      meeting_id: meetingId,
      user_id: req.user.userId,
      location,
      check_in_method: qrToken ? 'qr' : 'manual',
      status,
    });

    log.info('Attendance logged successfully', {
      meetingId,
      userId: req.user.userId,
      status,
    });

    return successResponse(res, 201, { attendance }, 'Attendance logged successfully');
  })
);

/**
 * @route   GET /api/meetings/:id/attendance
 * @desc    Get attendance list for a meeting
 * @access  Private
 */
router.get(
  '/:id/attendance',
  asyncHandler(async (req, res) => {
    const meetingId = parseInt(req.params.id);

    const attendance = await Attendance.findAll({
      where: { meeting_id: meetingId },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email', 'role', 'department'],
      }],
      order: [['timestamp', 'DESC']],
    });

    return successResponse(res, 200, { attendance });
  })
);

/**
 * @route   PUT /api/meetings/:id
 * @desc    Update meeting
 * @access  Private (admin, secretary, organizer)
 */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const meeting = await Meeting.findByPk(req.params.id);

    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    // Check permissions
    if (req.user.role !== 'admin' && req.user.role !== 'secretary' && 
        meeting.organizer_id !== req.user.userId) {
      return errorResponse(res, 403, 'Insufficient permissions');
    }

    const { title, datetime, location, description, status } = req.body;

    if (title) meeting.title = title;
    if (datetime) meeting.datetime = new Date(datetime);
    if (location !== undefined) meeting.location = location;
    if (description !== undefined) meeting.description = description;
    if (status) meeting.status = status;

    await meeting.save();

    log.info('Meeting updated successfully', { meetingId: meeting.id });

    return successResponse(res, 200, { meeting }, 'Meeting updated successfully');
  })
);

export default router;
