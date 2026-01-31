/**
 * Participant Controller
 * 
 * Handles participant-specific endpoints for meeting attendance, tasks, and file submissions
 * Participants are authenticated users who join meetings but don't own them
 */

import { Request, Response } from 'express';
import Logger from '../logger';
import * as participantService from '../services/participant.service';
import { emitAttendanceEvent } from '../websocket/ws-server';
import r2Storage from '../services/r2-storage.service';
import { TaskStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import crypto from 'crypto';

/**
 * Get meeting info for join/resolution
 * GET /api/participant/meetings/:meetingId/join
 */
export const getMeetingJoinInfo = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;

    const meetingInfo = await participantService.getMeetingJoinInfo(meetingId);

    if (!meetingInfo) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    res.status(200).json({
      meetingId: meetingInfo.meetingId,
      meetingStatus: meetingInfo.meetingStatus,
      meetingTitle: meetingInfo.meetingTitle,
      organizerName: meetingInfo.organizerName,
      scheduledStart: meetingInfo.scheduledStart?.toISOString() || null,
      scheduledEnd: meetingInfo.scheduledEnd?.toISOString() || null,
      canCheckIn: meetingInfo.canCheckIn,
    });
  } catch (error) {
    Logger.error('[Participant] Error getting meeting join info:', error);
    res.status(500).json({ error: 'Failed to get meeting info' });
  }
};

/**
 * Join a meeting as authenticated participant
 * POST /api/participant/meetings/:meetingId/join
 */
export const joinMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const meetingId = req.params.meetingId as string;
    const { id: userId, name, email } = req.user;

    // Verify meeting exists
    const meetingInfo = await participantService.getMeetingJoinInfo(meetingId);
    if (!meetingInfo) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    // Create or get participant record
    const participant = await participantService.joinMeetingAsParticipant(
      meetingId,
      userId,
      name || 'Participant',
      email
    );

    res.status(200).json({
      success: true,
      participant: {
        id: participant.id,
        meetingId: participant.meetingId,
        role: participant.role,
        joinedAt: participant.joinedAt.toISOString(),
        checkedIn: !!participant.checkedInAt,
      },
      meeting: {
        id: meetingInfo.meetingId,
        title: meetingInfo.meetingTitle,
        status: meetingInfo.meetingStatus,
        organizerName: meetingInfo.organizerName,
      },
    });
  } catch (error) {
    Logger.error('[Participant] Error joining meeting:', error);
    res.status(500).json({ error: 'Failed to join meeting' });
  }
};

/**
 * Check in to a meeting (attendance)
 * POST /api/participant/meetings/:meetingId/attendance
 */
export const checkIn = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const meetingId = req.params.meetingId as string;
    const { id: userId, name, email } = req.user;

    // Verify meeting exists and can accept check-ins
    const meetingInfo = await participantService.getMeetingJoinInfo(meetingId);
    if (!meetingInfo) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    if (!meetingInfo.canCheckIn) {
      res.status(400).json({ error: 'Check-in is not available for this meeting' });
      return;
    }

    // Check if user has joined first
    const isParticipant = await participantService.isParticipant(meetingId, userId);
    if (!isParticipant) {
      // Auto-join if not already a participant
      await participantService.joinMeetingAsParticipant(
        meetingId,
        userId,
        name || 'Participant',
        email
      );
    }

    // Check in
    const result = await participantService.checkInToMeeting(meetingId, userId);

    if (!result.success || !result.attendance) {
      res.status(400).json({ error: 'Failed to check in' });
      return;
    }

    // Emit WebSocket event
    emitAttendanceEvent(meetingId, {
      type: 'attendance:checked-in',
      meetingId,
      attendee: {
        name: result.attendance.participantName,
        email: result.attendance.participantEmail,
        checkedInAt: result.attendance.checkedInAt?.toISOString() || new Date().toISOString(),
      },
      totalCount: result.totalCount,
    });

    res.status(200).json({
      success: true,
      attendance: {
        id: result.attendance.id,
        name: result.attendance.participantName,
        email: result.attendance.participantEmail,
        checkedInAt: result.attendance.checkedInAt?.toISOString(),
      },
      totalCount: result.totalCount,
    });
  } catch (error) {
    Logger.error('[Participant] Error checking in:', error);
    res.status(500).json({ error: 'Failed to check in' });
  }
};

/**
 * Get attendance list for a meeting
 * GET /api/participant/meetings/:meetingId/attendance
 */
export const getAttendance = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const meetingId = req.params.meetingId as string;
    const { id: userId } = req.user;

    // Verify user is participant or owner
    const isParticipant = await participantService.isParticipant(meetingId, userId);
    const isOwner = await participantService.isMeetingOwner(meetingId, userId);

    if (!isParticipant && !isOwner) {
      res.status(403).json({ error: 'Not authorized to view attendance' });
      return;
    }

    const result = await participantService.getMeetingAttendance(meetingId);

    res.status(200).json({
      totalCount: result.totalCount,
      attendees: result.attendees.map((a) => ({
        id: a.id,
        name: a.participantName,
        email: a.participantEmail,
        checkedInAt: a.checkedInAt?.toISOString() || null,
      })),
    });
  } catch (error) {
    Logger.error('[Participant] Error getting attendance:', error);
    res.status(500).json({ error: 'Failed to get attendance' });
  }
};

/**
 * Get tasks assigned to the current participant
 * GET /api/participant/meetings/:meetingId/tasks/me
 */
export const getMyTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const meetingId = req.params.meetingId as string;
    const { id: userId } = req.user;

    // Verify user is participant
    const isParticipant = await participantService.isParticipant(meetingId, userId);
    if (!isParticipant) {
      res.status(403).json({ error: 'Not a participant in this meeting' });
      return;
    }

    const tasks = await participantService.getParticipantTasks(meetingId, userId);

    res.status(200).json({
      tasks,
      totalCount: tasks.length,
    });
  } catch (error) {
    Logger.error('[Participant] Error getting tasks:', error);
    res.status(500).json({ error: 'Failed to get tasks' });
  }
};

/**
 * Submit a task
 * POST /api/participant/tasks/:taskId/submit
 */
export const submitTask = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const taskId = req.params.taskId as string;
    const { notes } = req.body;
    const { id: userId, email } = req.user;

    const result = await participantService.submitTask(taskId, userId, email, notes);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(200).json({
      success: true,
      submissionId: result.submissionId,
    });
  } catch (error) {
    Logger.error('[Participant] Error submitting task:', error);
    res.status(500).json({ error: 'Failed to submit task' });
  }
};

/**
 * Get presigned URL for file upload
 * POST /api/participant/tasks/:taskId/upload-url
 */
export const getUploadUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const taskId = req.params.taskId as string;
    const { fileName, contentType, fileSize } = req.body;
    const { id: userId, email } = req.user;

    // Validate file
    if (!fileName || !contentType) {
      res.status(400).json({ error: 'fileName and contentType are required' });
      return;
    }

    // Validate file size (max 50MB)
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (fileSize && fileSize > MAX_FILE_SIZE) {
      res.status(400).json({ error: 'File size exceeds 50MB limit' });
      return;
    }

    // Validate content type
    const ALLOWED_TYPES = [
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

    if (!ALLOWED_TYPES.includes(contentType)) {
      res.status(400).json({ error: 'File type not allowed' });
      return;
    }

    // Verify task exists and belongs to user
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        meetingId: true,
        assigneeEmail: true,
        participantId: true,
      },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Check ownership
    const isAssigned =
      task.assigneeEmail === email || task.participantId === userId;

    if (!isAssigned) {
      res.status(403).json({ error: 'Not authorized to upload to this task' });
      return;
    }

    // Generate object name
    const fileId = crypto.randomBytes(8).toString('hex');
    const ext = fileName.split('.').pop() || 'bin';
    const objectName = `tasks/${task.meetingId}/${taskId}/${fileId}.${ext}`;

    // Generate presigned URL
    const { url, expiresAt } = await r2Storage.createSignedUploadUrl({
      objectName,
      contentType,
      expiresInMinutes: 15,
    });

    res.status(200).json({
      uploadUrl: url,
      objectName,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    Logger.error('[Participant] Error getting upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
};

/**
 * Complete file upload and attach to task submission
 * POST /api/participant/tasks/:taskId/upload-complete
 */
export const completeUpload = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const taskId = req.params.taskId as string;
    const { objectName, fileName, fileSize, contentType, notes } = req.body;
    const { id: userId, email } = req.user;

    if (!objectName) {
      res.status(400).json({ error: 'objectName is required' });
      return;
    }

    // Verify task exists and belongs to user
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        meetingId: true,
        assigneeEmail: true,
        participantId: true,
        status: true,
      },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Check ownership
    const isAssigned =
      task.assigneeEmail === email || task.participantId === userId;

    if (!isAssigned) {
      res.status(403).json({ error: 'Not authorized to upload to this task' });
      return;
    }

    // Generate download URL
    const { url: fileUrl } = await r2Storage.createSignedDownloadUrl({
      objectName,
      contentType: contentType || 'application/octet-stream',
      expiresInMinutes: 60 * 24 * 7, // 7 days
    });

    // Create submission with file
    const submission = await prisma.taskSubmission.create({
      data: {
        taskId,
        notes,
        submittedByType: 'USER',
        submittedByUserId: userId,
        submittedByEmail: email,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        files: {
          create: {
            objectName,
            fileUrl,
            fileSize: BigInt(fileSize || 0),
            mimeType: contentType || 'application/octet-stream',
            originalFileName: fileName,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        },
      },
      include: {
        files: true,
      },
    });

    // Update task status
    await prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.SUBMITTED },
    });

    Logger.info(`[Participant] User ${userId} uploaded file for task ${taskId}`);

    res.status(200).json({
      success: true,
      submission: {
        id: submission.id,
        notes: submission.notes,
        createdAt: submission.createdAt.toISOString(),
        files: (submission.files || []).map((f: any) => ({
          id: f.id,
          fileName: f.originalFileName,
          mimeType: f.mimeType,
        })),
      },
    });
  } catch (error) {
    Logger.error('[Participant] Error completing upload:', error);
    res.status(500).json({ error: 'Failed to complete upload' });
  }
};

/**
 * Get participant's check-in status for a meeting
 * GET /api/participant/meetings/:meetingId/my-status
 */
export const getMyStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const meetingId = req.params.meetingId as string;
    const { id: userId } = req.user;

    // Check if user is a participant
    const attendance = await prisma.attendance.findFirst({
      where: {
        meetingId,
        ownerId: userId,
      },
      select: {
        id: true,
        joinedAt: true,
        checkedInAt: true,
        role: true,
      },
    });

    // Check if user is the owner
    const isOwner = await participantService.isMeetingOwner(meetingId, userId);

    if (!attendance && !isOwner) {
      res.status(200).json({
        isParticipant: false,
        isOwner: false,
        isCheckedIn: false,
      });
      return;
    }

    res.status(200).json({
      isParticipant: !!attendance,
      isOwner,
      isCheckedIn: !!attendance?.checkedInAt,
      joinedAt: attendance?.joinedAt?.toISOString() || null,
      checkedInAt: attendance?.checkedInAt?.toISOString() || null,
      role: isOwner ? 'ORGANIZER' : (attendance?.role || 'PARTICIPANT'),
    });
  } catch (error) {
    Logger.error('[Participant] Error getting status:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
};

export default {
  getMeetingJoinInfo,
  joinMeeting,
  checkIn,
  getAttendance,
  getMyTasks,
  submitTask,
  getUploadUrl,
  completeUpload,
  getMyStatus,
};
