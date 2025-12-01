import express from 'express';
import { body, validationResult } from 'express-validator';
import { Op } from 'sequelize';
import Task from '../models/Task.js';
import Meeting from '../models/Meeting.js';
import User from '../models/User.js';
import { sendTaskAssignment, sendTaskReminder } from '../services/notificationService.js';
import { asyncHandler, errorResponse, successResponse } from '../utils/helpers.js';
import { log } from '../utils/logger.js';

const router = express.Router();

/**
 * @route   POST /api/tasks
 * @desc    Create a new task
 * @access  Private
 */
router.post(
  '/',
  [
    body('meeting_id').notEmpty().withMessage('Meeting ID is required'),
    body('assigned_to').notEmpty().withMessage('Assigned user ID is required'),
    body('title').trim().notEmpty().withMessage('Task title is required'),
    body('deadline').isISO8601().withMessage('Valid deadline is required'),
    body('description').optional().trim(),
    body('priority').optional().isIn(['low', 'medium', 'high']),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 400, 'Validation failed', errors.array());
    }

    const { meeting_id, assigned_to, title, deadline, description, priority } = req.body;

    // Verify meeting exists
    const meeting = await Meeting.findByPk(meeting_id);
    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    // Verify assigned user exists
    const assignedUser = await User.findByPk(assigned_to);
    if (!assignedUser) {
      return errorResponse(res, 404, 'Assigned user not found');
    }

    // Create task
    const task = await Task.create({
      meeting_id: parseInt(meeting_id),
      assigned_to: parseInt(assigned_to),
      assigned_by: req.user.userId,
      title,
      deadline: new Date(deadline),
      description,
      priority: priority || 'medium',
    });

    // Send notification
    try {
      await sendTaskAssignment(task, assignedUser);
    } catch (error) {
      log.warn('Failed to send task assignment notification', error);
    }

    log.info('Task created successfully', { taskId: task.id, assignedTo: assigned_to });

    return successResponse(res, 201, { task }, 'Task created successfully');
  })
);

/**
 * @route   GET /api/tasks
 * @desc    Get all tasks
 * @access  Private
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, assigned_to, meeting_id, overdue } = req.query;
    const where = {};

    if (status) {
      where.status = status;
    }

    if (assigned_to) {
      where.assigned_to = parseInt(assigned_to);
    } else if (req.user.role !== 'admin') {
      // Non-admins only see their own tasks
      where.assigned_to = req.user.userId;
    }

    if (meeting_id) {
      where.meeting_id = parseInt(meeting_id);
    }

    if (overdue === 'true') {
      where.deadline = { [Op.lt]: new Date() };
      where.status = { [Op.in]: ['pending', 'in-progress'] };
    }

    const tasks = await Task.findAll({
      where,
      include: [
        {
          model: Meeting,
          as: 'meeting',
          attributes: ['id', 'title', 'datetime'],
        },
        {
          model: User,
          as: 'assignedTo',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: User,
          as: 'assignedBy',
          attributes: ['id', 'name', 'email'],
        },
      ],
      order: [['deadline', 'ASC']],
    });

    return successResponse(res, 200, { tasks });
  })
);

/**
 * @route   GET /api/tasks/:id
 * @desc    Get task by ID
 * @access  Private
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const task = await Task.findByPk(req.params.id, {
      include: [
        {
          model: Meeting,
          as: 'meeting',
          attributes: ['id', 'title', 'datetime'],
        },
        {
          model: User,
          as: 'assignedTo',
          attributes: ['id', 'name', 'email', 'role'],
        },
        {
          model: User,
          as: 'assignedBy',
          attributes: ['id', 'name', 'email'],
        },
      ],
    });

    if (!task) {
      return errorResponse(res, 404, 'Task not found');
    }

    // Check permissions
    if (req.user.role !== 'admin' && task.assigned_to !== req.user.userId) {
      return errorResponse(res, 403, 'Insufficient permissions');
    }

    return successResponse(res, 200, { task });
  })
);

/**
 * @route   PUT /api/tasks/:id
 * @desc    Update task
 * @access  Private
 */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const task = await Task.findByPk(req.params.id);

    if (!task) {
      return errorResponse(res, 404, 'Task not found');
    }

    // Check permissions
    if (req.user.role !== 'admin' && task.assigned_to !== req.user.userId) {
      return errorResponse(res, 403, 'Insufficient permissions');
    }

    const { title, description, deadline, status, priority } = req.body;

    if (title) task.title = title;
    if (description !== undefined) task.description = description;
    if (deadline) task.deadline = new Date(deadline);
    if (status) task.status = status;
    if (priority) task.priority = priority;

    // Mark as completed
    if (status === 'completed' && !task.completed_at) {
      task.completed_at = new Date();
    }

    await task.save();

    log.info('Task updated successfully', { taskId: task.id });

    return successResponse(res, 200, { task }, 'Task updated successfully');
  })
);

/**
 * @route   POST /api/tasks/:id/reminder
 * @desc    Send reminder for a task
 * @access  Private
 */
router.post(
  '/:id/reminder',
  asyncHandler(async (req, res) => {
    const task = await Task.findByPk(req.params.id, {
      include: [{
        model: User,
        as: 'assignedTo',
      }],
    });

    if (!task) {
      return errorResponse(res, 404, 'Task not found');
    }

    // Check permissions
    if (req.user.role !== 'admin' && task.assigned_to !== req.user.userId) {
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
 * @route   DELETE /api/tasks/:id
 * @desc    Delete task
 * @access  Private (admin only)
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') {
      return errorResponse(res, 403, 'Admin access required');
    }

    const task = await Task.findByPk(req.params.id);

    if (!task) {
      return errorResponse(res, 404, 'Task not found');
    }

    await task.destroy();

    log.info('Task deleted successfully', { taskId: task.id });

    return successResponse(res, 200, {}, 'Task deleted successfully');
  })
);

export default router;
