import { Request, Response } from 'express';
import { PrismaClient, MeetingStatus, OwnerType } from '@prisma/client';
import Logger from '../logger';
import { emitAttendanceEvent } from '../websocket/ws-server';

const prisma = new PrismaClient();

/**
 * Check-in to a meeting (public, no auth required)
 * POST /attendance/check-in
 * 
 * Used by participants scanning QR codes
 */
export const checkIn = async (req: Request, res: Response): Promise<void> => {
  try {
    const { meetingId, name, email } = req.body;

    // Validate required fields
    if (!meetingId) {
      res.status(400).json({ 
        error: 'Missing required field: meetingId' 
      });
      return;
    }

    if (!name || !name.trim()) {
      res.status(400).json({ 
        error: 'Missing required field: name' 
      });
      return;
    }

    const trimmedName = name.trim();
    const trimmedEmail = email?.trim() || null;

    // Find the meeting
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId }
    });

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    // Validate meeting status - must be SCHEDULED or ACTIVE
    if (meeting.status === MeetingStatus.COMPLETED) {
      res.status(400).json({ error: 'Meeting has already ended' });
      return;
    }

    if (meeting.status === MeetingStatus.CANCELLED) {
      res.status(400).json({ error: 'Meeting has been cancelled' });
      return;
    }

    // Check if meeting has expired (for scheduled meetings)
    if (meeting.scheduledEnd && new Date() > meeting.scheduledEnd) {
      res.status(400).json({ error: 'Meeting has expired' });
      return;
    }

    // Check for duplicate attendance (same name or email for this meeting)
    const existingAttendance = await prisma.attendance.findFirst({
      where: {
        meetingId,
        OR: [
          { participantName: trimmedName },
          ...(trimmedEmail ? [{ participantEmail: trimmedEmail }] : [])
        ]
      }
    });

    if (existingAttendance) {
      res.status(409).json({ 
        error: 'You have already checked in to this meeting',
        alreadyCheckedIn: true
      });
      return;
    }

    // Create attendance record
    const attendance = await prisma.attendance.create({
      data: {
        meetingId: meeting.id,
        participantName: trimmedName,
        participantEmail: trimmedEmail,
        ownerType: OwnerType.GUEST,
        checkedInAt: new Date(),
        checkedInVia: 'QR_SCAN',
        joinedAt: new Date()
      }
    });

    // Get total attendance count for this meeting
    const totalCount = await prisma.attendance.count({
      where: { meetingId }
    });

    Logger.info(`Attendance check-in: ${trimmedName} for meeting ${meetingId} (total: ${totalCount})`);

    // Emit WebSocket event to meeting room AFTER successful DB write
    emitAttendanceEvent(meetingId, {
      type: 'attendance:checked-in',
      meetingId,
      attendee: {
        name: trimmedName,
        email: trimmedEmail,
        checkedInAt: attendance.checkedInAt?.toISOString() || new Date().toISOString()
      },
      totalCount
    });

    res.status(201).json({
      success: true,
      message: 'Checked in successfully',
      attendance: {
        id: attendance.id,
        name: attendance.participantName,
        email: attendance.participantEmail,
        checkedInAt: attendance.checkedInAt?.toISOString()
      },
      totalCount
    });
  } catch (error) {
    Logger.error(`Error during attendance check-in: ${error}`);
    res.status(500).json({ error: 'Failed to check in' });
  }
};

/**
 * Get attendance list for a meeting
 * GET /meetings/:meetingId/attendance
 * 
 * Used for initial load on organizer pages
 */
export const getAttendance = async (req: Request, res: Response): Promise<void> => {
  try {
    const { meetingId } = req.params;

    // Validate meeting exists
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId }
    });

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    // Get all attendance records for the meeting
    const attendances = await prisma.attendance.findMany({
      where: { meetingId },
      orderBy: { checkedInAt: 'desc' },
      select: {
        id: true,
        participantName: true,
        participantEmail: true,
        checkedInAt: true,
        joinedAt: true
      }
    });

    const totalCount = attendances.length;

    res.status(200).json({
      totalCount,
      attendees: attendances.map(a => ({
        id: a.id,
        name: a.participantName,
        email: a.participantEmail || null,
        checkedInAt: (a.checkedInAt || a.joinedAt)?.toISOString() || null
      }))
    });
  } catch (error) {
    Logger.error(`Error getting attendance: ${error}`);
    res.status(500).json({ error: 'Failed to get attendance' });
  }
};

/**
 * Get meeting info for check-in page (public, minimal data)
 * GET /attendance/meeting/:meetingId
 * 
 * Returns only public meeting info needed for check-in
 */
export const getMeetingInfoForCheckIn = async (req: Request, res: Response): Promise<void> => {
  try {
    const { meetingId } = req.params;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        title: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true
      }
    });

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    // Check if meeting is available for check-in
    const isExpired = meeting.scheduledEnd && new Date() > meeting.scheduledEnd;
    const isCancelled = meeting.status === MeetingStatus.CANCELLED;
    const isCompleted = meeting.status === MeetingStatus.COMPLETED;

    res.status(200).json({
      id: meeting.id,
      title: meeting.title,
      status: meeting.status,
      scheduledStart: meeting.scheduledStart?.toISOString() || null,
      canCheckIn: !isExpired && !isCancelled && !isCompleted
    });
  } catch (error) {
    Logger.error(`Error getting meeting info for check-in: ${error}`);
    res.status(500).json({ error: 'Failed to get meeting info' });
  }
};
