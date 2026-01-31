import { Request, Response } from 'express';
import { PrismaClient, MeetingStatus, OwnerType } from '@prisma/client';
import crypto from 'crypto';
import Logger from '../logger';
import * as meetingLifecycle from '../services/meeting-lifecycle.service';
import { sendMeetingInvites, parseParticipantsFromJson, MeetingInviteData } from '../services/meeting-email.service';
import { auth } from '../lib/auth';
import { fromNodeHeaders } from 'better-auth/node';

const prisma = new PrismaClient();

// =============================================================================
// DEV MODE: BYPASS GUEST MEETING LIMITS
// Set to true during development/testing to allow unlimited meetings per guest
// TODO: Set to false before deploying to production
// =============================================================================
const DEV_MODE_BYPASS_MEETING_LIMIT = true;

// Data retention period (7 days for guest users)
const DATA_RETENTION_DAYS = 7;

/**
 * Create a new meeting
 * Validates duration (max 60 minutes) and participants
 */
export const createMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      title, 
      meetingType, 
      scheduledAt, 
      durationMinutes, 
      participants, 
      location,
      workflowId 
    } = req.body;

    // Check for authenticated user
    let authenticatedUserId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      if (session?.user) {
        authenticatedUserId = session.user.id;
      }
    } catch (authError) {
      Logger.debug('Auth check failed in createMeeting, continuing with guest flow');
    }

    // Validate required fields
    if (!title || !meetingType || !durationMinutes) {
      res.status(400).json({ 
        error: 'Missing required fields: title, meetingType, and durationMinutes are required' 
      });
      return;
    }

    // Validate meeting type
    if (!['INSTANT', 'SCHEDULED'].includes(meetingType)) {
      res.status(400).json({ 
        error: 'Invalid meetingType. Must be INSTANT or SCHEDULED' 
      });
      return;
    }

    // Validate duration (max 60 minutes for free/guest users)
    if (durationMinutes > 60) {
      res.status(400).json({ 
        error: 'Duration cannot exceed 60 minutes for guest users' 
      });
      return;
    }

    if (durationMinutes < 5) {
      res.status(400).json({ 
        error: 'Duration must be at least 5 minutes' 
      });
      return;
    }

    // Validate scheduled meetings have a date
    if (meetingType === 'SCHEDULED' && !scheduledAt) {
      res.status(400).json({ 
        error: 'Scheduled meetings require a scheduledAt date' 
      });
      return;
    }

    // Validate participants if provided
    if (participants && !Array.isArray(participants)) {
      res.status(400).json({ 
        error: 'Participants must be an array' 
      });
      return;
    }

    // Calculate scheduled start and end times
    const scheduledStart = scheduledAt ? new Date(scheduledAt) : new Date();
    const scheduledEnd = new Date(scheduledStart.getTime() + durationMinutes * 60 * 1000);
    
    // Calculate expiration date for data retention
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + DATA_RETENTION_DAYS);

    // Generate unique access code
    const guestAccessCode = crypto.randomBytes(4).toString('hex').toUpperCase();

    // Determine owner type and ID based on authentication
    const isAuthenticated = !!authenticatedUserId;
    const ownerType = isAuthenticated ? OwnerType.PERSONAL : OwnerType.GUEST;
    const ownerId = authenticatedUserId || workflowId || 'anonymous';

    // Create the meeting in the database
    const meeting = await prisma.meeting.create({
      data: {
        title,
        description: null,
        location: location || null,
        status: meetingType === 'INSTANT' ? MeetingStatus.ACTIVE : MeetingStatus.SCHEDULED,
        scheduledStart,
        scheduledEnd,
        ownerType,
        ownerId,
        guestSessionId: isAuthenticated ? null : (workflowId || null),
        guestAccessCode,
        invitedParticipants: participants || [],
        expiresAt
      }
    });

    Logger.info(`Meeting created: ${meeting.id} by ${isAuthenticated ? `user:${authenticatedUserId}` : (workflowId || 'guest')}`);

    // Generate join URL
    const joinUrl = `/meeting/${meeting.id}?code=${guestAccessCode}`;

    // Send participant invite emails (non-blocking)
    if (participants && participants.length > 0) {
      const participantEmails = parseParticipantsFromJson(participants);
      if (participantEmails.length > 0) {
        const inviteData: MeetingInviteData = {
          meetingId: meeting.id,
          meetingTitle: meeting.title,
          accessCode: guestAccessCode,
          scheduledAt: meeting.scheduledStart || undefined,
          durationMinutes: durationMinutes,
          location: location || undefined,
        };
        
        // Send invites asynchronously - don't block meeting creation
        sendMeetingInvites(participantEmails, inviteData)
          .then(results => {
            const successCount = results.filter(r => r.success).length;
            Logger.info(`Sent ${successCount}/${results.length} invites for meeting ${meeting.id}`);
          })
          .catch(err => {
            Logger.error(`Error sending invites for meeting ${meeting.id}:`, err);
          });
      }
    }

    res.status(201).json({
      id: meeting.id,
      title: meeting.title,
      meetingType,
      scheduledAt: meeting.scheduledStart?.toISOString(),
      durationMinutes,
      status: meeting.status,
      joinUrl,
      joinCode: guestAccessCode,
      participants: participants || [],
      createdBy: {
        id: ownerId,
        type: isAuthenticated ? 'USER' : 'GUEST'
      },
      createdAt: meeting.createdAt.toISOString(),
      updatedAt: meeting.updatedAt.toISOString()
    });
  } catch (error) {
    Logger.error(`Error creating meeting: ${error}`);
    res.status(500).json({ error: 'Failed to create meeting' });
  }
};

/**
 * Get meeting by ID
 */
export const getMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    const { meetingId } = req.params;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId as string },
      include: {
        attendances: true
      }
    });

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    // Calculate duration from scheduled times
    let durationMinutes = 30;
    if (meeting.scheduledStart && meeting.scheduledEnd) {
      durationMinutes = Math.round(
        (meeting.scheduledEnd.getTime() - meeting.scheduledStart.getTime()) / (60 * 1000)
      );
    }

    // Determine meeting type from status
    const meetingType = meeting.status === MeetingStatus.SCHEDULED ? 'SCHEDULED' : 'INSTANT';

    // Transform attendances to participant format for frontend
    const participants = meeting.attendances.map(att => ({
      id: att.id,
      name: att.participantName,
      email: att.participantEmail,
      status: att.leftAt ? 'LEFT' : 'JOINED',
      joinedAt: att.joinedAt?.toISOString(),
      leftAt: att.leftAt?.toISOString()
    }));

    res.status(200).json({
      id: meeting.id,
      title: meeting.title,
      meetingType,
      scheduledAt: meeting.scheduledStart?.toISOString(),
      durationMinutes,
      status: meeting.status,
      joinUrl: `/meeting/${meeting.id}?code=${meeting.guestAccessCode}`,
      participants,
      createdAt: meeting.createdAt.toISOString(),
      updatedAt: meeting.updatedAt.toISOString()
    });
  } catch (error) {
    Logger.error(`Error getting meeting: ${error}`);
    res.status(500).json({ error: 'Failed to get meeting' });
  }
};

/**
 * Join a meeting
 */
export const joinMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    const { meetingId } = req.params;
    const { workflowId } = req.body;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId as string }
    });

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    // Calculate duration from scheduled times
    let durationMinutes = 30;
    if (meeting.scheduledStart && meeting.scheduledEnd) {
      durationMinutes = Math.round(
        (meeting.scheduledEnd.getTime() - meeting.scheduledStart.getTime()) / (60 * 1000)
      );
    }

    // Determine meeting type from status
    const meetingType = meeting.status === MeetingStatus.SCHEDULED ? 'SCHEDULED' : 'INSTANT';

    // Generate a connection token for this participant
    const connectionToken = crypto.randomBytes(32).toString('hex');

    res.status(200).json({
      meeting: {
        id: meeting.id,
        title: meeting.title,
        meetingType,
        scheduledAt: meeting.scheduledStart?.toISOString(),
        durationMinutes,
        status: meeting.status,
        joinUrl: `/meeting/${meeting.id}?code=${meeting.guestAccessCode}`,
        participants: meeting.invitedParticipants || []
      },
      connectionToken
    });
  } catch (error) {
    Logger.error(`Error joining meeting: ${error}`);
    res.status(500).json({ error: 'Failed to join meeting' });
  }
};

/**
 * Check in to a meeting (for QR code attendance)
 */
export const checkInToMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    const { meetingId } = req.params;
    const { name } = req.body;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId as string }
    });

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    // Create attendance record
    const attendance = await prisma.attendance.create({
      data: {
        meetingId: meeting.id,
        participantName: name || 'Guest',
        ownerType: OwnerType.GUEST,
        checkedInAt: new Date(),
        checkedInVia: 'QR_SCAN'
      }
    });

    Logger.info(`Check-in recorded for meeting ${meetingId}: ${name || 'Guest'}`);

    res.status(200).json({
      success: true,
      message: 'Checked in successfully',
      attendance: {
        id: attendance.id,
        name: attendance.participantName,
        checkedInAt: attendance.checkedInAt?.toISOString()
      }
    });
  } catch (error) {
    Logger.error(`Error checking in to meeting: ${error}`);
    res.status(500).json({ error: 'Failed to check in' });
  }
};

/**
 * Start a meeting recording
 * POST /meetings/:meetingId/start
 */
export const startMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;

    const result = await meetingLifecycle.startMeeting(meetingId);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(200).json({
      success: true,
      meetingId: result.meetingId,
      status: result.status,
      recordingState: result.recordingState,
      startedAt: result.startedAt,
      endsAt: result.endsAt
    });
  } catch (error) {
    Logger.error(`Error starting meeting: ${error}`);
    res.status(500).json({ error: 'Failed to start meeting' });
  }
};

/**
 * Pause a meeting recording
 * POST /meetings/:meetingId/pause
 */
export const pauseMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;
    const { workflowId } = req.body;

    let ownerId = workflowId;
    if (!ownerId) {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      if (session?.user) {
        ownerId = session.user.id;
      }
    }

    if (!ownerId) {
      res.status(400).json({ error: 'Authentication required' });
      return;
    }

    const result = await meetingLifecycle.pauseMeeting(meetingId, ownerId);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(200).json({
      success: true,
      meetingId: result.meetingId,
      status: result.status,
      recordingState: result.recordingState,
      startedAt: result.startedAt,
      endsAt: result.endsAt
    });
  } catch (error) {
    Logger.error(`Error pausing meeting: ${error}`);
    res.status(500).json({ error: 'Failed to pause meeting' });
  }
};

/**
 * Resume a paused meeting recording
 * POST /meetings/:meetingId/resume
 */
export const resumeMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;
    const { workflowId } = req.body;

    let ownerId = workflowId;
    if (!ownerId) {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      if (session?.user) {
        ownerId = session.user.id;
      }
    }

    if (!ownerId) {
      res.status(400).json({ error: 'Authentication required' });
      return;
    }

    const result = await meetingLifecycle.resumeMeeting(meetingId, ownerId);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(200).json({
      success: true,
      meetingId: result.meetingId,
      status: result.status,
      recordingState: result.recordingState,
      startedAt: result.startedAt,
      endsAt: result.endsAt
    });
  } catch (error) {
    Logger.error(`Error resuming meeting: ${error}`);
    res.status(500).json({ error: 'Failed to resume meeting' });
  }
};

/**
 * End a meeting
 * POST /meetings/:meetingId/end
 */
export const endMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;
    const { workflowId } = req.body;

    let ownerId = workflowId;
    if (!ownerId) {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      if (session?.user) {
        ownerId = session.user.id;
      }
    }

    if (!ownerId) {
      res.status(400).json({ error: 'Authentication required' });
      return;
    }

    const result = await meetingLifecycle.endMeeting(meetingId, ownerId);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    // Cancel any scheduled auto-end
    meetingLifecycle.cancelAutoEnd(meetingId);

    res.status(200).json({
      success: true,
      meetingId: result.meetingId,
      status: result.status,
      recordingState: result.recordingState,
      startedAt: result.startedAt,
      endsAt: result.endsAt
    });
  } catch (error) {
    Logger.error(`Error ending meeting: ${error}`);
    res.status(500).json({ error: 'Failed to end meeting' });
  }
};

/**
 * Get meeting state (for frontend sync)
 * GET /meetings/:meetingId/state
 */
export const getMeetingState = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;

    const state = await meetingLifecycle.getMeetingState(meetingId);

    if (!state) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    res.status(200).json(state);
  } catch (error) {
    Logger.error(`Error getting meeting state: ${error}`);
    res.status(500).json({ error: 'Failed to get meeting state' });
  }
};

/**
 * Resolve meeting by access code
 * GET /meetings/access/:accessCode
 * 
 * This is the single source of truth for frontend routing.
 * Returns meeting status and processingStatus for state-based navigation.
 */
export const getMeetingByAccessCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const accessCode = req.params.accessCode as string;

    if (!accessCode) {
      res.status(400).json({ error: 'Access code is required' });
      return;
    }

    const meeting = await prisma.meeting.findUnique({
      where: { guestAccessCode: accessCode.toUpperCase() },
      select: {
        id: true,
        title: true,
        status: true,
        processingStatus: true,
        processingError: true,
        recordingStatus: true,
        scheduledStart: true,
        scheduledEnd: true,
        actualStart: true,
        actualEnd: true,
        guestAccessCode: true,
        workflowCompletedAt: true,
        isReadOnly: true,
      }
    });

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found. Please check your access code.' });
      return;
    }

    // Calculate duration
    let durationMinutes = 30;
    if (meeting.scheduledStart && meeting.scheduledEnd) {
      durationMinutes = Math.round(
        (meeting.scheduledEnd.getTime() - meeting.scheduledStart.getTime()) / (60 * 1000)
      );
    }

    // Determine the effective status for routing
    // Map legacy statuses to new states
    let effectiveStatus = meeting.status;
    if (meeting.status === MeetingStatus.SCHEDULED) {
      effectiveStatus = MeetingStatus.SCHEDULED; // WAITING equivalent
    } else if (meeting.status === MeetingStatus.ACTIVE) {
      effectiveStatus = MeetingStatus.ACTIVE; // LIVE equivalent
    }

    res.status(200).json({
      id: meeting.id,
      title: meeting.title,
      status: effectiveStatus,
      processingStatus: meeting.processingStatus || 'IDLE',
      processingError: meeting.processingError,
      recordingStatus: meeting.recordingStatus,
      scheduledStart: meeting.scheduledStart?.toISOString(),
      scheduledEnd: meeting.scheduledEnd?.toISOString(),
      actualStart: meeting.actualStart?.toISOString(),
      actualEnd: meeting.actualEnd?.toISOString(),
      durationMinutes,
      accessCode: meeting.guestAccessCode,
      workflowCompletedAt: meeting.workflowCompletedAt?.toISOString() || null,
      isReadOnly: meeting.isReadOnly || false,
    });
  } catch (error) {
    Logger.error(`Error resolving access code: ${error}`);
    res.status(500).json({ error: 'Failed to resolve access code' });
  }
};

/**
 * Get meeting processing status
 * GET /meetings/:meetingId/processing-status
 */
export const getMeetingProcessingStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        status: true,
        processingStatus: true,
        processingError: true,
      }
    });

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    res.status(200).json({
      meetingId: meeting.id,
      status: meeting.status,
      processingStatus: meeting.processingStatus || 'IDLE',
      processingError: meeting.processingError,
    });
  } catch (error) {
    Logger.error(`Error getting processing status: ${error}`);
    res.status(500).json({ error: 'Failed to get processing status' });
  }
};

/**
 * Send participant invite emails
 * POST /meetings/:meetingId/send-invites
 */
export const sendParticipantInvites = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;
    const { participants } = req.body;

    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      res.status(400).json({ error: 'participants array is required' });
      return;
    }

    // Get meeting details
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        title: true,
        guestAccessCode: true,
        scheduledStart: true,
        scheduledEnd: true,
        location: true,
      }
    });

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    if (!meeting.guestAccessCode) {
      res.status(400).json({ error: 'Meeting does not have an access code' });
      return;
    }

    // Parse participants
    const participantEmails = parseParticipantsFromJson(participants);
    
    if (participantEmails.length === 0) {
      res.status(400).json({ error: 'No valid email addresses provided' });
      return;
    }

    // Calculate duration
    let durationMinutes = 30;
    if (meeting.scheduledStart && meeting.scheduledEnd) {
      durationMinutes = Math.round(
        (meeting.scheduledEnd.getTime() - meeting.scheduledStart.getTime()) / (60 * 1000)
      );
    }

    // Prepare invite data
    const inviteData: MeetingInviteData = {
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      accessCode: meeting.guestAccessCode,
      scheduledAt: meeting.scheduledStart || undefined,
      durationMinutes,
      location: meeting.location || undefined,
    };

    // Send invites
    const results = await sendMeetingInvites(participantEmails, inviteData);

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    Logger.info(`Sent ${successCount}/${results.length} invites for meeting ${meetingId}`);

    res.status(200).json({
      success: true,
      totalSent: successCount,
      totalFailed: failedCount,
      results: results.map(r => ({
        email: r.email,
        success: r.success,
        error: r.error || null,
      })),
    });
  } catch (error) {
    Logger.error(`Error sending invites: ${error}`);
    res.status(500).json({ error: 'Failed to send invites' });
  }
};
