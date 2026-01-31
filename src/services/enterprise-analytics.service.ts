/**
 * Enterprise Analytics Service
 * 
 * Provides analytics and statistics for enterprise organizations
 * All queries are scoped by enterpriseId for multi-tenant safety
 */

import { TaskStatus, MeetingStatus } from '@prisma/client';
import Logger from '../logger';
import { prisma } from '../lib/prisma';

// Types
export interface OrganizationStats {
  totalMeetings: number;
  totalDurationMinutes: number;
  completedTasks: number;
  pendingTasks: number;
  totalTasks: number;
  totalMembers: number;
  activeMeetingsToday: number;
}

export interface MeetingTimeSeries {
  date: string;
  count: number;
  totalDurationMinutes: number;
}

export interface MeetingStatsByPeriod {
  period: 'week' | 'month';
  startDate: string;
  endDate: string;
  timeSeries: MeetingTimeSeries[];
  summary: {
    totalMeetings: number;
    avgMeetingsPerDay: number;
    totalDurationMinutes: number;
    avgDurationMinutes: number;
  };
}

export interface TaskStatsByStatus {
  pending: number;
  inProgress: number;
  submitted: number;
  completed: number;
  cancelled: number;
  overdue: number;
}

export interface MemberActivity {
  userId: string;
  userName: string | null;
  userEmail: string;
  role: string;
  meetingsOrganized: number;
  tasksCreated: number;
  tasksCompleted: number;
}

/**
 * Get organization-wide statistics
 * All queries filtered by enterpriseId for multi-tenant safety
 */
export async function getOrganizationStats(enterpriseId: string): Promise<OrganizationStats> {
  try {
    Logger.info(`[Analytics] Fetching organization stats for enterprise: ${enterpriseId}`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Execute all queries in parallel for performance
    const [
      meetingCount,
      meetingsWithDuration,
      taskCounts,
      memberCount,
      activeMeetingsToday
    ] = await Promise.all([
      // Total meetings count
      prisma.meeting.count({
        where: { enterpriseId }
      }),

      // Meetings with duration calculation
      prisma.meeting.findMany({
        where: { 
          enterpriseId,
          actualStart: { not: null },
          actualEnd: { not: null }
        },
        select: {
          actualStart: true,
          actualEnd: true
        }
      }),

      // Task counts by status
      prisma.task.groupBy({
        by: ['status'],
        where: { enterpriseId },
        _count: { id: true }
      }),

      // Total members
      prisma.enterpriseMembership.count({
        where: { enterpriseId }
      }),

      // Active meetings today
      prisma.meeting.count({
        where: {
          enterpriseId,
          OR: [
            { status: MeetingStatus.LIVE },
            { status: MeetingStatus.ACTIVE },
            {
              scheduledStart: {
                gte: today,
                lt: tomorrow
              }
            }
          ]
        }
      })
    ]);

    // Calculate total duration
    const totalDurationMinutes = meetingsWithDuration.reduce((total, meeting) => {
      if (meeting.actualStart && meeting.actualEnd) {
        const duration = (meeting.actualEnd.getTime() - meeting.actualStart.getTime()) / (1000 * 60);
        return total + Math.max(0, duration);
      }
      return total;
    }, 0);

    // Process task counts
    let completedTasks = 0;
    let pendingTasks = 0;
    let totalTasks = 0;

    taskCounts.forEach(item => {
      const count = item._count.id;
      totalTasks += count;
      
      if (item.status === TaskStatus.COMPLETED) {
        completedTasks += count;
      } else if (item.status === TaskStatus.PENDING || item.status === TaskStatus.IN_PROGRESS) {
        pendingTasks += count;
      }
    });

    const stats: OrganizationStats = {
      totalMeetings: meetingCount,
      totalDurationMinutes: Math.round(totalDurationMinutes),
      completedTasks,
      pendingTasks,
      totalTasks,
      totalMembers: memberCount,
      activeMeetingsToday
    };

    Logger.info(`[Analytics] Organization stats retrieved for enterprise ${enterpriseId}: ${JSON.stringify(stats)}`);
    return stats;
  } catch (error) {
    Logger.error(`[Analytics] Error fetching organization stats: ${error}`);
    throw error;
  }
}

/**
 * Get meeting statistics by time period (week or month)
 * Returns time series data for charts
 */
export async function getMeetingStatsByPeriod(
  enterpriseId: string, 
  period: 'week' | 'month'
): Promise<MeetingStatsByPeriod> {
  try {
    Logger.info(`[Analytics] Fetching meeting stats by ${period} for enterprise: ${enterpriseId}`);

    const now = new Date();
    const startDate = new Date();
    
    if (period === 'week') {
      startDate.setDate(now.getDate() - 7);
    } else {
      startDate.setDate(now.getDate() - 30);
    }
    startDate.setHours(0, 0, 0, 0);

    // Fetch meetings within the period
    const meetings = await prisma.meeting.findMany({
      where: {
        enterpriseId,
        createdAt: {
          gte: startDate,
          lte: now
        }
      },
      select: {
        id: true,
        createdAt: true,
        actualStart: true,
        actualEnd: true,
        scheduledStart: true
      }
    });

    // Build time series data
    const timeSeriesMap = new Map<string, MeetingTimeSeries>();
    
    // Initialize all dates in range
    const currentDate = new Date(startDate);
    while (currentDate <= now) {
      const dateKey = currentDate.toISOString().split('T')[0];
      timeSeriesMap.set(dateKey, {
        date: dateKey,
        count: 0,
        totalDurationMinutes: 0
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Populate with actual data
    let totalDurationMinutes = 0;
    meetings.forEach(meeting => {
      const meetingDate = (meeting.scheduledStart || meeting.createdAt).toISOString().split('T')[0];
      const entry = timeSeriesMap.get(meetingDate);
      
      if (entry) {
        entry.count++;
        
        if (meeting.actualStart && meeting.actualEnd) {
          const duration = (meeting.actualEnd.getTime() - meeting.actualStart.getTime()) / (1000 * 60);
          entry.totalDurationMinutes += Math.max(0, duration);
          totalDurationMinutes += Math.max(0, duration);
        }
      }
    });

    const timeSeries = Array.from(timeSeriesMap.values()).sort((a, b) => 
      a.date.localeCompare(b.date)
    );

    const daysInPeriod = period === 'week' ? 7 : 30;
    const avgMeetingsPerDay = meetings.length / daysInPeriod;
    const avgDurationMinutes = meetings.length > 0 ? totalDurationMinutes / meetings.length : 0;

    const result: MeetingStatsByPeriod = {
      period,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      timeSeries,
      summary: {
        totalMeetings: meetings.length,
        avgMeetingsPerDay: Math.round(avgMeetingsPerDay * 100) / 100,
        totalDurationMinutes: Math.round(totalDurationMinutes),
        avgDurationMinutes: Math.round(avgDurationMinutes)
      }
    };

    Logger.info(`[Analytics] Meeting stats by ${period} retrieved for enterprise ${enterpriseId}`);
    return result;
  } catch (error) {
    Logger.error(`[Analytics] Error fetching meeting stats by period: ${error}`);
    throw error;
  }
}

/**
 * Get task statistics by status for the enterprise
 */
export async function getTaskStatsByStatus(enterpriseId: string): Promise<TaskStatsByStatus> {
  try {
    Logger.info(`[Analytics] Fetching task stats by status for enterprise: ${enterpriseId}`);

    const now = new Date();

    const [taskGroups, overdueTasks] = await Promise.all([
      prisma.task.groupBy({
        by: ['status'],
        where: { enterpriseId },
        _count: { id: true }
      }),
      prisma.task.count({
        where: {
          enterpriseId,
          status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
          dueDate: { lt: now }
        }
      })
    ]);

    const stats: TaskStatsByStatus = {
      pending: 0,
      inProgress: 0,
      submitted: 0,
      completed: 0,
      cancelled: 0,
      overdue: overdueTasks
    };

    taskGroups.forEach(group => {
      const count = group._count.id;
      switch (group.status) {
        case TaskStatus.PENDING:
          stats.pending = count;
          break;
        case TaskStatus.IN_PROGRESS:
          stats.inProgress = count;
          break;
        case TaskStatus.SUBMITTED:
          stats.submitted = count;
          break;
        case TaskStatus.COMPLETED:
          stats.completed = count;
          break;
        case TaskStatus.CANCELLED:
          stats.cancelled = count;
          break;
      }
    });

    Logger.info(`[Analytics] Task stats by status retrieved for enterprise ${enterpriseId}`);
    return stats;
  } catch (error) {
    Logger.error(`[Analytics] Error fetching task stats by status: ${error}`);
    throw error;
  }
}

/**
 * Get member activity statistics
 */
export async function getMemberActivity(
  enterpriseId: string,
  limit: number = 10
): Promise<MemberActivity[]> {
  try {
    Logger.info(`[Analytics] Fetching member activity for enterprise: ${enterpriseId}`);

    // Get all enterprise members
    const members = await prisma.enterpriseMembership.findMany({
      where: { enterpriseId },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      },
      take: limit
    });

    // Get activity stats for each member
    const memberActivities = await Promise.all(
      members.map(async (member) => {
        const [meetingsOrganized, tasksCreated, tasksCompleted] = await Promise.all([
          prisma.meeting.count({
            where: {
              enterpriseId,
              ownerId: member.userId
            }
          }),
          prisma.task.count({
            where: {
              enterpriseId,
              createdByUserId: member.userId
            }
          }),
          prisma.task.count({
            where: {
              enterpriseId,
              assignedToUserId: member.userId,
              status: TaskStatus.COMPLETED
            }
          })
        ]);

        return {
          userId: member.userId,
          userName: member.user.name,
          userEmail: member.user.email,
          role: member.role,
          meetingsOrganized,
          tasksCreated,
          tasksCompleted
        };
      })
    );

    Logger.info(`[Analytics] Member activity retrieved for enterprise ${enterpriseId}: ${memberActivities.length} members`);
    return memberActivities;
  } catch (error) {
    Logger.error(`[Analytics] Error fetching member activity: ${error}`);
    throw error;
  }
}

/**
 * Get recent activity feed for the enterprise
 */
export async function getRecentActivity(
  enterpriseId: string,
  limit: number = 20
): Promise<Array<{
  type: 'meeting' | 'task';
  action: string;
  timestamp: Date;
  details: Record<string, any>;
}>> {
  try {
    Logger.info(`[Analytics] Fetching recent activity for enterprise: ${enterpriseId}`);

    // Fetch recent meetings and tasks
    const [recentMeetings, recentTasks] = await Promise.all([
      prisma.meeting.findMany({
        where: { enterpriseId },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          ownerId: true
        }
      }),
      prisma.task.findMany({
        where: { enterpriseId },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          createdByUserId: true,
          assignedToUserId: true
        }
      })
    ]);

    // Combine and sort by timestamp
    const activities = [
      ...recentMeetings.map(m => ({
        type: 'meeting' as const,
        action: m.status === MeetingStatus.LIVE ? 'Meeting started' : 
                m.status === MeetingStatus.COMPLETED ? 'Meeting completed' : 'Meeting updated',
        timestamp: m.updatedAt,
        details: { meetingId: m.id, title: m.title, status: m.status }
      })),
      ...recentTasks.map(t => ({
        type: 'task' as const,
        action: t.status === TaskStatus.COMPLETED ? 'Task completed' :
                t.status === TaskStatus.SUBMITTED ? 'Task submitted' : 'Task updated',
        timestamp: t.updatedAt,
        details: { taskId: t.id, title: t.title, status: t.status }
      }))
    ];

    // Sort by timestamp descending and limit
    activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    Logger.info(`[Analytics] Recent activity retrieved for enterprise ${enterpriseId}`);
    return activities.slice(0, limit);
  } catch (error) {
    Logger.error(`[Analytics] Error fetching recent activity: ${error}`);
    throw error;
  }
}

export default {
  getOrganizationStats,
  getMeetingStatsByPeriod,
  getTaskStatsByStatus,
  getMemberActivity,
  getRecentActivity
};
