/**
 * Enterprise Analytics Controller
 * 
 * Handles analytics and dashboard data endpoints for enterprise users
 * All endpoints enforce multi-tenant scoping via enterpriseId
 */

import { Request, Response } from 'express';
import { EnterpriseRole } from '@prisma/client';
import Logger from '../logger';
import {
  getOrganizationStats,
  getMeetingStatsByPeriod,
  getTaskStatsByStatus,
  getMemberActivity,
  getRecentActivity
} from '../services/enterprise-analytics.service';
import {
  getUserDashboardData,
  getParticipantDashboardData
} from '../services/dashboard.service';

/**
 * GET /api/enterprise/analytics/summary
 * Returns organization-wide statistics
 * Requires ADMIN or ORGANIZER role
 */
export const getAnalyticsSummary = async (req: Request, res: Response) => {
  try {
    if (!req.enterpriseContext) {
      return res.status(401).json({ error: 'Enterprise context required' });
    }

    const { enterpriseId, userId, role } = req.enterpriseContext;

    Logger.info(`[Analytics] User ${userId} requesting analytics summary for enterprise ${enterpriseId}`);

    const stats = await getOrganizationStats(enterpriseId);

    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    Logger.error('Error fetching analytics summary:', error);
    return res.status(500).json({ error: 'Failed to fetch analytics summary' });
  }
};

/**
 * GET /api/enterprise/analytics/meetings
 * Returns meeting statistics by period (week or month)
 * Requires ADMIN or ORGANIZER role
 */
export const getAnalyticsMeetings = async (req: Request, res: Response) => {
  try {
    if (!req.enterpriseContext) {
      return res.status(401).json({ error: 'Enterprise context required' });
    }

    const { enterpriseId, userId } = req.enterpriseContext;
    const period = (req.query.period as 'week' | 'month') || 'week';

    if (!['week', 'month'].includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be "week" or "month"' });
    }

    Logger.info(`[Analytics] User ${userId} requesting meeting stats (${period}) for enterprise ${enterpriseId}`);

    const stats = await getMeetingStatsByPeriod(enterpriseId, period);

    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    Logger.error('Error fetching meeting analytics:', error);
    return res.status(500).json({ error: 'Failed to fetch meeting analytics' });
  }
};

/**
 * GET /api/enterprise/analytics/tasks
 * Returns task statistics by status
 * Requires ADMIN or ORGANIZER role
 */
export const getAnalyticsTasks = async (req: Request, res: Response) => {
  try {
    if (!req.enterpriseContext) {
      return res.status(401).json({ error: 'Enterprise context required' });
    }

    const { enterpriseId, userId } = req.enterpriseContext;

    Logger.info(`[Analytics] User ${userId} requesting task stats for enterprise ${enterpriseId}`);

    const stats = await getTaskStatsByStatus(enterpriseId);

    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    Logger.error('Error fetching task analytics:', error);
    return res.status(500).json({ error: 'Failed to fetch task analytics' });
  }
};

/**
 * GET /api/enterprise/analytics/members
 * Returns member activity statistics
 * Requires ADMIN role
 */
export const getAnalyticsMembers = async (req: Request, res: Response) => {
  try {
    if (!req.enterpriseContext) {
      return res.status(401).json({ error: 'Enterprise context required' });
    }

    const { enterpriseId, userId } = req.enterpriseContext;
    const limit = parseInt(req.query.limit as string) || 10;

    Logger.info(`[Analytics] User ${userId} requesting member activity for enterprise ${enterpriseId}`);

    const members = await getMemberActivity(enterpriseId, Math.min(limit, 50));

    return res.status(200).json({
      success: true,
      data: members
    });
  } catch (error) {
    Logger.error('Error fetching member analytics:', error);
    return res.status(500).json({ error: 'Failed to fetch member analytics' });
  }
};

/**
 * GET /api/enterprise/analytics/activity
 * Returns recent activity feed
 * Available to all enterprise members
 */
export const getAnalyticsActivity = async (req: Request, res: Response) => {
  try {
    if (!req.enterpriseContext) {
      return res.status(401).json({ error: 'Enterprise context required' });
    }

    const { enterpriseId, userId } = req.enterpriseContext;
    const limit = parseInt(req.query.limit as string) || 20;

    Logger.info(`[Analytics] User ${userId} requesting activity feed for enterprise ${enterpriseId}`);

    const activity = await getRecentActivity(enterpriseId, Math.min(limit, 50));

    return res.status(200).json({
      success: true,
      data: activity
    });
  } catch (error) {
    Logger.error('Error fetching activity feed:', error);
    return res.status(500).json({ error: 'Failed to fetch activity feed' });
  }
};

/**
 * GET /api/enterprise/dashboard
 * Returns dashboard data for the authenticated user
 * Data is scoped based on user role
 */
export const getDashboard = async (req: Request, res: Response) => {
  try {
    if (!req.enterpriseContext) {
      return res.status(401).json({ error: 'Enterprise context required' });
    }

    const { enterpriseId, userId, role } = req.enterpriseContext;

    Logger.info(`[Dashboard] User ${userId} (${role}) requesting dashboard data for enterprise ${enterpriseId}`);

    // Use participant-specific dashboard for ASSIGNEE role
    if (role === EnterpriseRole.ASSIGNEE) {
      const dashboardData = await getParticipantDashboardData(userId, enterpriseId);
      return res.status(200).json({
        success: true,
        role,
        data: dashboardData
      });
    }

    // Full dashboard for ADMIN and ORGANIZER
    const dashboardData = await getUserDashboardData(userId, enterpriseId, role);

    return res.status(200).json({
      success: true,
      role,
      data: dashboardData
    });
  } catch (error) {
    Logger.error('Error fetching dashboard data:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
};

/**
 * GET /api/enterprise/dashboard/participant
 * Returns participant-specific dashboard data
 * Only shows assigned tasks and meetings the user is invited to
 */
export const getParticipantDashboard = async (req: Request, res: Response) => {
  try {
    if (!req.enterpriseContext) {
      return res.status(401).json({ error: 'Enterprise context required' });
    }

    const { enterpriseId, userId, role } = req.enterpriseContext;

    Logger.info(`[Dashboard] User ${userId} requesting participant dashboard for enterprise ${enterpriseId}`);

    const dashboardData = await getParticipantDashboardData(userId, enterpriseId);

    return res.status(200).json({
      success: true,
      role,
      data: dashboardData
    });
  } catch (error) {
    Logger.error('Error fetching participant dashboard:', error);
    return res.status(500).json({ error: 'Failed to fetch participant dashboard' });
  }
};

export default {
  getAnalyticsSummary,
  getAnalyticsMeetings,
  getAnalyticsTasks,
  getAnalyticsMembers,
  getAnalyticsActivity,
  getDashboard,
  getParticipantDashboard
};
