/**
 * Personal Meeting Controller
 * 
 * Handles meeting operations for authenticated personal users
 */

import { Request, Response } from 'express';
import Logger from '../logger';
import * as personalMeetingService from '../services/personal-meeting.service';

/**
 * Create a new meeting for authenticated personal user
 * POST /api/personal/meetings
 */
export const createMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { title, meetingType, scheduledAt, durationMinutes, participants, location } = req.body;

    // Validate required fields
    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    if (!meetingType || !['INSTANT', 'SCHEDULED'].includes(meetingType)) {
      res.status(400).json({ error: 'Invalid meetingType. Must be INSTANT or SCHEDULED' });
      return;
    }

    if (!durationMinutes || durationMinutes < 5) {
      res.status(400).json({ error: 'Duration must be at least 5 minutes' });
      return;
    }

    if (durationMinutes > 60) {
      res.status(400).json({ error: 'Duration cannot exceed 60 minutes' });
      return;
    }

    // Validate scheduledAt is in the future for scheduled meetings
    if (meetingType === 'SCHEDULED' && scheduledAt) {
      const scheduledDate = new Date(scheduledAt);
      if (scheduledDate <= new Date()) {
        res.status(400).json({ error: 'Scheduled time must be in the future' });
        return;
      }
    }

    if (meetingType === 'SCHEDULED' && !scheduledAt) {
      res.status(400).json({ error: 'Scheduled meetings require a scheduledAt date' });
      return;
    }

    if (participants && !Array.isArray(participants)) {
      res.status(400).json({ error: 'Participants must be an array' });
      return;
    }

    const result = await personalMeetingService.createMeeting(req.user.id, {
      title,
      meetingType,
      scheduledAt,
      durationMinutes,
      participants,
      location,
    });

    res.status(201).json({
      success: true,
      meeting: result.meeting,
      inviteResults: result.inviteResults,
    });
  } catch (error) {
    Logger.error('[PersonalMeeting] Error creating meeting:', error);
    res.status(500).json({ error: 'Failed to create meeting' });
  }
};

/**
 * List meetings for authenticated personal user
 * GET /api/personal/meetings
 */
export const listMeetings = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 10, 50);

    const result = await personalMeetingService.listMeetingsByOwner(req.user.id, page, pageSize);

    res.status(200).json(result);
  } catch (error) {
    Logger.error('[PersonalMeeting] Error listing meetings:', error);
    res.status(500).json({ error: 'Failed to list meetings' });
  }
};

/**
 * Get meeting details by ID
 * GET /api/personal/meetings/:meetingId
 */
export const getMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const meetingId = req.params.meetingId as string;

    const meeting = await personalMeetingService.getMeetingById(meetingId, req.user.id);

    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }

    res.status(200).json(meeting);
  } catch (error: any) {
    if (error.message === 'ACCESS_DENIED') {
      res.status(403).json({ error: 'You do not have access to this meeting' });
      return;
    }
    Logger.error('[PersonalMeeting] Error getting meeting:', error);
    res.status(500).json({ error: 'Failed to get meeting' });
  }
};

/**
 * Update a meeting
 * PUT /api/personal/meetings/:meetingId
 */
export const updateMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const meetingId = req.params.meetingId as string;
    const updates = req.body;

    const meeting = await personalMeetingService.updateMeeting(meetingId, req.user.id, updates);

    res.status(200).json({
      success: true,
      meeting,
    });
  } catch (error: any) {
    if (error.message === 'MEETING_NOT_FOUND') {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }
    if (error.message === 'ACCESS_DENIED') {
      res.status(403).json({ error: 'You do not have access to this meeting' });
      return;
    }
    if (error.message === 'MEETING_LOCKED') {
      res.status(400).json({ error: 'Cannot update a completed or cancelled meeting' });
      return;
    }
    Logger.error('[PersonalMeeting] Error updating meeting:', error);
    res.status(500).json({ error: 'Failed to update meeting' });
  }
};

/**
 * Delete a meeting
 * DELETE /api/personal/meetings/:meetingId
 */
export const deleteMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const meetingId = req.params.meetingId as string;

    await personalMeetingService.deleteMeeting(meetingId, req.user.id);

    res.status(200).json({
      success: true,
      message: 'Meeting deleted successfully',
    });
  } catch (error: any) {
    if (error.message === 'MEETING_NOT_FOUND') {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }
    if (error.message === 'ACCESS_DENIED') {
      res.status(403).json({ error: 'You do not have access to this meeting' });
      return;
    }
    Logger.error('[PersonalMeeting] Error deleting meeting:', error);
    res.status(500).json({ error: 'Failed to delete meeting' });
  }
};

/**
 * Resend invites to participants
 * POST /api/personal/meetings/:meetingId/invite
 */
export const resendInvites = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const meetingId = req.params.meetingId as string;
    const { participants } = req.body;

    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      res.status(400).json({ error: 'Participants array is required' });
      return;
    }

    const results = await personalMeetingService.resendInvites(meetingId, req.user.id, participants);

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    res.status(200).json({
      success: true,
      totalSent: successCount,
      totalFailed: failedCount,
      results,
    });
  } catch (error: any) {
    if (error.message === 'MEETING_NOT_FOUND') {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }
    if (error.message === 'ACCESS_DENIED') {
      res.status(403).json({ error: 'You do not have access to this meeting' });
      return;
    }
    if (error.message === 'NO_ACCESS_CODE') {
      res.status(400).json({ error: 'Meeting does not have an access code' });
      return;
    }
    Logger.error('[PersonalMeeting] Error resending invites:', error);
    res.status(500).json({ error: 'Failed to resend invites' });
  }
};

/**
 * Get meeting statistics for dashboard
 * GET /api/personal/meetings/stats
 */
export const getMeetingStats = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const stats = await personalMeetingService.getMeetingStats(req.user.id);

    res.status(200).json({
      success: true,
      stats,
    });
  } catch (error) {
    Logger.error('[PersonalMeeting] Error getting meeting stats:', error);
    res.status(500).json({ error: 'Failed to get meeting statistics' });
  }
};

export default {
  createMeeting,
  listMeetings,
  getMeeting,
  updateMeeting,
  deleteMeeting,
  resendInvites,
  getMeetingStats,
};
