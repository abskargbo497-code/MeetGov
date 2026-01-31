/**
 * User Controller
 * 
 * Handles user-related operations including fetching current user info
 */

import { Request, Response } from 'express';
import Logger from '../logger';
import { prisma } from '../lib/prisma';
import { auth } from '../lib/auth';
import { fromNodeHeaders } from 'better-auth/node';

export const getCurrentUser = async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userId = session.user.id;

    // Fetch user with enterprise memberships
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        enterpriseMemberships: {
          include: {
            enterprise: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Determine user type and role
    const membership = user.enterpriseMemberships[0]; // Primary enterprise membership
    const isEnterprise = !!membership;
    const isFirstTimeEnterprise = isEnterprise && user.enterpriseMemberships.length === 1 && 
      !membership.enterprise; // Edge case - should not happen

    // Check if user needs onboarding (enterprise user with no organization created yet)
    // This is determined by checking if they have an ADMIN role membership
    const needsOnboarding = !isEnterprise; // Will be set during enterprise signup flow

    const response = {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      userType: isEnterprise ? 'enterprise' : 'personal',
      enterprise: membership ? {
        id: membership.enterprise.id,
        name: membership.enterprise.name,
        domain: membership.enterprise.domain,
        role: membership.role,
      } : null,
      needsOnboarding: false, // Will be managed via query param in redirect
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching current user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const checkEnterpriseOnboardingStatus = async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userId = session.user.id;

    // Check if user has any enterprise membership
    const membership = await prisma.enterpriseMembership.findFirst({
      where: { userId },
      include: { enterprise: true },
    });

    // Check for pending invites
    const pendingInvite = await prisma.enterpriseInvite.findFirst({
      where: {
        email: session.user.email,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      include: { enterprise: true },
    });

    return res.status(200).json({
      hasEnterprise: !!membership,
      enterprise: membership ? {
        id: membership.enterprise.id,
        name: membership.enterprise.name,
        role: membership.role,
      } : null,
      pendingInvite: pendingInvite ? {
        id: pendingInvite.id,
        enterpriseName: pendingInvite.enterprise.name,
        role: pendingInvite.role,
      } : null,
    });
  } catch (error) {
    console.error('Error checking onboarding status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
