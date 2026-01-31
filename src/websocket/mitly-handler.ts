/**
 * MITLY WebSocket Handler
 * 
 * Handles WebSocket connections for MITLY AI assistant
 * - Authentication required
 * - Role-based context
 * - Streaming responses
 * - Security validations
 */

import { WebSocket } from 'ws';
import { auth } from '../lib/auth';
import { fromNodeHeaders } from 'better-auth/node';
import { PrismaClient, EnterpriseRole } from '@prisma/client';
import Logger from '../logger';
import { streamMitlyResponse, MitlyUserContext } from '../services/mitly.service';
import { IncomingMessage } from 'http';

const prisma = new PrismaClient();

/**
 * Authenticated MITLY connection
 */
type MitlyConnection = {
  ws: WebSocket;
  userId: string;
  userEmail: string;
  userName?: string | null;
  role: 'PERSONAL' | 'ADMIN' | 'ORGANIZER' | 'ASSIGNEE';
  enterpriseId?: string;
  isAuthenticated: boolean;
};

const mitlyConnections = new Map<WebSocket, MitlyConnection>();

/**
 * Authenticate WebSocket connection using BetterAuth session
 */
async function authenticateConnection(request: IncomingMessage): Promise<MitlyConnection | null> {
  try {
    // Get session from headers
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (!session?.user) {
      Logger.warn('[MITLY] Authentication failed: No valid session');
      return null;
    }

    // Check if user is part of an enterprise
    const membership = await prisma.enterpriseMembership.findFirst({
      where: { userId: session.user.id },
      include: {
        enterprise: {
          select: { id: true, name: true }
        }
      }
    });

    let role: 'PERSONAL' | 'ADMIN' | 'ORGANIZER' | 'ASSIGNEE' = 'PERSONAL';
    let enterpriseId: string | undefined;

    if (membership) {
      // Map enterprise role
      if (membership.role === EnterpriseRole.ADMIN) {
        role = 'ADMIN';
      } else if (membership.role === EnterpriseRole.ORGANIZER) {
        role = 'ORGANIZER';
      } else if (membership.role === EnterpriseRole.ASSIGNEE) {
        role = 'ASSIGNEE';
      }
      enterpriseId = membership.enterpriseId;
    }

    Logger.info(`[MITLY] User authenticated: ${session.user.email} (${role})`);

    return {
      ws: null as any, // Will be set later
      userId: session.user.id,
      userEmail: session.user.email,
      userName: session.user.name,
      role,
      enterpriseId,
      isAuthenticated: true
    };
  } catch (error) {
    Logger.error('[MITLY] Authentication error:', error);
    return null;
  }
}

/**
 * Handle MITLY WebSocket connection
 */
export async function handleMitlyConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
  Logger.info('[MITLY] New connection attempt');

  // Authenticate connection
  const authResult = await authenticateConnection(request);

  if (!authResult) {
    Logger.warn('[MITLY] Rejecting unauthenticated connection');
    ws.close(1008, 'Authentication required');
    return;
  }

  // Store connection
  const connection: MitlyConnection = {
    ...authResult,
    ws
  };
  mitlyConnections.set(ws, connection);

  Logger.info(`[MITLY] Connection established for user ${connection.userEmail}`);

  // Send ready message
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'mitly:ready',
      user: {
        email: connection.userEmail,
        name: connection.userName,
        role: connection.role
      }
    }));
  }

  // Handle messages
  ws.on('message', async (data: Buffer) => {
    await handleMitlyMessage(ws, connection, data);
  });

  // Handle close
  ws.on('close', (code: number, reason: Buffer) => {
    Logger.info(`[MITLY] Connection closed: ${connection.userEmail} (code=${code})`);
    mitlyConnections.delete(ws);
  });

  // Handle errors
  ws.on('error', (error: Error) => {
    Logger.error('[MITLY] WebSocket error:', error);
    mitlyConnections.delete(ws);
  });
}

/**
 * Handle incoming MITLY message
 */
async function handleMitlyMessage(
  ws: WebSocket,
  connection: MitlyConnection,
  data: Buffer
): Promise<void> {
  try {
    const message = JSON.parse(data.toString());
    Logger.info(`[MITLY] Received message type: ${message.type}`);

    // Validate connection is authenticated
    if (!connection.isAuthenticated) {
      ws.send(JSON.stringify({
        type: 'mitly:error',
        error: 'Not authenticated'
      }));
      return;
    }

    // Handle message types
    if (message.type === 'mitly:message') {
      await handleUserMessage(ws, connection, message);
      return;
    }

    if (message.type === 'mitly:ping') {
      ws.send(JSON.stringify({
        type: 'mitly:pong',
        timestamp: new Date().toISOString()
      }));
      return;
    }

    // Unknown message type
    Logger.warn(`[MITLY] Unknown message type: ${message.type}`);
    ws.send(JSON.stringify({
      type: 'mitly:error',
      error: 'Unknown message type'
    }));
  } catch (error) {
    Logger.error('[MITLY] Error handling message:', error);
    ws.send(JSON.stringify({
      type: 'mitly:error',
      error: 'Failed to process message'
    }));
  }
}

/**
 * Handle user message and stream AI response
 */
async function handleUserMessage(
  ws: WebSocket,
  connection: MitlyConnection,
  message: any
): Promise<void> {
  const userMessage = message.content;

  if (!userMessage || typeof userMessage !== 'string' || userMessage.trim() === '') {
    ws.send(JSON.stringify({
      type: 'mitly:error',
      error: 'Message content is required'
    }));
    return;
  }

  Logger.info(`[MITLY] Processing message from ${connection.userEmail}: "${userMessage.substring(0, 50)}..."`);

  try {
    // Build user context
    const userContext: MitlyUserContext = {
      userId: connection.userId,
      role: connection.role,
      enterpriseId: connection.enterpriseId
    };

    // Validate role permissions
    if (connection.role === 'ASSIGNEE') {
      // ASSIGNEE role is not allowed to use MITLY
      ws.send(JSON.stringify({
        type: 'mitly:error',
        error: 'MITLY is only available for Personal users, Admins, and Organizers'
      }));
      return;
    }

    // Stream response
    const responseStream = streamMitlyResponse(userContext, userMessage);

    for await (const chunk of responseStream) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'mitly:chunk',
          content: chunk
        }));
      } else {
        Logger.warn('[MITLY] WebSocket closed during streaming');
        break;
      }
    }

    // Send completion message
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'mitly:complete'
      }));
    }

    Logger.info(`[MITLY] Response completed for ${connection.userEmail}`);
  } catch (error: any) {
    Logger.error('[MITLY] Error processing message:', error);
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'mitly:error',
        error: error.message || 'Failed to process your request'
      }));
    }
  }
}

/**
 * Get active MITLY connections count
 */
export function getActiveMitlyConnections(): number {
  return mitlyConnections.size;
}

/**
 * Close all MITLY connections (for graceful shutdown)
 */
export function closeAllMitlyConnections(): void {
  Logger.info(`[MITLY] Closing ${mitlyConnections.size} active connections`);
  
  for (const [ws, connection] of mitlyConnections) {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1001, 'Server shutting down');
      }
    } catch (error) {
      Logger.error('[MITLY] Error closing connection:', error);
    }
  }
  
  mitlyConnections.clear();
}
