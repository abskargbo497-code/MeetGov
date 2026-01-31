/**
 * AssemblyAI Transcription Service
 * 
 * Handles transcription job creation, status checking, and result processing
 * with true multi-speaker diarization support
 */

import { assemblyAI, ASSEMBLYAI_WEBHOOK_URL, ASSEMBLYAI_WEBHOOK_SECRET } from '../config/assemblyai';
import Logger from '../logger';
import { prisma } from '../lib/prisma';
import r2Storage from './r2-storage.service';

// Data retention period
const DATA_RETENTION_DAYS = 7;

export type TranscriptionJobResult = {
  transcriptId: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
};

export type AssemblyAIUtterance = {
  speaker: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
  words: Array<{
    text: string;
    start: number;
    end: number;
    confidence: number;
    speaker: string;
  }>;
};

export type AssemblyAITranscriptResult = {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  text: string | null;
  utterances: AssemblyAIUtterance[] | null;
  error: string | null;
};

/**
 * Start an AssemblyAI transcription job
 * Creates a transcription request with speaker diarization enabled
 */
export async function startAssemblyAITranscription({
  audioUrl,
  meetingId,
  useWebhook = true,
}: {
  audioUrl: string;
  meetingId: string;
  useWebhook?: boolean;
}): Promise<TranscriptionJobResult> {
  Logger.info(`[AssemblyAI] Starting transcription for meeting ${meetingId}`);

  try {
    // Generate a signed URL for the audio file if it's an R2 object key
    let publicAudioUrl = audioUrl;
    if (!audioUrl.startsWith('http')) {
      // It's an R2 object key, generate a signed URL
      const signedUrl = await r2Storage.createSignedDownloadUrl({
        objectName: audioUrl,
        contentType: 'audio/webm',
        expiresInMinutes: 60, // 1 hour should be enough for AssemblyAI to download
      });
      publicAudioUrl = signedUrl.url;
      Logger.info(`[AssemblyAI] Generated signed URL for audio file: ${publicAudioUrl.substring(0, 100)}...`);
    }

    // Create transcription request with speaker diarization
    const transcriptConfig: any = {
      audio_url: publicAudioUrl,
      speaker_labels: true,
      punctuate: true,
      format_text: true,
    };

    // Add webhook configuration if enabled
    if (useWebhook && ASSEMBLYAI_WEBHOOK_URL) {
      transcriptConfig.webhook_url = ASSEMBLYAI_WEBHOOK_URL;
      if (ASSEMBLYAI_WEBHOOK_SECRET) {
        transcriptConfig.webhook_auth_header_name = 'x-webhook-secret';
        transcriptConfig.webhook_auth_header_value = ASSEMBLYAI_WEBHOOK_SECRET;
      }
    }

    const transcript = await assemblyAI.transcripts.create(transcriptConfig);

    Logger.info(`[AssemblyAI] Transcription job created: ${transcript.id} for meeting ${meetingId}`);

    // Store the AssemblyAI transcript ID on the meeting for webhook processing
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        processingStatus: 'PROCESSING',
        processingError: null,
      },
    });

    // Create an AI job record to track the transcription
    await prisma.aiJob.create({
      data: {
        meetingId,
        type: 'SUMMARY', // We'll use SUMMARY type to track transcription jobs
        status: 'PROCESSING',
        bullmqJobId: transcript.id, // Store AssemblyAI transcript ID here
      },
    });

    return {
      transcriptId: transcript.id,
      status: transcript.status as 'queued' | 'processing' | 'completed' | 'error',
    };
  } catch (error) {
    Logger.error(`[AssemblyAI] Failed to start transcription for meeting ${meetingId}:`, error);
    throw error;
  }
}

/**
 * Poll for transcription completion (fallback when webhooks aren't available)
 */
export async function waitForTranscription(transcriptId: string): Promise<AssemblyAITranscriptResult> {
  Logger.info(`[AssemblyAI] Waiting for transcription ${transcriptId} to complete`);

  try {
    const transcript = await assemblyAI.transcripts.waitUntilReady(transcriptId, {
      pollingInterval: 3000, // Poll every 3 seconds
      pollingTimeout: 600000, // 10 minute timeout
    });

    Logger.info(`[AssemblyAI] Transcription ${transcriptId} finished with status: ${transcript.status}`);
    
    if (transcript.status === 'error') {
      Logger.error(`[AssemblyAI] Transcription error details: ${transcript.error}`);
    }

    return {
      id: transcript.id,
      status: transcript.status as 'queued' | 'processing' | 'completed' | 'error',
      text: transcript.text || null,
      utterances: transcript.utterances as AssemblyAIUtterance[] || null,
      error: transcript.error || null,
    };
  } catch (error) {
    Logger.error(`[AssemblyAI] Error waiting for transcription ${transcriptId}:`, error);
    throw error;
  }
}

/**
 * Get transcription result by ID
 */
export async function getTranscriptionResult(transcriptId: string): Promise<AssemblyAITranscriptResult> {
  Logger.info(`[AssemblyAI] Getting transcription result for ${transcriptId}`);

  try {
    const transcript = await assemblyAI.transcripts.get(transcriptId);

    return {
      id: transcript.id,
      status: transcript.status as 'queued' | 'processing' | 'completed' | 'error',
      text: transcript.text || null,
      utterances: transcript.utterances as AssemblyAIUtterance[] || null,
      error: transcript.error || null,
    };
  } catch (error) {
    Logger.error(`[AssemblyAI] Error getting transcription ${transcriptId}:`, error);
    throw error;
  }
}

/**
 * Process completed transcription and save to database
 */
export async function processTranscriptionResult({
  meetingId,
  recordingId,
  transcriptResult,
}: {
  meetingId: string;
  recordingId: string;
  transcriptResult: AssemblyAITranscriptResult;
}): Promise<{ transcriptId: string; segmentCount: number }> {
  Logger.info(`[AssemblyAI] Processing transcription result for meeting ${meetingId}`);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + DATA_RETENTION_DAYS);

  try {
    // Create main transcript record
    const transcript = await prisma.transcript.create({
      data: {
        meetingId,
        content: transcriptResult.text || '',
        language: 'en',
        source: 'AI',
        expiresAt,
      },
    });

    // Process utterances (speaker-labeled segments)
    let segmentCount = 0;
    
    if (transcriptResult.utterances && transcriptResult.utterances.length > 0) {
      const segmentData = transcriptResult.utterances.map((utterance) => ({
        meetingId,
        speakerLabel: `SPEAKER_${utterance.speaker}`,
        text: utterance.text.trim(),
        startTime: utterance.start / 1000, // Convert ms to seconds
        endTime: utterance.end / 1000,
        confidence: utterance.confidence,
      }));

      // Insert segments
      for (const seg of segmentData) {
        await prisma.$executeRaw`
          INSERT INTO "TranscriptSegment" ("id", "meetingId", "speakerLabel", "text", "startTime", "endTime", "confidence", "createdAt")
          VALUES (gen_random_uuid(), ${seg.meetingId}, ${seg.speakerLabel}, ${seg.text}, ${seg.startTime}, ${seg.endTime}, ${seg.confidence}, NOW())
        `;
      }

      segmentCount = segmentData.length;
      Logger.info(`[AssemblyAI] Created ${segmentCount} transcript segments for meeting ${meetingId}`);
    }

    // Update recording status
    await prisma.recording.update({
      where: { id: recordingId },
      data: { processingStatus: 'COMPLETED' },
    });

    // Update meeting status
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        processingStatus: 'COMPLETED',
        processingError: null,
      },
    });

    // Update AI job status
    await prisma.aiJob.updateMany({
      where: {
        meetingId,
        bullmqJobId: transcriptResult.id,
      },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    Logger.info(`[AssemblyAI] Successfully processed transcription for meeting ${meetingId}`);

    return {
      transcriptId: transcript.id,
      segmentCount,
    };
  } catch (error) {
    Logger.error(`[AssemblyAI] Error processing transcription result for meeting ${meetingId}:`, error);
    throw error;
  }
}

/**
 * Handle transcription failure
 */
export async function handleTranscriptionFailure({
  meetingId,
  recordingId,
  error,
  assemblyAITranscriptId,
}: {
  meetingId: string;
  recordingId: string;
  error: string;
  assemblyAITranscriptId?: string;
}): Promise<void> {
  Logger.error(`[AssemblyAI] Transcription failed for meeting ${meetingId}: ${error}`);

  try {
    // Update meeting status
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        processingStatus: 'FAILED',
        processingError: error,
      },
    });

    // Update recording status
    await prisma.recording.update({
      where: { id: recordingId },
      data: { processingStatus: 'FAILED' },
    });

    // Update AI job status if we have the transcript ID
    if (assemblyAITranscriptId) {
      await prisma.aiJob.updateMany({
        where: {
          meetingId,
          bullmqJobId: assemblyAITranscriptId,
        },
        data: {
          status: 'FAILED',
          errorMessage: error,
        },
      });
    }
  } catch (updateError) {
    Logger.error(`[AssemblyAI] Error updating failure status for meeting ${meetingId}:`, updateError);
  }
}

/**
 * Retry transcription for a failed meeting
 * Clears failure state and re-queues the transcription job
 */
export async function retryTranscription({
  meetingId,
  audioUrl,
}: {
  meetingId: string;
  audioUrl: string;
}): Promise<TranscriptionJobResult> {
  Logger.info(`[AssemblyAI] Retrying transcription for meeting ${meetingId}`);

  try {
    // Clear failure state
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        processingStatus: 'PROCESSING',
        processingError: null,
      },
    });

    // Get the recording
    const recording = await prisma.recording.findFirst({
      where: { meetingId },
      orderBy: { uploadedAt: 'desc' },
    });

    if (recording) {
      await prisma.recording.update({
        where: { id: recording.id },
        data: { processingStatus: 'PROCESSING' },
      });
    }

    // Start new transcription
    return startAssemblyAITranscription({
      audioUrl,
      meetingId,
      useWebhook: false,
    });
  } catch (error) {
    Logger.error(`[AssemblyAI] Retry failed for meeting ${meetingId}:`, error);
    throw error;
  }
}

/**
 * Check if AssemblyAI is properly configured
 */
export function isAssemblyAIConfigured(): boolean {
  return !!process.env.ASSEMBLYAI_API_KEY && process.env.ASSEMBLYAI_API_KEY !== 'your_assemblyai_api_key_here';
}
