/**
 * Artifact Controller
 * 
 * Handles transcript and AI artifact endpoints
 * 
 * Supports:
 * - Personal users (meeting owner)
 * - Enterprise ORGANIZER role (can manage meetings)
 * - Enterprise ADMIN role (read-only access - can view but not generate/edit)
 */

import { Request, Response } from 'express';
import { MeetingArtifactType, MeetingArtifactStatus, OwnerType, EnterpriseRole } from '@prisma/client';
import Logger from '../logger';
import { prisma } from '../lib/prisma';
import { auth } from '../lib/auth';
import { fromNodeHeaders } from 'better-auth/node';
import * as transcriptService from '../services/transcript.service';
import * as artifactService from '../services/artifact.service';
import { enqueueArtifactJob } from '../queues/artifact.queue';

// User access levels
type AccessLevel = 'OWNER' | 'ORGANIZER' | 'ADMIN' | 'NONE';

/**
 * Helper to get user context from request
 */
async function getUserContext(req: Request): Promise<{
  workflowId: string | null;
  userId: string | null;
  enterpriseId: string | null;
  enterpriseRole: EnterpriseRole | null;
}> {
  const headerWorkflowId = req.headers['x-workflow-id'];
  const workflowId = req.body?.workflowId || (Array.isArray(headerWorkflowId) ? headerWorkflowId[0] : headerWorkflowId) || null;

  let userId: string | null = null;
  let enterpriseId: string | null = null;
  let enterpriseRole: EnterpriseRole | null = null;

  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (session?.user) {
      userId = session.user.id;

      const membership = await prisma.enterpriseMembership.findFirst({
        where: { userId: session.user.id },
        select: { enterpriseId: true, role: true }
      });

      if (membership) {
        enterpriseId = membership.enterpriseId;
        enterpriseRole = membership.role;
      }
    }
  } catch (authError) {
    Logger.debug('Auth check failed, continuing with guest flow');
  }

  return { workflowId, userId, enterpriseId, enterpriseRole };
}

/**
 * Determine user's access level to a meeting
 */
async function getMeetingAccessLevel(
  meetingId: string,
  workflowId: string | null,
  userId: string | null,
  enterpriseId: string | null,
  enterpriseRole: EnterpriseRole | null
): Promise<AccessLevel> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      ownerId: true,
      ownerType: true,
      guestSessionId: true,
      enterpriseId: true
    }
  });

  if (!meeting) return 'NONE';

  // Guest owner check
  if (workflowId && (workflowId === meeting.guestSessionId || workflowId === meeting.ownerId)) {
    return 'OWNER';
  }

  // Personal user owner check
  if (userId && meeting.ownerId === userId && meeting.ownerType === OwnerType.PERSONAL) {
    return 'OWNER';
  }

  // Enterprise meeting checks
  if (meeting.enterpriseId && enterpriseId === meeting.enterpriseId) {
    if (userId && meeting.ownerId === userId && enterpriseRole === EnterpriseRole.ORGANIZER) {
      return 'OWNER';
    }
    if (enterpriseRole === EnterpriseRole.ADMIN) {
      return 'ADMIN'; // Read-only
    }
    if (enterpriseRole === EnterpriseRole.ORGANIZER) {
      return 'ORGANIZER'; // Can manage
    }
  }

  return 'NONE';
}

function canModify(accessLevel: AccessLevel): boolean {
  return accessLevel === 'OWNER' || accessLevel === 'ORGANIZER';
}

function canView(accessLevel: AccessLevel): boolean {
  return accessLevel !== 'NONE';
}

/**
 * Get transcript segments for a meeting
 * GET /meetings/:meetingId/transcript
 */
export const getTranscript = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;

    const transcript = await transcriptService.getTranscriptByMeetingId(meetingId);

    if (!transcript) {
      res.status(404).json({ error: 'Transcript not found' });
      return;
    }

    res.status(200).json({
      segments: transcript.segments,
      language: transcript.language
    });
  } catch (error) {
    Logger.error(`Error getting transcript: ${error}`);
    res.status(500).json({ error: 'Failed to get transcript' });
  }
};

/**
 * Get all artifacts for a meeting
 * GET /meetings/:meetingId/artifacts
 */
export const getArtifacts = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;

    const artifacts = await artifactService.getArtifactsByMeetingId(meetingId);

    res.status(200).json({ artifacts });
  } catch (error) {
    Logger.error(`Error getting artifacts: ${error}`);
    res.status(500).json({ error: 'Failed to get artifacts' });
  }
};

/**
 * Generate AI summary
 * POST /meetings/:meetingId/ai/summary
 */
export const generateSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;
    const { workflowId, userId, enterpriseId, enterpriseRole } = await getUserContext(req);

    // Check access level
    const accessLevel = await getMeetingAccessLevel(meetingId, workflowId, userId, enterpriseId, enterpriseRole);
    
    if (accessLevel === 'ADMIN') {
      res.status(403).json({ error: 'Admin users have read-only access. Cannot generate artifacts.' });
      return;
    }
    
    if (!canModify(accessLevel)) {
      res.status(403).json({ error: 'Not authorized to generate artifacts for this meeting' });
      return;
    }

    // Validate meeting
    const validation = await artifactService.validateMeetingForArtifacts(meetingId);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    // Create pending artifact and enqueue job
    const artifact = await artifactService.createPendingArtifact(meetingId, 'SUMMARY' as any);
    const jobId = await enqueueArtifactJob(meetingId, artifact.id, 'SUMMARY');

    res.status(202).json({
      jobId,
      artifactId: artifact.id,
      status: 'PENDING'
    });
  } catch (error) {
    Logger.error(`Error generating summary: ${error}`);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
};

/**
 * Generate AI meeting minutes
 * POST /meetings/:meetingId/ai/minutes
 */
export const generateMinutes = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;
    const { workflowId, userId, enterpriseId, enterpriseRole } = await getUserContext(req);

    // Check access level
    const accessLevel = await getMeetingAccessLevel(meetingId, workflowId, userId, enterpriseId, enterpriseRole);
    
    if (accessLevel === 'ADMIN') {
      res.status(403).json({ error: 'Admin users have read-only access. Cannot generate artifacts.' });
      return;
    }
    
    if (!canModify(accessLevel)) {
      res.status(403).json({ error: 'Not authorized to generate artifacts for this meeting' });
      return;
    }

    // Validate meeting
    const validation = await artifactService.validateMeetingForArtifacts(meetingId);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    // Create pending artifact and enqueue job
    const artifact = await artifactService.createPendingArtifact(meetingId, 'MINUTES' as any);
    const jobId = await enqueueArtifactJob(meetingId, artifact.id, 'MINUTES');

    res.status(202).json({
      jobId,
      artifactId: artifact.id,
      status: 'PENDING'
    });
  } catch (error) {
    Logger.error(`Error generating minutes: ${error}`);
    res.status(500).json({ error: 'Failed to generate minutes' });
  }
};

/**
 * Generate AI action items
 * POST /meetings/:meetingId/ai/action-items
 */
export const generateActionItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;
    const { workflowId, userId, enterpriseId, enterpriseRole } = await getUserContext(req);

    // Check access level
    const accessLevel = await getMeetingAccessLevel(meetingId, workflowId, userId, enterpriseId, enterpriseRole);
    
    if (accessLevel === 'ADMIN') {
      res.status(403).json({ error: 'Admin users have read-only access. Cannot generate artifacts.' });
      return;
    }
    
    if (!canModify(accessLevel)) {
      res.status(403).json({ error: 'Not authorized to generate artifacts for this meeting' });
      return;
    }

    // Validate meeting
    const validation = await artifactService.validateMeetingForArtifacts(meetingId);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    // Create pending artifact and enqueue job
    const artifact = await artifactService.createPendingArtifact(meetingId, 'ACTION_ITEMS' as any);
    const jobId = await enqueueArtifactJob(meetingId, artifact.id, 'ACTION_ITEMS');

    res.status(202).json({
      jobId,
      artifactId: artifact.id,
      status: 'PENDING'
    });
  } catch (error) {
    Logger.error(`Error generating action items: ${error}`);
    res.status(500).json({ error: 'Failed to generate action items' });
  }
};

/**
 * Update artifact content (for user edits)
 * PUT /artifacts/:artifactId
 * Admin users have read-only access - cannot edit
 */
export const updateArtifact = async (req: Request, res: Response): Promise<void> => {
  try {
    const artifactId = req.params.artifactId as string;
    const { content } = req.body;
    const { workflowId, userId, enterpriseId, enterpriseRole } = await getUserContext(req);

    if (typeof content !== 'string') {
      res.status(400).json({ error: 'Content is required and must be a string' });
      return;
    }

    // Check artifact exists
    const existing = await artifactService.getArtifactById(artifactId);
    if (!existing) {
      res.status(404).json({ error: 'Artifact not found' });
      return;
    }

    // Check access level
    const accessLevel = await getMeetingAccessLevel(existing.meetingId, workflowId, userId, enterpriseId, enterpriseRole);
    
    if (accessLevel === 'ADMIN') {
      res.status(403).json({ error: 'Admin users have read-only access. Cannot edit artifacts.' });
      return;
    }
    
    if (!canModify(accessLevel)) {
      res.status(403).json({ error: 'Not authorized to edit this artifact' });
      return;
    }

    const artifact = await artifactService.updateArtifactContent(artifactId, content);

    res.status(200).json({ artifact });
  } catch (error) {
    Logger.error(`Error updating artifact: ${error}`);
    res.status(500).json({ error: 'Failed to update artifact' });
  }
};

/**
 * Get a single artifact by ID
 * GET /artifacts/:artifactId
 */
export const getArtifact = async (req: Request, res: Response): Promise<void> => {
  try {
    const artifactId = req.params.artifactId as string;

    const artifact = await artifactService.getArtifactById(artifactId);

    if (!artifact) {
      res.status(404).json({ error: 'Artifact not found' });
      return;
    }

    res.status(200).json({ artifact });
  } catch (error) {
    Logger.error(`Error getting artifact: ${error}`);
    res.status(500).json({ error: 'Failed to get artifact' });
  }
};

/**
 * Export artifact in specified format
 * GET /artifacts/:artifactId/export
 */
export const exportArtifact = async (req: Request, res: Response): Promise<void> => {
  try {
    const artifactId = req.params.artifactId as string;
    const format = (req.query.format as 'txt' | 'md') || 'txt';

    if (format !== 'txt' && format !== 'md') {
      res.status(400).json({ error: 'Invalid format. Use "txt" or "md"' });
      return;
    }

    const result = await artifactService.exportArtifact(artifactId, format);

    if (!result) {
      res.status(404).json({ error: 'Artifact not found or has no content' });
      return;
    }

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.status(200).send(result.content);
  } catch (error) {
    Logger.error(`Error exporting artifact: ${error}`);
    res.status(500).json({ error: 'Failed to export artifact' });
  }
};

/**
 * Generate artifact (unified endpoint)
 * POST /meetings/:meetingId/artifacts/generate
 */
export const generateArtifact = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;
    const { type } = req.body;
    const { workflowId, userId, enterpriseId, enterpriseRole } = await getUserContext(req);

    if (!type || !['SUMMARY', 'MINUTES', 'ACTION_ITEMS'].includes(type)) {
      res.status(400).json({ error: 'Invalid artifact type. Use SUMMARY, MINUTES, or ACTION_ITEMS' });
      return;
    }

    // Check access level
    const accessLevel = await getMeetingAccessLevel(meetingId, workflowId, userId, enterpriseId, enterpriseRole);
    
    if (accessLevel === 'ADMIN') {
      res.status(403).json({ error: 'Admin users have read-only access. Cannot generate artifacts.' });
      return;
    }
    
    if (!canModify(accessLevel)) {
      res.status(403).json({ error: 'Not authorized to generate artifacts for this meeting' });
      return;
    }

    // Validate meeting
    const validation = await artifactService.validateMeetingForArtifacts(meetingId);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    // Create pending artifact and enqueue job
    const artifact = await artifactService.createPendingArtifact(meetingId, type as any);
    const jobId = await enqueueArtifactJob(meetingId, artifact.id, type);

    res.status(202).json({
      jobId,
      artifactId: artifact.id,
      type,
      status: 'PENDING'
    });
  } catch (error) {
    Logger.error(`Error generating artifact: ${error}`);
    res.status(500).json({ error: 'Failed to generate artifact' });
  }
};

/**
 * Get artifacts status for a meeting (for polling)
 * GET /meetings/:meetingId/artifacts/status
 */
export const getArtifactsStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;

    const status = await artifactService.getArtifactsStatus(meetingId);

    res.status(200).json(status);
  } catch (error) {
    Logger.error(`Error getting artifacts status: ${error}`);
    res.status(500).json({ error: 'Failed to get artifacts status' });
  }
};

/**
 * Retry a failed artifact generation
 * POST /meetings/:meetingId/artifacts/:type/retry
 */
export const retryArtifact = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;
    const type = (req.params.type as string)?.toUpperCase();
    const { workflowId, userId, enterpriseId, enterpriseRole } = await getUserContext(req);

    if (!type || !['SUMMARY', 'MINUTES', 'ACTION_ITEMS'].includes(type)) {
      res.status(400).json({ error: 'Invalid artifact type. Use SUMMARY, MINUTES, or ACTION_ITEMS' });
      return;
    }

    // Check access level
    const accessLevel = await getMeetingAccessLevel(meetingId, workflowId, userId, enterpriseId, enterpriseRole);
    
    if (accessLevel === 'ADMIN') {
      res.status(403).json({ error: 'Admin users have read-only access. Cannot retry artifacts.' });
      return;
    }
    
    if (!canModify(accessLevel)) {
      res.status(403).json({ error: 'Not authorized to retry artifacts for this meeting' });
      return;
    }

    const result = await artifactService.retryArtifact(meetingId, type as MeetingArtifactType);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(202).json({
      jobId: result.jobId,
      artifactId: result.artifactId,
      type,
      status: 'PENDING'
    });
  } catch (error) {
    Logger.error(`Error retrying artifact: ${error}`);
    res.status(500).json({ error: 'Failed to retry artifact' });
  }
};

/**
 * Trigger all artifacts generation for a meeting
 * POST /meetings/:meetingId/artifacts/generate-all
 */
export const generateAllArtifacts = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;
    const { workflowId, userId, enterpriseId, enterpriseRole } = await getUserContext(req);

    // Check access level
    const accessLevel = await getMeetingAccessLevel(meetingId, workflowId, userId, enterpriseId, enterpriseRole);
    
    if (accessLevel === 'ADMIN') {
      res.status(403).json({ error: 'Admin users have read-only access. Cannot generate artifacts.' });
      return;
    }
    
    if (!canModify(accessLevel)) {
      res.status(403).json({ error: 'Not authorized to generate artifacts for this meeting' });
      return;
    }

    const result = await artifactService.triggerAllArtifactsGeneration(meetingId);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(202).json({
      success: true,
      artifacts: result.artifacts.map(a => ({
        type: a.type,
        artifactId: a.artifactId,
        jobId: a.jobId,
        status: 'PENDING'
      }))
    });
  } catch (error) {
    Logger.error(`Error generating all artifacts: ${error}`);
    res.status(500).json({ error: 'Failed to generate artifacts' });
  }
};

/**
 * Get user's access level for a meeting
 * GET /meetings/:meetingId/access-level
 * Used by frontend to determine if user has read-only access (admin) or full access
 */
export const getMeetingUserAccessLevel = async (req: Request, res: Response): Promise<void> => {
  try {
    const meetingId = req.params.meetingId as string;
    const { workflowId, userId, enterpriseId, enterpriseRole } = await getUserContext(req);

    const accessLevel = await getMeetingAccessLevel(meetingId, workflowId, userId, enterpriseId, enterpriseRole);

    res.status(200).json({
      meetingId,
      accessLevel,
      canModify: canModify(accessLevel),
      canView: canView(accessLevel),
      isReadOnly: accessLevel === 'ADMIN',
      enterpriseRole: enterpriseRole
    });
  } catch (error) {
    Logger.error(`Error getting access level: ${error}`);
    res.status(500).json({ error: 'Failed to get access level' });
  }
};
