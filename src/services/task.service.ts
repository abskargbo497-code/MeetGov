/**
 * Task Service
 * 
 * Business logic for task management and collaboration workflow
 * Scoped by userId and meetingId for personal account users
 */

import { PrismaClient, TaskStatus, OwnerType, Task, TaskSubmission } from '@prisma/client';
import Logger from '../logger';
import { emitTaskEvent, emitEnterpriseTaskAssigned } from '../websocket/ws-server';
import r2Storage from './r2-storage.service';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Data retention period (30 days for personal users)
const DATA_RETENTION_DAYS = 30;

// File upload constraints
const MAX_FILE_SIZE_MB = 10;
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/zip',
];

// Types
export interface CreateTaskInput {
  meetingId: string;
  title: string;
  description?: string;
  assignedToUserId?: string;
  assigneeEmail?: string;
  assigneeName?: string;
  dueDate?: Date;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  assignedToUserId?: string;
  assigneeEmail?: string;
  assigneeName?: string;
  dueDate?: Date;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface TaskWithDetails extends Task {
  submissions: TaskSubmission[];
  createdByUser?: { id: string; name: string | null; email: string } | null;
  assignedToUser?: { id: string; name: string | null; email: string } | null;
}

export interface TaskListFilters {
  status?: TaskStatus;
  assignedToMe?: boolean;
  createdByMe?: boolean;
}

/**
 * Verify user has access to a meeting
 */
async function verifyMeetingAccess(meetingId: string, userId: string): Promise<boolean> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { 
      id: true, 
      ownerId: true, 
      ownerType: true,
      invitedParticipants: true,
    }
  });

  if (!meeting) return false;

  // Owner always has access
  if (meeting.ownerType === OwnerType.PERSONAL && meeting.ownerId === userId) {
    return true;
  }

  // Check if user is in invited participants
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true }
  });

  if (user && meeting.invitedParticipants) {
    const participants = meeting.invitedParticipants as string[];
    if (participants.includes(user.email)) {
      return true;
    }
  }

  // Check attendance
  const attendance = await prisma.attendance.findFirst({
    where: {
      meetingId,
      ownerId: userId,
    }
  });

  return !!attendance;
}

/**
 * Verify user can view/modify a task
 */
async function verifyTaskAccess(
  taskId: string, 
  userId: string, 
  requireOwnership: boolean = false
): Promise<{ allowed: boolean; task: Task | null; isCreator: boolean }> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });

  if (!task) {
    return { allowed: false, task: null, isCreator: false };
  }

  const isCreator = task.createdByUserId === userId;
  const isAssignee = task.assignedToUserId === userId;

  // If ownership required (for delete, reassign), only creator can do it
  if (requireOwnership) {
    return { allowed: isCreator, task, isCreator };
  }

  // For view/update, both creator and assignee have access
  return { allowed: isCreator || isAssignee, task, isCreator };
}

/**
 * Create a new task for a meeting
 */
export async function createTask(
  userId: string,
  input: CreateTaskInput
): Promise<{ success: boolean; task?: TaskWithDetails; error?: string }> {
  try {
    // Verify meeting access
    const hasAccess = await verifyMeetingAccess(input.meetingId, userId);
    if (!hasAccess) {
      return { success: false, error: 'Not authorized to create tasks for this meeting' };
    }

    // Get meeting details for owner type and enterprise scoping
    const meeting = await prisma.meeting.findUnique({
      where: { id: input.meetingId },
      select: { ownerId: true, ownerType: true, enterpriseId: true, title: true }
    });

    if (!meeting) {
      return { success: false, error: 'Meeting not found' };
    }

    // Validate due date is not in the past
    if (input.dueDate && new Date(input.dueDate) < new Date()) {
      return { success: false, error: 'Due date cannot be in the past' };
    }

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + DATA_RETENTION_DAYS);

    // Create the task
    const task = await prisma.task.create({
      data: {
        meetingId: input.meetingId,
        title: input.title,
        description: input.description,
        ownerType: meeting.enterpriseId ? OwnerType.ENTERPRISE : OwnerType.PERSONAL,
        ownerId: userId,
        enterpriseId: meeting.enterpriseId,
        createdByUserId: userId,
        assignedToUserId: input.assignedToUserId,
        assigneeEmail: input.assigneeEmail,
        assignee: input.assigneeName,
        dueDate: input.dueDate,
        priority: input.priority || 'MEDIUM',
        status: TaskStatus.PENDING,
        expiresAt,
      },
      include: {
        submissions: true,
      }
    });

    Logger.info(`Task created: ${task.id} for meeting ${input.meetingId} by user ${userId}`);

    // Emit WebSocket event for real-time updates
    emitTaskEvent(input.meetingId, {
      type: 'task:created',
      meetingId: input.meetingId,
      taskId: task.id,
      task: {
        id: task.id,
        title: task.title,
        status: task.status,
        assignedToUserId: task.assignedToUserId,
        createdByUserId: task.createdByUserId,
      },
    } as any);

    // Emit enterprise-scoped event if this is an enterprise meeting
    if (meeting.enterpriseId && input.assignedToUserId) {
      emitEnterpriseTaskAssigned(
        meeting.enterpriseId,
        task.id,
        input.meetingId,
        task.title,
        input.assignedToUserId,
        input.assigneeName,
        userId
      );
    }

    return { success: true, task: task as TaskWithDetails };
  } catch (error) {
    Logger.error(`Error creating task: ${error}`);
    return { success: false, error: 'Failed to create task' };
  }
}

/**
 * List tasks for a meeting scoped to user
 */
export async function listTasks(
  userId: string,
  meetingId: string,
  filters?: TaskListFilters
): Promise<{ success: boolean; tasks?: TaskWithDetails[]; error?: string }> {
  try {
    // Verify meeting access
    const hasAccess = await verifyMeetingAccess(meetingId, userId);
    if (!hasAccess) {
      return { success: false, error: 'Not authorized to view tasks for this meeting' };
    }

    // Build where clause - show tasks where user is creator OR assignee
    const whereClause: any = {
      meetingId,
      OR: [
        { createdByUserId: userId },
        { assignedToUserId: userId },
      ],
    };

    // Apply filters
    if (filters?.status) {
      whereClause.status = filters.status;
    }

    if (filters?.assignedToMe) {
      whereClause.assignedToUserId = userId;
      delete whereClause.OR;
    }

    if (filters?.createdByMe) {
      whereClause.createdByUserId = userId;
      delete whereClause.OR;
    }

    const tasks = await prisma.task.findMany({
      where: whereClause,
      include: {
        submissions: {
          include: {
            files: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [
        { status: 'asc' },
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    // Fetch user details for creator and assignee
    const userIds = new Set<string>();
    tasks.forEach(task => {
      if (task.createdByUserId) userIds.add(task.createdByUserId);
      if (task.assignedToUserId) userIds.add(task.assignedToUserId);
    });

    const users = await prisma.user.findMany({
      where: { id: { in: Array.from(userIds) } },
      select: { id: true, name: true, email: true },
    });

    const userMap = new Map(users.map(u => [u.id, u]));

    const tasksWithDetails: TaskWithDetails[] = tasks.map(task => ({
      ...task,
      createdByUser: task.createdByUserId ? userMap.get(task.createdByUserId) || null : null,
      assignedToUser: task.assignedToUserId ? userMap.get(task.assignedToUserId) || null : null,
    }));

    return { success: true, tasks: tasksWithDetails };
  } catch (error) {
    Logger.error(`Error listing tasks: ${error}`);
    return { success: false, error: 'Failed to list tasks' };
  }
}

/**
 * Get a single task by ID
 */
export async function getTask(
  userId: string,
  taskId: string
): Promise<{ success: boolean; task?: TaskWithDetails; error?: string }> {
  try {
    const { allowed, task } = await verifyTaskAccess(taskId, userId);
    
    if (!allowed || !task) {
      return { success: false, error: 'Task not found or access denied' };
    }

    const fullTask = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        submissions: {
          include: {
            files: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!fullTask) {
      return { success: false, error: 'Task not found' };
    }

    // Fetch user details
    const userIds: string[] = [];
    if (fullTask.createdByUserId) userIds.push(fullTask.createdByUserId);
    if (fullTask.assignedToUserId) userIds.push(fullTask.assignedToUserId);

    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });

    const userMap = new Map(users.map(u => [u.id, u]));

    const taskWithDetails: TaskWithDetails = {
      ...fullTask,
      createdByUser: fullTask.createdByUserId ? userMap.get(fullTask.createdByUserId) || null : null,
      assignedToUser: fullTask.assignedToUserId ? userMap.get(fullTask.assignedToUserId) || null : null,
    };

    return { success: true, task: taskWithDetails };
  } catch (error) {
    Logger.error(`Error getting task: ${error}`);
    return { success: false, error: 'Failed to get task' };
  }
}

/**
 * Update a task
 */
export async function updateTask(
  userId: string,
  taskId: string,
  input: UpdateTaskInput
): Promise<{ success: boolean; task?: TaskWithDetails; error?: string; reassigned?: boolean }> {
  try {
    const { allowed, task, isCreator } = await verifyTaskAccess(taskId, userId);
    
    if (!allowed || !task) {
      return { success: false, error: 'Task not found or access denied' };
    }

    // Only creator can reassign
    const isReassigning = input.assignedToUserId !== undefined && 
                          input.assignedToUserId !== task.assignedToUserId;
    
    if (isReassigning && !isCreator) {
      return { success: false, error: 'Only task creator can reassign tasks' };
    }

    // Validate due date
    if (input.dueDate && new Date(input.dueDate) < new Date()) {
      return { success: false, error: 'Due date cannot be in the past' };
    }

    // Build update data
    const updateData: any = {};
    
    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.status !== undefined) {
      updateData.status = input.status;
      if (input.status === TaskStatus.COMPLETED) {
        updateData.completedAt = new Date();
      }
    }
    if (input.assignedToUserId !== undefined) updateData.assignedToUserId = input.assignedToUserId;
    if (input.assigneeEmail !== undefined) updateData.assigneeEmail = input.assigneeEmail;
    if (input.assigneeName !== undefined) updateData.assignee = input.assigneeName;
    if (input.dueDate !== undefined) updateData.dueDate = input.dueDate;
    if (input.priority !== undefined) updateData.priority = input.priority;

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: {
        submissions: {
          include: { files: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    Logger.info(`Task updated: ${taskId} by user ${userId}`);

    // Emit WebSocket event
    emitTaskEvent(task.meetingId, {
      type: 'task:updated',
      meetingId: task.meetingId,
      taskId: task.id,
      task: {
        id: updatedTask.id,
        title: updatedTask.title,
        status: updatedTask.status,
        assignedToUserId: updatedTask.assignedToUserId,
        createdByUserId: updatedTask.createdByUserId,
      },
    } as any);

    // If reassigned, emit special event
    if (isReassigning && input.assignedToUserId) {
      emitTaskEvent(task.meetingId, {
        type: 'task:assigned',
        meetingId: task.meetingId,
        taskId: task.id,
        assigneeEmail: input.assigneeEmail,
        assigneeName: input.assigneeName,
        taskTitle: updatedTask.title,
      });
    }

    return { success: true, task: updatedTask as TaskWithDetails, reassigned: isReassigning };
  } catch (error) {
    Logger.error(`Error updating task: ${error}`);
    return { success: false, error: 'Failed to update task' };
  }
}

/**
 * Delete a task (only creator can delete)
 */
export async function deleteTask(
  userId: string,
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { allowed, task } = await verifyTaskAccess(taskId, userId, true);
    
    if (!allowed || !task) {
      return { success: false, error: 'Task not found or only creator can delete tasks' };
    }

    await prisma.task.delete({
      where: { id: taskId },
    });

    Logger.info(`Task deleted: ${taskId} by user ${userId}`);

    // Emit WebSocket event
    emitTaskEvent(task.meetingId, {
      type: 'task:deleted',
      meetingId: task.meetingId,
      taskId: task.id,
    } as any);

    return { success: true };
  } catch (error) {
    Logger.error(`Error deleting task: ${error}`);
    return { success: false, error: 'Failed to delete task' };
  }
}

/**
 * Generate presigned upload URL for task submission
 */
export async function getSubmissionUploadUrl(
  userId: string,
  taskId: string,
  fileName: string,
  contentType: string,
  fileSize: number
): Promise<{ success: boolean; uploadUrl?: string; objectName?: string; expiresAt?: Date; error?: string }> {
  try {
    const { allowed, task } = await verifyTaskAccess(taskId, userId);
    
    if (!allowed || !task) {
      return { success: false, error: 'Task not found or access denied' };
    }

    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(contentType)) {
      return { success: false, error: `File type not allowed. Allowed types: PDF, Word, Excel, PowerPoint, Images, Text, CSV, ZIP` };
    }

    // Validate file size
    if (fileSize > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return { success: false, error: `File size exceeds ${MAX_FILE_SIZE_MB}MB limit` };
    }

    // Generate unique object name
    const fileExtension = fileName.split('.').pop() || 'bin';
    const objectName = `task-submissions/${task.meetingId}/${taskId}/${crypto.randomUUID()}.${fileExtension}`;

    const { url, expiresAt } = await r2Storage.createSignedUploadUrl({
      objectName,
      contentType,
      expiresInMinutes: 15,
    });

    return { success: true, uploadUrl: url, objectName, expiresAt };
  } catch (error) {
    Logger.error(`Error generating upload URL: ${error}`);
    return { success: false, error: 'Failed to generate upload URL' };
  }
}

/**
 * Create a task submission
 */
export async function createSubmission(
  userId: string,
  taskId: string,
  notes?: string,
  files?: Array<{ objectName: string; fileUrl: string; fileSize: number; mimeType: string; originalFileName: string }>
): Promise<{ success: boolean; submission?: TaskSubmission; error?: string }> {
  try {
    const { allowed, task } = await verifyTaskAccess(taskId, userId);
    
    if (!allowed || !task) {
      return { success: false, error: 'Task not found or access denied' };
    }

    // Get user email
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + DATA_RETENTION_DAYS);

    // Create submission with files
    const submission = await prisma.taskSubmission.create({
      data: {
        taskId,
        notes,
        submittedByType: 'USER',
        submittedByUserId: userId,
        submittedByEmail: user?.email,
        expiresAt,
        files: files ? {
          create: files.map(f => ({
            objectName: f.objectName,
            fileUrl: f.fileUrl,
            fileSize: BigInt(f.fileSize),
            mimeType: f.mimeType,
            originalFileName: f.originalFileName,
            expiresAt,
          })),
        } : undefined,
      },
      include: {
        files: true,
      },
    });

    // Update task status to SUBMITTED if it was PENDING or IN_PROGRESS
    if (task.status === TaskStatus.PENDING || task.status === TaskStatus.IN_PROGRESS) {
      await prisma.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.SUBMITTED },
      });
    }

    Logger.info(`Task submission created: ${submission.id} for task ${taskId} by user ${userId}`);

    // Emit WebSocket event
    emitTaskEvent(task.meetingId, {
      type: 'task:submitted',
      meetingId: task.meetingId,
      taskId: task.id,
      taskTitle: task.title,
    });

    return { success: true, submission };
  } catch (error) {
    Logger.error(`Error creating submission: ${error}`);
    return { success: false, error: 'Failed to create submission' };
  }
}

/**
 * List submissions for a task
 */
export async function listSubmissions(
  userId: string,
  taskId: string
): Promise<{ success: boolean; submissions?: any[]; error?: string }> {
  try {
    const { allowed, task, isCreator } = await verifyTaskAccess(taskId, userId);
    
    if (!allowed || !task) {
      return { success: false, error: 'Task not found or access denied' };
    }

    const submissions = await prisma.taskSubmission.findMany({
      where: { taskId },
      include: {
        files: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Generate download URLs for files
    const submissionsWithUrls = await Promise.all(
      submissions.map(async (submission) => {
        const filesWithUrls = await Promise.all(
          submission.files.map(async (file) => {
            try {
              const { url } = await r2Storage.createSignedDownloadUrl({
                objectName: file.objectName,
                contentType: file.mimeType,
                responseContentDisposition: `attachment; filename="${file.originalFileName || 'download'}"`,
                expiresInMinutes: 60,
              });
              return { ...file, downloadUrl: url, fileSize: Number(file.fileSize) };
            } catch {
              return { ...file, downloadUrl: null, fileSize: Number(file.fileSize) };
            }
          })
        );
        return { ...submission, files: filesWithUrls };
      })
    );

    return { success: true, submissions: submissionsWithUrls };
  } catch (error) {
    Logger.error(`Error listing submissions: ${error}`);
    return { success: false, error: 'Failed to list submissions' };
  }
}

/**
 * Get tasks assigned to user across all meetings (for dashboard)
 */
export async function getMyTasks(
  userId: string,
  filters?: { status?: TaskStatus; limit?: number }
): Promise<{ success: boolean; tasks?: TaskWithDetails[]; error?: string }> {
  try {
    const whereClause: any = {
      OR: [
        { assignedToUserId: userId },
        { createdByUserId: userId },
      ],
    };

    if (filters?.status) {
      whereClause.status = filters.status;
    }

    const tasks = await prisma.task.findMany({
      where: whereClause,
      include: {
        submissions: {
          include: { files: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        meeting: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: [
        { status: 'asc' },
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
      take: filters?.limit || 50,
    });

    // Fetch user details
    const userIds = new Set<string>();
    tasks.forEach(task => {
      if (task.createdByUserId) userIds.add(task.createdByUserId);
      if (task.assignedToUserId) userIds.add(task.assignedToUserId);
    });

    const users = await prisma.user.findMany({
      where: { id: { in: Array.from(userIds) } },
      select: { id: true, name: true, email: true },
    });

    const userMap = new Map(users.map(u => [u.id, u]));

    const tasksWithDetails = tasks.map(task => ({
      ...task,
      createdByUser: task.createdByUserId ? userMap.get(task.createdByUserId) || null : null,
      assignedToUser: task.assignedToUserId ? userMap.get(task.assignedToUserId) || null : null,
    }));

    return { success: true, tasks: tasksWithDetails as TaskWithDetails[] };
  } catch (error) {
    Logger.error(`Error getting user tasks: ${error}`);
    return { success: false, error: 'Failed to get tasks' };
  }
}

/**
 * Get meeting participants for task assignment dropdown
 */
export async function getMeetingParticipants(
  userId: string,
  meetingId: string
): Promise<{ success: boolean; participants?: Array<{ id: string; name: string | null; email: string }>; error?: string }> {
  try {
    const hasAccess = await verifyMeetingAccess(meetingId, userId);
    if (!hasAccess) {
      return { success: false, error: 'Not authorized to access this meeting' };
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        ownerId: true,
        ownerType: true,
        invitedParticipants: true,
      },
    });

    if (!meeting) {
      return { success: false, error: 'Meeting not found' };
    }

    const participants: Array<{ id: string; name: string | null; email: string }> = [];

    // Add meeting owner if personal
    if (meeting.ownerType === OwnerType.PERSONAL) {
      const owner = await prisma.user.findUnique({
        where: { id: meeting.ownerId },
        select: { id: true, name: true, email: true },
      });
      if (owner) {
        participants.push(owner);
      }
    }

    // Add invited participants who are registered users
    if (meeting.invitedParticipants) {
      const emails = meeting.invitedParticipants as string[];
      const users = await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { id: true, name: true, email: true },
      });
      users.forEach(u => {
        if (!participants.find(p => p.id === u.id)) {
          participants.push(u);
        }
      });
    }

    // Add users from attendance records
    const attendances = await prisma.attendance.findMany({
      where: { meetingId, ownerId: { not: null } },
      select: { ownerId: true },
    });

    const attendeeIds = attendances
      .map(a => a.ownerId)
      .filter((id): id is string => id !== null);

    if (attendeeIds.length > 0) {
      const attendeeUsers = await prisma.user.findMany({
        where: { id: { in: attendeeIds } },
        select: { id: true, name: true, email: true },
      });
      attendeeUsers.forEach(u => {
        if (!participants.find(p => p.id === u.id)) {
          participants.push(u);
        }
      });
    }

    return { success: true, participants };
  } catch (error) {
    Logger.error(`Error getting meeting participants: ${error}`);
    return { success: false, error: 'Failed to get participants' };
  }
}

/**
 * Get task statistics for a user (for dashboard)
 */
export async function getTaskStats(
  userId: string
): Promise<{ 
  success: boolean; 
  stats?: { 
    pending: number; 
    inProgress: number;
    completed: number; 
    overdue: number; 
    total: number;
  }; 
  error?: string 
}> {
  try {
    const now = new Date();

    // Get all tasks where user is creator or assignee
    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          { assignedToUserId: userId },
          { createdByUserId: userId },
        ],
      },
      select: {
        status: true,
        dueDate: true,
      },
    });

    let pending = 0;
    let inProgress = 0;
    let completed = 0;
    let overdue = 0;

    tasks.forEach(task => {
      if (task.status === TaskStatus.COMPLETED) {
        completed++;
      } else if (task.status === TaskStatus.IN_PROGRESS) {
        inProgress++;
        // Check if overdue
        if (task.dueDate && new Date(task.dueDate) < now) {
          overdue++;
        }
      } else if (task.status === TaskStatus.PENDING) {
        pending++;
        // Check if overdue
        if (task.dueDate && new Date(task.dueDate) < now) {
          overdue++;
        }
      }
    });

    return {
      success: true,
      stats: {
        pending,
        inProgress,
        completed,
        overdue,
        total: tasks.length,
      },
    };
  } catch (error) {
    Logger.error(`Error getting task stats: ${error}`);
    return { success: false, error: 'Failed to get task statistics' };
  }
}
