/**
 * MITLY AI Assistant Service
 * 
 * Server-controlled AI agent for dashboard assistance
 * - Authenticated users only
 * - Role-aware context generation
 * - OpenAI GPT-4o-mini streaming
 * - NO direct database access from AI
 * - NO cross-user data leakage
 */

import { OpenAI } from 'openai';
import { EnterpriseRole } from '@prisma/client';
import Logger from '../logger';
import { prisma } from '../lib/prisma';

let openai: OpenAI;

try {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  Logger.info('MITLY OpenAI service initialized');
} catch (error) {
  Logger.error('Failed to initialize MITLY OpenAI service:', error);
}

// System prompt for MITLY
const MITLY_SYSTEM_PROMPT = `You are MITLY, an AI assistant for meeting intelligence dashboards.
You may ONLY answer using the provided context.
If information is missing, say you do not have enough data.
Do NOT guess.
Do NOT assume.
Do NOT invent metrics.
Be concise and helpful.`;

/**
 * User context for MITLY
 */
export type MitlyUserContext = {
  userId: string;
  role: 'PERSONAL' | 'ADMIN' | 'ORGANIZER' | 'ASSIGNEE';
  enterpriseId?: string;
};

/**
 * Dashboard snapshot for context
 */
type DashboardSnapshot = {
  userInfo: {
    name?: string | null;
    email: string;
    role: string;
  };
  meetings: Array<{
    id: string;
    title: string;
    status: string;
    scheduledStart?: string | null;
    actualStart?: string | null;
    actualEnd?: string | null;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    dueDate?: string | null;
    assignee?: string | null;
  }>;
  stats: {
    totalMeetings: number;
    upcomingMeetings: number;
    completedMeetings: number;
    totalTasks: number;
    pendingTasks: number;
    completedTasks: number;
  };
  enterpriseInfo?: {
    name: string;
    memberCount?: number;
  };
};

/**
 * Build dashboard snapshot for PERSONAL users
 */
async function getPersonalDashboardSnapshot(userId: string): Promise<DashboardSnapshot> {
  try {
    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Get user's meetings (last 30 days + upcoming)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const meetings = await prisma.meeting.findMany({
      where: {
        ownerType: 'PERSONAL',
        ownerId: userId,
        createdAt: { gte: thirtyDaysAgo }
      },
      select: {
        id: true,
        title: true,
        status: true,
        scheduledStart: true,
        actualStart: true,
        actualEnd: true
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    // Get user's tasks
    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          { createdByUserId: userId },
          { assignedToUserId: userId }
        ]
      },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        assignee: true
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    // Calculate stats
    const upcomingMeetings = meetings.filter(m => 
      m.status === 'WAITING' || m.status === 'SCHEDULED'
    ).length;
    
    const completedMeetings = meetings.filter(m => 
      m.status === 'COMPLETED' || m.status === 'ENDED'
    ).length;

    const pendingTasks = tasks.filter(t => 
      t.status === 'PENDING' || t.status === 'IN_PROGRESS'
    ).length;
    
    const completedTasks = tasks.filter(t => 
      t.status === 'COMPLETED'
    ).length;

    return {
      userInfo: {
        name: user.name,
        email: user.email,
        role: 'PERSONAL'
      },
      meetings: meetings.map(m => ({
        id: m.id,
        title: m.title,
        status: m.status,
        scheduledStart: m.scheduledStart?.toISOString() || null,
        actualStart: m.actualStart?.toISOString() || null,
        actualEnd: m.actualEnd?.toISOString() || null
      })),
      tasks: tasks.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        dueDate: t.dueDate?.toISOString() || null,
        assignee: t.assignee || null
      })),
      stats: {
        totalMeetings: meetings.length,
        upcomingMeetings,
        completedMeetings,
        totalTasks: tasks.length,
        pendingTasks,
        completedTasks
      }
    };
  } catch (error) {
    Logger.error('Error building personal dashboard snapshot:', error);
    throw error;
  }
}

/**
 * Build dashboard snapshot for ADMIN users
 */
async function getEnterpriseDashboardSnapshot(enterpriseId: string, userId: string): Promise<DashboardSnapshot> {
  try {
    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Get enterprise info
    const enterprise = await prisma.enterprise.findUnique({
      where: { id: enterpriseId },
      select: { 
        name: true,
        memberships: {
          select: { id: true }
        }
      }
    });

    if (!enterprise) {
      throw new Error('Enterprise not found');
    }

    // Get all enterprise meetings (last 30 days + upcoming)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const meetings = await prisma.meeting.findMany({
      where: {
        enterpriseId,
        createdAt: { gte: thirtyDaysAgo }
      },
      select: {
        id: true,
        title: true,
        status: true,
        scheduledStart: true,
        actualStart: true,
        actualEnd: true
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    // Get all enterprise tasks
    const tasks = await prisma.task.findMany({
      where: {
        enterpriseId
      },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        assignee: true
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    // Calculate stats
    const upcomingMeetings = meetings.filter(m => 
      m.status === 'WAITING' || m.status === 'SCHEDULED'
    ).length;
    
    const completedMeetings = meetings.filter(m => 
      m.status === 'COMPLETED' || m.status === 'ENDED'
    ).length;

    const pendingTasks = tasks.filter(t => 
      t.status === 'PENDING' || t.status === 'IN_PROGRESS'
    ).length;
    
    const completedTasks = tasks.filter(t => 
      t.status === 'COMPLETED'
    ).length;

    return {
      userInfo: {
        name: user.name,
        email: user.email,
        role: 'ADMIN'
      },
      meetings: meetings.map(m => ({
        id: m.id,
        title: m.title,
        status: m.status,
        scheduledStart: m.scheduledStart?.toISOString() || null,
        actualStart: m.actualStart?.toISOString() || null,
        actualEnd: m.actualEnd?.toISOString() || null
      })),
      tasks: tasks.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        dueDate: t.dueDate?.toISOString() || null,
        assignee: t.assignee || null
      })),
      stats: {
        totalMeetings: meetings.length,
        upcomingMeetings,
        completedMeetings,
        totalTasks: tasks.length,
        pendingTasks,
        completedTasks
      },
      enterpriseInfo: {
        name: enterprise.name,
        memberCount: enterprise.memberships.length
      }
    };
  } catch (error) {
    Logger.error('Error building enterprise dashboard snapshot:', error);
    throw error;
  }
}

/**
 * Build dashboard snapshot for ORGANIZER users
 */
async function getOrganizerDashboardSnapshot(userId: string, enterpriseId: string): Promise<DashboardSnapshot> {
  try {
    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Get enterprise info
    const enterprise = await prisma.enterprise.findUnique({
      where: { id: enterpriseId },
      select: { 
        name: true,
        memberships: {
          select: { id: true }
        }
      }
    });

    if (!enterprise) {
      throw new Error('Enterprise not found');
    }

    // Get meetings created by this organizer (last 30 days + upcoming)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const meetings = await prisma.meeting.findMany({
      where: {
        enterpriseId,
        ownerId: userId,
        createdAt: { gte: thirtyDaysAgo }
      },
      select: {
        id: true,
        title: true,
        status: true,
        scheduledStart: true,
        actualStart: true,
        actualEnd: true
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    // Get tasks created by or assigned to this organizer
    const tasks = await prisma.task.findMany({
      where: {
        enterpriseId,
        OR: [
          { createdByUserId: userId },
          { assignedToUserId: userId }
        ]
      },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        assignee: true
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    // Calculate stats
    const upcomingMeetings = meetings.filter(m => 
      m.status === 'WAITING' || m.status === 'SCHEDULED'
    ).length;
    
    const completedMeetings = meetings.filter(m => 
      m.status === 'COMPLETED' || m.status === 'ENDED'
    ).length;

    const pendingTasks = tasks.filter(t => 
      t.status === 'PENDING' || t.status === 'IN_PROGRESS'
    ).length;
    
    const completedTasks = tasks.filter(t => 
      t.status === 'COMPLETED'
    ).length;

    return {
      userInfo: {
        name: user.name,
        email: user.email,
        role: 'ORGANIZER'
      },
      meetings: meetings.map(m => ({
        id: m.id,
        title: m.title,
        status: m.status,
        scheduledStart: m.scheduledStart?.toISOString() || null,
        actualStart: m.actualStart?.toISOString() || null,
        actualEnd: m.actualEnd?.toISOString() || null
      })),
      tasks: tasks.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        dueDate: t.dueDate?.toISOString() || null,
        assignee: t.assignee || null
      })),
      stats: {
        totalMeetings: meetings.length,
        upcomingMeetings,
        completedMeetings,
        totalTasks: tasks.length,
        pendingTasks,
        completedTasks
      },
      enterpriseInfo: {
        name: enterprise.name,
        memberCount: enterprise.memberships.length
      }
    };
  } catch (error) {
    Logger.error('Error building organizer dashboard snapshot:', error);
    throw error;
  }
}

/**
 * Build context based on user role
 */
export async function buildDashboardContext(userContext: MitlyUserContext): Promise<DashboardSnapshot> {
  if (userContext.role === 'PERSONAL') {
    return getPersonalDashboardSnapshot(userContext.userId);
  }

  if (userContext.role === 'ADMIN' && userContext.enterpriseId) {
    return getEnterpriseDashboardSnapshot(userContext.enterpriseId, userContext.userId);
  }

  if (userContext.role === 'ORGANIZER' && userContext.enterpriseId) {
    return getOrganizerDashboardSnapshot(userContext.userId, userContext.enterpriseId);
  }

  throw new Error('Invalid user context for MITLY');
}

/**
 * Stream MITLY response using OpenAI
 */
export async function* streamMitlyResponse(
  userContext: MitlyUserContext,
  userMessage: string
): AsyncGenerator<string, void, unknown> {
  if (!openai) {
    throw new Error('OpenAI service not initialized');
  }

  try {
    // Build dashboard context
    const dashboardSnapshot = await buildDashboardContext(userContext);

    // Create context string
    const contextString = JSON.stringify(dashboardSnapshot, null, 2);

    Logger.info(`MITLY processing message for user ${userContext.userId} (${userContext.role})`);

    // Create streaming completion
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: MITLY_SYSTEM_PROMPT
        },
        {
          role: 'system',
          content: `Dashboard Context:\n${contextString}`
        },
        {
          role: 'user',
          content: userMessage
        }
      ],
      stream: true,
      temperature: 0.3,
      max_tokens: 1000
    });

    // Stream tokens
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }

    Logger.info('MITLY response streaming completed');
  } catch (error) {
    Logger.error('Error streaming MITLY response:', error);
    throw error;
  }
}
