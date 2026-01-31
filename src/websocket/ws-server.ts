import { Server } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import Logger from '../logger';
import { generateMeetingDraft as aiGenerateMeetingDraft } from '../services/ai-assistant.service';
import { PrismaClient, OwnerType, EnterpriseRole } from '@prisma/client';
import { canControlMeeting, createWebSocketContext, RequestContext, MeetingOwnership } from '../lib/meeting-auth';

const prisma = new PrismaClient();

// Store active connections
type Connection = {
  ws: WebSocket;
  token?: string;
  workflowId?: string;
  userId?: string; // For authenticated personal users
  enterpriseId?: string; // For enterprise users
  enterpriseRole?: string; // ADMIN, ORGANIZER, ASSIGNEE
  isAuthenticated: boolean;
  subscribedRooms: Set<string>; // Room subscriptions (e.g., "meeting:abc123", "enterprise:abc123")
  context: RequestContext; // Unified request context for authorization
};

const connections = new Map<WebSocket, Connection>();

// Room-based subscriptions: roomId -> Set of WebSocket connections
const rooms = new Map<string, Set<WebSocket>>();

// User-based subscriptions: userId -> Set of WebSocket connections (for direct user notifications)
const userConnections = new Map<string, Set<WebSocket>>();

// Enterprise-based subscriptions: enterpriseId -> Set of WebSocket connections
const enterpriseConnections = new Map<string, Set<WebSocket>>();

export function setupWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ 
    noServer: true,
    path: '/api/v1/ws',
  });

  // Handle upgrade requests (HTTP -> WebSocket)
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
    
    Logger.info(`[WS] Upgrade request received for path: ${pathname}`);
    
    if (pathname === '/api/v1/ws') {
      Logger.info('[WS] Accepting WebSocket upgrade');
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      Logger.warn(`[WS] Rejected upgrade for unknown path: ${pathname}`);
      socket.destroy();
    }
  });

  // Handle new connections
  wss.on('connection', (ws: WebSocket) => {
    Logger.info('[WS] Client connected');
    
    // Add to connections map with empty context
    connections.set(ws, { 
      ws, 
      isAuthenticated: false,
      subscribedRooms: new Set(),
      context: {} // Initialize empty context
    });
    
    // Immediately send connected message - no auth required at this stage
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'connected' }));
      Logger.info('[WS] Sent connected message');
    }
    
    ws.on('message', (message: Buffer | ArrayBuffer | Buffer[]) => handleMessage(ws, message));
    
    ws.on('close', (code: number, reason: Buffer) => {
      Logger.info(`[WS] Client disconnected: code=${code}, reason=${reason.toString()}`);
      // Clean up room subscriptions
      const connection = connections.get(ws);
      if (connection) {
        for (const roomId of connection.subscribedRooms) {
          const room = rooms.get(roomId);
          if (room) {
            room.delete(ws);
            if (room.size === 0) {
              rooms.delete(roomId);
            }
          }
        }
        // Clean up user connections
        if (connection.userId) {
          const userConns = userConnections.get(connection.userId);
          if (userConns) {
            userConns.delete(ws);
            if (userConns.size === 0) {
              userConnections.delete(connection.userId);
            }
          }
        }
        // Clean up enterprise connections
        if (connection.enterpriseId) {
          const entConns = enterpriseConnections.get(connection.enterpriseId);
          if (entConns) {
            entConns.delete(ws);
            if (entConns.size === 0) {
              enterpriseConnections.delete(connection.enterpriseId);
            }
          }
        }
      }
      connections.delete(ws);
    });
    
    ws.on('error', (error: Error) => {
      Logger.error('[WS] Socket error:', error);
      connections.delete(ws);
    });
  });
  
  Logger.info('[WS] WebSocket server initialized on path /api/v1/ws');
  return wss;
}

// Process incoming WebSocket messages
function handleMessage(ws: WebSocket | null, messageData: Buffer | ArrayBuffer | Buffer[]): void {
  if (!ws) return;
  
  try {
    const message = JSON.parse(messageData.toString());
    Logger.info(`[WS] Received message type: ${message.type || 'unknown'}`);
    const connection = connections.get(ws);
    
    if (!connection) {
      return;
    }
    
    // Handle authentication
    if (message.type === 'authenticate') {
      Logger.info('WebSocket client authenticating');
      
      // Store authentication info
      connection.token = message.token;
      connection.workflowId = message.workflowId;
      connection.userId = message.userId; // For authenticated personal users
      connection.enterpriseId = message.enterpriseId; // For enterprise users
      connection.enterpriseRole = message.enterpriseRole; // ADMIN, ORGANIZER, ASSIGNEE
      connection.isAuthenticated = true;
      
      // Build unified RequestContext for authorization
      connection.context = createWebSocketContext({
        workflowId: message.workflowId,
        userId: message.userId,
        enterpriseId: message.enterpriseId,
        enterpriseRole: message.enterpriseRole,
      });
      
      // Debug logging (temporary)
      Logger.debug('WebSocket context created', {
        workflowId: message.workflowId,
        userId: message.userId,
        enterpriseId: message.enterpriseId,
        contextGuestSessionId: connection.context.guestSessionId,
        contextUserId: connection.context.user?.id,
      });
      
      // Register user connection for direct notifications
      if (message.userId) {
        if (!userConnections.has(message.userId)) {
          userConnections.set(message.userId, new Set());
        }
        userConnections.get(message.userId)!.add(ws);
      }
      
      // Register enterprise connection for enterprise-wide notifications
      if (message.enterpriseId) {
        if (!enterpriseConnections.has(message.enterpriseId)) {
          enterpriseConnections.set(message.enterpriseId, new Set());
        }
        enterpriseConnections.get(message.enterpriseId)!.add(ws);
        
        // Auto-subscribe to enterprise room
        const enterpriseRoomId = `enterprise:${message.enterpriseId}`;
        if (!rooms.has(enterpriseRoomId)) {
          rooms.set(enterpriseRoomId, new Set());
        }
        rooms.get(enterpriseRoomId)!.add(ws);
        connection.subscribedRooms.add(enterpriseRoomId);
        
        Logger.info(`[WS] User ${message.userId} subscribed to enterprise room ${enterpriseRoomId}`);
      }
      
      // Send acknowledgment
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'authenticated',
          success: true,
          enterpriseId: message.enterpriseId,
          enterpriseRole: message.enterpriseRole
        }));
      }
      return;
    }
    
    // Handle meeting draft generation (no auth required for Phase 1 stability)
    if (message.type === 'generateMeetingDraft') {
      handleMeetingDraftGeneration(ws, connection, message);
      return;
    }
    
    // Handle ping for connection testing
    if (message.type === 'ping') {
      Logger.info('Received ping message');
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date().toISOString(),
          echo: message.data
        }));
        Logger.info('Sent pong response');
      }
      return;
    }
    
    // Handle meeting subscription
    if (message.type === 'subscribe') {
      handleMeetingSubscription(ws, connection, message);
      return;
    }
    
    // Handle unsubscribe
    if (message.type === 'unsubscribe') {
      handleMeetingUnsubscription(ws, connection, message);
      return;
    }
    
    // Unknown message type
    Logger.warn('Unknown WebSocket message type:', message.type);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Unknown message type'
      }));
    }
  } catch (error) {
    Logger.error('Error processing WebSocket message:', error);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Failed to process message'
      }));
    }
  }
}

// Process meeting draft generation with OpenAI
async function handleMeetingDraftGeneration(ws: WebSocket, connection: Connection, message: any): Promise<void> {
  // Log the request
  Logger.info('Generating meeting draft from:', message.input);
  
  try {
    // Generate meeting draft using OpenAI service
    const draft = await aiGenerateMeetingDraft(message.input);
    
    // Send the generated draft to the client
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'meetingDraftGenerated',
        draft
      }));
    }
    
    Logger.info('Successfully sent meeting draft to client');
  } catch (error) {
    Logger.error('Error generating meeting draft:', error);
    
    // Send error response to client
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'meetingDraftGenerated',
        error: 'Failed to generate meeting draft. Please try again.'
      }));
    }
  }
}

// Handle meeting room subscription
async function handleMeetingSubscription(ws: WebSocket, connection: Connection, message: any): Promise<void> {
  const { channel, meetingId, role } = message;
  
  if (channel !== 'meeting' || !meetingId) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Invalid subscription: channel must be "meeting" and meetingId is required'
      }));
    }
    return;
  }
  
  // Validate meeting exists and get ownership data
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { 
      id: true, 
      ownerType: true,
      ownerId: true,
      guestSessionId: true, 
      enterpriseId: true 
    }
  });
  
  if (!meeting) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Meeting not found'
      }));
    }
    return;
  }
  
  // Build meeting ownership for authorization check
  const meetingOwnership: MeetingOwnership = {
    id: meeting.id,
    ownerType: meeting.ownerType,
    ownerId: meeting.ownerId,
    guestSessionId: meeting.guestSessionId,
    enterpriseId: meeting.enterpriseId,
  };
  
  // Debug logging (temporary)
  Logger.debug('WebSocket subscription auth check', {
    meetingOwnerType: meeting.ownerType,
    meetingOwnerId: meeting.ownerId,
    meetingGuestSessionId: meeting.guestSessionId,
    socketUserId: connection.context.user?.id,
    guestSessionId: connection.context.guestSessionId,
  });
  
  // Check authorization using unified auth
  const isOwner = canControlMeeting(meetingOwnership, connection.context);
  
  // Participants can subscribe if they have a userId and role is 'participant'
  let isParticipant = false;
  if (connection.userId && role === 'participant') {
    // Check if user is a participant in this meeting
    const attendance = await prisma.attendance.findFirst({
      where: {
        meetingId,
        ownerId: connection.userId,
      }
    });
    isParticipant = !!attendance;
  }
  
  if (!isOwner && !isParticipant) {
    Logger.warn(`[WS] Subscription denied for meeting ${meetingId}: not authorized`);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Not authorized to subscribe to this meeting'
      }));
    }
    return;
  }
  
  const roomId = `meeting:${meetingId}`;
  
  // Add to room
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  rooms.get(roomId)!.add(ws);
  connection.subscribedRooms.add(roomId);
  
  Logger.info(`[WS] Client subscribed to room: ${roomId} (role: ${isOwner ? 'owner' : 'participant'})`);
  
  // Send confirmation
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'subscribed',
      channel: 'meeting',
      meetingId,
      role: isOwner ? 'owner' : 'participant'
    }));
  }
}

// Handle meeting room unsubscription
function handleMeetingUnsubscription(ws: WebSocket, connection: Connection, message: any): void {
  const { channel, meetingId } = message;
  
  if (channel !== 'meeting' || !meetingId) {
    return;
  }
  
  const roomId = `meeting:${meetingId}`;
  
  // Remove from room
  const room = rooms.get(roomId);
  if (room) {
    room.delete(ws);
    if (room.size === 0) {
      rooms.delete(roomId);
    }
  }
  connection.subscribedRooms.delete(roomId);
  
  Logger.info(`[WS] Client unsubscribed from room: ${roomId}`);
  
  // Send confirmation
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'unsubscribed',
      channel: 'meeting',
      meetingId
    }));
  }
}

// Attendance event payload type
type AttendanceEventPayload = {
  type: 'attendance:checked-in';
  meetingId: string;
  attendee: {
    name: string;
    email: string | null;
    checkedInAt: string;
  };
  totalCount: number;
};

// Meeting lifecycle event payload type
type MeetingEventPayload = {
  type: 'meeting:auto-ended' | 'meeting:state-changed' | 'processing:completed' | 'processing:failed' | 'meeting:started';
  meetingId: string;
  recordingState?: string;
  status?: string;
  processingStatus?: string;
  error?: string;
};

// Task event payload type
type TaskEventPayload = {
  type: 'task:created' | 'task:updated' | 'task:deleted' | 'task:assigned' | 'task:submitted';
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
};

// Notification event payload type
type NotificationEventPayload = {
  type: 'notification';
  meetingId: string;
  notification: {
    id: string;
    title: string;
    message: string;
    timestamp: string;
  };
};

// Artifact event payload type
type ArtifactEventPayload = {
  type: 'artifact:started' | 'artifact:completed' | 'artifact:failed' | 'artifact:all-completed';
  meetingId: string;
  artifactType?: 'SUMMARY' | 'MINUTES' | 'ACTION_ITEMS';
  artifactId?: string;
  content?: string;
  error?: string;
  timestamp: string;
};

/**
 * Emit attendance event to all subscribers of a meeting room
 * Called from attendance controller AFTER successful DB write
 */
export function emitAttendanceEvent(meetingId: string, payload: AttendanceEventPayload): void {
  const roomId = `meeting:${meetingId}`;
  const room = rooms.get(roomId);
  
  if (!room || room.size === 0) {
    Logger.info(`[WS] No subscribers for room ${roomId}, skipping event emission`);
    return;
  }
  
  const message = JSON.stringify(payload);
  let sentCount = 0;
  
  for (const ws of room) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      sentCount++;
    }
  }
  
  Logger.info(`[WS] Emitted attendance:checked-in to ${sentCount} clients in room ${roomId}`);
}

/**
 * Emit meeting lifecycle event to all subscribers of a meeting room
 * Used for auto-end notifications and state changes
 */
export function emitMeetingEvent(meetingId: string, payload: MeetingEventPayload): void {
  const roomId = `meeting:${meetingId}`;
  const room = rooms.get(roomId);
  
  if (!room || room.size === 0) {
    Logger.info(`[WS] No subscribers for room ${roomId}, skipping meeting event emission`);
    return;
  }
  
  const message = JSON.stringify(payload);
  let sentCount = 0;
  
  for (const ws of room) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      sentCount++;
    }
  }
  
  Logger.info(`[WS] Emitted ${payload.type} to ${sentCount} clients in room ${roomId}`);
}

/**
 * Emit processing completed event to all subscribers of a meeting room
 * Called from processing worker after transcription is complete
 */
export function emitProcessingCompleted(meetingId: string): void {
  emitMeetingEvent(meetingId, {
    type: 'processing:completed',
    meetingId,
    processingStatus: 'COMPLETED',
  });
}

/**
 * Emit processing failed event to all subscribers of a meeting room
 * Called from processing worker when transcription fails
 */
export function emitProcessingFailed(meetingId: string, error: string): void {
  emitMeetingEvent(meetingId, {
    type: 'processing:failed',
    meetingId,
    processingStatus: 'FAILED',
    error,
  });
}

/**
 * Emit task event to all subscribers of a meeting room
 * Used for task assignments and submissions
 */
export function emitTaskEvent(meetingId: string, payload: TaskEventPayload): void {
  const roomId = `meeting:${meetingId}`;
  const room = rooms.get(roomId);
  
  if (!room || room.size === 0) {
    Logger.info(`[WS] No subscribers for room ${roomId}, skipping task event emission`);
    return;
  }
  
  const message = JSON.stringify(payload);
  let sentCount = 0;
  
  for (const ws of room) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      sentCount++;
    }
  }
  
  Logger.info(`[WS] Emitted ${payload.type} to ${sentCount} clients in room ${roomId}`);
}

/**
 * Emit notification to all subscribers of a meeting room
 */
export function emitNotification(meetingId: string, payload: NotificationEventPayload): void {
  const roomId = `meeting:${meetingId}`;
  const room = rooms.get(roomId);
  
  if (!room || room.size === 0) {
    return;
  }
  
  const message = JSON.stringify(payload);
  
  for (const ws of room) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

/**
 * Emit meeting started event
 */
export function emitMeetingStarted(meetingId: string): void {
  emitMeetingEvent(meetingId, {
    type: 'meeting:started',
    meetingId,
    status: 'LIVE',
  });
}

// Transcript ready event payload type
type TranscriptReadyPayload = {
  type: 'transcript:ready';
  meetingId: string;
  segmentCount?: number;
};

/**
 * Emit transcript ready event to all subscribers of a meeting room
 * Called when AssemblyAI transcription is complete
 */
export function emitTranscriptReady(meetingId: string, segmentCount?: number): void {
  const roomId = `meeting:${meetingId}`;
  const room = rooms.get(roomId);
  
  if (!room || room.size === 0) {
    Logger.info(`[WS] No subscribers for room ${roomId}, skipping transcript:ready event emission`);
    return;
  }
  
  const payload: TranscriptReadyPayload = {
    type: 'transcript:ready',
    meetingId,
    segmentCount,
  };
  
  const message = JSON.stringify(payload);
  let sentCount = 0;
  
  for (const ws of room) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      sentCount++;
    }
  }
  
  Logger.info(`[WS] Emitted transcript:ready to ${sentCount} clients in room ${roomId}`);
}

/**
 * Emit artifact event to all subscribers of a meeting room
 * Used for artifact generation progress updates
 */
export function emitArtifactEvent(meetingId: string, payload: ArtifactEventPayload): void {
  const roomId = `meeting:${meetingId}`;
  const room = rooms.get(roomId);
  
  if (!room || room.size === 0) {
    Logger.info(`[WS] No subscribers for room ${roomId}, skipping artifact event emission`);
    return;
  }
  
  const message = JSON.stringify(payload);
  let sentCount = 0;
  
  for (const ws of room) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      sentCount++;
    }
  }
  
  Logger.info(`[WS] Emitted ${payload.type} (${payload.artifactType || 'all'}) to ${sentCount} clients in room ${roomId}`);
}

/**
 * Emit artifact started event
 */
export function emitArtifactStarted(
  meetingId: string, 
  artifactType: 'SUMMARY' | 'MINUTES' | 'ACTION_ITEMS',
  artifactId: string
): void {
  emitArtifactEvent(meetingId, {
    type: 'artifact:started',
    meetingId,
    artifactType,
    artifactId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emit artifact completed event
 */
export function emitArtifactCompleted(
  meetingId: string,
  artifactType: 'SUMMARY' | 'MINUTES' | 'ACTION_ITEMS',
  artifactId: string,
  content?: string
): void {
  emitArtifactEvent(meetingId, {
    type: 'artifact:completed',
    meetingId,
    artifactType,
    artifactId,
    content,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emit artifact failed event
 */
export function emitArtifactFailed(
  meetingId: string,
  artifactType: 'SUMMARY' | 'MINUTES' | 'ACTION_ITEMS',
  artifactId: string,
  error: string
): void {
  emitArtifactEvent(meetingId, {
    type: 'artifact:failed',
    meetingId,
    artifactType,
    artifactId,
    error,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emit all artifacts completed event
 */
export function emitAllArtifactsCompleted(meetingId: string): void {
  emitArtifactEvent(meetingId, {
    type: 'artifact:all-completed',
    meetingId,
    timestamp: new Date().toISOString(),
  });
}

// ============================================
// ENTERPRISE-SCOPED EVENT EMISSION FUNCTIONS
// ============================================

// Enterprise event payload types
type EnterpriseTaskEventPayload = {
  type: 'enterprise:task:assigned' | 'enterprise:task:updated' | 'enterprise:task:completed';
  enterpriseId: string;
  taskId: string;
  meetingId: string;
  taskTitle: string;
  assigneeUserId?: string;
  assigneeName?: string;
  createdByUserId?: string;
  timestamp: string;
};

type EnterpriseMeetingEventPayload = {
  type: 'enterprise:meeting:created' | 'enterprise:meeting:updated' | 'enterprise:meeting:started' | 'enterprise:meeting:ended';
  enterpriseId: string;
  meetingId: string;
  meetingTitle: string;
  status?: string;
  organizerUserId?: string;
  timestamp: string;
};

type EnterpriseMemberEventPayload = {
  type: 'enterprise:member:joined' | 'enterprise:member:updated';
  enterpriseId: string;
  userId: string;
  userName?: string;
  role: string;
  timestamp: string;
};

type EnterpriseNotificationPayload = {
  type: 'enterprise:notification';
  enterpriseId: string;
  targetUserId?: string; // If specified, only send to this user
  targetRole?: string; // If specified, only send to users with this role
  notification: {
    id: string;
    title: string;
    message: string;
    category: 'task' | 'meeting' | 'system';
    actionUrl?: string;
  };
  timestamp: string;
};

/**
 * Emit enterprise task event to all enterprise members or specific user
 */
export function emitEnterpriseTaskEvent(payload: EnterpriseTaskEventPayload): void {
  const { enterpriseId, assigneeUserId } = payload;
  
  // If assignee specified, send directly to that user
  if (assigneeUserId) {
    emitToUser(assigneeUserId, payload);
  }
  
  // Also broadcast to enterprise room for admins/organizers
  const roomId = `enterprise:${enterpriseId}`;
  const room = rooms.get(roomId);
  
  if (!room || room.size === 0) {
    Logger.info(`[WS] No subscribers for enterprise room ${roomId}`);
    return;
  }
  
  const message = JSON.stringify(payload);
  let sentCount = 0;
  
  for (const ws of room) {
    const connection = connections.get(ws);
    // Send to ADMIN and ORGANIZER roles only (they see all tasks)
    if (connection && (connection.enterpriseRole === 'ADMIN' || connection.enterpriseRole === 'ORGANIZER')) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        sentCount++;
      }
    }
  }
  
  Logger.info(`[WS] Emitted ${payload.type} to ${sentCount} admin/organizer clients in enterprise ${enterpriseId}`);
}

/**
 * Emit enterprise meeting event to all enterprise members
 */
export function emitEnterpriseMeetingEvent(payload: EnterpriseMeetingEventPayload): void {
  const { enterpriseId } = payload;
  const roomId = `enterprise:${enterpriseId}`;
  const room = rooms.get(roomId);
  
  if (!room || room.size === 0) {
    Logger.info(`[WS] No subscribers for enterprise room ${roomId}`);
    return;
  }
  
  const message = JSON.stringify(payload);
  let sentCount = 0;
  
  for (const ws of room) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      sentCount++;
    }
  }
  
  Logger.info(`[WS] Emitted ${payload.type} to ${sentCount} clients in enterprise ${enterpriseId}`);
}

/**
 * Emit enterprise member event (e.g., new member joined)
 */
export function emitEnterpriseMemberEvent(payload: EnterpriseMemberEventPayload): void {
  const { enterpriseId } = payload;
  const roomId = `enterprise:${enterpriseId}`;
  const room = rooms.get(roomId);
  
  if (!room || room.size === 0) {
    return;
  }
  
  const message = JSON.stringify(payload);
  let sentCount = 0;
  
  // Only send to ADMIN and ORGANIZER (they manage members)
  for (const ws of room) {
    const connection = connections.get(ws);
    if (connection && (connection.enterpriseRole === 'ADMIN' || connection.enterpriseRole === 'ORGANIZER')) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        sentCount++;
      }
    }
  }
  
  Logger.info(`[WS] Emitted ${payload.type} to ${sentCount} admin/organizer clients in enterprise ${enterpriseId}`);
}

/**
 * Emit notification to specific user(s) in an enterprise
 */
export function emitEnterpriseNotification(payload: EnterpriseNotificationPayload): void {
  const { enterpriseId, targetUserId, targetRole } = payload;
  
  // If targeting specific user
  if (targetUserId) {
    emitToUser(targetUserId, payload);
    return;
  }
  
  const roomId = `enterprise:${enterpriseId}`;
  const room = rooms.get(roomId);
  
  if (!room || room.size === 0) {
    return;
  }
  
  const message = JSON.stringify(payload);
  let sentCount = 0;
  
  for (const ws of room) {
    const connection = connections.get(ws);
    
    // If role filter specified, check role
    if (targetRole && connection?.enterpriseRole !== targetRole) {
      continue;
    }
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      sentCount++;
    }
  }
  
  Logger.info(`[WS] Emitted enterprise notification to ${sentCount} clients in enterprise ${enterpriseId}`);
}

/**
 * Emit event directly to a specific user
 */
export function emitToUser(userId: string, payload: any): void {
  const userConns = userConnections.get(userId);
  
  if (!userConns || userConns.size === 0) {
    Logger.info(`[WS] No active connections for user ${userId}`);
    return;
  }
  
  const message = JSON.stringify(payload);
  let sentCount = 0;
  
  for (const ws of userConns) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      sentCount++;
    }
  }
  
  Logger.info(`[WS] Emitted event to ${sentCount} connections for user ${userId}`);
}

/**
 * Helper: Emit task assigned event for enterprise
 */
export function emitEnterpriseTaskAssigned(
  enterpriseId: string,
  taskId: string,
  meetingId: string,
  taskTitle: string,
  assigneeUserId: string,
  assigneeName?: string,
  createdByUserId?: string
): void {
  emitEnterpriseTaskEvent({
    type: 'enterprise:task:assigned',
    enterpriseId,
    taskId,
    meetingId,
    taskTitle,
    assigneeUserId,
    assigneeName,
    createdByUserId,
    timestamp: new Date().toISOString()
  });
}

/**
 * Helper: Emit meeting created event for enterprise
 */
export function emitEnterpriseMeetingCreated(
  enterpriseId: string,
  meetingId: string,
  meetingTitle: string,
  organizerUserId?: string
): void {
  emitEnterpriseMeetingEvent({
    type: 'enterprise:meeting:created',
    enterpriseId,
    meetingId,
    meetingTitle,
    organizerUserId,
    timestamp: new Date().toISOString()
  });
}

/**
 * Helper: Emit meeting status change event for enterprise
 */
export function emitEnterpriseMeetingStatusChange(
  enterpriseId: string,
  meetingId: string,
  meetingTitle: string,
  status: 'started' | 'ended' | 'updated'
): void {
  const eventType = status === 'started' ? 'enterprise:meeting:started' :
                    status === 'ended' ? 'enterprise:meeting:ended' :
                    'enterprise:meeting:updated';
  
  emitEnterpriseMeetingEvent({
    type: eventType,
    enterpriseId,
    meetingId,
    meetingTitle,
    status,
    timestamp: new Date().toISOString()
  });
}
