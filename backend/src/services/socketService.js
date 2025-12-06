/**
 * Socket.IO Service
 * Handles WebSocket connections for real-time updates
 * Supports live transcription, attendance updates, and task notifications
 */

import { Server } from 'socket.io';
import { log } from '../utils/logger.js';

let io = null;

/**
 * Initialize Socket.IO server
 * @param {http.Server} server - HTTP server instance
 * @returns {Server} - Socket.IO server instance
 */
export const initializeSocketIO = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Connection handling
  io.on('connection', (socket) => {
    log.info('Client connected', { socketId: socket.id });

    // Join meeting room
    socket.on('join-meeting', (meetingId) => {
      socket.join(`meeting-${meetingId}`);
      log.info('Client joined meeting room', {
        socketId: socket.id,
        meetingId,
      });
    });

    // Leave meeting room
    socket.on('leave-meeting', (meetingId) => {
      socket.leave(`meeting-${meetingId}`);
      log.info('Client left meeting room', {
        socketId: socket.id,
        meetingId,
      });
    });

    // Handle live audio streaming
    socket.on('audio-chunk', async (data) => {
      const { meetingId, audioData, mimeType } = data;
      
      // Broadcast to other participants in the meeting
      socket.to(`meeting-${meetingId}`).emit('audio-chunk-received', {
        meetingId,
        timestamp: Date.now(),
      });
    });

    // Handle transcription updates
    socket.on('transcription-update', (data) => {
      const { meetingId, transcript } = data;
      
      // Broadcast to all participants in the meeting
      io.to(`meeting-${meetingId}`).emit('transcription-updated', {
        meetingId,
        transcript,
        timestamp: Date.now(),
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      log.info('Client disconnected', { socketId: socket.id });
    });
  });

  log.info('Socket.IO server initialized');
  return io;
};

/**
 * Get Socket.IO instance
 * @returns {Server} - Socket.IO server instance
 */
export const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initializeSocketIO first.');
  }
  return io;
};

/**
 * Emit event to meeting room
 * @param {number} meetingId - Meeting ID
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
export const emitToMeeting = (meetingId, event, data) => {
  if (!io) return;
  
  io.to(`meeting-${meetingId}`).emit(event, {
    ...data,
    timestamp: Date.now(),
  });
  
  log.debug('Emitted event to meeting room', {
    meetingId,
    event,
  });
};

/**
 * Emit attendance update
 * @param {number} meetingId - Meeting ID
 * @param {Object} attendance - Attendance data
 */
export const emitAttendanceUpdate = (meetingId, attendance) => {
  emitToMeeting(meetingId, 'attendance-updated', {
    meetingId,
    attendance,
  });
};

/**
 * Emit task update
 * @param {number} meetingId - Meeting ID
 * @param {Object} task - Task data
 */
export const emitTaskUpdate = (meetingId, task) => {
  emitToMeeting(meetingId, 'task-updated', {
    meetingId,
    task,
  });
};

/**
 * Emit meeting status update
 * @param {number} meetingId - Meeting ID
 * @param {string} status - New status
 */
export const emitMeetingStatusUpdate = (meetingId, status) => {
  emitToMeeting(meetingId, 'meeting-status-updated', {
    meetingId,
    status,
  });
};

/**
 * Emit live transcription
 * @param {number} meetingId - Meeting ID
 * @param {string} transcript - Transcript text
 * @param {Object} summary - Real-time summary
 */
export const emitLiveTranscription = (meetingId, transcript, summary = null) => {
  emitToMeeting(meetingId, 'live-transcription', {
    meetingId,
    transcript,
    summary,
  });
};

export default {
  initializeSocketIO,
  getIO,
  emitToMeeting,
  emitAttendanceUpdate,
  emitTaskUpdate,
  emitMeetingStatusUpdate,
  emitLiveTranscription,
};

