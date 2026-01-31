/**
 * Task Controller
 * 
 * API endpoints for task management and collaboration workflow
 */

import { Request, Response } from 'express';
import * as taskService from '../services/task.service';
import { sendTaskAssignmentEmail } from '../services/task-email.service';
import Logger from '../logger';
import { TaskStatus } from '@prisma/client';

/**
 * Get task statistics for dashboard
 * GET /api/tasks/stats
 */
export const getTaskStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const result = await taskService.getTaskStats(userId);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(200).json({
      success: true,
      stats: result.stats,
    });
  } catch (error) {
    Logger.error(`Error in getTaskStats: ${error}`, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to get task statistics' });
  }
};

/**
 * Create a new task
 * POST /api/meetings/:meetingId/tasks
 */
export const createTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { meetingId } = req.params;
    const { title, description, assignedToUserId, assigneeEmail, assigneeName, dueDate, priority } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!title || title.trim().length === 0) {
      res.status(422).json({ error: 'Task title is required' });
      return;
    }

    if (title.length > 200) {
      res.status(422).json({ error: 'Task title cannot exceed 200 characters' });
      return;
    }

    const result = await taskService.createTask(userId, {
      meetingId,
      title: title.trim(),
      description: description?.trim(),
      assignedToUserId,
      assigneeEmail,
      assigneeName,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      priority,
    });

    if (!result.success) {
      const statusCode = result.error?.includes('Not authorized') ? 403 : 400;
      res.status(statusCode).json({ error: result.error });
      return;
    }

    // Send email notification if task is assigned
    if (assignedToUserId && assigneeEmail) {
      sendTaskAssignmentEmail({
        to: assigneeEmail,
        assigneeName: assigneeName || assigneeEmail,
        taskTitle: title,
        taskDescription: description,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        meetingId,
        taskId: result.task!.id,
      }).catch(err => {
        Logger.error(`Failed to send task assignment email: ${err as Error}`);
      });
    }

    Logger.info(`Task created: ${result.task?.id}`, { userId, meetingId });

    res.status(201).json({
      success: true,
      task: result.task,
    });
  } catch (error) {
    Logger.error(`Error in createTask: ${error}`, { userId: req.user?.id, meetingId: req.params.meetingId });
    res.status(500).json({ error: 'Failed to create task' });
  }
};

/**
 * List tasks for a meeting
 * GET /api/meetings/:meetingId/tasks
 */
export const listTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { meetingId } = req.params;
    const { status, assignedToMe, createdByMe } = req.query;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const filters: taskService.TaskListFilters = {};
    
    const statusStr = Array.isArray(status) ? status[0] : status;
    if (statusStr && Object.values(TaskStatus).includes(statusStr as TaskStatus)) {
      filters.status = statusStr as TaskStatus;
    }
    
    const assignedToMeStr = Array.isArray(assignedToMe) ? assignedToMe[0] : assignedToMe;
    if (assignedToMeStr === 'true') {
      filters.assignedToMe = true;
    }
    
    const createdByMeStr = Array.isArray(createdByMe) ? createdByMe[0] : createdByMe;
    if (createdByMeStr === 'true') {
      filters.createdByMe = true;
    }

    const result = await taskService.listTasks(userId, meetingId, filters);

    if (!result.success) {
      const statusCode = result.error?.includes('Not authorized') ? 403 : 400;
      res.status(statusCode).json({ error: result.error });
      return;
    }

    res.status(200).json({
      success: true,
      tasks: result.tasks,
    });
  } catch (error) {
    Logger.error(`Error in listTasks: ${error}`, { userId: req.user?.id, meetingId: req.params.meetingId });
    res.status(500).json({ error: 'Failed to list tasks' });
  }
};

/**
 * Get a single task
 * GET /api/tasks/:taskId
 */
export const getTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { taskId } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const result = await taskService.getTask(userId, taskId);

    if (!result.success) {
      const statusCode = result.error?.includes('not found') ? 404 : 403;
      res.status(statusCode).json({ error: result.error });
      return;
    }

    res.status(200).json({
      success: true,
      task: result.task,
    });
  } catch (error) {
    Logger.error(`Error in getTask: ${error}`, { userId: req.user?.id, taskId: req.params.taskId });
    res.status(500).json({ error: 'Failed to get task' });
  }
};

/**
 * Update a task
 * PATCH /api/tasks/:taskId
 */
export const updateTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { taskId } = req.params;
    const { title, description, status, assignedToUserId, assigneeEmail, assigneeName, dueDate, priority } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (title !== undefined && title.trim().length === 0) {
      res.status(422).json({ error: 'Task title cannot be empty' });
      return;
    }

    if (title && title.length > 200) {
      res.status(422).json({ error: 'Task title cannot exceed 200 characters' });
      return;
    }

    // Validate status if provided
    if (status && !Object.values(TaskStatus).includes(status)) {
      res.status(422).json({ error: `Invalid status. Must be one of: ${Object.values(TaskStatus).join(', ')}` });
      return;
    }

    const result = await taskService.updateTask(userId, taskId, {
      title: title?.trim(),
      description: description?.trim(),
      status,
      assignedToUserId,
      assigneeEmail,
      assigneeName,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      priority,
    });

    if (!result.success) {
      let statusCode = 400;
      if (result.error?.includes('not found')) statusCode = 404;
      if (result.error?.includes('Only task creator') || result.error?.includes('access denied')) statusCode = 403;
      res.status(statusCode).json({ error: result.error });
      return;
    }

    // Send email if task was reassigned
    if (result.reassigned && assignedToUserId && assigneeEmail) {
      sendTaskAssignmentEmail({
        to: assigneeEmail,
        assigneeName: assigneeName || assigneeEmail,
        taskTitle: result.task!.title,
        taskDescription: result.task!.description || undefined,
        dueDate: result.task!.dueDate || undefined,
        meetingId: result.task!.meetingId,
        taskId: result.task!.id,
      }).catch(err => {
        Logger.error(`Failed to send task reassignment email: ${err as Error}`);
      });
    }

    Logger.info(`Task updated: ${taskId}`, { userId });

    res.status(200).json({
      success: true,
      task: result.task,
    });
  } catch (error) {
    Logger.error(`Error in updateTask: ${error}`, { userId: req.user?.id, taskId: req.params.taskId });
    res.status(500).json({ error: 'Failed to update task' });
  }
};

/**
 * Delete a task
 * DELETE /api/tasks/:taskId
 */
export const deleteTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { taskId } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const result = await taskService.deleteTask(userId, taskId);

    if (!result.success) {
      let statusCode = 400;
      if (result.error?.includes('not found')) statusCode = 404;
      if (result.error?.includes('only creator')) statusCode = 403;
      res.status(statusCode).json({ error: result.error });
      return;
    }

    Logger.info(`Task deleted: ${taskId}`, { userId });

    res.status(200).json({
      success: true,
      message: 'Task deleted successfully',
    });
  } catch (error) {
    Logger.error(`Error in deleteTask: ${error}`, { userId: req.user?.id, taskId: req.params.taskId });
    res.status(500).json({ error: 'Failed to delete task' });
  }
};

/**
 * Get presigned upload URL for task submission
 * POST /api/tasks/:taskId/upload-url
 */
export const getUploadUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { taskId } = req.params;
    const { fileName, contentType, fileSize } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!fileName || !contentType || !fileSize) {
      res.status(422).json({ error: 'fileName, contentType, and fileSize are required' });
      return;
    }

    const result = await taskService.getSubmissionUploadUrl(userId, taskId, fileName, contentType, fileSize);

    if (!result.success) {
      let statusCode = 400;
      if (result.error?.includes('not found') || result.error?.includes('access denied')) statusCode = 404;
      if (result.error?.includes('File type') || result.error?.includes('File size')) statusCode = 422;
      res.status(statusCode).json({ error: result.error });
      return;
    }

    res.status(200).json({
      success: true,
      uploadUrl: result.uploadUrl,
      objectName: result.objectName,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    Logger.error(`Error in getUploadUrl: ${error}`, { userId: req.user?.id, taskId: req.params.taskId });
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
};

/**
 * Create a task submission
 * POST /api/tasks/:taskId/submissions
 */
export const createSubmission = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { taskId } = req.params;
    const { notes, files } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!notes && (!files || files.length === 0)) {
      res.status(422).json({ error: 'Either notes or files are required for a submission' });
      return;
    }

    const result = await taskService.createSubmission(userId, taskId, notes, files);

    if (!result.success) {
      let statusCode = 400;
      if (result.error?.includes('not found') || result.error?.includes('access denied')) statusCode = 404;
      res.status(statusCode).json({ error: result.error });
      return;
    }

    Logger.info(`Task submission created: ${result.submission?.id}`, { userId, taskId });

    res.status(201).json({
      success: true,
      submission: result.submission,
    });
  } catch (error) {
    Logger.error(`Error in createSubmission: ${error}`, { userId: req.user?.id, taskId: req.params.taskId });
    res.status(500).json({ error: 'Failed to create submission' });
  }
};

/**
 * List submissions for a task
 * GET /api/tasks/:taskId/submissions
 */
export const listSubmissions = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { taskId } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const result = await taskService.listSubmissions(userId, taskId);

    if (!result.success) {
      let statusCode = 400;
      if (result.error?.includes('not found') || result.error?.includes('access denied')) statusCode = 404;
      res.status(statusCode).json({ error: result.error });
      return;
    }

    res.status(200).json({
      success: true,
      submissions: result.submissions,
    });
  } catch (error) {
    Logger.error(`Error in listSubmissions: ${error}`, { userId: req.user?.id, taskId: req.params.taskId });
    res.status(500).json({ error: 'Failed to list submissions' });
  }
};

/**
 * Get all tasks for the current user (dashboard)
 * GET /api/tasks/my-tasks
 */
export const getMyTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { status, limit } = req.query;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const filters: { status?: TaskStatus; limit?: number } = {};
    
    const statusVal = Array.isArray(status) ? status[0] : status;
    if (statusVal && Object.values(TaskStatus).includes(statusVal as TaskStatus)) {
      filters.status = statusVal as TaskStatus;
    }
    
    const limitVal = Array.isArray(limit) ? limit[0] : limit;
    if (limitVal && typeof limitVal === 'string') {
      const parsedLimit = parseInt(limitVal, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        filters.limit = Math.min(parsedLimit, 100);
      }
    }

    const result = await taskService.getMyTasks(userId, filters);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(200).json({
      success: true,
      tasks: result.tasks,
    });
  } catch (error) {
    Logger.error(`Error in getMyTasks: ${error}`, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to get tasks' });
  }
};

/**
 * Get meeting participants for assignment dropdown
 * GET /api/meetings/:meetingId/participants
 */
export const getMeetingParticipants = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { meetingId } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const result = await taskService.getMeetingParticipants(userId, meetingId);

    if (!result.success) {
      const statusCode = result.error?.includes('Not authorized') ? 403 : 400;
      res.status(statusCode).json({ error: result.error });
      return;
    }

    res.status(200).json({
      success: true,
      participants: result.participants,
    });
  } catch (error) {
    Logger.error(`Error in getMeetingParticipants: ${error}`, { userId: req.user?.id, meetingId: req.params.meetingId });
    res.status(500).json({ error: 'Failed to get participants' });
  }
};
