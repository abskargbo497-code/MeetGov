/**
 * Authorization Middleware
 * Role-based access control for MeetGov API
 */

import { errorResponse } from './helpers.js';
import { log } from './logger.js';
import Meeting from '../models/Meeting.js';
import Attendance from '../models/Attendance.js';

/**
 * Middleware to allow only Administrator and Secretary roles
 * Full access to all features
 */
export const allowOnlyAdminOrSecretary = (req, res, next) => {
  if (!req.user) {
    return errorResponse(res, 401, 'Authentication required');
  }

  const allowedRoles = ['super_admin', 'secretary'];
  
  if (!allowedRoles.includes(req.user.role)) {
    log.warn('Access denied - insufficient role', {
      userId: req.user.userId,
      role: req.user.role,
      endpoint: `${req.method} ${req.originalUrl}`,
    });
    
    return errorResponse(
      res,
      403,
      'Access denied. Administrator or Secretary role required.'
    );
  }

  next();
};

/**
 * Middleware to allow all authenticated users
 * Basic participant access
 */
export const allowAuthenticatedUsers = (req, res, next) => {
  if (!req.user) {
    return errorResponse(res, 401, 'Authentication required');
  }

  next();
};

/**
 * Middleware to allow meeting participants (including organizer)
 * Users can only access meetings they're involved in
 */
export const allowMeetingParticipants = async (req, res, next) => {
  if (!req.user) {
    return errorResponse(res, 401, 'Authentication required');
  }

  // Admin and Secretary have access to all meetings
  if (req.user.role === 'super_admin' || req.user.role === 'secretary') {
    return next();
  }

  const meetingId = parseInt(req.params.id || req.params.meetingId);

  if (!meetingId) {
    return errorResponse(res, 400, 'Meeting ID is required');
  }

  try {
    // Find the meeting
    const meeting = await Meeting.findByPk(meetingId);

    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    // Check if user is the organizer
    if (meeting.organizer_id === req.user.userId) {
      return next();
    }

    // Check if user is in participants list
    const participants = meeting.participants || [];
    const isParticipant = Array.isArray(participants) && 
      (participants.includes(req.user.userId) || 
       participants.includes(req.user.email));

    // Check if user has attendance record
    const attendance = await Attendance.findOne({
      where: {
        meeting_id: meetingId,
        user_id: req.user.userId,
      },
    });

    if (isParticipant || attendance) {
      return next();
    }

    log.warn('Access denied - not a meeting participant', {
      userId: req.user.userId,
      meetingId,
      endpoint: `${req.method} ${req.originalUrl}`,
    });

    return errorResponse(
      res,
      403,
      'Access denied. You are not a participant of this meeting.'
    );
  } catch (error) {
    log.error('Error checking meeting participation', {
      error: error.message,
      meetingId,
      userId: req.user.userId,
    });

    return errorResponse(res, 500, 'Error verifying meeting access');
  }
};

/**
 * Middleware to allow only meeting organizer or Admin/Secretary
 */
export const allowOrganizerOrAdmin = async (req, res, next) => {
  if (!req.user) {
    return errorResponse(res, 401, 'Authentication required');
  }

  // Admin and Secretary have access
  if (req.user.role === 'super_admin' || req.user.role === 'secretary') {
    return next();
  }

  const meetingId = parseInt(req.params.id || req.params.meetingId);

  if (!meetingId) {
    return errorResponse(res, 400, 'Meeting ID is required');
  }

  try {
    const meeting = await Meeting.findByPk(meetingId);

    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    if (meeting.organizer_id === req.user.userId) {
      return next();
    }

    log.warn('Access denied - not organizer', {
      userId: req.user.userId,
      meetingId,
      organizerId: meeting.organizer_id,
    });

    return errorResponse(
      res,
      403,
      'Access denied. Only the meeting organizer can perform this action.'
    );
  } catch (error) {
    log.error('Error checking organizer', {
      error: error.message,
      meetingId,
    });

    return errorResponse(res, 500, 'Error verifying organizer access');
  }
};

