/**
 * Dashboard Service
 * 
 * Provides dashboard data for users with multi-tenant scoping
 * Returns upcoming meetings, assigned tasks, and recent activity
 */

import { PrismaClient, TaskStatus, MeetingStatus, EnterpriseRole } from '@prisma/client';
import Logger from '../logger';

const prisma = new PrismaClient();

// Types
export interface UpcomingMeeting {
  id: string;
  title: string;
  description: string | null;
  scheduledStart: Date | null;
  status: MeetingStatus;
  isOwner: boolean;
  attendeeCount: number;
}

export interface AssignedTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: string | null;
  dueDate: Date | null;
  meetingId: string;
  meetingTitle: string;
  isOverdue: boolean;
  assignedByName: string | null;
}

export interface RecentActivityItem {
  id: string;
  type: 'meeting_created' | 'meeting_started' | 'meeting_ended' | 'task_assigned' | 'task_completed' | 'task_submitted' | 'member_joined';
  title: string;
  description: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

export interface DashboardData {
  upcomingMeetings: UpcomingMeeting[];
  assignedTasks: AssignedTask[];
  recentActivity: RecentActivityItem[];
  stats: {
    totalMeetings: number;
    totalTasks: number;
    pendingTasks: number;
    completedTasksThisWeek: number;
  };
}

export interface ParticipantDashboardData {
  assignedTasks: AssignedTask[];
  upcomingMeetings: UpcomingMeeting[];
  recentActivity: RecentActivityItem[];
}

/**
 * Get dashboard data for an enterprise user
 * All queries filtered by enterpriseId for multi-tenant safety
 */
export async function getUserDashboardData(
  userId: string,
  enterpriseId: string,
  role: EnterpriseRole
): Promise<DashboardData> {
  try {
    Logger.info(`[Dashboard] Fetching dashboard data for user ${userId} in enterprise ${enterpriseId}`);

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Build base where clause for meetings based on role
    const meetingWhereClause: any = {
      enterpriseId,
      scheduledStart: { gte: now },
      status: { in: [MeetingStatus.WAITING, MeetingStatus.SCHEDULED] }
    };

    // ASSIGNEE can only see meetings they're invited to or attending
    if (role === EnterpriseRole.ASSIGNEE) {
      meetingWhereClause.OR = [
        { ownerId: userId },
        { attendances: { some: { ownerId: userId } } }
      ];
    }

    // Build task where clause based on role
    const taskWhereClause: any = {
      enterpriseId,
      status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS, TaskStatus.SUBMITTED] }
    };

    // ASSIGNEE can only see their assigned tasks
    if (role === EnterpriseRole.ASSIGNEE) {
      taskWhereClause.assignedToUserId = userId;
    } else {
      // ADMIN/ORGANIZER can see all tasks but prioritize their own
      taskWhereClause.OR = [
        { assignedToUserId: userId },
        { createdByUserId: userId }
      ];
    }

    // Execute queries in parallel
    const [
      upcomingMeetingsRaw,
      assignedTasksRaw,
      totalMeetings,
      totalTasks,
      pendingTasks,
      completedTasksThisWeek
    ] = await Promise.all([
      // Upcoming meetings
      prisma.meeting.findMany({
        where: meetingWhereClause,
        orderBy: { scheduledStart: 'asc' },
        take: 10,
        select: {
          id: true,
          title: true,
          description: true,
          scheduledStart: true,
          status: true,
          ownerId: true,
          _count: { select: { attendances: true } }
        }
      }),

      // Assigned tasks
      prisma.task.findMany({
        where: taskWhereClause,
        orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
        take: 10,
        include: {
          meeting: { select: { id: true, title: true } }
        }
      }),

      // Stats: total meetings in enterprise
      prisma.meeting.count({
        where: role === EnterpriseRole.ASSIGNEE 
          ? { enterpriseId, OR: [{ ownerId: userId }, { attendances: { some: { ownerId: userId } } }] }
          : { enterpriseId }
      }),

      // Stats: total tasks
      prisma.task.count({
        where: role === EnterpriseRole.ASSIGNEE
          ? { enterpriseId, assignedToUserId: userId }
          : { enterpriseId, OR: [{ assignedToUserId: userId }, { createdByUserId: userId }] }
      }),

      // Stats: pending tasks
      prisma.task.count({
        where: role === EnterpriseRole.ASSIGNEE
          ? { enterpriseId, assignedToUserId: userId, status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] } }
          : { enterpriseId, status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] } }
      }),

      // Stats: completed tasks this week
      prisma.task.count({
        where: {
          enterpriseId,
          status: TaskStatus.COMPLETED,
          completedAt: { gte: weekAgo },
          ...(role === EnterpriseRole.ASSIGNEE ? { assignedToUserId: userId } : {})
        }
      })
    ]);

    // Get user info for task creators
    const creatorIds = assignedTasksRaw
      .map(t => t.createdByUserId)
      .filter((id): id is string => id !== null);
    
    const creators = creatorIds.length > 0 
      ? await prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, name: true }
        })
      : [];
    
    const creatorMap = new Map(creators.map(c => [c.id, c.name]));

    // Format upcoming meetings
    const upcomingMeetings: UpcomingMeeting[] = upcomingMeetingsRaw.map(m => ({
      id: m.id,
      title: m.title,
      description: m.description,
      scheduledStart: m.scheduledStart,
      status: m.status,
      isOwner: m.ownerId === userId,
      attendeeCount: m._count.attendances
    }));

    // Format assigned tasks
    const assignedTasks: AssignedTask[] = assignedTasksRaw.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      meetingId: t.meetingId,
      meetingTitle: t.meeting.title,
      isOverdue: t.dueDate ? t.dueDate < now : false,
      assignedByName: t.createdByUserId ? creatorMap.get(t.createdByUserId) || null : null
    }));

    // Build recent activity
    const recentActivity = await buildRecentActivity(enterpriseId, userId, role);

    const dashboardData: DashboardData = {
      upcomingMeetings,
      assignedTasks,
      recentActivity,
      stats: {
        totalMeetings,
        totalTasks,
        pendingTasks,
        completedTasksThisWeek
      }
    };

    Logger.info(`[Dashboard] Dashboard data retrieved for user ${userId}`);
    return dashboardData;
  } catch (error) {
    Logger.error(`[Dashboard] Error fetching dashboard data: ${error}`);
    throw error;
  }
}

/**
 * Get participant-specific dashboard data
 * Only shows tasks assigned to them and meetings they're invited to
 */
export async function getParticipantDashboardData(
  userId: string,
  enterpriseId: string
): Promise<ParticipantDashboardData> {
  try {
    Logger.info(`[Dashboard] Fetching participant dashboard for user ${userId}`);

    const now = new Date();

    const [assignedTasksRaw, upcomingMeetingsRaw] = await Promise.all([
      // Tasks assigned to the participant
      prisma.task.findMany({
        where: {
          enterpriseId,
          assignedToUserId: userId,
          status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS, TaskStatus.SUBMITTED] }
        },
        orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
        take: 20,
        include: {
          meeting: { select: { id: true, title: true } }
        }
      }),

      // Meetings the participant is invited to or attending
      prisma.meeting.findMany({
        where: {
          enterpriseId,
          scheduledStart: { gte: now },
          status: { in: [MeetingStatus.WAITING, MeetingStatus.SCHEDULED] },
          OR: [
            { attendances: { some: { ownerId: userId } } }
          ]
        },
        orderBy: { scheduledStart: 'asc' },
        take: 10,
        select: {
          id: true,
          title: true,
          description: true,
          scheduledStart: true,
          status: true,
          ownerId: true,
          _count: { select: { attendances: true } }
        }
      })
    ]);

    // Get creator info
    const creatorIds = assignedTasksRaw
      .map(t => t.createdByUserId)
      .filter((id): id is string => id !== null);
    
    const creators = creatorIds.length > 0 
      ? await prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, name: true }
        })
      : [];
    
    const creatorMap = new Map(creators.map(c => [c.id, c.name]));

    const assignedTasks: AssignedTask[] = assignedTasksRaw.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      meetingId: t.meetingId,
      meetingTitle: t.meeting.title,
      isOverdue: t.dueDate ? t.dueDate < now : false,
      assignedByName: t.createdByUserId ? creatorMap.get(t.createdByUserId) || null : null
    }));

    const upcomingMeetings: UpcomingMeeting[] = upcomingMeetingsRaw.map(m => ({
      id: m.id,
      title: m.title,
      description: m.description,
      scheduledStart: m.scheduledStart,
      status: m.status,
      isOwner: m.ownerId === userId,
      attendeeCount: m._count.attendances
    }));

    const recentActivity = await buildRecentActivity(enterpriseId, userId, EnterpriseRole.ASSIGNEE);

    return {
      assignedTasks,
      upcomingMeetings,
      recentActivity
    };
  } catch (error) {
    Logger.error(`[Dashboard] Error fetching participant dashboard: ${error}`);
    throw error;
  }
}

/**
 * Build recent activity feed
 */
async function buildRecentActivity(
  enterpriseId: string,
  userId: string,
  role: EnterpriseRole
): Promise<RecentActivityItem[]> {
  const activities: RecentActivityItem[] = [];
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  try {
    // Fetch recent meetings
    const meetingWhereClause: any = {
      enterpriseId,
      updatedAt: { gte: threeDaysAgo }
    };

    if (role === EnterpriseRole.ASSIGNEE) {
      meetingWhereClause.OR = [
        { ownerId: userId },
        { attendances: { some: { ownerId: userId } } }
      ];
    }

    const recentMeetings = await prisma.meeting.findMany({
      where: meetingWhereClause,
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        actualStart: true,
        actualEnd: true
      }
    });

    recentMeetings.forEach(meeting => {
      if (meeting.status === MeetingStatus.LIVE && meeting.actualStart) {
        activities.push({
          id: `meeting-started-${meeting.id}`,
          type: 'meeting_started',
          title: 'Meeting Started',
          description: `"${meeting.title}" is now live`,
          timestamp: meeting.actualStart,
          metadata: { meetingId: meeting.id }
        });
      } else if ((meeting.status === MeetingStatus.ENDED || meeting.status === MeetingStatus.COMPLETED) && meeting.actualEnd) {
        activities.push({
          id: `meeting-ended-${meeting.id}`,
          type: 'meeting_ended',
          title: 'Meeting Ended',
          description: `"${meeting.title}" has ended`,
          timestamp: meeting.actualEnd,
          metadata: { meetingId: meeting.id }
        });
      } else if (meeting.createdAt >= threeDaysAgo) {
        activities.push({
          id: `meeting-created-${meeting.id}`,
          type: 'meeting_created',
          title: 'Meeting Created',
          description: `New meeting: "${meeting.title}"`,
          timestamp: meeting.createdAt,
          metadata: { meetingId: meeting.id }
        });
      }
    });

    // Fetch recent task updates
    const taskWhereClause: any = {
      enterpriseId,
      updatedAt: { gte: threeDaysAgo }
    };

    if (role === EnterpriseRole.ASSIGNEE) {
      taskWhereClause.assignedToUserId = userId;
    }

    const recentTasks = await prisma.task.findMany({
      where: taskWhereClause,
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
        assignedToUserId: true
      }
    });

    recentTasks.forEach(task => {
      if (task.status === TaskStatus.COMPLETED && task.completedAt) {
        activities.push({
          id: `task-completed-${task.id}`,
          type: 'task_completed',
          title: 'Task Completed',
          description: `"${task.title}" has been completed`,
          timestamp: task.completedAt,
          metadata: { taskId: task.id }
        });
      } else if (task.status === TaskStatus.SUBMITTED) {
        activities.push({
          id: `task-submitted-${task.id}`,
          type: 'task_submitted',
          title: 'Task Submitted',
          description: `Submission received for "${task.title}"`,
          timestamp: task.updatedAt,
          metadata: { taskId: task.id }
        });
      } else if (task.assignedToUserId === userId && task.createdAt >= threeDaysAgo) {
        activities.push({
          id: `task-assigned-${task.id}`,
          type: 'task_assigned',
          title: 'Task Assigned',
          description: `You have been assigned "${task.title}"`,
          timestamp: task.createdAt,
          metadata: { taskId: task.id }
        });
      }
    });

    // Sort by timestamp descending
    activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return activities.slice(0, 15);
  } catch (error) {
    Logger.error(`[Dashboard] Error building recent activity: ${error}`);
    return [];
  }
}

export default {
  getUserDashboardData,
  getParticipantDashboardData
};
