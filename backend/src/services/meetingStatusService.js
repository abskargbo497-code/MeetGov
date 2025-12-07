/**
 * Meeting Status Service
 * Handles automatic meeting status transitions based on time and events
 */

import { Op } from 'sequelize';
import Meeting from '../models/Meeting.js';
import { log } from '../utils/logger.js';
import { emitMeetingStatusUpdate } from './socketService.js';

/**
 * Check and update meeting statuses based on datetime
 * Called periodically (cron job or interval)
 */
export const checkAndUpdateMeetingStatuses = async () => {
  try {
    const now = new Date();

    // Find meetings that should be "in-progress" (datetime has passed but status is still "scheduled")
    const meetingsToStart = await Meeting.findAll({
      where: {
        status: 'scheduled',
        datetime: {
          [Op.lte]: now, // Meeting time has passed
        },
      },
    });

    // Update meetings to "in-progress"
    for (const meeting of meetingsToStart) {
      const previousStatus = meeting.status;
      meeting.status = 'in-progress';
      await meeting.save();

      log.info('Meeting status auto-updated to in-progress', {
        meetingId: meeting.id,
        previousStatus,
        datetime: meeting.datetime,
      });

      // Emit real-time update
      emitMeetingStatusUpdate(meeting.id, 'in-progress');
    }

    return {
      updated: meetingsToStart.length,
      meetings: meetingsToStart.map((m) => ({ id: m.id, title: m.title })),
    };
  } catch (error) {
    log.error('Error checking meeting statuses', error);
    throw error;
  }
};

/**
 * Manually start a meeting (change status to in-progress)
 * @param {number} meetingId - Meeting ID
 * @param {number} userId - User ID who started the meeting
 * @returns {Promise<Meeting>}
 */
export const startMeeting = async (meetingId, userId) => {
  try {
    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    if (meeting.status === 'completed') {
      throw new Error('Cannot start a completed meeting');
    }

    if (meeting.status === 'cancelled') {
      throw new Error('Cannot start a cancelled meeting');
    }

    const previousStatus = meeting.status;
    meeting.status = 'in-progress';
    await meeting.save();

    log.info('Meeting started manually', {
      meetingId: meeting.id,
      previousStatus,
      startedBy: userId,
    });

    // Emit real-time update
    emitMeetingStatusUpdate(meeting.id, 'in-progress');

    return meeting;
  } catch (error) {
    log.error('Error starting meeting', { meetingId, error: error.message });
    throw error;
  }
};

/**
 * Stop a meeting (change status to completed)
 * @param {number} meetingId - Meeting ID
 * @param {number} userId - User ID who stopped the meeting
 * @returns {Promise<Meeting>}
 */
export const stopMeeting = async (meetingId, userId) => {
  try {
    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    if (meeting.status !== 'in-progress') {
      throw new Error('Meeting must be in-progress to stop');
    }

    const previousStatus = meeting.status;
    meeting.status = 'completed';
    await meeting.save();

    log.info('Meeting stopped manually', {
      meetingId: meeting.id,
      previousStatus,
      stoppedBy: userId,
    });

    // Emit real-time update
    emitMeetingStatusUpdate(meeting.id, 'completed');

    return meeting;
  } catch (error) {
    log.error('Error stopping meeting', { meetingId, error: error.message });
    throw error;
  }
};

/**
 * Initialize periodic status checking (call this on server startup)
 * @param {number} intervalMs - Interval in milliseconds (default: 1 minute)
 */
export const initializeStatusChecker = (intervalMs = 60000) => {
  log.info('Initializing meeting status checker', { intervalMs });

  // Check immediately on startup
  checkAndUpdateMeetingStatuses().catch((error) => {
    log.error('Error in initial meeting status check', error);
  });

  // Then check periodically
  setInterval(() => {
    checkAndUpdateMeetingStatuses().catch((error) => {
      log.error('Error in periodic meeting status check', error);
    });
  }, intervalMs);

  log.info('Meeting status checker initialized');
};

