/**
 * Artifact Queue
 * 
 * BullMQ queue for async AI artifact generation jobs
 */

import { Queue, QueueEvents } from 'bullmq';
import Logger from '../logger';

// Redis connection URL for BullMQ
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Parse Redis URL to connection options
function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port) || 6379,
    password: parsed.password || undefined,
    username: parsed.username || undefined,
    maxRetriesPerRequest: null,
  };
}

const connectionOptions = parseRedisUrl(redisUrl);

// Queue name
export const ARTIFACT_QUEUE_NAME = 'artifact-generation';

// Artifact types
export type ArtifactType = 'SUMMARY' | 'MINUTES' | 'ACTION_ITEMS';

// Job data structure
export interface ArtifactJobData {
  meetingId: string;
  artifactId: string;
  type: ArtifactType;
}

// Job result structure
export interface ArtifactJobResult {
  success: boolean;
  artifactId: string;
  type: ArtifactType;
  error?: string;
}

// Create the artifact queue
export const artifactQueue = new Queue<ArtifactJobData, ArtifactJobResult>(
  ARTIFACT_QUEUE_NAME,
  {
    connection: connectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 100,
      },
      removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      },
    },
  }
);

// Queue events for monitoring
export const artifactQueueEvents = new QueueEvents(ARTIFACT_QUEUE_NAME, {
  connection: connectionOptions,
});

// Log queue events
artifactQueueEvents.on('completed', ({ jobId, returnvalue }) => {
  Logger.info(`[ArtifactQueue] Job ${jobId} completed`, returnvalue);
});

artifactQueueEvents.on('failed', ({ jobId, failedReason }) => {
  Logger.error(`[ArtifactQueue] Job ${jobId} failed: ${failedReason}`);
});

artifactQueueEvents.on('stalled', ({ jobId }) => {
  Logger.warn(`[ArtifactQueue] Job ${jobId} stalled`);
});

/**
 * Add an artifact generation job to the queue
 */
export async function enqueueArtifactJob(
  meetingId: string,
  artifactId: string,
  type: ArtifactType
): Promise<string> {
  const job = await artifactQueue.add(
    `artifact-${type.toLowerCase()}`,
    {
      meetingId,
      artifactId,
      type,
    },
    {
      jobId: `artifact-${artifactId}-${Date.now()}`,
    }
  );

  Logger.info(`[ArtifactQueue] Enqueued ${type} job ${job.id} for meeting ${meetingId}`);
  return job.id!;
}

/**
 * Get job status by ID
 */
export async function getArtifactJobStatus(jobId: string) {
  const job = await artifactQueue.getJob(jobId);
  if (!job) {
    return null;
  }

  const state = await job.getState();
  return {
    id: job.id,
    state,
    progress: job.progress,
    data: job.data,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
  };
}

export { connectionOptions };
