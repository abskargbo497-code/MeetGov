import express from 'express';
import { body, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import User from '../models/User.js';
import Meeting from '../models/Meeting.js';
import Task from '../models/Task.js';
import { sendNotification, sendTaskAssignment, sendTaskReminder, sendMeetingReminder } from '../services/notificationService.js';
import { sendMeetingSummary, sendGuestInvitation } from '../services/emailService.js';
import { asyncHandler, errorResponse, successResponse } from '../utils/helpers.js';
import { authenticateToken } from '../utils/jwt.js';
import { allowOnlyAdminOrSecretary, allowAuthenticatedUsers } from '../utils/authorization.js';
import { log } from '../utils/logger.js';

const router = express.Router();

/**
 * @route   POST /api/notifications/send
 * @desc    Send a custom notification to a user
 * @access  Private (super_admin, secretary)
 */
router.post(
  '/send',
  authenticateToken,
  allowOnlyAdminOrSecretary,
  [
    body('user_id').notEmpty().withMessage('User ID is required'),
    body('type').isIn(['task_assigned', 'task_reminder', 'meeting_reminder', 'custom']).withMessage('Invalid notification type'),
    body('message').optional().trim(),
    body('data').optional(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 400, 'Validation failed', errors.array());
    }

    const { user_id, type, message, data } = req.body;

    // Find user
    const user = await User.findByPk(user_id);
    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    try {
      await sendNotification(user, type, { message, ...data });
      log.info('Notification sent', { userId: user_id, type });

      return successResponse(res, 200, {}, 'Notification sent successfully');
    } catch (error) {
      log.error('Failed to send notification', error);
      return errorResponse(res, 500, 'Failed to send notification');
    }
  })
);

/**
 * @route   POST /api/notifications/task/:id/reminder
 * @desc    Send reminder for a specific task
 * @access  Private
 */
router.post(
  '/task/:id/reminder',
  authenticateToken,
  allowAuthenticatedUsers,
  asyncHandler(async (req, res) => {
    const task = await Task.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'assignedTo',
        },
      ],
    });

    if (!task) {
      return errorResponse(res, 404, 'Task not found');
    }

    // Check permissions - user must be assigned to task or be admin/secretary
    if (req.user.role !== 'super_admin' && req.user.role !== 'secretary' && task.assigned_to !== req.user.userId) {
      return errorResponse(res, 403, 'Insufficient permissions');
    }

    try {
      await sendTaskReminder(task, task.assignedTo);
      task.reminder_sent = true;
      await task.save();

      log.info('Task reminder sent', { taskId: task.id });

      return successResponse(res, 200, {}, 'Reminder sent successfully');
    } catch (error) {
      log.error('Failed to send task reminder', error);
      return errorResponse(res, 500, 'Failed to send reminder');
    }
  })
);

/**
 * @route   POST /api/notifications/meeting/:id/reminder
 * @desc    Send reminder for a meeting to all participants
 * @access  Private (super_admin, secretary)
 */
router.post(
  '/meeting/:id/reminder',
  authenticateToken,
  allowOnlyAdminOrSecretary,
  asyncHandler(async (req, res) => {
    const meeting = await Meeting.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'organizer',
        },
      ],
    });

    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    try {
      // Get all participants
      const participantIds = meeting.participants || [];
      const participants = await User.findAll({
        where: {
          id: {
            [Op.in]: [meeting.organizer_id, ...participantIds],
          },
        },
      });

      // Send reminder to all participants
      const reminderPromises = participants.map((user) => sendMeetingReminder(meeting, user));
      await Promise.all(reminderPromises);

      log.info('Meeting reminders sent', { meetingId: meeting.id, count: participants.length });

      return successResponse(res, 200, { sentTo: participants.length }, 'Reminders sent successfully');
    } catch (error) {
      log.error('Failed to send meeting reminders', error);
      return errorResponse(res, 500, 'Failed to send reminders');
    }
  })
);

/**
 * @route   GET /api/notifications/history
 * @desc    Get notification history (placeholder - can be extended with Notification model)
 * @access  Private
 */
router.get(
  '/history',
  authenticateToken,
  allowAuthenticatedUsers,
  asyncHandler(async (req, res) => {
    // TODO: Implement Notification model to track sent notifications
    // For now, return empty array
    return successResponse(res, 200, { notifications: [] }, 'Notification history retrieved');
  })
);

/**
 * @route   POST /api/notifications/bulk
 * @desc    Send bulk notifications to multiple users
 * @access  Private (super_admin, secretary)
 */
router.post(
  '/bulk',
  authenticateToken,
  allowOnlyAdminOrSecretary,
  [
    body('user_ids').isArray().notEmpty().withMessage('User IDs array is required'),
    body('type').isIn(['task_assigned', 'task_reminder', 'meeting_reminder', 'custom']).withMessage('Invalid notification type'),
    body('message').optional().trim(),
    body('data').optional(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 400, 'Validation failed', errors.array());
    }

    const { user_ids, type, message, data } = req.body;

    // Find all users
    const users = await User.findAll({
      where: {
        id: {
          [Op.in]: user_ids,
        },
      },
    });

    if (users.length === 0) {
      return errorResponse(res, 404, 'No users found');
    }

    try {
      // Send notifications to all users
      const notificationPromises = users.map((user) => sendNotification(user, type, { message, ...data }));
      await Promise.all(notificationPromises);

      log.info('Bulk notifications sent', { count: users.length, type });

      return successResponse(res, 200, { sentTo: users.length }, 'Notifications sent successfully');
    } catch (error) {
      log.error('Failed to send bulk notifications', error);
      return errorResponse(res, 500, 'Failed to send notifications');
    }
  })
);

export default router;


