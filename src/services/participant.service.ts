/**
 * Participant Service
 * 
 * Handles participant-specific operations for meeting attendance and tasks
 * Participants are authenticated users who join meetings but don't own them
 */

import { PrismaClient, MeetingStatus, OwnerType, TaskStatus } from '@prisma/client';
import Logger from '../logger';

const prisma = new PrismaClient();

export type MeetingJoinInfo = {
  meetingId: string;
  meetingStatus: MeetingStatus;
  meetingTitle: string;
  organizerName: string | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  canCheckIn: boolean;
};

export type ParticipantRecord = {
  id: string;
  meetingId: string;
  userId: string;
  joinedAt: Date;
  checkedInAt: Date | null;
  role: string;
};

export type AttendanceRecord = {
  id: string;
  participantName: string;
  participantEmail: string | null;
  checkedInAt: Date | null;
  userId: string | null;
};

/**
 * Resolve meeting info for join page
 * Returns meeting status and basic info for routing decisions
 */
export async function getMeetingJoinInfo(meetingId: string): Promise<MeetingJoinInfo | null> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      title: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      ownerId: true,
      ownerType: true,
    },
  });

  if (!meeting) {
    return null;
  }

  // Get organizer name
  let organizerName: string | null = null;
  if (meeting.ownerType === OwnerType.PERSONAL) {
    const owner = await prisma.user.findUnique({
      where: { id: meeting.ownerId },
      select: { name: true },
    });
    organizerName = owner?.name || null;
  }

  // Determine if check-in is allowed
  const isExpired = meeting.scheduledEnd && new Date() > meeting.scheduledEnd;
  const isCancelled = meeting.status === MeetingStatus.CANCELLED;
  const isCompleted = meeting.status === MeetingStatus.COMPLETED;
  const canCheckIn = !isExpired && !isCancelled && !isCompleted;

  return {
    meetingId: meeting.id,
    meetingStatus: meeting.status,
    meetingTitle: meeting.title,
    organizerName,
    scheduledStart: meeting.scheduledStart,
    scheduledEnd: meeting.scheduledEnd,
    canCheckIn,
  };
}

/**
 * Create or get participant record when user joins a meeting
 * Creates an Attendance record linked to the user
 */
export async function joinMeetingAsParticipant(
  meetingId: string,
  userId: string,
  userName: string,
  userEmail: string
): Promise<ParticipantRecord> {
  // Check if participant already joined
  const existingAttendance = await prisma.attendance.findFirst({
    where: {
      meetingId,
      ownerId: userId,
      ownerType: OwnerType.PERSONAL,
    },
  });

  if (existingAttendance) {
    Logger.info(`[Participant] User ${userId} already joined meeting ${meetingId}`);
    return {
      id: existingAttendance.id,
      meetingId: existingAttendance.meetingId,
      userId: existingAttendance.ownerId || userId,
      joinedAt: existingAttendance.joinedAt,
      checkedInAt: existingAttendance.checkedInAt,
      role: existingAttendance.role || 'PARTICIPANT',
    };
  }

  // Create new attendance record for participant
  const attendance = await prisma.attendance.create({
    data: {
      meetingId,
      participantName: userName,
      participantEmail: userEmail,
      ownerType: OwnerType.PERSONAL,
      ownerId: userId,
      role: 'PARTICIPANT',
      joinedAt: new Date(),
    },
  });

  Logger.info(`[Participant] User ${userId} joined meeting ${meetingId}`);

  return {
    id: attendance.id,
    meetingId: attendance.meetingId,
    userId: attendance.ownerId || userId,
    joinedAt: attendance.joinedAt,
    checkedInAt: attendance.checkedInAt,
    role: attendance.role || 'PARTICIPANT',
  };
}

/**
 * Check in to a meeting (idempotent)
 * Updates the attendance record with check-in time
 */
export async function checkInToMeeting(
  meetingId: string,
  userId: string
): Promise<{ success: boolean; attendance: AttendanceRecord | null; totalCount: number }> {
  // Find existing attendance record
  const existingAttendance = await prisma.attendance.findFirst({
    where: {
      meetingId,
      ownerId: userId,
      ownerType: OwnerType.PERSONAL,
    },
  });

  if (!existingAttendance) {
    return { success: false, attendance: null, totalCount: 0 };
  }

  // If already checked in, return existing record (idempotent)
  if (existingAttendance.checkedInAt) {
    const totalCount = await prisma.attendance.count({
      where: { meetingId, checkedInAt: { not: null } },
    });

    return {
      success: true,
      attendance: {
        id: existingAttendance.id,
        participantName: existingAttendance.participantName,
        participantEmail: existingAttendance.participantEmail,
        checkedInAt: existingAttendance.checkedInAt,
        userId: existingAttendance.ownerId,
      },
      totalCount,
    };
  }

  // Update with check-in time
  const attendance = await prisma.attendance.update({
    where: { id: existingAttendance.id },
    data: {
      checkedInAt: new Date(),
      checkedInVia: 'AUTH',
    },
  });

  const totalCount = await prisma.attendance.count({
    where: { meetingId, checkedInAt: { not: null } },
  });

  Logger.info(`[Participant] User ${userId} checked in to meeting ${meetingId}`);

  return {
    success: true,
    attendance: {
      id: attendance.id,
      participantName: attendance.participantName,
      participantEmail: attendance.participantEmail,
      checkedInAt: attendance.checkedInAt,
      userId: attendance.ownerId,
    },
    totalCount,
  };
}

/**
 * Get attendance list for a meeting with names
 */
export async function getMeetingAttendance(
  meetingId: string
): Promise<{ attendees: AttendanceRecord[]; totalCount: number }> {
  const attendances = await prisma.attendance.findMany({
    where: { meetingId },
    orderBy: { checkedInAt: 'desc' },
    select: {
      id: true,
      participantName: true,
      participantEmail: true,
      checkedInAt: true,
      ownerId: true,
    },
  });

  return {
    attendees: attendances.map((a) => ({
      id: a.id,
      participantName: a.participantName,
      participantEmail: a.participantEmail,
      checkedInAt: a.checkedInAt,
      userId: a.ownerId,
    })),
    totalCount: attendances.length,
  };
}

/**
 * Check if user is a participant in a meeting
 */
export async function isParticipant(meetingId: string, userId: string): Promise<boolean> {
  const attendance = await prisma.attendance.findFirst({
    where: {
      meetingId,
      ownerId: userId,
      ownerType: OwnerType.PERSONAL,
    },
  });

  return !!attendance;
}

/**
 * Check if user is the owner of a meeting
 */
export async function isMeetingOwner(meetingId: string, userId: string): Promise<boolean> {
  const meeting = await prisma.meeting.findFirst({
    where: {
      id: meetingId,
      ownerId: userId,
      ownerType: OwnerType.PERSONAL,
    },
  });

  return !!meeting;
}

/**
 * Get tasks assigned to a participant for a specific meeting
 */
export async function getParticipantTasks(
  meetingId: string,
  userId: string
): Promise<any[]> {
  // Get user email for task lookup
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user) {
    return [];
  }

  // Find tasks assigned to this user (by email or userId)
  const tasks = await prisma.task.findMany({
    where: {
      meetingId,
      OR: [
        { assigneeEmail: user.email },
        { participantId: userId },
      ],
    },
    include: {
      submissions: {
        include: {
          files: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate?.toISOString() || null,
    requiresUpload: true, // Default to true for now
    hasSubmission: task.submissions.length > 0,
    submission: task.submissions[0]
      ? {
          id: task.submissions[0].id,
          notes: task.submissions[0].notes,
          createdAt: task.submissions[0].createdAt.toISOString(),
          files: task.submissions[0].files.map((f) => ({
            id: f.id,
            fileName: f.originalFileName,
            fileUrl: f.fileUrl,
            mimeType: f.mimeType,
          })),
        }
      : null,
    createdAt: task.createdAt.toISOString(),
  }));
}

/**
 * Submit a task with optional file
 */
export async function submitTask(
  taskId: string,
  userId: string,
  userEmail: string,
  notes?: string
): Promise<{ success: boolean; submissionId: string | null; error?: string }> {
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
    return { success: false, submissionId: null, error: 'Task not found' };
  }

  // Check ownership
  const isAssigned =
    task.assigneeEmail === userEmail || task.participantId === userId;

  if (!isAssigned) {
    return { success: false, submissionId: null, error: 'Not authorized to submit this task' };
  }

  // Check if already submitted
  if (task.status === TaskStatus.SUBMITTED || task.status === TaskStatus.COMPLETED) {
    return { success: false, submissionId: null, error: 'Task already submitted' };
  }

  // Create submission
  const submission = await prisma.taskSubmission.create({
    data: {
      taskId,
      notes,
      submittedByType: 'USER',
      submittedByUserId: userId,
      submittedByEmail: userEmail,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  });

  // Update task status
  await prisma.task.update({
    where: { id: taskId },
    data: { status: TaskStatus.SUBMITTED },
  });

  Logger.info(`[Participant] User ${userId} submitted task ${taskId}`);

  return { success: true, submissionId: submission.id };
}

export default {
  getMeetingJoinInfo,
  joinMeetingAsParticipant,
  checkInToMeeting,
  getMeetingAttendance,
  isParticipant,
  isMeetingOwner,
  getParticipantTasks,
  submitTask,
};
