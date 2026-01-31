/**
 * Artifact Worker
 * 
 * BullMQ worker for AI artifact generation jobs:
 * - Summary generation
 * - Meeting minutes generation
 * - Action items extraction
 * 
 * Each job type runs independently - failure of one does not block others.
 */

import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import Logger from '../logger';
import {
  ARTIFACT_QUEUE_NAME,
  ArtifactJobData,
  ArtifactJobResult,
  connectionOptions,
} from '../queues/artifact.queue';
import { getFullTranscriptText } from '../services/transcript.service';
import * as artifactService from '../services/artifact.service';
import { checkAndUpdateWorkflowCompletion } from '../services/artifact.service';
import { 
  emitArtifactStarted, 
  emitArtifactCompleted, 
  emitArtifactFailed,
  emitAllArtifactsCompleted 
} from '../websocket/ws-server';

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// AI Prompts for each artifact type
const PROMPTS = {
  SUMMARY: `You are an expert meeting analyst. Analyze the following meeting transcript and provide a comprehensive summary.

Your summary should include:
1. **Overview**: A brief 2-3 sentence overview of what the meeting was about
2. **Key Discussion Points**: The main topics discussed
3. **Decisions Made**: Any decisions that were reached
4. **Notable Insights**: Any important observations or insights shared

Format your response in clean Markdown. Be concise but thorough.

TRANSCRIPT:
`,

  MINUTES: `You are an expert at creating professional meeting minutes. Analyze the following meeting transcript and generate formal meeting minutes.

Your minutes should follow this structure:
1. **Meeting Overview**
   - Purpose/Objective
   - Key Participants (based on speaker labels)

2. **Agenda Items Discussed**
   - List each major topic with a brief summary

3. **Decisions & Resolutions**
   - Document any decisions made

4. **Action Items**
   - List any tasks assigned (who, what, when if mentioned)

5. **Next Steps**
   - Any follow-up items or future meeting topics

Format your response in clean, professional Markdown. Use bullet points for clarity.

TRANSCRIPT:
`,

  ACTION_ITEMS: `You are an expert at extracting action items from meeting discussions. Analyze the following meeting transcript and extract all action items.

For each action item, identify:
- **Task**: What needs to be done
- **Assigned To**: Who is responsible (use speaker labels if names aren't mentioned)
- **Priority**: High/Medium/Low (infer from context)
- **Deadline**: If mentioned, otherwise mark as "TBD"
- **Context**: Brief context about why this task is needed

Format your response as a numbered list in Markdown. If no clear action items are found, indicate that and suggest potential follow-up items based on the discussion.

TRANSCRIPT:
`
};

/**
 * Process an artifact generation job
 */
async function processArtifactJob(
  job: Job<ArtifactJobData, ArtifactJobResult>
): Promise<ArtifactJobResult> {
  const { meetingId, artifactId, type } = job.data;

  Logger.info(`[ArtifactWorker] Starting ${type} generation for meeting ${meetingId}`);

  // Emit artifact started event
  emitArtifactStarted(meetingId, type, artifactId);

  try {
    // Step 1: Get full transcript
    job.updateProgress(10);
    const transcript = await getFullTranscriptText(meetingId);

    if (!transcript) {
      throw new Error('No transcript available for this meeting');
    }

    // Step 2: Generate content with OpenAI
    job.updateProgress(30);
    Logger.info(`[ArtifactWorker] Calling OpenAI for ${type}`);

    const prompt = PROMPTS[type];
    const fullPrompt = prompt + transcript;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: fullPrompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    job.updateProgress(80);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    // Step 3: Save content to artifact
    job.updateProgress(90);
    await artifactService.completeArtifact(artifactId, content);

    // Emit artifact completed event
    emitArtifactCompleted(meetingId, type, artifactId, content);

    // Step 4: Check and update workflow completion
    // This marks the meeting as read-only once transcript + artifact are both complete
    const workflowComplete = await checkAndUpdateWorkflowCompletion(meetingId);
    
    // Check if all artifacts are completed
    const allArtifactsComplete = await checkAllArtifactsCompleted(meetingId);
    if (allArtifactsComplete) {
      emitAllArtifactsCompleted(meetingId);
    }

    job.updateProgress(100);
    Logger.info(`[ArtifactWorker] Completed ${type} for meeting ${meetingId}`);

    return {
      success: true,
      artifactId,
      type,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    Logger.error(`[ArtifactWorker] Failed ${type} for meeting ${meetingId}:`, error);

    // Mark artifact as failed
    try {
      await artifactService.failArtifact(artifactId, errorMessage);
    } catch (updateError) {
      Logger.error(`[ArtifactWorker] Failed to update artifact status:`, updateError);
    }

    // Emit artifact failed event
    emitArtifactFailed(meetingId, type, artifactId, errorMessage);

    return {
      success: false,
      artifactId,
      type,
      error: errorMessage,
    };
  }
}

/**
 * Check if all expected artifacts are completed for a meeting
 */
async function checkAllArtifactsCompleted(meetingId: string): Promise<boolean> {
  const artifacts = await prisma.meetingArtifact.findMany({
    where: { meetingId },
    select: { type: true, status: true }
  });

  const expectedTypes = ['SUMMARY', 'MINUTES', 'ACTION_ITEMS'];
  const completedTypes = artifacts
    .filter(a => a.status === 'COMPLETED')
    .map(a => a.type);

  return expectedTypes.every(type => completedTypes.includes(type as any));
}

/**
 * Create and start the artifact worker
 */
export function createArtifactWorker(): Worker<ArtifactJobData, ArtifactJobResult> {
  const worker = new Worker<ArtifactJobData, ArtifactJobResult>(
    ARTIFACT_QUEUE_NAME,
    async (job) => {
      return processArtifactJob(job);
    },
    {
      connection: connectionOptions,
      concurrency: 3, // Process up to 3 artifact jobs concurrently
      limiter: {
        max: 20,
        duration: 60000, // Max 20 jobs per minute (API rate limiting)
      },
    }
  );

  worker.on('completed', (job, result) => {
    Logger.info(`[ArtifactWorker] Job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, error) => {
    Logger.error(`[ArtifactWorker] Job ${job?.id} failed:`, error);
  });

  worker.on('error', (error) => {
    Logger.error('[ArtifactWorker] Worker error:', error);
  });

  Logger.info('[ArtifactWorker] Worker started');
  return worker;
}

export { connectionOptions as artifactWorkerConnectionOptions };
