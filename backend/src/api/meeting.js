import express from 'express';
import { body, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import Meeting from '../models/Meeting.js';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import Transcript from '../models/Transcript.js';
import Task from '../models/Task.js';
import GuestInvite from '../models/GuestInvite.js';
import { generateQRCode, generateQRToken } from '../services/qrService.js';
import { sendGuestInvitation, sendMeetingSummary } from '../services/emailService.js';
import { emitAttendanceUpdate, emitMeetingStatusUpdate, emitTaskUpdate } from '../services/socketService.js';
import { asyncHandler, errorResponse, successResponse } from '../utils/helpers.js';
import { authenticateToken } from '../utils/jwt.js';
import {
  allowOnlyAdminOrSecretary,
  allowAuthenticatedUsers,
  allowMeetingParticipants,
  allowOrganizerOrAdmin,
} from '../utils/authorization.js';
import { log } from '../utils/logger.js';
import crypto from 'crypto';

const router = express.Router();

/**
 * @route   POST /api/meetings
 * @desc    Create a new meeting
 * @access  Private (super_admin, secretary)
 */
router.post(
  '/',
  authenticateToken,
  allowOnlyAdminOrSecretary,
  [
    body('title').trim().notEmpty().withMessage('Meeting title is required'),
    body('datetime').isISO8601().withMessage('Valid datetime is required'),
    body('location').optional().trim(),
    body('description').optional().trim(),
    body('participants').optional().isArray().withMessage('Participants must be an array'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 400, 'Validation failed', errors.array());
    }

    const { title, datetime, location, description, participants } = req.body;

    // Generate QR token and code
    const qrToken = generateQRToken();
    const qrCodeUrl = await generateQRCode(req.user.userId, qrToken);

    // Create meeting
    const meeting = await Meeting.create({
      title,
      datetime: new Date(datetime),
      location,
      description,
      participants: participants || [],
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
 * @note    Officials only see meetings they're participants of
 */
router.get(
  '/',
  authenticateToken,
  allowAuthenticatedUsers,
  asyncHandler(async (req, res) => {
    const { status, organizer_id } = req.query;
    const where = {};

    // Officials can only see meetings they're participants of
    if (req.user.role === 'official') {
      // Get meetings where user is organizer or participant
      const meetingsAsOrganizer = await Meeting.findAll({
        where: { organizer_id: req.user.userId },
        attributes: ['id'],
      });
      const meetingIds = meetingsAsOrganizer.map(m => m.id);

      // Get meetings where user has attendance
      const attendances = await Attendance.findAll({
        where: { user_id: req.user.userId },
        attributes: ['meeting_id'],
      });
      const attendanceMeetingIds = attendances.map(a => a.meeting_id);

      // Combine all meeting IDs user can access
      const accessibleMeetingIds = [...new Set([...meetingIds, ...attendanceMeetingIds])];

      if (accessibleMeetingIds.length === 0) {
        return successResponse(res, 200, { meetings: [] });
      }

      where.id = { [Op.in]: accessibleMeetingIds };
    } else {
      // Admin and Secretary can see all meetings
      if (status) {
        where.status = status;
      }

      if (organizer_id) {
        where.organizer_id = organizer_id;
      }
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
 * @access  Private (participants only for officials)
 */
router.get(
  '/:id',
  authenticateToken,
  allowMeetingParticipants,
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
 * @access  Private (super_admin, secretary)
 */
router.get(
  '/:id/qr',
  authenticateToken,
  allowOnlyAdminOrSecretary,
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
 * @desc    Log attendance for a meeting (own attendance only for officials)
 * @access  Private (all authenticated users)
 */
router.post(
  '/:id/attendance',
  authenticateToken,
  allowAuthenticatedUsers,
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

    // Fetch attendance with user details for WebSocket emission
    const attendanceWithUser = await Attendance.findByPk(attendance.id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email', 'role', 'department'],
      }],
    });

    // Emit real-time attendance update via WebSocket
    emitAttendanceUpdate(meetingId, attendanceWithUser.toJSON());

    log.info('Attendance logged successfully', {
      meetingId,
      userId: req.user.userId,
      status,
    });

    return successResponse(res, 201, { attendance: attendanceWithUser }, 'Attendance logged successfully');
  })
);

/**
 * @route   GET /api/meetings/:id/attendance
 * @desc    Get attendance list for a meeting
 * @access  Private (participants only for officials)
 */
router.get(
  '/:id/attendance',
  authenticateToken,
  allowMeetingParticipants,
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
 * @access  Private (super_admin, secretary, organizer)
 */
router.put(
  '/:id',
  authenticateToken,
  allowOrganizerOrAdmin,
  [
    body('title').optional().trim().notEmpty().withMessage('Title cannot be empty'),
    body('datetime').optional().isISO8601().withMessage('Valid datetime is required'),
    body('participants').optional().isArray().withMessage('Participants must be an array'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 400, 'Validation failed', errors.array());
    }

    const meeting = await Meeting.findByPk(req.params.id);

    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    // Permissions already checked by allowOrganizerOrAdmin middleware

    const { title, datetime, location, description, status, participants } = req.body;

    if (title) meeting.title = title;
    if (datetime) meeting.datetime = new Date(datetime);
    if (location !== undefined) meeting.location = location;
    if (description !== undefined) meeting.description = description;
    if (status) meeting.status = status;
    if (participants !== undefined) meeting.participants = participants;

    await meeting.save();

    log.info('Meeting updated successfully', { meetingId: meeting.id });

    return successResponse(res, 200, { meeting }, 'Meeting updated successfully');
  })
);

/**
 * @route   DELETE /api/meetings/:id
 * @desc    Delete a meeting
 * @access  Private (super_admin, secretary, organizer)
 */
router.delete(
  '/:id',
  authenticateToken,
  allowOrganizerOrAdmin,
  asyncHandler(async (req, res) => {
    const meeting = await Meeting.findByPk(req.params.id);

    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    // Permissions already checked by allowOrganizerOrAdmin middleware

    // Store ID for logging before deletion
    const meetingId = meeting.id;

    // Delete the meeting (cascade will handle related records if configured)
    await meeting.destroy();

    log.info('Meeting deleted successfully', { meetingId });

    return successResponse(res, 200, { meetingId }, 'Meeting deleted successfully');
  })
);

/**
 * @route   PATCH /api/meetings/:id/status
 * @desc    Update meeting status
 * @access  Private (super_admin, secretary)
 */
router.patch(
  '/:id/status',
  authenticateToken,
  allowOnlyAdminOrSecretary,
  [
    body('status')
      .isIn(['scheduled', 'in-progress', 'completed', 'rescheduled', 'cancelled'])
      .withMessage('Invalid status. Must be scheduled, in-progress, completed, rescheduled, or cancelled'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 400, 'Validation failed', errors.array());
    }

    const meeting = await Meeting.findByPk(req.params.id);

    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    const { status } = req.body;
    const previousStatus = meeting.status;
    meeting.status = status;

    await meeting.save();

    // Emit real-time status update via WebSocket
    emitMeetingStatusUpdate(meeting.id, status);

    log.info('Meeting status updated', {
      meetingId: meeting.id,
      previousStatus,
      newStatus: status,
      updatedBy: req.user.userId,
    });

    // If meeting is marked as completed, send automatic emails
    if (status === 'completed' && previousStatus !== 'completed') {
      try {
        await sendMeetingCompletionEmails(meeting.id);
      } catch (error) {
        log.error('Failed to send meeting completion emails', {
          error: error.message,
          meetingId: meeting.id,
        });
        // Don't fail the request if email sending fails
      }
    }

    return successResponse(res, 200, { meeting }, 'Meeting status updated successfully');
  })
);

/**
 * Helper function to send emails when meeting is completed
 * Sends to all guests and participants (Official, Secretary, Admin)
 */
const sendMeetingCompletionEmails = async (meetingId) => {
  try {
    // Fetch meeting with related data
    const meeting = await Meeting.findByPk(meetingId, {
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
      log.error('Meeting not found for email sending', { meetingId });
      return;
    }

    // Fetch all tasks for this meeting
    const tasks = await Task.findAll({
      where: { meeting_id: meetingId },
      include: [
        {
          model: User,
          as: 'assignedTo',
          attributes: ['id', 'name', 'email'],
        },
      ],
      order: [['deadline', 'ASC']],
    });

    // Collect all participant emails
    const participantEmails = new Set();

    // Add organizer
    if (meeting.organizer && meeting.organizer.email) {
      participantEmails.add(meeting.organizer.email);
    }

    // Add all users who have attendance records
    const attendances = await Attendance.findAll({
      where: { meeting_id: meetingId },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email'],
        },
      ],
    });

    attendances.forEach((attendance) => {
      if (attendance.user && attendance.user.email) {
        participantEmails.add(attendance.user.email);
      }
    });

    // Add users from participants array (if it contains user IDs)
    if (Array.isArray(meeting.participants)) {
      for (const participantId of meeting.participants) {
        if (typeof participantId === 'number') {
          const user = await User.findByPk(participantId);
          if (user && user.email) {
            participantEmails.add(user.email);
          }
        }
      }
    }

    // Fetch all guest invites for this meeting
    const guestInvites = await GuestInvite.findAll({
      where: { meeting_id: meetingId },
    });

    const guestEmails = guestInvites
      .map((invite) => invite.email)
      .filter((email) => email);

    // Combine all recipient emails
    const allRecipients = [...participantEmails, ...guestEmails];

    if (allRecipients.length === 0) {
      log.info('No recipients found for meeting completion email', { meetingId });
      return;
    }

    // Send email to all recipients
    const emailResult = await sendMeetingSummary({
      to: Array.from(allRecipients),
      meeting: meeting.toJSON(),
      transcript: meeting.transcript ? meeting.transcript.toJSON() : null,
      tasks: tasks.map((task) => task.toJSON()),
    });

    if (emailResult.success) {
      log.info('Meeting completion emails sent successfully', {
        meetingId,
        recipientCount: allRecipients.length,
      });
    } else {
      log.error('Failed to send meeting completion emails', {
        meetingId,
        error: emailResult.error,
      });
    }
  } catch (error) {
    log.error('Error sending meeting completion emails', {
      error: error.message,
      meetingId,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * @route   POST /api/meetings/:id/invite-guest
 * @desc    Invite guest(s) to a meeting via email
 * @access  Private (super_admin, secretary)
 */
router.post(
  '/:id/invite-guest',
  authenticateToken,
  allowOnlyAdminOrSecretary,
  [
    body('emails')
      .isArray({ min: 1 })
      .withMessage('At least one email is required'),
    body('emails.*')
      .isEmail()
      .withMessage('Each email must be a valid email address'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 400, 'Validation failed', errors.array());
    }

    const meetingId = parseInt(req.params.id);
    const { emails } = req.body;

    // Find meeting
    const meeting = await Meeting.findByPk(meetingId, {
      include: [
        {
          model: User,
          as: 'organizer',
          attributes: ['id', 'name', 'email'],
        },
      ],
    });

    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    const invitedGuests = [];
    const errors_list = [];

    // Process each email
    for (const email of emails) {
      try {
        // Check if guest invite already exists
        const existingInvite = await GuestInvite.findOne({
          where: {
            meeting_id: meetingId,
            email: email.toLowerCase().trim(),
          },
        });

        if (existingInvite) {
          errors_list.push({
            email,
            error: 'Guest already invited to this meeting',
          });
          continue;
        }

        // Generate unique token for guest access
        const uniqueToken = crypto.randomBytes(32).toString('hex');

        // Create guest invite
        const guestInvite = await GuestInvite.create({
          email: email.toLowerCase().trim(),
          meeting_id: meetingId,
          invited_by: req.user.userId,
          unique_token: uniqueToken,
          status: 'pending',
        });

        // Send invitation email
        const emailResult = await sendGuestInvitation({
          email: email.toLowerCase().trim(),
          meeting: meeting.toJSON(),
          accessToken: uniqueToken,
        });

        if (emailResult.success) {
          guestInvite.status = 'sent';
          guestInvite.sent_at = new Date();
          await guestInvite.save();
        } else {
          guestInvite.status = 'failed';
          await guestInvite.save();
          errors_list.push({
            email,
            error: 'Failed to send invitation email',
          });
        }

        invitedGuests.push(guestInvite.toJSON());
      } catch (error) {
        log.error('Error inviting guest', {
          error: error.message,
          email,
          meetingId,
        });
        errors_list.push({
          email,
          error: error.message || 'Failed to invite guest',
        });
      }
    }

    log.info('Guest invitations processed', {
      meetingId,
      total: emails.length,
      successful: invitedGuests.length,
      failed: errors_list.length,
    });

    return successResponse(
      res,
      201,
      {
        invitedGuests,
        errors: errors_list.length > 0 ? errors_list : undefined,
      },
      `Successfully invited ${invitedGuests.length} guest(s)`
    );
  })
);

/**
 * @route   GET /api/meetings/:id/guests
 * @desc    Get all guest invites for a meeting
 * @access  Private (super_admin, secretary, organizer)
 */
router.get(
  '/:id/guests',
  authenticateToken,
  allowOrganizerOrAdmin,
  asyncHandler(async (req, res) => {
    const meetingId = parseInt(req.params.id);

    const guestInvites = await GuestInvite.findAll({
      where: { meeting_id: meetingId },
      include: [
        {
          model: User,
          as: 'inviter',
          attributes: ['id', 'name', 'email'],
        },
      ],
      order: [['created_at', 'DESC']],
    });

    return successResponse(res, 200, { guestInvites });
  })
);

export default router;
