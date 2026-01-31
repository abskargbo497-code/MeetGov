/**
 * Personal Meeting Service
 * 
 * Handles meeting CRUD operations for personal (authenticated) users
 */

import { MeetingStatus, OwnerType, ProcessingStatus } from '@prisma/client';
import crypto from 'crypto';
import Logger from '../logger';
import { prisma } from '../lib/prisma';
import { sendMeetingInvites, parseParticipantsFromJson, MeetingInviteData } from './meeting-email.service';

// Data retention period (30 days for personal users, longer than guest)
const DATA_RETENTION_DAYS = 30;

export type CreateMeetingInput = {
  title: string;
  meetingType: 'INSTANT' | 'SCHEDULED';
  scheduledAt?: string;
  durationMinutes: number;
  participants?: Array<{ name?: string; email?: string }>;
  location?: string;
};

export type MeetingListItem = {
  id: string;
  title: string;
  meetingType: 'INSTANT' | 'SCHEDULED';
  status: MeetingStatus;
  scheduledAt: string | null;
  durationMinutes: number;
  participantCount: number;
  hasArtifacts: boolean;
  createdAt: string;
};

export type MeetingListResult = {
  meetings: MeetingListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type MeetingDetail = {
  id: string;
  title: string;
  description: string | null;
  meetingType: 'INSTANT' | 'SCHEDULED';
  status: MeetingStatus;
  processingStatus: ProcessingStatus;
  scheduledAt: string | null;
  durationMinutes: number;
  location: string | null;
  joinUrl: string;
  joinCode: string;
  participants: Array<{
    id: string;
    name: string;
    email: string | null;
    status: string;
    joinedAt: string | null;
  }>;
  hasTranscript: boolean;
  hasArtifacts: {
    summary: boolean;
    minutes: boolean;
    actionItems: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

/**
 * Create a new meeting for a personal user
 */
export async function createMeeting(
  userId: string,
  input: CreateMeetingInput
): Promise<{ meeting: MeetingDetail; inviteResults?: Array<{ email: string; success: boolean; error?: string }> }> {
  // Validate duration (max 60 minutes for personal users per requirements)
  const durationMinutes = Math.min(Math.max(input.durationMinutes, 5), 60); // 5 min to 60 min

  // Calculate scheduled start and end times
  const scheduledStart = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
  const scheduledEnd = new Date(scheduledStart.getTime() + durationMinutes * 60 * 1000);

  // Calculate expiration date for data retention
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + DATA_RETENTION_DAYS);

  // Generate unique access code
  const guestAccessCode = crypto.randomBytes(4).toString('hex').toUpperCase();

  // Create the meeting in the database
  const meeting = await prisma.meeting.create({
    data: {
      title: input.title,
      description: null,
      location: input.location || null,
      status: input.meetingType === 'INSTANT' ? MeetingStatus.ACTIVE : MeetingStatus.SCHEDULED,
      scheduledStart,
      scheduledEnd,
      ownerType: OwnerType.PERSONAL,
      ownerId: userId,
      guestAccessCode,
      invitedParticipants: input.participants || [],
      expiresAt,
    },
    include: {
      attendances: true,
      artifacts: true,
      transcripts: true,
    },
  });

  Logger.info(`[PersonalMeeting] Created meeting ${meeting.id} for user ${userId}`);

  // Send participant invite emails
  let inviteResults: Array<{ email: string; success: boolean; error?: string }> | undefined;
  
  if (input.participants && input.participants.length > 0) {
    const participantEmails = parseParticipantsFromJson(input.participants);
    
    if (participantEmails.length > 0) {
      const inviteData: MeetingInviteData = {
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        accessCode: guestAccessCode,
        scheduledAt: meeting.scheduledStart || undefined,
        durationMinutes,
        location: input.location || undefined,
      };

      try {
        inviteResults = await sendMeetingInvites(participantEmails, inviteData);
        const successCount = inviteResults.filter(r => r.success).length;
        Logger.info(`[PersonalMeeting] Sent ${successCount}/${inviteResults.length} invites for meeting ${meeting.id}`);
      } catch (err) {
        Logger.error(`[PersonalMeeting] Error sending invites for meeting ${meeting.id}:`, err);
      }
    }
  }

  return {
    meeting: formatMeetingDetail(meeting, durationMinutes),
    inviteResults,
  };
}

/**
 * List meetings owned by a personal user with pagination
 */
export async function listMeetingsByOwner(
  userId: string,
  page: number = 1,
  pageSize: number = 10
): Promise<MeetingListResult> {
  const skip = (page - 1) * pageSize;

  const [meetings, total] = await Promise.all([
    prisma.meeting.findMany({
      where: {
        ownerType: OwnerType.PERSONAL,
        ownerId: userId,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: {
        attendances: true,
        artifacts: true,
      },
    }),
    prisma.meeting.count({
      where: {
        ownerType: OwnerType.PERSONAL,
        ownerId: userId,
      },
    }),
  ]);

  const meetingItems: MeetingListItem[] = meetings.map((m) => {
    let durationMinutes = 30;
    if (m.scheduledStart && m.scheduledEnd) {
      durationMinutes = Math.round(
        (m.scheduledEnd.getTime() - m.scheduledStart.getTime()) / (60 * 1000)
      );
    }

    const meetingType = m.status === MeetingStatus.SCHEDULED || m.status === MeetingStatus.WAITING
      ? 'SCHEDULED'
      : 'INSTANT';

    return {
      id: m.id,
      title: m.title,
      meetingType,
      status: m.status,
      scheduledAt: m.scheduledStart?.toISOString() || null,
      durationMinutes,
      participantCount: m.attendances.length,
      hasArtifacts: m.artifacts.some(a => a.status === 'COMPLETED'),
      createdAt: m.createdAt.toISOString(),
    };
  });

  return {
    meetings: meetingItems,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Get meeting by ID with ownership check
 */
export async function getMeetingById(
  meetingId: string,
  userId: string
): Promise<MeetingDetail | null> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      attendances: true,
      artifacts: true,
      transcripts: true,
    },
  });

  if (!meeting) {
    return null;
  }

  // Ownership check
  if (meeting.ownerType !== OwnerType.PERSONAL || meeting.ownerId !== userId) {
    throw new Error('ACCESS_DENIED');
  }

  let durationMinutes = 30;
  if (meeting.scheduledStart && meeting.scheduledEnd) {
    durationMinutes = Math.round(
      (meeting.scheduledEnd.getTime() - meeting.scheduledStart.getTime()) / (60 * 1000)
    );
  }

  return formatMeetingDetail(meeting, durationMinutes);
}

/**
 * Update a meeting
 */
export async function updateMeeting(
  meetingId: string,
  userId: string,
  updates: Partial<CreateMeetingInput>
): Promise<MeetingDetail> {
  // First verify ownership
  const existing = await prisma.meeting.findUnique({
    where: { id: meetingId },
  });

  if (!existing) {
    throw new Error('MEETING_NOT_FOUND');
  }

  if (existing.ownerType !== OwnerType.PERSONAL || existing.ownerId !== userId) {
    throw new Error('ACCESS_DENIED');
  }

  // Cannot update ended or cancelled meetings
  if (existing.status === MeetingStatus.ENDED || 
      existing.status === MeetingStatus.COMPLETED ||
      existing.status === MeetingStatus.CANCELLED) {
    throw new Error('MEETING_LOCKED');
  }

  const updateData: any = {};

  if (updates.title) updateData.title = updates.title;
  if (updates.location !== undefined) updateData.location = updates.location;
  if (updates.participants) updateData.invitedParticipants = updates.participants;

  if (updates.scheduledAt && updates.durationMinutes) {
    const scheduledStart = new Date(updates.scheduledAt);
    const scheduledEnd = new Date(scheduledStart.getTime() + updates.durationMinutes * 60 * 1000);
    updateData.scheduledStart = scheduledStart;
    updateData.scheduledEnd = scheduledEnd;
  } else if (updates.durationMinutes && existing.scheduledStart) {
    const scheduledEnd = new Date(existing.scheduledStart.getTime() + updates.durationMinutes * 60 * 1000);
    updateData.scheduledEnd = scheduledEnd;
  }

  const updated = await prisma.meeting.update({
    where: { id: meetingId },
    data: updateData,
    include: {
      attendances: true,
      artifacts: true,
      transcripts: true,
    },
  });

  let durationMinutes = 30;
  if (updated.scheduledStart && updated.scheduledEnd) {
    durationMinutes = Math.round(
      (updated.scheduledEnd.getTime() - updated.scheduledStart.getTime()) / (60 * 1000)
    );
  }

  Logger.info(`[PersonalMeeting] Updated meeting ${meetingId}`);
  return formatMeetingDetail(updated, durationMinutes);
}

/**
 * Delete a meeting
 */
export async function deleteMeeting(
  meetingId: string,
  userId: string
): Promise<boolean> {
  const existing = await prisma.meeting.findUnique({
    where: { id: meetingId },
  });

  if (!existing) {
    throw new Error('MEETING_NOT_FOUND');
  }

  if (existing.ownerType !== OwnerType.PERSONAL || existing.ownerId !== userId) {
    throw new Error('ACCESS_DENIED');
  }

  await prisma.meeting.delete({
    where: { id: meetingId },
  });

  Logger.info(`[PersonalMeeting] Deleted meeting ${meetingId}`);
  return true;
}

/**
 * Resend invites for a meeting
 */
export async function resendInvites(
  meetingId: string,
  userId: string,
  participants: Array<{ name?: string; email?: string }>
): Promise<Array<{ email: string; success: boolean; error?: string }>> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
  });

  if (!meeting) {
    throw new Error('MEETING_NOT_FOUND');
  }

  if (meeting.ownerType !== OwnerType.PERSONAL || meeting.ownerId !== userId) {
    throw new Error('ACCESS_DENIED');
  }

  if (!meeting.guestAccessCode) {
    throw new Error('NO_ACCESS_CODE');
  }

  const participantEmails = parseParticipantsFromJson(participants);
  
  if (participantEmails.length === 0) {
    return [];
  }

  let durationMinutes = 30;
  if (meeting.scheduledStart && meeting.scheduledEnd) {
    durationMinutes = Math.round(
      (meeting.scheduledEnd.getTime() - meeting.scheduledStart.getTime()) / (60 * 1000)
    );
  }

  const inviteData: MeetingInviteData = {
    meetingId: meeting.id,
    meetingTitle: meeting.title,
    accessCode: meeting.guestAccessCode,
    scheduledAt: meeting.scheduledStart || undefined,
    durationMinutes,
    location: meeting.location || undefined,
  };

  const results = await sendMeetingInvites(participantEmails, inviteData);
  Logger.info(`[PersonalMeeting] Resent ${results.filter(r => r.success).length}/${results.length} invites for meeting ${meetingId}`);
  
  return results;
}

/**
 * Format meeting data for API response
 */
function formatMeetingDetail(
  meeting: any,
  durationMinutes: number
): MeetingDetail {
  const meetingType = meeting.status === MeetingStatus.SCHEDULED || meeting.status === MeetingStatus.WAITING
    ? 'SCHEDULED'
    : 'INSTANT';

  const participants = (meeting.attendances || []).map((att: any) => ({
    id: att.id,
    name: att.participantName,
    email: att.participantEmail,
    status: att.leftAt ? 'LEFT' : 'JOINED',
    joinedAt: att.joinedAt?.toISOString() || null,
  }));

  const artifacts = meeting.artifacts || [];
  const hasArtifacts = {
    summary: artifacts.some((a: any) => a.type === 'SUMMARY' && a.status === 'COMPLETED'),
    minutes: artifacts.some((a: any) => a.type === 'MINUTES' && a.status === 'COMPLETED'),
    actionItems: artifacts.some((a: any) => a.type === 'ACTION_ITEMS' && a.status === 'COMPLETED'),
  };

  return {
    id: meeting.id,
    title: meeting.title,
    description: meeting.description,
    meetingType,
    status: meeting.status,
    processingStatus: meeting.processingStatus,
    scheduledAt: meeting.scheduledStart?.toISOString() || null,
    durationMinutes,
    location: meeting.location,
    joinUrl: `/meeting/${meeting.id}?code=${meeting.guestAccessCode}`,
    joinCode: meeting.guestAccessCode || '',
    participants,
    hasTranscript: (meeting.transcripts || []).length > 0,
    hasArtifacts,
    createdAt: meeting.createdAt.toISOString(),
    updatedAt: meeting.updatedAt.toISOString(),
  };
}

/**
 * Get meeting statistics for a user (for dashboard)
 */
export async function getMeetingStats(
  userId: string
): Promise<{
  totalMeetings: number;
  totalDurationMinutes: number;
  completedMeetings: number;
  upcomingMeetings: number;
  liveMeetings: number;
}> {
  const now = new Date();

  const meetings = await prisma.meeting.findMany({
    where: {
      ownerType: OwnerType.PERSONAL,
      ownerId: userId,
    },
    select: {
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      actualStart: true,
      actualEnd: true,
    },
  });

  let totalDurationMinutes = 0;
  let completedMeetings = 0;
  let upcomingMeetings = 0;
  let liveMeetings = 0;

  meetings.forEach(m => {
    // Calculate duration
    if (m.scheduledStart && m.scheduledEnd) {
      totalDurationMinutes += Math.round(
        (m.scheduledEnd.getTime() - m.scheduledStart.getTime()) / (60 * 1000)
      );
    } else if (m.actualStart && m.actualEnd) {
      totalDurationMinutes += Math.round(
        (m.actualEnd.getTime() - m.actualStart.getTime()) / (60 * 1000)
      );
    }

    // Count by status
    if (m.status === MeetingStatus.COMPLETED || m.status === MeetingStatus.ENDED) {
      completedMeetings++;
    } else if (m.status === MeetingStatus.LIVE || m.status === MeetingStatus.ACTIVE) {
      liveMeetings++;
    } else if (m.status === MeetingStatus.SCHEDULED || m.status === MeetingStatus.WAITING) {
      if (m.scheduledStart && m.scheduledStart > now) {
        upcomingMeetings++;
      }
    }
  });

  return {
    totalMeetings: meetings.length,
    totalDurationMinutes,
    completedMeetings,
    upcomingMeetings,
    liveMeetings,
  };
}

export default {
  createMeeting,
  listMeetingsByOwner,
  getMeetingById,
  updateMeeting,
  deleteMeeting,
  resendInvites,
  getMeetingStats,
};
