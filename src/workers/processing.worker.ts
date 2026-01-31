/**
 * Processing Worker
 * 
 * BullMQ worker for audio processing jobs:
 * 1. Audio normalization (convert to standard format)
 * 2. Transcription with AssemblyAI (true speaker diarization) or OpenAI Whisper (fallback)
 * 3. Parse transcript segments
 * 4. Persist transcript + speaker segments
 * 5. Update processingStatus
 */

import { Worker, Job } from 'bullmq';
import OpenAI from 'openai';
import Logger from '../logger';
import { prisma } from '../lib/prisma';
import r2Storage from '../services/r2-storage.service';
import { emitProcessingCompleted, emitProcessingFailed, emitTranscriptReady } from '../websocket/ws-server';
import {
  PROCESSING_QUEUE_NAME,
  ProcessingJobData,
  ProcessingJobResult,
  connectionOptions,
} from '../queues/processing.queue';
import { TRANSCRIPTION_PROVIDER } from '../config/assemblyai';
import {
  startAssemblyAITranscription,
  waitForTranscription,
  processTranscriptionResult,
  handleTranscriptionFailure,
} from '../services/assemblyai-transcription.service';
import { triggerAllArtifactsGeneration } from '../services/artifact.service';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Data retention period
const DATA_RETENTION_DAYS = 7;

/**
 * Process transcription job using AssemblyAI
 * Uses true speaker diarization for accurate speaker labels
 */
async function processWithAssemblyAI(
  job: Job<ProcessingJobData, ProcessingJobResult>
): Promise<ProcessingJobResult> {
  const { meetingId, recordingId, audioUrl } = job.data;

  Logger.info(`[ProcessingWorker] Starting AssemblyAI transcription for meeting ${meetingId}`);

  try {
    // Update meeting processingStatus to PROCESSING
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { processingStatus: 'PROCESSING' },
    });

    job.updateProgress(10);

    // Start AssemblyAI transcription (uses webhook for async completion)
    const { transcriptId, status } = await startAssemblyAITranscription({
      audioUrl,
      meetingId,
      useWebhook: false, // Use polling for BullMQ worker flow
    });

    job.updateProgress(30);
    Logger.info(`[ProcessingWorker] AssemblyAI job started: ${transcriptId}`);

    // Wait for transcription to complete (polling)
    const transcriptResult = await waitForTranscription(transcriptId);

    job.updateProgress(70);

    if (transcriptResult.status === 'error' || !transcriptResult.text) {
      throw new Error(transcriptResult.error || 'Transcription failed');
    }

    Logger.info(`[ProcessingWorker] AssemblyAI transcription complete for meeting ${meetingId}`);

    // Process and save the transcription result
    job.updateProgress(80);
    const { transcriptId: dbTranscriptId, segmentCount } = await processTranscriptionResult({
      meetingId,
      recordingId,
      transcriptResult,
    });

    // Emit WebSocket events
    emitProcessingCompleted(meetingId);
    emitTranscriptReady(meetingId, segmentCount);

    job.updateProgress(90);
    Logger.info(`[ProcessingWorker] Completed AssemblyAI processing for meeting ${meetingId}`);

    // Trigger automatic artifact generation
    Logger.info(`[ProcessingWorker] Triggering artifact generation for meeting ${meetingId}`);
    const artifactResult = await triggerAllArtifactsGeneration(meetingId);
    if (artifactResult.success) {
      Logger.info(`[ProcessingWorker] Queued ${artifactResult.artifacts.length} artifact jobs for meeting ${meetingId}`);
    } else {
      Logger.warn(`[ProcessingWorker] Failed to trigger artifacts for meeting ${meetingId}: ${artifactResult.error}`);
    }

    job.updateProgress(100);

    return {
      success: true,
      meetingId,
      transcriptId: dbTranscriptId,
      segmentCount,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    Logger.error(`[ProcessingWorker] AssemblyAI processing failed for meeting ${meetingId}:`, error);

    await handleTranscriptionFailure({
      meetingId,
      recordingId,
      error: errorMessage,
    });

    emitProcessingFailed(meetingId, errorMessage);
    throw error;
  }
}

/**
 * Process transcription job using OpenAI Whisper (fallback)
 * Note: Whisper doesn't provide true speaker diarization
 */
async function processWithWhisper(
  job: Job<ProcessingJobData, ProcessingJobResult>
): Promise<ProcessingJobResult> {
  const { meetingId, recordingId, audioUrl } = job.data;

  Logger.info(`[ProcessingWorker] Starting Whisper transcription for meeting ${meetingId}`);

  try {
    // Update meeting processingStatus to PROCESSING
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { processingStatus: 'PROCESSING' },
    });

    // Step 1: Download audio from R2
    job.updateProgress(10);
    Logger.info(`[ProcessingWorker] Downloading audio: ${audioUrl}`);
    
    const audioBuffer = await r2Storage.downloadFile(audioUrl);
    if (!audioBuffer) {
      throw new Error('Failed to download audio file');
    }

    // Step 2: Transcribe with OpenAI Whisper
    job.updateProgress(30);
    Logger.info(`[ProcessingWorker] Transcribing audio for meeting ${meetingId}`);

    // Create a File-like object for the OpenAI API
    const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/webm' });
    const audioFile = new File([audioBlob], 'audio.webm', { type: 'audio/webm' });

    // Use Whisper API with verbose JSON for word-level timestamps
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    job.updateProgress(70);
    Logger.info(`[ProcessingWorker] Transcription complete for meeting ${meetingId}`);

    // Step 3: Parse segments and create transcript
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + DATA_RETENTION_DAYS);

    // Create main transcript
    const transcript = await prisma.transcript.create({
      data: {
        meetingId,
        content: transcription.text,
        language: transcription.language || 'en',
        source: 'AI',
        expiresAt,
      },
    });

    // Step 4: Create transcript segments
    job.updateProgress(80);
    
    const segments = (transcription as any).segments || [];
    let segmentCount = 0;

    if (segments.length > 0) {
      // Create segments with speaker labels (Whisper doesn't provide true diarization,
      // but we can use segment boundaries as a starting point)
      const segmentData = segments.map((seg: any, index: number) => ({
        meetingId,
        speakerLabel: `SPEAKER_${(index % 4) + 1}`, // Placeholder - no true diarization
        text: seg.text.trim(),
        startTime: seg.start,
        endTime: seg.end,
        confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : null,
      }));

      // Create segments using raw query since model may not be generated yet
      for (const seg of segmentData) {
        await prisma.$executeRaw`
          INSERT INTO "TranscriptSegment" ("id", "meetingId", "speakerLabel", "text", "startTime", "endTime", "confidence", "createdAt")
          VALUES (gen_random_uuid(), ${seg.meetingId}, ${seg.speakerLabel}, ${seg.text}, ${seg.startTime}, ${seg.endTime}, ${seg.confidence}, NOW())
        `;
      }

      segmentCount = segmentData.length;
    }

    // Step 5: Update recording status
    await prisma.recording.update({
      where: { id: recordingId },
      data: { processingStatus: 'COMPLETED' },
    });

    // Step 6: Update meeting processingStatus to COMPLETED
    job.updateProgress(90);
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { 
        processingStatus: 'COMPLETED',
        processingError: null,
      },
    });

    // Step 7: Emit WebSocket events
    emitProcessingCompleted(meetingId);
    emitTranscriptReady(meetingId, segmentCount);

    // Step 8: Trigger automatic artifact generation
    Logger.info(`[ProcessingWorker] Triggering artifact generation for meeting ${meetingId}`);
    const artifactResult = await triggerAllArtifactsGeneration(meetingId);
    if (artifactResult.success) {
      Logger.info(`[ProcessingWorker] Queued ${artifactResult.artifacts.length} artifact jobs for meeting ${meetingId}`);
    } else {
      Logger.warn(`[ProcessingWorker] Failed to trigger artifacts for meeting ${meetingId}: ${artifactResult.error}`);
    }

    job.updateProgress(100);
    Logger.info(`[ProcessingWorker] Completed Whisper processing for meeting ${meetingId}`);

    return {
      success: true,
      meetingId,
      transcriptId: transcript.id,
      segmentCount,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    Logger.error(`[ProcessingWorker] Whisper processing failed for meeting ${meetingId}:`, error);

    // Update meeting with failure status
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        processingStatus: 'FAILED',
        processingError: errorMessage,
      },
    });

    // Update recording status
    await prisma.recording.update({
      where: { id: recordingId },
      data: { processingStatus: 'FAILED' },
    });

    emitProcessingFailed(meetingId, errorMessage);
    throw error;
  }
}

/**
 * Process transcription job
 * Routes to AssemblyAI or Whisper based on TRANSCRIPTION_PROVIDER config
 */
async function processTranscriptionJob(
  job: Job<ProcessingJobData, ProcessingJobResult>
): Promise<ProcessingJobResult> {
  const provider = TRANSCRIPTION_PROVIDER;
  
  Logger.info(`[ProcessingWorker] Using transcription provider: ${provider}`);

  if (provider === 'assemblyai') {
    return processWithAssemblyAI(job);
  } else {
    return processWithWhisper(job);
  }
}

/**
 * Create and start the processing worker
 */
export function createProcessingWorker(): Worker<ProcessingJobData, ProcessingJobResult> {
  const worker = new Worker<ProcessingJobData, ProcessingJobResult>(
    PROCESSING_QUEUE_NAME,
    async (job) => {
      switch (job.data.type) {
        case 'TRANSCRIPTION':
          return processTranscriptionJob(job);
        default:
          throw new Error(`Unknown job type: ${job.data.type}`);
      }
    },
    {
      connection: connectionOptions,
      concurrency: 2, // Process 2 jobs concurrently
      limiter: {
        max: 10,
        duration: 60000, // Max 10 jobs per minute (API rate limiting)
      },
    }
  );

  worker.on('completed', (job, result) => {
    Logger.info(`[ProcessingWorker] Job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, error) => {
    Logger.error(`[ProcessingWorker] Job ${job?.id} failed:`, error);
  });

  worker.on('error', (error) => {
    Logger.error('[ProcessingWorker] Worker error:', error);
  });

  Logger.info('[ProcessingWorker] Worker started');
  return worker;
}

export { connectionOptions as workerConnectionOptions };
