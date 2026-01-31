/**
 * Enterprise Routes
 * 
 * Handles enterprise onboarding, member management, analytics, and dashboard
 */

import { Router } from 'express';
import { 
  onboardEnterprise, 
  getEnterpriseMembers, 
  acceptInvite,
  resendInvite,
  inviteMember,
  updateMemberRole,
  removeMember,
  cancelInvite,
  getOrganizationSettings,
  updateOrganizationSettings,
  deleteOrganization,
  createEnterpriseMeeting,
  listEnterpriseMeetings,
  getEnterpriseMeeting,
  updateEnterpriseMeeting,
  deleteEnterpriseMeeting,
  getEnterpriseMeetingStats,
} from '../controllers/enterprise.controller';
import {
  getAnalyticsSummary,
  getAnalyticsMeetings,
  getAnalyticsTasks,
  getAnalyticsMembers,
  getAnalyticsActivity,
  getDashboard,
  getParticipantDashboard
} from '../controllers/enterprise-analytics.controller';
import {
  attachEnterpriseContext,
  requireAdmin,
  requireOrganizer,
  requireAssignee
} from '../middlewares/enterprise-role.middleware';

const router = Router();

// POST /api/enterprise/onboard - Create new enterprise and send invites
router.post('/onboard', onboardEnterprise);

// GET /api/enterprise/members - Get enterprise members (admin/organizer only)
router.get('/members', getEnterpriseMembers);

// POST /api/enterprise/members/invite - Invite a new member
router.post('/members/invite', inviteMember);

// PATCH /api/enterprise/members/:memberId/role - Update member role (admin only)
router.patch('/members/:memberId/role', updateMemberRole);

// DELETE /api/enterprise/members/:memberId - Remove member (admin only)
router.delete('/members/:memberId', removeMember);

// POST /api/enterprise/invites/:token/accept - Accept an enterprise invite
router.post('/invites/:token/accept', acceptInvite);

// POST /api/enterprise/invites/:inviteId/resend - Resend an invite
router.post('/invites/:inviteId/resend', resendInvite);

// DELETE /api/enterprise/invites/:inviteId - Cancel an invite
router.delete('/invites/:inviteId', cancelInvite);

// Organization settings routes (admin only)
router.get('/settings', getOrganizationSettings);
router.patch('/settings', updateOrganizationSettings);
router.delete('/organization', deleteOrganization);

// Analytics routes (require ADMIN or ORGANIZER role)
router.get('/analytics/summary', attachEnterpriseContext, requireOrganizer, getAnalyticsSummary);
router.get('/analytics/meetings', attachEnterpriseContext, requireOrganizer, getAnalyticsMeetings);
router.get('/analytics/tasks', attachEnterpriseContext, requireOrganizer, getAnalyticsTasks);
router.get('/analytics/members', attachEnterpriseContext, requireAdmin, getAnalyticsMembers);
router.get('/analytics/activity', attachEnterpriseContext, requireAssignee, getAnalyticsActivity);

// Dashboard routes (available to all enterprise members with role-based data scoping)
router.get('/dashboard', attachEnterpriseContext, requireAssignee, getDashboard);
router.get('/dashboard/participant', attachEnterpriseContext, requireAssignee, getParticipantDashboard);

// =============================================================================
// ENTERPRISE MEETING ROUTES (for ORGANIZER role - recording, transcription, artifacts)
// =============================================================================

// GET /api/enterprise/meetings/stats - Get meeting statistics (before :meetingId to avoid conflict)
router.get('/meetings/stats', attachEnterpriseContext, requireOrganizer, getEnterpriseMeetingStats);

// POST /api/enterprise/meetings - Create a new meeting
router.post('/meetings', attachEnterpriseContext, requireOrganizer, createEnterpriseMeeting);

// GET /api/enterprise/meetings - List all enterprise meetings
router.get('/meetings', attachEnterpriseContext, requireOrganizer, listEnterpriseMeetings);

// GET /api/enterprise/meetings/:meetingId - Get meeting details
router.get('/meetings/:meetingId', attachEnterpriseContext, requireOrganizer, getEnterpriseMeeting);

// PUT /api/enterprise/meetings/:meetingId - Update meeting
router.put('/meetings/:meetingId', attachEnterpriseContext, requireOrganizer, updateEnterpriseMeeting);

// DELETE /api/enterprise/meetings/:meetingId - Delete meeting
router.delete('/meetings/:meetingId', attachEnterpriseContext, requireOrganizer, deleteEnterpriseMeeting);

export default router;
