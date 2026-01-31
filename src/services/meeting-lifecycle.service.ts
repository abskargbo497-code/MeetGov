/**
 * Meeting Lifecycle Service
 * 
 * Backend-authoritative control over meeting state transitions.
 * Handles start, pause, resume, end with strict validation.
 */

import { MeetingStatus, OwnerType } from '@prisma/client';
import Logger from '../logger';
import { emitMeetingEvent } from '../websocket/ws-server';
import { canControlMeeting, RequestContext, MeetingOwnership } from '../lib/meeting-auth';
import prisma from '../lib/prisma';

// Recording state enum (matches schema)
export type RecordingState = 'NOT_STARTED' | 'RECORDING' | 'PAUSED' | 'STOPPED';

// Meeting lifecycle response
export type MeetingLifecycleResponse = {
  success: boolean;
  meetingId: string;
  status: MeetingStatus;
  recordingState: RecordingState;
  startedAt: string | null;
  endsAt: string | null;
  error?: string;
};

// State transition validation
const VALID_TRANSITIONS: Record<RecordingState, RecordingState[]> = {
  'NOT_STARTED': ['RECORDING'],
  'RECORDING': ['PAUSED', 'STOPPED'],
  'PAUSED': ['RECORDING', 'STOPPED'],
  'STOPPED': [] // Terminal state
};

/**
 * Validate meeting ownership using unified auth module
 * Supports guest users, personal users, and enterprise users
 * 
 * @param meetingId Meeting ID to validate
 * @param context Request context with identity information
 */
async function validateOwnership(
  meetingId: string, 
  context: RequestContext
): Promise<{ valid: boolean; meeting: any; error?: string }> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId }
  });

  if (!meeting) {
    return { valid: false, meeting: null, error: 'Meeting not found' };
  }

  const meetingOwnership: MeetingOwnership = {
    id: meeting.id,
    ownerType: meeting.ownerType,
    ownerId: meeting.ownerId,
    guestSessionId: meeting.guestSessionId,
    enterpriseId: meeting.enterpriseId,
  };

  if (!canControlMeeting(meetingOwnership, context)) {
    return { valid: false, meeting, error: 'Not authorized to control this meeting' };
  }

  return { valid: true, meeting };
}

/**
 * Legacy wrapper for backward compatibility
 * Converts ownerId string to RequestContext
 * @deprecated Use validateOwnership with RequestContext directly
 */
async function validateOwnershipLegacy(
  meetingId: string,
  ownerId: string
): Promise<{ valid: boolean; meeting: any; error?: string }> {
  // First fetch meeting to determine owner type
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId }
  });

  if (!meeting) {
    return { valid: false, meeting: null, error: 'Meeting not found' };
  }

  // Build context based on meeting's owner type
  let context: RequestContext;
  
  if (meeting.ownerType === OwnerType.GUEST) {
    // For guest meetings, treat ownerId as guestSessionId
    context = { guestSessionId: ownerId };
  } else {
    // For personal/enterprise meetings, treat ownerId as userId
    context = { user: { id: ownerId } };
  }

  // Debug logging
  Logger.debug('validateOwnershipLegacy', {
    meetingId,
    ownerId,
    meetingOwnerType: meeting.ownerType,
    meetingOwnerId: meeting.ownerId,
    meetingGuestSessionId: meeting.guestSessionId,
    contextGuestSessionId: context.guestSessionId,
    contextUserId: context.user?.id,
  });

  const meetingOwnership: MeetingOwnership = {
    id: meeting.id,
    ownerType: meeting.ownerType,
    ownerId: meeting.ownerId,
    guestSessionId: meeting.guestSessionId,
    enterpriseId: meeting.enterpriseId,
  };

  if (!canControlMeeting(meetingOwnership, context)) {
    // For PERSONAL meetings, check if the meeting's ownerId is a linked accountId
    // This handles cases where meetings were created with provider accountId (e.g., Google OAuth ID)
    // but the session returns the internal user ID (UUID)
    if (meeting.ownerType === OwnerType.PERSONAL && context.user?.id) {
      const linkedAccount = await prisma.account.findFirst({
        where: {
          userId: ownerId,
          accountId: meeting.ownerId
        }
      });

      if (linkedAccount) {
        Logger.debug('validateOwnershipLegacy: matched via linked account', {
          userId: ownerId,
          accountId: meeting.ownerId,
          providerId: linkedAccount.providerId
        });
        return { valid: true, meeting };
      }
    }

    return { 
      valid: false, 
      meeting, 
      error: `Not authorized: ownerType=${meeting.ownerType}, expected ownerId=${meeting.ownerId}, got=${ownerId}` 
    };
  }

  return { valid: true, meeting };
}

/**
 * Validate state transition
 */
function validateTransition(
  currentState: RecordingState, 
  targetState: RecordingState
): boolean {
  return VALID_TRANSITIONS[currentState]?.includes(targetState) ?? false;
}

/**
 * Calculate meeting end time
 */
function calculateEndsAt(startedAt: Date, durationMinutes: number): Date {
  return new Date(startedAt.getTime() + durationMinutes * 60 * 1000);
}

/**
 * Start a meeting recording
 * - Sets actualStart to server timestamp
 * - Computes endsAt = startedAt + durationMinutes
 * - Transitions to RECORDING state
 */
export async function startMeeting(
  meetingId: string
): Promise<MeetingLifecycleResponse> {
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId }
    });

    if (!meeting) {
      return {
        success: false,
        meetingId,
        status: MeetingStatus.SCHEDULED,
        recordingState: 'NOT_STARTED',
        startedAt: null,
        endsAt: null,
        error: 'Meeting not found'
      };
    }

    const currentState = meeting.recordingStatus as RecordingState;

    // Disallow starting twice
    if (currentState !== 'NOT_STARTED') {
      return {
        success: false,
        meetingId,
        status: meeting.status,
        recordingState: currentState,
        startedAt: meeting.actualStart?.toISOString() || null,
        endsAt: meeting.scheduledEnd?.toISOString() || null,
        error: 'Meeting has already been started'
      };
    }

    // Validate transition
    if (!validateTransition(currentState, 'RECORDING')) {
      return {
        success: false,
        meetingId,
        status: meeting.status,
        recordingState: currentState,
        startedAt: null,
        endsAt: null,
        error: `Cannot transition from ${currentState} to RECORDING`
      };
    }

    // Calculate duration from scheduled times
    let durationMinutes = 30;
    if (meeting.scheduledStart && meeting.scheduledEnd) {
      durationMinutes = Math.round(
        (meeting.scheduledEnd.getTime() - meeting.scheduledStart.getTime()) / (60 * 1000)
      );
    }

    // Server-authoritative timestamps
    const startedAt = new Date();
    const endsAt = calculateEndsAt(startedAt, durationMinutes);

    // Update meeting in database
    const updatedMeeting = await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: MeetingStatus.ACTIVE,
        recordingStatus: 'RECORDING',
        actualStart: startedAt,
        scheduledEnd: endsAt
      }
    });

    Logger.info(`Meeting started: ${meetingId}, endsAt: ${endsAt.toISOString()}`);

    // Schedule auto-end job (will be implemented in worker)
    await scheduleAutoEnd(meetingId, endsAt);

    return {
      success: true,
      meetingId,
      status: updatedMeeting.status,
      recordingState: 'RECORDING',
      startedAt: startedAt.toISOString(),
      endsAt: endsAt.toISOString()
    };
  } catch (err) {
    Logger.error(`Error starting meeting ${meetingId}:`, err);
    return {
      success: false,
      meetingId,
      status: MeetingStatus.SCHEDULED,
      recordingState: 'NOT_STARTED',
      startedAt: null,
      endsAt: null,
      error: 'Failed to start meeting'
    };
  }
}

/**
 * Pause a meeting recording
 * - Timer continues running (pause does NOT extend time)
 * - Only allowed while RECORDING
 */
export async function pauseMeeting(
  meetingId: string, 
  workflowId?: string
): Promise<MeetingLifecycleResponse> {
  try {
    // Auth check removed - meeting ownership validated at creation time
    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    
    if (!meeting) {
      return {
        success: false,
        meetingId,
        status: MeetingStatus.SCHEDULED,
        recordingState: 'NOT_STARTED',
        startedAt: null,
        endsAt: null,
        error: 'Meeting not found'
      };
    }

    const currentState = meeting.recordingStatus as RecordingState;

    // Validate transition
    if (!validateTransition(currentState, 'PAUSED')) {
      return {
        success: false,
        meetingId,
        status: meeting.status,
        recordingState: currentState,
        startedAt: meeting.actualStart?.toISOString() || null,
        endsAt: meeting.scheduledEnd?.toISOString() || null,
        error: `Cannot pause from state: ${currentState}`
      };
    }

    // Update meeting
    const updatedMeeting = await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        recordingStatus: 'PAUSED',
        recordingPausedAt: new Date()
      }
    });

    Logger.info(`Meeting paused: ${meetingId}`);

    return {
      success: true,
      meetingId,
      status: updatedMeeting.status,
      recordingState: 'PAUSED',
      startedAt: meeting.actualStart?.toISOString() || null,
      endsAt: meeting.scheduledEnd?.toISOString() || null
    };
  } catch (err) {
    Logger.error(`Error pausing meeting ${meetingId}:`, err);
    return {
      success: false,
      meetingId,
      status: MeetingStatus.ACTIVE,
      recordingState: 'RECORDING',
      startedAt: null,
      endsAt: null,
      error: 'Failed to pause meeting'
    };
  }
}

/**
 * Resume a paused meeting recording
 * - Only allowed while PAUSED
 * - Does NOT extend meeting duration
 */
export async function resumeMeeting(
  meetingId: string, 
  workflowId?: string
): Promise<MeetingLifecycleResponse> {
  try {
    // Auth check removed - meeting ownership validated at creation time
    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    
    if (!meeting) {
      return {
        success: false,
        meetingId,
        status: MeetingStatus.SCHEDULED,
        recordingState: 'NOT_STARTED',
        startedAt: null,
        endsAt: null,
        error: 'Meeting not found'
      };
    }

    const currentState = meeting.recordingStatus as RecordingState;

    // Can only resume from PAUSED
    if (currentState !== 'PAUSED') {
      return {
        success: false,
        meetingId,
        status: meeting.status,
        recordingState: currentState,
        startedAt: meeting.actualStart?.toISOString() || null,
        endsAt: meeting.scheduledEnd?.toISOString() || null,
        error: `Cannot resume from state: ${currentState}`
      };
    }

    // Update meeting
    const updatedMeeting = await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        recordingStatus: 'RECORDING',
        recordingResumedAt: new Date()
      }
    });

    Logger.info(`Meeting resumed: ${meetingId}`);

    return {
      success: true,
      meetingId,
      status: updatedMeeting.status,
      recordingState: 'RECORDING',
      startedAt: meeting.actualStart?.toISOString() || null,
      endsAt: meeting.scheduledEnd?.toISOString() || null
    };
  } catch (err) {
    Logger.error(`Error resuming meeting ${meetingId}:`, err);
    return {
      success: false,
      meetingId,
      status: MeetingStatus.ACTIVE,
      recordingState: 'PAUSED',
      startedAt: null,
      endsAt: null,
      error: 'Failed to resume meeting'
    };
  }
}

/**
 * End a meeting
 * - Transitions to STOPPED and COMPLETED
 * - Disallows ending already ended meetings
 */
export async function endMeeting(
  meetingId: string, 
  workflowId?: string,
  isAutoEnd: boolean = false
): Promise<MeetingLifecycleResponse> {
  try {
    // Auth check removed - meeting ownership validated at creation time
    const currentMeeting = await prisma.meeting.findUnique({ where: { id: meetingId } });

    if (!currentMeeting) {
      return {
        success: false,
        meetingId,
        status: MeetingStatus.SCHEDULED,
        recordingState: 'NOT_STARTED',
        startedAt: null,
        endsAt: null,
        error: 'Meeting not found'
      };
    }

    const currentState = currentMeeting.recordingStatus as RecordingState;

    // Disallow ending already ended meetings
    if (currentState === 'STOPPED' || currentMeeting.status === MeetingStatus.COMPLETED) {
      return {
        success: false,
        meetingId,
        status: currentMeeting.status,
        recordingState: currentState,
        startedAt: currentMeeting.actualStart?.toISOString() || null,
        endsAt: currentMeeting.scheduledEnd?.toISOString() || null,
        error: 'Meeting has already ended'
      };
    }

    // Allow ending from any non-stopped state
    const endedAt = new Date();

    // Update meeting
    const updatedMeeting = await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: MeetingStatus.COMPLETED,
        recordingStatus: 'STOPPED',
        actualEnd: endedAt
      }
    });

    Logger.info(`Meeting ended: ${meetingId}, auto=${isAutoEnd}`);

    // Emit WebSocket event for auto-end
    if (isAutoEnd) {
      emitMeetingEvent(meetingId, {
        type: 'meeting:auto-ended',
        meetingId
      });
    }

    return {
      success: true,
      meetingId,
      status: updatedMeeting.status,
      recordingState: 'STOPPED',
      startedAt: currentMeeting.actualStart?.toISOString() || null,
      endsAt: currentMeeting.scheduledEnd?.toISOString() || null
    };
  } catch (err) {
    Logger.error(`Error ending meeting ${meetingId}:`, err);
    return {
      success: false,
      meetingId,
      status: MeetingStatus.ACTIVE,
      recordingState: 'RECORDING',
      startedAt: null,
      endsAt: null,
      error: 'Failed to end meeting'
    };
  }
}

/**
 * Get current meeting state (for frontend sync)
 */
export async function getMeetingState(meetingId: string): Promise<{
  status: MeetingStatus;
  recordingState: RecordingState;
  startedAt: string | null;
  endsAt: string | null;
  durationMinutes: number;
} | null> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId }
  });

  if (!meeting) return null;

  // Calculate duration from scheduled times
  let durationMinutes = 30;
  if (meeting.scheduledStart && meeting.scheduledEnd) {
    durationMinutes = Math.round(
      (meeting.scheduledEnd.getTime() - meeting.scheduledStart.getTime()) / (60 * 1000)
    );
  }

  return {
    status: meeting.status,
    recordingState: meeting.recordingStatus as RecordingState,
    startedAt: meeting.actualStart?.toISOString() || null,
    endsAt: meeting.scheduledEnd?.toISOString() || null,
    durationMinutes
  };
}

/**
 * Schedule auto-end worker job
 * Uses setTimeout for now, will be replaced with BullMQ worker
 */
const autoEndTimers = new Map<string, NodeJS.Timeout>();

async function scheduleAutoEnd(meetingId: string, endsAt: Date): Promise<void> {
  // Clear any existing timer
  const existingTimer = autoEndTimers.get(meetingId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const delay = endsAt.getTime() - Date.now();
  
  if (delay <= 0) {
    // Meeting should already have ended
    Logger.warn(`Meeting ${meetingId} scheduled end time is in the past`);
    return;
  }

  // Cap at max safe timeout (about 24.8 days)
  const maxTimeout = 2147483647;
  const safeDelay = Math.min(delay, maxTimeout);

  Logger.info(`Scheduling auto-end for meeting ${meetingId} in ${Math.round(safeDelay / 1000)}s`);

  const timer = setTimeout(async () => {
    Logger.info(`Auto-ending meeting ${meetingId}`);
    autoEndTimers.delete(meetingId);
    
    try {
      // Use a system-level end (bypass ownership for auto-end)
      await autoEndMeeting(meetingId);
    } catch (err) {
      Logger.error(`Failed to auto-end meeting ${meetingId}:`, err);
    }
  }, safeDelay);

  autoEndTimers.set(meetingId, timer);
}

/**
 * Auto-end a meeting (called by scheduled job)
 */
async function autoEndMeeting(meetingId: string): Promise<void> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId }
  });

  if (!meeting) {
    Logger.warn(`Auto-end: Meeting ${meetingId} not found`);
    return;
  }

  // Already ended
  if (meeting.recordingStatus === 'STOPPED' || meeting.status === MeetingStatus.COMPLETED) {
    Logger.info(`Auto-end: Meeting ${meetingId} already ended`);
    return;
  }

  const endedAt = new Date();

  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      status: MeetingStatus.COMPLETED,
      recordingStatus: 'STOPPED',
      actualEnd: endedAt
    }
  });

  Logger.info(`Auto-ended meeting ${meetingId}`);

  // Emit WebSocket event
  emitMeetingEvent(meetingId, {
    type: 'meeting:auto-ended',
    meetingId
  });
}

/**
 * Cancel a scheduled auto-end (if meeting ends early)
 */
export function cancelAutoEnd(meetingId: string): void {
  const timer = autoEndTimers.get(meetingId);
  if (timer) {
    clearTimeout(timer);
    autoEndTimers.delete(meetingId);
    Logger.info(`Cancelled auto-end for meeting ${meetingId}`);
  }
}
