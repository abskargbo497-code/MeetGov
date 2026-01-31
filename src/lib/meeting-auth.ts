/**
 * Meeting Authorization Module
 * 
 * Single source of truth for meeting ownership validation.
 * Used by REST controllers, WebSocket handlers, and services.
 */

import { Request } from 'express';
import { OwnerType, EnterpriseRole } from '@prisma/client';
import { auth } from './auth';
import { fromNodeHeaders } from 'better-auth/node';
import Logger from '../logger';
import prisma from './prisma';

/**
 * Unified request context for authorization
 * This interface is used across REST and WebSocket layers
 */
export interface RequestContext {
  user?: { id: string };
  guestSessionId?: string;
  enterpriseId?: string;
  enterpriseRole?: EnterpriseRole;
}

/**
 * Meeting ownership data needed for authorization
 */
export interface MeetingOwnership {
  id: string;
  ownerType: OwnerType;
  ownerId: string;
  guestSessionId?: string | null;
  enterpriseId?: string | null;
}

/**
 * Check if context can control a meeting
 * 
 * Authorization rules:
 * - GUEST: guestSessionId must match meeting.guestSessionId OR meeting.ownerId
 * - PERSONAL: user.id must match meeting.ownerId
 * - ENTERPRISE: user must be in the same enterprise with ORGANIZER or ADMIN role
 * 
 * @param meeting Meeting ownership data
 * @param context Request context with identity information
 * @returns boolean indicating if the context can control the meeting
 */
export function canControlMeeting(meeting: MeetingOwnership, context: RequestContext): boolean {
  // Debug logging (temporary)
  Logger.debug('canControlMeeting check', {
    meetingOwnerType: meeting.ownerType,
    meetingOwnerId: meeting.ownerId,
    meetingGuestSessionId: meeting.guestSessionId,
    meetingEnterpriseId: meeting.enterpriseId,
    contextUserId: context.user?.id,
    contextGuestSessionId: context.guestSessionId,
    contextEnterpriseId: context.enterpriseId,
  });

  if (meeting.ownerType === OwnerType.GUEST) {
    // Guest ownership: check guestSessionId against meeting's guestSessionId or ownerId
    if (!context.guestSessionId) {
      return false;
    }
    return context.guestSessionId === meeting.guestSessionId || 
           context.guestSessionId === meeting.ownerId;
  }

  if (meeting.ownerType === OwnerType.PERSONAL) {
    // Personal user ownership: check user.id against ownerId
    if (!context.user?.id) {
      return false;
    }
    return context.user.id === meeting.ownerId;
  }

  if (meeting.ownerType === OwnerType.ENTERPRISE) {
    // Enterprise ownership: user must be in the same enterprise
    if (!context.user?.id || !context.enterpriseId) {
      return false;
    }
    
    // Must be in the same enterprise
    if (context.enterpriseId !== meeting.enterpriseId) {
      return false;
    }
    
    // Owner of the meeting can always control it
    if (context.user.id === meeting.ownerId) {
      return true;
    }
    
    // ORGANIZER and ADMIN can control enterprise meetings
    if (context.enterpriseRole === EnterpriseRole.ORGANIZER || 
        context.enterpriseRole === EnterpriseRole.ADMIN) {
      return true;
    }
    
    return false;
  }

  return false;
}

/**
 * Check if context can view a meeting (less restrictive than control)
 * 
 * @param meeting Meeting ownership data
 * @param context Request context with identity information
 * @returns boolean indicating if the context can view the meeting
 */
export function canViewMeeting(meeting: MeetingOwnership, context: RequestContext): boolean {
  // Anyone who can control can also view
  if (canControlMeeting(meeting, context)) {
    return true;
  }

  // Enterprise members with any role can view enterprise meetings
  if (meeting.ownerType === OwnerType.ENTERPRISE && 
      context.enterpriseId === meeting.enterpriseId) {
    return true;
  }

  return false;
}

/**
 * Extract request context from Express request
 * Handles both authenticated users and guest sessions
 * 
 * @param req Express request object
 * @returns RequestContext with identity information
 */
export async function getRequestContext(req: Request): Promise<RequestContext> {
  const context: RequestContext = {};

  // Extract guestSessionId from headers or body
  const headerWorkflowId = req.headers['x-workflow-id'];
  const guestSessionId = req.body?.workflowId || 
    (Array.isArray(headerWorkflowId) ? headerWorkflowId[0] : headerWorkflowId);
  
  if (guestSessionId && typeof guestSessionId === 'string') {
    context.guestSessionId = guestSessionId;
  }

  // Try to get authenticated user from session
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (session?.user) {
      context.user = { id: session.user.id };
      
      // Check for enterprise membership using singleton prisma client
      const membership = await prisma.enterpriseMembership.findFirst({
        where: { userId: session.user.id },
        select: { enterpriseId: true, role: true }
      });
      
      if (membership) {
        context.enterpriseId = membership.enterpriseId;
        context.enterpriseRole = membership.role;
      }
    }
  } catch (authError) {
    // Auth check failed, continue with guest flow only
    Logger.debug('Auth check failed in getRequestContext, continuing with guest session if available');
  }

  return context;
}

/**
 * Create request context from WebSocket connection data
 * Used during WebSocket authentication
 * 
 * @param data WebSocket authentication message data
 * @returns RequestContext with identity information
 */
export function createWebSocketContext(data: {
  workflowId?: string;
  userId?: string;
  enterpriseId?: string;
  enterpriseRole?: string;
}): RequestContext {
  const context: RequestContext = {};

  if (data.workflowId) {
    context.guestSessionId = data.workflowId;
  }

  if (data.userId) {
    context.user = { id: data.userId };
  }

  if (data.enterpriseId) {
    context.enterpriseId = data.enterpriseId;
  }

  if (data.enterpriseRole) {
    context.enterpriseRole = data.enterpriseRole as EnterpriseRole;
  }

  return context;
}

/**
 * Validate meeting ownership and return result
 * Convenience function that combines fetching and checking
 * 
 * @param meeting Meeting with ownership fields
 * @param context Request context
 * @returns Object with valid flag and error message if invalid
 */
export function validateMeetingAccess(
  meeting: MeetingOwnership | null,
  context: RequestContext
): { valid: boolean; error?: string } {
  if (!meeting) {
    return { valid: false, error: 'Meeting not found' };
  }

  if (!canControlMeeting(meeting, context)) {
    return { valid: false, error: 'Not authorized to control this meeting' };
  }

  return { valid: true };
}

export default {
  canControlMeeting,
  canViewMeeting,
  getRequestContext,
  createWebSocketContext,
  validateMeetingAccess,
};
