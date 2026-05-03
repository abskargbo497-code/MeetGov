/**
 * Dashboard Notifications Hook
 * 
 * Provides real-time task notifications for the dashboard using WebSocket
 */

'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { getWorkflowId } from '@/lib/api/guest-session';

const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';
const WS_PATH = '/api/v1/ws';

export type NotificationType = 'task' | 'meeting' | 'info';

export interface DashboardNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  data?: {
    meetingId?: string;
    taskId?: string;
    taskTitle?: string;
  };
}

export type TaskEventType = 
  | 'task:created'
  | 'task:updated'
  | 'task:deleted'
  | 'task:assigned'
  | 'task:submitted';

export interface TaskEvent {
  type: TaskEventType;
  meetingId: string;
  taskId: string;
  assigneeEmail?: string;
  assigneeName?: string;
  taskTitle?: string;
  task?: {
    id: string;
    title: string;
    status: string;
    assignedToUserId?: string | null;
    createdByUserId?: string | null;
  };
}

interface UseDashboardNotificationsOptions {
  userId?: string;
  onTaskEvent?: (event: TaskEvent) => void;
  onNotification?: (notification: DashboardNotification) => void;
  enabled?: boolean;
}

interface UseDashboardNotificationsReturn {
  notifications: DashboardNotification[];
  unreadCount: number;
  isConnected: boolean;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
}

export function useDashboardNotifications({
  userId,
  onTaskEvent,
  onNotification,
  enabled = true,
}: UseDashboardNotificationsOptions): UseDashboardNotificationsReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  // Stable refs for callbacks
  const onTaskEventRef = useRef(onTaskEvent);
  onTaskEventRef.current = onTaskEvent;
  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;

  const addNotification = useCallback((notification: Omit<DashboardNotification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: DashboardNotification = {
      ...notification,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      read: false,
    };
    
    setNotifications(prev => [newNotification, ...prev].slice(0, 50)); // Keep last 50
    onNotificationRef.current?.(newNotification);
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      
      // Handle task events
      if (data.type?.startsWith('task:')) {
        const taskEvent = data as TaskEvent;
        onTaskEventRef.current?.(taskEvent);

        // Create notification based on event type
        let title = '';
        let message = '';
        
        switch (taskEvent.type) {
          case 'task:created':
            title = 'New Task Created';
            message = `Task "${taskEvent.task?.title || taskEvent.taskTitle || 'Unknown'}" has been created.`;
            break;
          case 'task:assigned':
            title = 'Task Assigned';
            message = `You have been assigned to "${taskEvent.taskTitle || 'a task'}"`;
            break;
          case 'task:updated':
            title = 'Task Updated';
            message = `Task "${taskEvent.task?.title || 'Unknown'}" has been updated.`;
            break;
          case 'task:submitted':
            title = 'Task Submitted';
            message = `A submission was made for "${taskEvent.taskTitle || 'a task'}"`;
            break;
          case 'task:deleted':
            title = 'Task Deleted';
            message = `A task has been deleted.`;
            break;
        }

        if (title) {
          addNotification({
            type: 'task',
            title,
            message,
            data: {
              meetingId: taskEvent.meetingId,
              taskId: taskEvent.taskId,
              taskTitle: taskEvent.task?.title || taskEvent.taskTitle,
            },
          });
        }
      }
    } catch (err) {
      console.error('[DashboardWS] Failed to parse message:', err);
    }
  }, [addNotification]);

  const connect = useCallback(() => {
    if (!enabled) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const workflowId = getWorkflowId();
    
    try {
      const wsUrl = `${WS_BASE_URL}${WS_PATH}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[DashboardWS] Connected');
        setIsConnected(true);
        reconnectAttempts.current = 0;

        // Authenticate
        ws.send(JSON.stringify({
          type: 'authenticate',
          userId,
          workflowId,
          token: workflowId,
        }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'authenticated') {
          console.log('[DashboardWS] Authenticated');
        } else {
          handleMessage(event);
        }
      };

      ws.onclose = (closeEvent) => {
        console.log('[DashboardWS] Disconnected:', closeEvent.code);
        setIsConnected(false);
        wsRef.current = null;
        
        // Attempt to reconnect
        if (enabled && closeEvent.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;
          console.log(`[DashboardWS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('[DashboardWS] Error:', error);
      };
    } catch (err) {
      console.error('[DashboardWS] Failed to connect:', err);
    }
  }, [enabled, userId, handleMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Component unmounting');
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // WebSocket disabled — no WS server in single-server Next.js setup
  useEffect(() => {
    return () => {};
  }, [enabled]);

  const markAsRead = useCallback((notificationId: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return {
    notifications,
    unreadCount,
    isConnected,
    markAsRead,
    markAllAsRead,
    clearNotifications,
  };
}
