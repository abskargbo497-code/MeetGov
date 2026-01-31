/**
 * Enterprise Role-Based Middleware
 * 
 * Middleware functions for enforcing role-based access control in enterprise context
 * Supports ADMIN, ORGANIZER, and ASSIGNEE roles
 */

import { Request, Response, NextFunction } from 'express';
import { PrismaClient, EnterpriseRole } from '@prisma/client';
import { auth } from '../lib/auth';
import { fromNodeHeaders } from 'better-auth/node';
import Logger from '../logger';

const prisma = new PrismaClient();

// Extend Express Request type to include enterprise context
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name?: string | null;
        image?: string | null;
      };
      enterpriseContext?: {
        enterpriseId: string;
        role: EnterpriseRole;
        userId: string;
        membershipId: string;
      };
    }
  }
}

/**
 * Helper to get user's enterprise membership
 */
async function getEnterpriseMembership(userId: string) {
  return prisma.enterpriseMembership.findFirst({
    where: { userId },
    include: {
      enterprise: {
        select: { id: true, name: true, domain: true }
      }
    }
  });
}

/**
 * Base middleware to attach enterprise context to request
 * Should be used before role-specific middleware
 */
export const attachEnterpriseContext = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const membership = await getEnterpriseMembership(session.user.id);

    if (!membership) {
      res.status(403).json({ error: 'Not a member of any enterprise' });
      return;
    }

    // Attach user info to request
    req.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    };

    // Attach enterprise context to request
    req.enterpriseContext = {
      enterpriseId: membership.enterpriseId,
      role: membership.role,
      userId: session.user.id,
      membershipId: membership.id,
    };

    next();
  } catch (error) {
    Logger.error('Enterprise context middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Middleware to require ADMIN role
 * Must be used after attachEnterpriseContext
 */
export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.enterpriseContext) {
    res.status(500).json({ error: 'Enterprise context not attached' });
    return;
  }

  if (req.enterpriseContext.role !== EnterpriseRole.ADMIN) {
    Logger.warn(`Access denied: User ${req.enterpriseContext.userId} attempted admin action with role ${req.enterpriseContext.role}`);
    res.status(403).json({ error: 'Forbidden: Admin role required' });
    return;
  }

  next();
};

/**
 * Middleware to require ORGANIZER or ADMIN role
 * Must be used after attachEnterpriseContext
 */
export const requireOrganizer = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.enterpriseContext) {
    res.status(500).json({ error: 'Enterprise context not attached' });
    return;
  }

  const allowedRoles: EnterpriseRole[] = [EnterpriseRole.ADMIN, EnterpriseRole.ORGANIZER];
  
  if (!allowedRoles.includes(req.enterpriseContext.role)) {
    Logger.warn(`Access denied: User ${req.enterpriseContext.userId} attempted organizer action with role ${req.enterpriseContext.role}`);
    res.status(403).json({ error: 'Forbidden: Organizer or Admin role required' });
    return;
  }

  next();
};

/**
 * Middleware to require ASSIGNEE, ORGANIZER, or ADMIN role (any enterprise member)
 * Must be used after attachEnterpriseContext
 */
export const requireAssignee = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.enterpriseContext) {
    res.status(500).json({ error: 'Enterprise context not attached' });
    return;
  }

  // All enterprise roles can access assignee-level resources
  const allowedRoles: EnterpriseRole[] = [
    EnterpriseRole.ADMIN, 
    EnterpriseRole.ORGANIZER, 
    EnterpriseRole.ASSIGNEE
  ];
  
  if (!allowedRoles.includes(req.enterpriseContext.role)) {
    Logger.warn(`Access denied: User ${req.enterpriseContext.userId} has invalid role ${req.enterpriseContext.role}`);
    res.status(403).json({ error: 'Forbidden: Enterprise membership required' });
    return;
  }

  next();
};

/**
 * Middleware factory for custom role requirements
 */
export const requireRoles = (allowedRoles: EnterpriseRole[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.enterpriseContext) {
      res.status(500).json({ error: 'Enterprise context not attached' });
      return;
    }

    if (!allowedRoles.includes(req.enterpriseContext.role)) {
      Logger.warn(`Access denied: User ${req.enterpriseContext.userId} role ${req.enterpriseContext.role} not in allowed roles: ${allowedRoles.join(', ')}`);
      res.status(403).json({ 
        error: `Forbidden: Required role(s): ${allowedRoles.join(' or ')}` 
      });
      return;
    }

    next();
  };
};

/**
 * Validate that a resource belongs to the user's enterprise
 * Useful for ensuring multi-tenant data isolation
 */
export const validateEnterpriseResource = (resourceEnterpriseId: string | null | undefined, userEnterpriseId: string): boolean => {
  if (!resourceEnterpriseId) return false;
  return resourceEnterpriseId === userEnterpriseId;
};

export default {
  attachEnterpriseContext,
  requireAdmin,
  requireOrganizer,
  requireAssignee,
  requireRoles,
  validateEnterpriseResource,
};
