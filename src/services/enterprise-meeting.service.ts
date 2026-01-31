/**
 * Enterprise Meeting Service
 * 
 * Handles meeting CRUD operations for enterprise users (ORGANIZER role)
 * Follows the same pattern as personal-meeting.service.ts
 */

import { MeetingStatus, OwnerType, ProcessingStatus, EnterpriseRole } from '@prisma/client';
import crypto from 'crypto';
import Logger from '../logger';
import { prisma } from '../lib/prisma';
import { sendMeetingInvites, parseParticipantsFromJson, MeetingInviteData } from './meeting-email.service';

// Data retention period (90 days for enterprise users)
const DATA_RETENTION_DAYS = 90;

export type CreateEnterpriseMeetingInput = {
  title: string;
  meetingType: 'INSTANT' | 'SCHEDULED';
  scheduledAt?: string;
  durationMinutes: number;
  participants?: Array<{ name?: string; email?: string }>;
  location?: string;
};

export type EnterpriseMeetingListItem = {
  id: string;
  title: string;
  meetingType: 'INSTANT' | 'SCHEDULED';
  status: MeetingStatus;
  scheduledAt: string | null;
  durationMinutes: number;
  participantCount: number;
  hasArtifacts: boolean;
  isOwner: boolean;
  organizerName: string;
  createdAt: string;
};

export type EnterpriseMeetingListResult = {
  meetings: EnterpriseMeetingListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type EnterpriseMeetingDetail = {
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
  isOwner: boolean;
  organizerName: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Create a new meeting for an enterprise organizer
 */
export async function createMeeting(
  userId: string,
  enterpriseId: string,
  input: CreateEnterpriseMeetingInput
): Promise<{ meeting: EnterpriseMeetingDetail; inviteResults?: Array<{ email: string; success: boolean; error?: string }> }> {
  // Enterprise users can have longer meetings (up to 180 minutes)
  const durationMinutes = Math.min(Math.max(input.durationMinutes, 5), 180);

  // Calculate scheduled start and end times
  const scheduledStart = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
  const scheduledEnd = new Date(scheduledStart.getTime() + durationMinutes * 60 * 1000);

  // Calculate expiration date for data retention
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + DATA_RETENTION_DAYS);

  // Generate unique access code
  const guestAccessCode = crypto.randomBytes(4).toString('hex').toUpperCase();

  // Get organizer info
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true }
  });

  // Create the meeting in the database
  const meeting = await prisma.meeting.create({
    data: {
      title: input.title,
      description: null,
      location: input.location || null,
      status: input.meetingType === 'INSTANT' ? MeetingStatus.ACTIVE : MeetingStatus.SCHEDULED,
      scheduledStart,
      scheduledEnd,
      ownerType: OwnerType.ENTERPRISE,
      ownerId: userId,
      enterpriseId,
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

  Logger.info(`[EnterpriseMeeting] Created meeting ${meeting.id} for organizer ${userId} in enterprise ${enterpriseId}`);

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
        Logger.info(`[EnterpriseMeeting] Sent ${successCount}/${inviteResults.length} invites for meeting ${meeting.id}`);
      } catch (err) {
        Logger.error(`[EnterpriseMeeting] Error sending invites for meeting ${meeting.id}:`, err);
      }
    }
  }

  return {
    meeting: formatMeetingDetail(meeting, durationMinutes, userId, user?.name || 'Organizer'),
    inviteResults,
  };
}

/**
 * List meetings for an enterprise (accessible by ORGANIZER and ADMIN)
 * ORGANIZER sees all enterprise meetings, ADMIN sees all with read-only access
 */
export async function listMeetings(
  userId: string,
  enterpriseId: string,
  role: EnterpriseRole,
  page: number = 1,
  pageSize: number = 10,
  filters?: {
    status?: string;
    search?: string;
  }
): Promise<EnterpriseMeetingListResult> {
  const skip = (page - 1) * pageSize;

  // Build where clause
  const where: any = {
    ownerType: OwnerType.ENTERPRISE,
    enterpriseId,
  };

  if (filters?.status && filters.status !== 'all') {
    where.status = filters.status;
  }

  if (filters?.search) {
    where.title = {
      contains: filters.search,
      mode: 'insensitive',
    };
  }

  const [meetings, total] = await Promise.all([
    prisma.meeting.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: {
        attendances: true,
        artifacts: true,
      },
    }),
    prisma.meeting.count({ where }),
  ]);

  // Get organizer names
  const ownerIds = [...new Set(meetings.map(m => m.ownerId))];
  const owners = await prisma.user.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, name: true },
  });
  const ownerMap = new Map(owners.map(o => [o.id, o.name || 'Organizer']));

  const meetingItems: EnterpriseMeetingListItem[] = meetings.map((m) => {
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
      isOwner: m.ownerId === userId,
      organizerName: ownerMap.get(m.ownerId) || 'Organizer',
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
 * Get meeting by ID with enterprise access check
 */
export async function getMeetingById(
  meetingId: string,
  userId: string,
  enterpriseId: string,
  role: EnterpriseRole
): Promise<EnterpriseMeetingDetail | null> {
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

  // Enterprise access check
  if (meeting.ownerType !== OwnerType.ENTERPRISE || meeting.enterpriseId !== enterpriseId) {
    throw new Error('ACCESS_DENIED');
  }

  // Get organizer info
  const owner = await prisma.user.findUnique({
    where: { id: meeting.ownerId },
    select: { name: true }
  });

  let durationMinutes = 30;
  if (meeting.scheduledStart && meeting.scheduledEnd) {
    durationMinutes = Math.round(
      (meeting.scheduledEnd.getTime() - meeting.scheduledStart.getTime()) / (60 * 1000)
    );
  }

  return formatMeetingDetail(meeting, durationMinutes, userId, owner?.name || 'Organizer');
}

/**
 * Update a meeting (ORGANIZER only - must be owner or have ORGANIZER role)
 */
export async function updateMeeting(
  meetingId: string,
  userId: string,
  enterpriseId: string,
  role: EnterpriseRole,
  updates: Partial<CreateEnterpriseMeetingInput>
): Promise<EnterpriseMeetingDetail> {
  // First verify access
  const existing = await prisma.meeting.findUnique({
    where: { id: meetingId },
  });

  if (!existing) {
    throw new Error('MEETING_NOT_FOUND');
  }

  if (existing.ownerType !== OwnerType.ENTERPRISE || existing.enterpriseId !== enterpriseId) {
    throw new Error('ACCESS_DENIED');
  }

  // ADMIN has read-only access
  if (role === EnterpriseRole.ADMIN) {
    throw new Error('READ_ONLY_ACCESS');
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

  // Get organizer info
  const owner = await prisma.user.findUnique({
    where: { id: updated.ownerId },
    select: { name: true }
  });

  let durationMinutes = 30;
  if (updated.scheduledStart && updated.scheduledEnd) {
    durationMinutes = Math.round(
      (updated.scheduledEnd.getTime() - updated.scheduledStart.getTime()) / (60 * 1000)
    );
  }

  Logger.info(`[EnterpriseMeeting] Updated meeting ${meetingId}`);
  return formatMeetingDetail(updated, durationMinutes, userId, owner?.name || 'Organizer');
}

/**
 * Delete a meeting (ORGANIZER only)
 */
export async function deleteMeeting(
  meetingId: string,
  userId: string,
  enterpriseId: string,
  role: EnterpriseRole
): Promise<boolean> {
  const existing = await prisma.meeting.findUnique({
    where: { id: meetingId },
  });

  if (!existing) {
    throw new Error('MEETING_NOT_FOUND');
  }

  if (existing.ownerType !== OwnerType.ENTERPRISE || existing.enterpriseId !== enterpriseId) {
    throw new Error('ACCESS_DENIED');
  }

  // ADMIN has read-only access
  if (role === EnterpriseRole.ADMIN) {
    throw new Error('READ_ONLY_ACCESS');
  }

  await prisma.meeting.delete({
    where: { id: meetingId },
  });

  Logger.info(`[EnterpriseMeeting] Deleted meeting ${meetingId}`);
  return true;
}

/**
 * Get meeting statistics for enterprise dashboard
 */
export async function getMeetingStats(
  enterpriseId: string
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
      ownerType: OwnerType.ENTERPRISE,
      enterpriseId,
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

/**
 * Format meeting data for API response
 */
function formatMeetingDetail(
  meeting: any,
  durationMinutes: number,
  currentUserId: string,
  organizerName: string
): EnterpriseMeetingDetail {
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
    isOwner: meeting.ownerId === currentUserId,
    organizerName,
    createdAt: meeting.createdAt.toISOString(),
    updatedAt: meeting.updatedAt.toISOString(),
  };
}

export default {
  createMeeting,
  listMeetings,
  getMeetingById,
  updateMeeting,
  deleteMeeting,
  getMeetingStats,
};
