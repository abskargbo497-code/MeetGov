/**
 * Processing Queue
 * 
 * BullMQ queue for async audio processing jobs:
 * - Audio normalization
 * - Transcription (with diarization)
 * - Transcript segment persistence
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
export const PROCESSING_QUEUE_NAME = 'audio-processing';

// Job types
export type ProcessingJobType = 'TRANSCRIPTION';

// Job data structure
export interface ProcessingJobData {
  meetingId: string;
  recordingId: string;
  audioUrl: string;
  type: ProcessingJobType;
}

// Job result structure
export interface ProcessingJobResult {
  success: boolean;
  meetingId: string;
  transcriptId?: string;
  segmentCount?: number;
  error?: string;
}

// Create the processing queue
export const processingQueue = new Queue<ProcessingJobData, ProcessingJobResult>(
  PROCESSING_QUEUE_NAME,
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
export const processingQueueEvents = new QueueEvents(PROCESSING_QUEUE_NAME, {
  connection: connectionOptions,
});

// Log queue events
processingQueueEvents.on('completed', ({ jobId, returnvalue }) => {
  Logger.info(`[ProcessingQueue] Job ${jobId} completed`, returnvalue);
});

processingQueueEvents.on('failed', ({ jobId, failedReason }) => {
  Logger.error(`[ProcessingQueue] Job ${jobId} failed: ${failedReason}`);
});

processingQueueEvents.on('stalled', ({ jobId }) => {
  Logger.warn(`[ProcessingQueue] Job ${jobId} stalled`);
});

/**
 * Add a transcription job to the queue
 */
export async function enqueueTranscriptionJob(
  meetingId: string,
  recordingId: string,
  audioUrl: string
): Promise<string> {
  const job = await processingQueue.add(
    'transcription',
    {
      meetingId,
      recordingId,
      audioUrl,
      type: 'TRANSCRIPTION',
    },
    {
      jobId: `transcription-${meetingId}-${Date.now()}`,
    }
  );

  Logger.info(`[ProcessingQueue] Enqueued transcription job ${job.id} for meeting ${meetingId}`);
  return job.id!;
}

/**
 * Get job status by ID
 */
export async function getJobStatus(jobId: string) {
  const job = await processingQueue.getJob(jobId);
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
