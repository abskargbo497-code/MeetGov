/**
 * React Hook for Socket.IO Connection
 * Manages WebSocket connection for real-time updates
 */

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const useSocket = (meetingId = null) => {
  const { isAuthenticated } = useAuth();
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    // Initialize socket connection
    socketRef.current = io(API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    // Connection event handlers
    socketRef.current.on('connect', () => {
      setIsConnected(true);
      setError(null);
      console.log('Socket connected:', socketRef.current.id);

      // Join meeting room if meetingId is provided
      if (meetingId) {
        socketRef.current.emit('join-meeting', meetingId);
      }
    });

    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
      console.log('Socket disconnected');
    });

    socketRef.current.on('connect_error', (err) => {
      setError(err.message);
      console.error('Socket connection error:', err);
    });

    // Cleanup on unmount
    return () => {
      if (meetingId && socketRef.current) {
        socketRef.current.emit('leave-meeting', meetingId);
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [isAuthenticated, meetingId]);

  // Join meeting room
  const joinMeeting = (id) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('join-meeting', id);
    }
  };

  // Leave meeting room
  const leaveMeeting = (id) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('leave-meeting', id);
    }
  };

  // Subscribe to event
  const on = (event, callback) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
    }
  };

  // Unsubscribe from event
  const off = (event, callback) => {
    if (socketRef.current) {
      socketRef.current.off(event, callback);
    }
  };

  // Emit event
  const emit = (event, data) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit(event, data);
    }
  };

  return {
    socket: socketRef.current,
    isConnected,
    error,
    joinMeeting,
    leaveMeeting,
    on,
    off,
    emit,
  };
};

export default useSocket;

