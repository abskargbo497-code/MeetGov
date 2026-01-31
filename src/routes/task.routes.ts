/**
 * Task Routes
 * 
 * Routes for task management and collaboration workflow
 */

import express from 'express';
import { requireAuth } from '../middlewares/auth.middleware';
import {
  createTask,
  listTasks,
  getTask,
  updateTask,
  deleteTask,
  getUploadUrl,
  createSubmission,
  listSubmissions,
  getMyTasks,
  getMeetingParticipants,
  getTaskStats,
} from '../controllers/task.controller';

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// ============================================
// User Dashboard Task Routes
// ============================================

/**
 * @route   GET /api/tasks/my-tasks
 * @desc    Get all tasks for the current user (dashboard view)
 * @access  Authenticated personal users
 */
router.get('/my-tasks', getMyTasks);

/**
 * @route   GET /api/tasks/stats
 * @desc    Get task statistics for dashboard
 * @access  Authenticated personal users
 */
router.get('/stats', getTaskStats);

/**
 * @route   GET /api/tasks/:taskId
 * @desc    Get a single task by ID
 * @access  Authenticated users (creator or assignee)
 */
router.get('/:taskId', getTask);

/**
 * @route   PATCH /api/tasks/:taskId
 * @desc    Update a task
 * @access  Authenticated users (creator or assignee, reassign only by creator)
 */
router.patch('/:taskId', updateTask);

/**
 * @route   DELETE /api/tasks/:taskId
 * @desc    Delete a task
 * @access  Authenticated users (creator only)
 */
router.delete('/:taskId', deleteTask);

// ============================================
// Task Submission Routes
// ============================================

/**
 * @route   POST /api/tasks/:taskId/upload-url
 * @desc    Get presigned URL for file upload
 * @access  Authenticated users (creator or assignee)
 */
router.post('/:taskId/upload-url', getUploadUrl);

/**
 * @route   POST /api/tasks/:taskId/submissions
 * @desc    Create a task submission
 * @access  Authenticated users (creator or assignee)
 */
router.post('/:taskId/submissions', createSubmission);

/**
 * @route   GET /api/tasks/:taskId/submissions
 * @desc    List submissions for a task
 * @access  Authenticated users (creator or assignee)
 */
router.get('/:taskId/submissions', listSubmissions);

export default router;

// ============================================
// Meeting-Scoped Task Routes (mounted separately)
// ============================================

export const meetingTaskRouter = express.Router({ mergeParams: true });

// Require auth for all meeting task routes
meetingTaskRouter.use(requireAuth);

/**
 * @route   POST /api/meetings/:meetingId/tasks
 * @desc    Create a new task for a meeting
 * @access  Authenticated users with meeting access
 */
meetingTaskRouter.post('/', createTask);

/**
 * @route   GET /api/meetings/:meetingId/tasks
 * @desc    List tasks for a meeting
 * @access  Authenticated users with meeting access
 */
meetingTaskRouter.get('/', listTasks);

/**
 * @route   GET /api/meetings/:meetingId/participants
 * @desc    Get meeting participants for task assignment
 * @access  Authenticated users with meeting access
 */
meetingTaskRouter.get('/participants', getMeetingParticipants);
