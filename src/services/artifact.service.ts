/**
 * Artifact Service
 * 
 * Handles AI artifact generation, storage, and retrieval
 */

import { MeetingArtifactType, MeetingArtifactStatus, OwnerType } from '@prisma/client';
import Logger from '../logger';
import { prisma } from '../lib/prisma';
import { getFullTranscriptText } from './transcript.service';
import { emitMeetingEvent } from '../websocket/ws-server';

// DEV MODE: Bypass meeting limits but still enforce per-meeting read-only
const DEV_MODE_BYPASS_MEETING_LIMIT = process.env.DEV_MODE_BYPASS_MEETING_LIMIT === 'true' || true;

export type ArtifactResponse = {
  id: string;
  meetingId: string;
  type: MeetingArtifactType;
  content: string | null;
  status: MeetingArtifactStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Get all artifacts for a meeting
 */
export async function getArtifactsByMeetingId(meetingId: string): Promise<ArtifactResponse[]> {
  try {
    const artifacts = await prisma.meetingArtifact.findMany({
      where: { meetingId },
      orderBy: { createdAt: 'asc' }
    });

    return artifacts.map(a => ({
      id: a.id,
      meetingId: a.meetingId,
      type: a.type,
      content: a.content,
      status: a.status,
      errorMessage: a.errorMessage,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString()
    }));
  } catch (error) {
    Logger.error(`Error fetching artifacts for meeting ${meetingId}:`, error);
    throw error;
  }
}

/**
 * Get a single artifact by ID
 */
export async function getArtifactById(artifactId: string): Promise<ArtifactResponse | null> {
  try {
    const artifact = await prisma.meetingArtifact.findUnique({
      where: { id: artifactId }
    });

    if (!artifact) {
      return null;
    }

    return {
      id: artifact.id,
      meetingId: artifact.meetingId,
      type: artifact.type,
      content: artifact.content,
      status: artifact.status,
      errorMessage: artifact.errorMessage,
      createdAt: artifact.createdAt.toISOString(),
      updatedAt: artifact.updatedAt.toISOString()
    };
  } catch (error) {
    Logger.error(`Error fetching artifact ${artifactId}:`, error);
    throw error;
  }
}

/**
 * Create or update a pending artifact
 */
export async function createPendingArtifact(
  meetingId: string,
  type: MeetingArtifactType,
  aiJobId?: string
): Promise<ArtifactResponse> {
  try {
    // Use upsert to handle both create and update cases
    const artifact = await prisma.meetingArtifact.upsert({
      where: {
        meetingId_type: { meetingId, type }
      },
      create: {
        meetingId,
        type,
        status: 'PENDING',
        aiJobId
      },
      update: {
        status: 'PENDING',
        content: null,
        errorMessage: null,
        aiJobId
      }
    });

    return {
      id: artifact.id,
      meetingId: artifact.meetingId,
      type: artifact.type,
      content: artifact.content,
      status: artifact.status,
      errorMessage: artifact.errorMessage,
      createdAt: artifact.createdAt.toISOString(),
      updatedAt: artifact.updatedAt.toISOString()
    };
  } catch (error) {
    Logger.error(`Error creating pending artifact for meeting ${meetingId}:`, error);
    throw error;
  }
}

/**
 * Update artifact with completed content
 */
export async function completeArtifact(
  artifactId: string,
  content: string
): Promise<ArtifactResponse> {
  try {
    const artifact = await prisma.meetingArtifact.update({
      where: { id: artifactId },
      data: {
        content,
        status: 'COMPLETED',
        errorMessage: null
      }
    });

    return {
      id: artifact.id,
      meetingId: artifact.meetingId,
      type: artifact.type,
      content: artifact.content,
      status: artifact.status,
      errorMessage: artifact.errorMessage,
      createdAt: artifact.createdAt.toISOString(),
      updatedAt: artifact.updatedAt.toISOString()
    };
  } catch (error) {
    Logger.error(`Error completing artifact ${artifactId}:`, error);
    throw error;
  }
}

/**
 * Mark artifact as failed
 */
export async function failArtifact(
  artifactId: string,
  errorMessage: string
): Promise<ArtifactResponse> {
  try {
    const artifact = await prisma.meetingArtifact.update({
      where: { id: artifactId },
      data: {
        status: 'FAILED',
        errorMessage
      }
    });

    return {
      id: artifact.id,
      meetingId: artifact.meetingId,
      type: artifact.type,
      content: artifact.content,
      status: artifact.status,
      errorMessage: artifact.errorMessage,
      createdAt: artifact.createdAt.toISOString(),
      updatedAt: artifact.updatedAt.toISOString()
    };
  } catch (error) {
    Logger.error(`Error marking artifact ${artifactId} as failed:`, error);
    throw error;
  }
}

/**
 * Update artifact content (for user edits)
 */
export async function updateArtifactContent(
  artifactId: string,
  content: string
): Promise<ArtifactResponse> {
  try {
    const artifact = await prisma.meetingArtifact.update({
      where: { id: artifactId },
      data: { content }
    });

    return {
      id: artifact.id,
      meetingId: artifact.meetingId,
      type: artifact.type,
      content: artifact.content,
      status: artifact.status,
      errorMessage: artifact.errorMessage,
      createdAt: artifact.createdAt.toISOString(),
      updatedAt: artifact.updatedAt.toISOString()
    };
  } catch (error) {
    Logger.error(`Error updating artifact ${artifactId}:`, error);
    throw error;
  }
}

/**
 * Validate meeting is ready for artifact generation
 */
export async function validateMeetingForArtifacts(meetingId: string): Promise<{
  valid: boolean;
  error?: string;
  meeting?: { id: string; title: string };
}> {
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        title: true,
        status: true,
        processingStatus: true
      }
    });

    if (!meeting) {
      return { valid: false, error: 'Meeting not found' };
    }

    // Check meeting is ENDED
    if (meeting.status !== 'ENDED' && meeting.status !== 'COMPLETED') {
      return { valid: false, error: 'Meeting has not ended yet' };
    }

    // Check processing is COMPLETED
    if (meeting.processingStatus !== 'COMPLETED') {
      return { valid: false, error: 'Meeting transcript is still processing' };
    }

    // Check transcript exists
    const transcriptText = await getFullTranscriptText(meetingId);
    if (!transcriptText || transcriptText.trim().length === 0) {
      return { valid: false, error: 'No transcript available for this meeting' };
    }

    return {
      valid: true,
      meeting: { id: meeting.id, title: meeting.title }
    };
  } catch (error) {
    Logger.error(`Error validating meeting ${meetingId} for artifacts:`, error);
    return { valid: false, error: 'Failed to validate meeting' };
  }
}

/**
 * Export artifact content in specified format
 */
export async function exportArtifact(
  artifactId: string,
  format: 'txt' | 'md' = 'txt'
): Promise<{ content: string; filename: string; mimeType: string } | null> {
  try {
    const artifact = await prisma.meetingArtifact.findUnique({
      where: { id: artifactId },
      include: {
        meeting: {
          select: {
            id: true,
            title: true,
            actualStart: true,
            createdAt: true
          }
        }
      }
    });

    if (!artifact || !artifact.content) {
      return null;
    }

    const typeNames: Record<MeetingArtifactType, string> = {
      SUMMARY: 'Summary',
      MINUTES: 'Minutes',
      ACTION_ITEMS: 'Action Items',
    };

    const typeSlugs: Record<MeetingArtifactType, string> = {
      SUMMARY: 'summary',
      MINUTES: 'minutes',
      ACTION_ITEMS: 'action-items',
    };

    const meetingDate = artifact.meeting.actualStart || artifact.meeting.createdAt;
    const dateStr = meetingDate.toISOString().split('T')[0];
    const meetingTitle = artifact.meeting.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'md') {
      content = `# ${typeNames[artifact.type]}\n\n`;
      content += `**Meeting:** ${artifact.meeting.title}\n`;
      content += `**Date:** ${dateStr}\n\n`;
      content += `---\n\n`;
      content += artifact.content;
      filename = `${typeSlugs[artifact.type]}-${meetingTitle}-${dateStr}.md`;
      mimeType = 'text/markdown';
    } else {
      content = `${typeNames[artifact.type]}\n`;
      content += `${'='.repeat(typeNames[artifact.type].length)}\n\n`;
      content += `Meeting: ${artifact.meeting.title}\n`;
      content += `Date: ${dateStr}\n\n`;
      content += `${'-'.repeat(40)}\n\n`;
      // Strip markdown formatting for plain text
      content += artifact.content
        .replace(/#{1,6}\s/g, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/`/g, '');
      filename = `${typeSlugs[artifact.type]}-${meetingTitle}-${dateStr}.txt`;
      mimeType = 'text/plain';
    }

    return { content, filename, mimeType };
  } catch (error) {
    Logger.error(`Error exporting artifact ${artifactId}:`, error);
    throw error;
  }
}

/**
 * Check if user has access to artifact (ownership check)
 */
export async function checkArtifactAccess(
  artifactId: string,
  guestSessionId: string
): Promise<boolean> {
  try {
    const artifact = await prisma.meetingArtifact.findUnique({
      where: { id: artifactId },
      include: {
        meeting: {
          select: {
            ownerId: true,
            ownerType: true,
            guestSessionId: true
          }
        }
      }
    });

    if (!artifact) {
      return false;
    }

    // Check if the guest session owns this meeting
    return artifact.meeting.guestSessionId === guestSessionId || 
           artifact.meeting.ownerId === guestSessionId;
  } catch (error) {
    Logger.error(`Error checking artifact access:`, error);
    return false;
  }
}

/**
 * Check if user has access to meeting artifacts
 */
export async function checkMeetingArtifactAccess(
  meetingId: string,
  guestSessionId: string
): Promise<boolean> {
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        ownerId: true,
        ownerType: true,
        guestSessionId: true
      }
    });

    if (!meeting) {
      return false;
    }

    return meeting.guestSessionId === guestSessionId || 
           meeting.ownerId === guestSessionId;
  } catch (error) {
    Logger.error(`Error checking meeting artifact access:`, error);
    return false;
  }
}

/**
 * Check if meeting workflow is complete (transcript + at least one artifact)
 * and update the meeting's workflowCompletedAt and isReadOnly fields
 */
export async function checkAndUpdateWorkflowCompletion(meetingId: string): Promise<boolean> {
  try {
    // Get meeting with its artifacts and transcripts
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        ownerType: true,
        workflowCompletedAt: true,
        isReadOnly: true,
        processingStatus: true,
        transcripts: {
          select: { id: true }
        },
        artifacts: {
          where: { status: 'COMPLETED' },
          select: { id: true, type: true }
        }
      }
    });

    if (!meeting) {
      Logger.warn(`[WorkflowCompletion] Meeting ${meetingId} not found`);
      return false;
    }

    // Already completed - no need to update
    if (meeting.workflowCompletedAt) {
      Logger.info(`[WorkflowCompletion] Meeting ${meetingId} workflow already completed`);
      return true;
    }

    // Check if transcript exists
    const hasTranscript = meeting.transcripts.length > 0 || meeting.processingStatus === 'COMPLETED';
    
    // Check if at least one artifact is completed
    const hasCompletedArtifact = meeting.artifacts.length > 0;

    // Workflow is complete when both conditions are met
    if (hasTranscript && hasCompletedArtifact) {
      Logger.info(`[WorkflowCompletion] Meeting ${meetingId} workflow complete - marking as read-only`);
      
      // Update meeting to mark workflow as complete
      await prisma.meeting.update({
        where: { id: meetingId },
        data: {
          workflowCompletedAt: new Date(),
          isReadOnly: true,
        }
      });

      // Emit WebSocket event for workflow completion
      emitMeetingEvent(meetingId, {
        type: 'meeting:state-changed',
        meetingId,
        status: 'COMPLETED',
        processingStatus: 'COMPLETED',
      });

      // Update guest session if this is a guest meeting
      if (meeting.ownerType === OwnerType.GUEST) {
        // Note: In dev mode, we don't mark the guest as exhausted
        // Each meeting just becomes read-only individually
        if (!DEV_MODE_BYPASS_MEETING_LIMIT) {
          // Update guest session workflow count if needed
          // This is handled elsewhere - just log for now
          Logger.info(`[WorkflowCompletion] Guest meeting ${meetingId} completed`);
        }
      }

      return true;
    }

    Logger.info(`[WorkflowCompletion] Meeting ${meetingId} not yet complete - transcript: ${hasTranscript}, artifact: ${hasCompletedArtifact}`);
    return false;
  } catch (error) {
    Logger.error(`[WorkflowCompletion] Error checking workflow completion for ${meetingId}:`, error);
    return false;
  }
}

/**
 * Check if a meeting is read-only
 */
export async function isMeetingReadOnly(meetingId: string): Promise<boolean> {
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { isReadOnly: true }
    });
    return meeting?.isReadOnly ?? false;
  } catch (error) {
    Logger.error(`[ArtifactService] Error checking read-only status:`, error);
    return false;
  }
}

/**
 * Trigger all artifacts generation for a meeting
 * Called automatically after transcription completes
 */
export async function triggerAllArtifactsGeneration(meetingId: string): Promise<{
  success: boolean;
  artifacts: { type: MeetingArtifactType; artifactId: string; jobId: string }[];
  error?: string;
}> {
  Logger.info(`[ArtifactService] Triggering all artifacts for meeting ${meetingId}`);
  
  try {
    // Validate meeting is ready for artifacts
    const validation = await validateMeetingForArtifacts(meetingId);
    if (!validation.valid) {
      Logger.warn(`[ArtifactService] Meeting ${meetingId} not ready for artifacts: ${validation.error}`);
      return { success: false, artifacts: [], error: validation.error };
    }

    // Import enqueueArtifactJob dynamically to avoid circular dependency
    const { enqueueArtifactJob } = await import('../queues/artifact.queue');

    const artifactTypes: MeetingArtifactType[] = ['SUMMARY', 'MINUTES', 'ACTION_ITEMS'];
    const results: { type: MeetingArtifactType; artifactId: string; jobId: string }[] = [];

    for (const type of artifactTypes) {
      // Create pending artifact
      const artifact = await createPendingArtifact(meetingId, type);
      
      // Enqueue job
      const jobId = await enqueueArtifactJob(meetingId, artifact.id, type);
      
      results.push({
        type,
        artifactId: artifact.id,
        jobId
      });
      
      Logger.info(`[ArtifactService] Enqueued ${type} job for meeting ${meetingId}`);
    }

    return { success: true, artifacts: results };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    Logger.error(`[ArtifactService] Failed to trigger artifacts for meeting ${meetingId}:`, error);
    return { success: false, artifacts: [], error: errorMessage };
  }
}

/**
 * Get artifacts status for a meeting (for polling)
 */
export async function getArtifactsStatus(meetingId: string): Promise<{
  meetingId: string;
  transcriptReady: boolean;
  artifacts: {
    type: MeetingArtifactType;
    status: MeetingArtifactStatus;
    artifactId: string | null;
    hasContent: boolean;
    errorMessage: string | null;
    updatedAt: string | null;
  }[];
  allCompleted: boolean;
  anyFailed: boolean;
}> {
  try {
    // Check transcript status
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { processingStatus: true }
    });
    
    const transcriptReady = meeting?.processingStatus === 'COMPLETED';
    
    // Get all artifacts
    const artifacts = await prisma.meetingArtifact.findMany({
      where: { meetingId },
      orderBy: { createdAt: 'asc' }
    });

    // Map artifacts to status
    const artifactTypes: MeetingArtifactType[] = ['SUMMARY', 'MINUTES', 'ACTION_ITEMS'];
    const artifactStatuses = artifactTypes.map(type => {
      const artifact = artifacts.find(a => a.type === type);
      return {
        type,
        status: artifact?.status || ('PENDING' as MeetingArtifactStatus),
        artifactId: artifact?.id || null,
        hasContent: !!(artifact?.content),
        errorMessage: artifact?.errorMessage || null,
        updatedAt: artifact?.updatedAt?.toISOString() || null
      };
    });

    const allCompleted = artifactStatuses.every(a => a.status === 'COMPLETED');
    const anyFailed = artifactStatuses.some(a => a.status === 'FAILED');

    return {
      meetingId,
      transcriptReady,
      artifacts: artifactStatuses,
      allCompleted,
      anyFailed
    };
  } catch (error) {
    Logger.error(`[ArtifactService] Error getting artifacts status for ${meetingId}:`, error);
    throw error;
  }
}

/**
 * Retry a failed artifact generation
 */
export async function retryArtifact(
  meetingId: string,
  artifactType: MeetingArtifactType
): Promise<{ success: boolean; artifactId?: string; jobId?: string; error?: string }> {
  try {
    // Validate meeting
    const validation = await validateMeetingForArtifacts(meetingId);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Import enqueueArtifactJob dynamically
    const { enqueueArtifactJob } = await import('../queues/artifact.queue');

    // Create/update pending artifact
    const artifact = await createPendingArtifact(meetingId, artifactType);
    
    // Enqueue job
    const jobId = await enqueueArtifactJob(meetingId, artifact.id, artifactType);

    Logger.info(`[ArtifactService] Retry ${artifactType} job for meeting ${meetingId}`);
    
    return { success: true, artifactId: artifact.id, jobId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    Logger.error(`[ArtifactService] Failed to retry artifact:`, error);
    return { success: false, error: errorMessage };
  }
}
