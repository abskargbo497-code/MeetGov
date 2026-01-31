/**
 * Enterprise Controller
 * 
 * Handles enterprise onboarding, member management, and organization operations
 */

import { Request, Response } from 'express';
import { PrismaClient, EnterpriseRole } from '@prisma/client';
import { auth } from '../lib/auth';
import { fromNodeHeaders } from 'better-auth/node';
import { z } from 'zod';
import crypto from 'crypto';
import { sendEnterpriseInviteEmail } from '../services/email.service';

const prisma = new PrismaClient();

// Validation schemas
const memberSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  role: z.enum(['ADMIN', 'ORGANIZER', 'ASSIGNEE']),
});

const onboardSchema = z.object({
  organizationName: z.string().min(1, 'Organization name is required').max(100),
  organizationDomain: z.string().optional(),
  logoUrl: z.string().url().optional(),
  members: z.array(memberSchema).min(0).max(20),
});

export const onboardEnterprise = async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userId = session.user.id;
    const userEmail = session.user.email;

    // Check if user already has an enterprise
    const existingMembership = await prisma.enterpriseMembership.findFirst({
      where: { userId },
    });

    if (existingMembership) {
      return res.status(400).json({ error: 'User already belongs to an organization' });
    }

    // Validate request body
    const validation = onboardSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.error.issues 
      });
    }

    const { organizationName, organizationDomain, logoUrl, members } = validation.data;

    // Check for duplicate emails in members list
    const memberEmails = members.map(m => m.email.toLowerCase());
    const uniqueEmails = new Set(memberEmails);
    if (memberEmails.length !== uniqueEmails.size) {
      return res.status(400).json({ error: 'Duplicate email addresses in member list' });
    }

    // Check if creator's email is in members list (shouldn't be)
    if (memberEmails.includes(userEmail.toLowerCase())) {
      return res.status(400).json({ error: 'You cannot add yourself as a member' });
    }

    // Check domain uniqueness if provided
    if (organizationDomain) {
      const existingDomain = await prisma.enterprise.findUnique({
        where: { domain: organizationDomain },
      });
      if (existingDomain) {
        return res.status(400).json({ error: 'Organization domain already exists' });
      }
    }

    // Check if any member emails are already in use by other enterprises
    const existingInvites = await prisma.enterpriseInvite.findMany({
      where: {
        email: { in: memberEmails },
        status: 'PENDING',
      },
    });

    if (existingInvites.length > 0) {
      const conflictEmails = existingInvites.map(i => i.email);
      return res.status(400).json({ 
        error: 'Some members already have pending invites',
        conflictEmails 
      });
    }

    // Transaction: Create enterprise, membership, and invites
    const result = await prisma.$transaction(async (tx) => {
      // Create enterprise
      const enterprise = await tx.enterprise.create({
        data: {
          name: organizationName,
          domain: organizationDomain || null,
        },
      });

      // Create creator's membership as ADMIN
      await tx.enterpriseMembership.create({
        data: {
          userId,
          enterpriseId: enterprise.id,
          role: 'ADMIN',
        },
      });

      // Create invites for members
      const invites = await Promise.all(
        members.map(async (member) => {
          const inviteToken = crypto.randomBytes(32).toString('hex');
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

          return tx.enterpriseInvite.create({
            data: {
              enterpriseId: enterprise.id,
              email: member.email.toLowerCase(),
              role: member.role as EnterpriseRole,
              inviteToken,
              expiresAt,
              createdByUserId: userId,
            },
          });
        })
      );

      return { enterprise, invites };
    });

    // Send invitation emails (non-blocking)
    const emailPromises = members.map((member, index) => {
      const invite = result.invites[index];
      return sendEnterpriseInviteEmail({
        to: member.email,
        inviteeName: member.name,
        organizationName,
        inviterName: session.user.name || 'An administrator',
        role: member.role,
        inviteToken: invite.inviteToken,
      }).catch((err: Error) => {
        console.error(`Failed to send invite to ${member.email}:`, err);
      });
    });

    // Don't await emails - let them send in background
    Promise.all(emailPromises);

    return res.status(201).json({
      success: true,
      enterprise: {
        id: result.enterprise.id,
        name: result.enterprise.name,
        domain: result.enterprise.domain,
      },
      invitesSent: members.length,
      members: members.map((m, i) => ({
        email: m.email,
        name: m.name,
        role: m.role,
        inviteId: result.invites[i].id,
        status: 'PENDING',
      })),
    });
  } catch (error) {
    console.error('Error onboarding enterprise:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getEnterpriseMembers = async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userId = session.user.id;

    // Get user's enterprise membership
    const membership = await prisma.enterpriseMembership.findFirst({
      where: { userId },
      include: { enterprise: true },
    });

    if (!membership) {
      return res.status(404).json({ error: 'Not a member of any organization' });
    }

    // Only ADMIN and ORGANIZER can view members
    if (!['ADMIN', 'ORGANIZER'].includes(membership.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const enterpriseId = membership.enterpriseId;

    // Get all members
    const members = await prisma.enterpriseMembership.findMany({
      where: { enterpriseId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    // Get pending invites
    const invites = await prisma.enterpriseInvite.findMany({
      where: {
        enterpriseId,
        status: 'PENDING',
      },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    // Mask emails for non-admin users
    const maskEmail = (email: string) => {
      if (membership.role === 'ADMIN') return email;
      const [local, domain] = email.split('@');
      const maskedLocal = local.slice(0, 2) + '***';
      return `${maskedLocal}@${domain}`;
    };

    return res.status(200).json({
      enterprise: {
        id: membership.enterprise.id,
        name: membership.enterprise.name,
        domain: membership.enterprise.domain,
      },
      members: members.map(m => ({
        id: m.id,
        userId: m.user.id,
        name: m.user.name,
        email: maskEmail(m.user.email),
        image: m.user.image,
        role: m.role,
        status: 'ACCEPTED',
        joinedAt: m.createdAt,
      })),
      pendingInvites: invites.map(i => ({
        id: i.id,
        email: maskEmail(i.email),
        role: i.role,
        status: i.status,
        createdAt: i.createdAt,
        expiresAt: i.expiresAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching enterprise members:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const acceptInvite = async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;

    if (!token) {
      return res.status(400).json({ error: 'Invite token is required' });
    }

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userId = session.user.id;
    const userEmail = session.user.email.toLowerCase();

    // Find the invite
    const invite = await prisma.enterpriseInvite.findUnique({
      where: { inviteToken: token },
      include: { enterprise: true },
    });

    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    if (invite.status !== 'PENDING') {
      return res.status(400).json({ error: 'Invite is no longer valid' });
    }

    if (invite.expiresAt < new Date()) {
      await prisma.enterpriseInvite.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' },
      });
      return res.status(400).json({ error: 'Invite has expired' });
    }

    if (invite.email.toLowerCase() !== userEmail) {
      return res.status(403).json({ error: 'This invite is for a different email address' });
    }

    // Check if already a member
    const existingMembership = await prisma.enterpriseMembership.findFirst({
      where: {
        userId,
        enterpriseId: invite.enterpriseId,
      },
    });

    if (existingMembership) {
      return res.status(400).json({ error: 'Already a member of this organization' });
    }

    // Accept invite and create membership
    await prisma.$transaction([
      prisma.enterpriseInvite.update({
        where: { id: invite.id },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          acceptedByUserId: userId,
        },
      }),
      prisma.enterpriseMembership.create({
        data: {
          userId,
          enterpriseId: invite.enterpriseId,
          role: invite.role,
        },
      }),
    ]);

    return res.status(200).json({
      success: true,
      enterprise: {
        id: invite.enterprise.id,
        name: invite.enterprise.name,
      },
      role: invite.role,
    });
  } catch (error) {
    console.error('Error accepting invite:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const resendInvite = async (req: Request, res: Response) => {
  try {
    const inviteId = req.params.inviteId as string;

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get user's enterprise membership
    const membership = await prisma.enterpriseMembership.findFirst({
      where: { userId: session.user.id },
      include: { enterprise: true },
    });

    if (!membership || !['ADMIN', 'ORGANIZER'].includes(membership.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Find the invite
    const invite = await prisma.enterpriseInvite.findUnique({
      where: { id: inviteId },
      include: { enterprise: true },
    });

    if (!invite || invite.enterpriseId !== membership.enterpriseId) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    if (invite.status !== 'PENDING') {
      return res.status(400).json({ error: 'Invite is no longer pending' });
    }

    // Generate new token and extend expiry
    const newToken = crypto.randomBytes(32).toString('hex');
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.enterpriseInvite.update({
      where: { id: inviteId },
      data: {
        inviteToken: newToken,
        expiresAt: newExpiresAt,
      },
    });

    // Resend email
    await sendEnterpriseInviteEmail({
      to: invite.email,
      inviteeName: '', // We don't store name separately
      organizationName: membership.enterprise.name,
      inviterName: session.user.name || 'An administrator',
      role: invite.role,
      inviteToken: newToken,
    });

    return res.status(200).json({ success: true, message: 'Invite resent successfully' });
  } catch (error) {
    console.error('Error resending invite:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Invite a new member to the enterprise
const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['ORGANIZER', 'ASSIGNEE']),
  name: z.string().optional(),
});

export const inviteMember = async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Validate request body
    const validation = inviteMemberSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.error.issues 
      });
    }

    const { email, role, name } = validation.data;
    const normalizedEmail = email.toLowerCase();

    // Get user's enterprise membership
    const membership = await prisma.enterpriseMembership.findFirst({
      where: { userId: session.user.id },
      include: { enterprise: true },
    });

    if (!membership || !['ADMIN', 'ORGANIZER'].includes(membership.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Only admins can invite organizers
    if (role === 'ORGANIZER' && membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can invite organizers' });
    }

    const enterpriseId = membership.enterpriseId;

    // Check if email is the current user
    if (normalizedEmail === session.user.email.toLowerCase()) {
      return res.status(400).json({ error: 'Cannot invite yourself' });
    }

    // Check if already a member
    const existingMember = await prisma.enterpriseMembership.findFirst({
      where: {
        enterpriseId,
        user: { email: normalizedEmail },
      },
    });

    if (existingMember) {
      return res.status(400).json({ error: 'User is already a member' });
    }

    // Check for existing pending invite
    const existingInvite = await prisma.enterpriseInvite.findFirst({
      where: {
        enterpriseId,
        email: normalizedEmail,
        status: 'PENDING',
      },
    });

    if (existingInvite) {
      return res.status(400).json({ error: 'An invite is already pending for this email' });
    }

    // Create invite
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await prisma.enterpriseInvite.create({
      data: {
        enterpriseId,
        email: normalizedEmail,
        role: role as EnterpriseRole,
        inviteToken,
        expiresAt,
        createdByUserId: session.user.id,
      },
    });

    // Send email
    await sendEnterpriseInviteEmail({
      to: normalizedEmail,
      inviteeName: name || '',
      organizationName: membership.enterprise.name,
      inviterName: session.user.name || 'An administrator',
      role,
      inviteToken,
    });

    return res.status(201).json({
      success: true,
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expiresAt,
      },
    });
  } catch (error) {
    console.error('Error inviting member:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Update a member's role
const updateRoleSchema = z.object({
  role: z.enum(['ORGANIZER', 'ASSIGNEE']),
});

export const updateMemberRole = async (req: Request, res: Response) => {
  try {
    const memberId = req.params.memberId as string;

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Validate request body
    const validation = updateRoleSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.error.issues 
      });
    }

    const { role } = validation.data;

    // Get user's enterprise membership
    const adminMembership = await prisma.enterpriseMembership.findFirst({
      where: { userId: session.user.id },
    });

    if (!adminMembership || adminMembership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can change member roles' });
    }

    // Find the target member
    const targetMembership = await prisma.enterpriseMembership.findUnique({
      where: { id: memberId },
    });

    if (!targetMembership || targetMembership.enterpriseId !== adminMembership.enterpriseId) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Cannot change own role
    if (targetMembership.userId === session.user.id) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    // Cannot demote another admin (must have at least one admin)
    if (targetMembership.role === 'ADMIN') {
      const adminCount = await prisma.enterpriseMembership.count({
        where: {
          enterpriseId: adminMembership.enterpriseId,
          role: 'ADMIN',
        },
      });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot demote the only admin' });
      }
    }

    // Update role
    const updated = await prisma.enterpriseMembership.update({
      where: { id: memberId },
      data: { role: role as EnterpriseRole },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return res.status(200).json({
      success: true,
      member: {
        id: updated.id,
        userId: updated.user.id,
        name: updated.user.name,
        email: updated.user.email,
        role: updated.role,
      },
    });
  } catch (error) {
    console.error('Error updating member role:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Remove a member from the enterprise
export const removeMember = async (req: Request, res: Response) => {
  try {
    const memberId = req.params.memberId as string;

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get user's enterprise membership
    const adminMembership = await prisma.enterpriseMembership.findFirst({
      where: { userId: session.user.id },
    });

    if (!adminMembership || adminMembership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can remove members' });
    }

    // Find the target member
    const targetMembership = await prisma.enterpriseMembership.findUnique({
      where: { id: memberId },
    });

    if (!targetMembership || targetMembership.enterpriseId !== adminMembership.enterpriseId) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Cannot remove yourself
    if (targetMembership.userId === session.user.id) {
      return res.status(400).json({ error: 'Cannot remove yourself from the organization' });
    }

    // Cannot remove another admin if you're the only other admin
    if (targetMembership.role === 'ADMIN') {
      const adminCount = await prisma.enterpriseMembership.count({
        where: {
          enterpriseId: adminMembership.enterpriseId,
          role: 'ADMIN',
        },
      });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot remove the only admin' });
      }
    }

    // Remove membership
    await prisma.enterpriseMembership.delete({
      where: { id: memberId },
    });

    return res.status(200).json({ success: true, message: 'Member removed successfully' });
  } catch (error) {
    console.error('Error removing member:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Cancel a pending invite
export const cancelInvite = async (req: Request, res: Response) => {
  try {
    const inviteId = req.params.inviteId as string;

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get user's enterprise membership
    const membership = await prisma.enterpriseMembership.findFirst({
      where: { userId: session.user.id },
    });

    if (!membership || !['ADMIN', 'ORGANIZER'].includes(membership.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Find the invite
    const invite = await prisma.enterpriseInvite.findUnique({
      where: { id: inviteId },
    });

    if (!invite || invite.enterpriseId !== membership.enterpriseId) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    if (invite.status !== 'PENDING') {
      return res.status(400).json({ error: 'Invite is no longer pending' });
    }

    // Revoke invite
    await prisma.enterpriseInvite.update({
      where: { id: inviteId },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedByUserId: session.user.id,
      },
    });

    return res.status(200).json({ success: true, message: 'Invite cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling invite:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Get organization settings
export const getOrganizationSettings = async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get user's enterprise membership
    const membership = await prisma.enterpriseMembership.findFirst({
      where: { userId: session.user.id },
      include: { enterprise: true },
    });

    if (!membership) {
      return res.status(404).json({ error: 'Not a member of any organization' });
    }

    // Only admins can view full settings
    if (membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can view organization settings' });
    }

    const enterprise = membership.enterprise;

    // Get member counts
    const memberCounts = await prisma.enterpriseMembership.groupBy({
      by: ['role'],
      where: { enterpriseId: enterprise.id },
      _count: true,
    });

    const counts = {
      admins: 0,
      organizers: 0,
      participants: 0,
    };
    memberCounts.forEach(c => {
      if (c.role === 'ADMIN') counts.admins = c._count;
      else if (c.role === 'ORGANIZER') counts.organizers = c._count;
      else counts.participants = c._count;
    });

    return res.status(200).json({
      id: enterprise.id,
      name: enterprise.name,
      domain: enterprise.domain,
      createdAt: enterprise.createdAt,
      updatedAt: enterprise.updatedAt,
      memberCounts: counts,
    });
  } catch (error) {
    console.error('Error getting organization settings:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Update organization settings
const updateSettingsSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  domain: z.string().max(100).optional().nullable(),
});

export const updateOrganizationSettings = async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Validate request body
    const validation = updateSettingsSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.error.issues 
      });
    }

    const { name, domain } = validation.data;

    // Get user's enterprise membership
    const membership = await prisma.enterpriseMembership.findFirst({
      where: { userId: session.user.id },
      include: { enterprise: true },
    });

    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can update organization settings' });
    }

    const enterpriseId = membership.enterpriseId;

    // Check domain uniqueness if changing
    if (domain !== undefined && domain !== membership.enterprise.domain) {
      if (domain) {
        const existingDomain = await prisma.enterprise.findFirst({
          where: {
            domain,
            id: { not: enterpriseId },
          },
        });
        if (existingDomain) {
          return res.status(400).json({ error: 'Domain already in use by another organization' });
        }
      }
    }

    // Update enterprise
    const updated = await prisma.enterprise.update({
      where: { id: enterpriseId },
      data: {
        ...(name !== undefined && { name }),
        ...(domain !== undefined && { domain }),
      },
    });

    return res.status(200).json({
      success: true,
      organization: {
        id: updated.id,
        name: updated.name,
        domain: updated.domain,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error updating organization settings:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete organization (admin only, dangerous!)
export const deleteOrganization = async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get user's enterprise membership
    const membership = await prisma.enterpriseMembership.findFirst({
      where: { userId: session.user.id },
    });

    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can delete the organization' });
    }

    const enterpriseId = membership.enterpriseId;

    // Delete enterprise (cascades to memberships, invites, meetings, tasks)
    await prisma.enterprise.delete({
      where: { id: enterpriseId },
    });

    return res.status(200).json({ success: true, message: 'Organization deleted successfully' });
  } catch (error) {
    console.error('Error deleting organization:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// =============================================================================
// ENTERPRISE MEETING MANAGEMENT (for ORGANIZER role)
// =============================================================================

import * as enterpriseMeetingService from '../services/enterprise-meeting.service';

/**
 * Create a new meeting for enterprise organizer
 * POST /api/enterprise/meetings
 */
export const createEnterpriseMeeting = async (req: Request, res: Response) => {
  try {
    if (!req.enterpriseContext) {
      return res.status(401).json({ error: 'Enterprise context required' });
    }

    const { enterpriseId, userId, role } = req.enterpriseContext;

    // Only ORGANIZER can create meetings (ADMIN has read-only access)
    if (role === 'ADMIN') {
      return res.status(403).json({ error: 'Admin users have read-only access. Only organizers can create meetings.' });
    }

    if (role !== 'ORGANIZER') {
      return res.status(403).json({ error: 'Only organizers can create meetings' });
    }

    const { title, meetingType, scheduledAt, durationMinutes, participants, location } = req.body;

    // Validate required fields
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    if (!meetingType || !['INSTANT', 'SCHEDULED'].includes(meetingType)) {
      return res.status(400).json({ error: 'Invalid meetingType. Must be INSTANT or SCHEDULED' });
    }

    if (!durationMinutes || durationMinutes < 5) {
      return res.status(400).json({ error: 'Duration must be at least 5 minutes' });
    }

    if (durationMinutes > 180) {
      return res.status(400).json({ error: 'Duration cannot exceed 180 minutes' });
    }

    if (meetingType === 'SCHEDULED' && !scheduledAt) {
      return res.status(400).json({ error: 'Scheduled meetings require a scheduledAt date' });
    }

    const result = await enterpriseMeetingService.createMeeting(userId, enterpriseId, {
      title,
      meetingType,
      scheduledAt,
      durationMinutes,
      participants,
      location,
    });

    return res.status(201).json({
      success: true,
      meeting: result.meeting,
      inviteResults: result.inviteResults,
    });
  } catch (error) {
    console.error('Error creating enterprise meeting:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * List enterprise meetings
 * GET /api/enterprise/meetings
 */
export const listEnterpriseMeetings = async (req: Request, res: Response) => {
  try {
    if (!req.enterpriseContext) {
      return res.status(401).json({ error: 'Enterprise context required' });
    }

    const { enterpriseId, userId, role } = req.enterpriseContext;

    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 10, 50);
    const status = req.query.status as string;
    const search = req.query.search as string;

    const result = await enterpriseMeetingService.listMeetings(
      userId,
      enterpriseId,
      role,
      page,
      pageSize,
      { status, search }
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error listing enterprise meetings:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get enterprise meeting by ID
 * GET /api/enterprise/meetings/:meetingId
 */
export const getEnterpriseMeeting = async (req: Request, res: Response) => {
  try {
    if (!req.enterpriseContext) {
      return res.status(401).json({ error: 'Enterprise context required' });
    }

    const { enterpriseId, userId, role } = req.enterpriseContext;
    const meetingId = req.params.meetingId as string;

    const meeting = await enterpriseMeetingService.getMeetingById(
      meetingId,
      userId,
      enterpriseId,
      role
    );

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    return res.status(200).json(meeting);
  } catch (error: any) {
    if (error.message === 'ACCESS_DENIED') {
      return res.status(403).json({ error: 'Access denied' });
    }
    console.error('Error getting enterprise meeting:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Update enterprise meeting
 * PUT /api/enterprise/meetings/:meetingId
 */
export const updateEnterpriseMeeting = async (req: Request, res: Response) => {
  try {
    if (!req.enterpriseContext) {
      return res.status(401).json({ error: 'Enterprise context required' });
    }

    const { enterpriseId, userId, role } = req.enterpriseContext;
    const meetingId = req.params.meetingId as string;

    const meeting = await enterpriseMeetingService.updateMeeting(
      meetingId,
      userId,
      enterpriseId,
      role,
      req.body
    );

    return res.status(200).json({
      success: true,
      meeting,
    });
  } catch (error: any) {
    if (error.message === 'MEETING_NOT_FOUND') {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    if (error.message === 'ACCESS_DENIED') {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (error.message === 'READ_ONLY_ACCESS') {
      return res.status(403).json({ error: 'Admin users have read-only access' });
    }
    if (error.message === 'MEETING_LOCKED') {
      return res.status(400).json({ error: 'Cannot update a completed or cancelled meeting' });
    }
    console.error('Error updating enterprise meeting:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Delete enterprise meeting
 * DELETE /api/enterprise/meetings/:meetingId
 */
export const deleteEnterpriseMeeting = async (req: Request, res: Response) => {
  try {
    if (!req.enterpriseContext) {
      return res.status(401).json({ error: 'Enterprise context required' });
    }

    const { enterpriseId, userId, role } = req.enterpriseContext;
    const meetingId = req.params.meetingId as string;

    await enterpriseMeetingService.deleteMeeting(
      meetingId,
      userId,
      enterpriseId,
      role
    );

    return res.status(200).json({
      success: true,
      message: 'Meeting deleted successfully',
    });
  } catch (error: any) {
    if (error.message === 'MEETING_NOT_FOUND') {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    if (error.message === 'ACCESS_DENIED') {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (error.message === 'READ_ONLY_ACCESS') {
      return res.status(403).json({ error: 'Admin users have read-only access' });
    }
    console.error('Error deleting enterprise meeting:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get enterprise meeting stats
 * GET /api/enterprise/meetings/stats
 */
export const getEnterpriseMeetingStats = async (req: Request, res: Response) => {
  try {
    if (!req.enterpriseContext) {
      return res.status(401).json({ error: 'Enterprise context required' });
    }

    const { enterpriseId } = req.enterpriseContext;

    const stats = await enterpriseMeetingService.getMeetingStats(enterpriseId);

    return res.status(200).json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Error getting enterprise meeting stats:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
