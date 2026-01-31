/**
 * Webhook Controller
 * 
 * Handles incoming webhooks from external services like AssemblyAI
 */

import { Request, Response } from 'express';
import Logger from '../logger';
import { prisma } from '../lib/prisma';
import { ASSEMBLYAI_WEBHOOK_SECRET } from '../config/assemblyai';
import {
  processTranscriptionResult,
  handleTranscriptionFailure,
  getTranscriptionResult,
} from '../services/assemblyai-transcription.service';
import { emitMeetingEvent, emitProcessingCompleted, emitProcessingFailed } from '../websocket/ws-server';

/**
 * AssemblyAI Webhook Handler
 * POST /api/v1/webhooks/assemblyai
 * 
 * Receives transcription completion notifications from AssemblyAI
 */
export async function assemblyAIWebhook(req: Request, res: Response): Promise<void> {
  try {
    // Verify webhook secret if configured
    if (ASSEMBLYAI_WEBHOOK_SECRET) {
      const receivedSecret = req.headers['x-webhook-secret'];
      if (receivedSecret !== ASSEMBLYAI_WEBHOOK_SECRET) {
        Logger.warn('[Webhook] AssemblyAI webhook received with invalid secret');
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }

    const { transcript_id, status } = req.body;

    Logger.info(`[Webhook] AssemblyAI webhook received: transcript_id=${transcript_id}, status=${status}`);

    if (!transcript_id) {
      Logger.warn('[Webhook] AssemblyAI webhook missing transcript_id');
      res.status(400).json({ error: 'Missing transcript_id' });
      return;
    }

    // Find the meeting associated with this transcript
    const aiJob = await prisma.aiJob.findFirst({
      where: { bullmqJobId: transcript_id },
      include: {
        meeting: {
          include: {
            recordings: {
              orderBy: { uploadedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!aiJob) {
      Logger.warn(`[Webhook] No AI job found for transcript_id: ${transcript_id}`);
      res.status(404).json({ error: 'Transcript not found' });
      return;
    }

    const meetingId = aiJob.meetingId;
    const recording = aiJob.meeting.recordings[0];

    if (!recording) {
      Logger.error(`[Webhook] No recording found for meeting ${meetingId}`);
      res.status(500).json({ error: 'Recording not found' });
      return;
    }

    // Handle based on status
    if (status === 'completed') {
      // Fetch the full transcript result from AssemblyAI
      const transcriptResult = await getTranscriptionResult(transcript_id);

      if (transcriptResult.status === 'completed' && transcriptResult.text) {
        // Process and save the transcription
        await processTranscriptionResult({
          meetingId,
          recordingId: recording.id,
          transcriptResult,
        });

        // Emit WebSocket event to notify frontend
        emitProcessingCompleted(meetingId);

        // Also emit a more specific transcript ready event
        emitMeetingEvent(meetingId, {
          type: 'processing:completed',
          meetingId,
          processingStatus: 'COMPLETED',
        });

        Logger.info(`[Webhook] Successfully processed transcription for meeting ${meetingId}`);
      } else {
        // Something went wrong even though status was 'completed'
        await handleTranscriptionFailure({
          meetingId,
          recordingId: recording.id,
          error: transcriptResult.error || 'Transcription completed but no text found',
          assemblyAITranscriptId: transcript_id,
        });

        emitProcessingFailed(meetingId, transcriptResult.error || 'Transcription failed');
      }
    } else if (status === 'error') {
      // Handle transcription error
      const transcriptResult = await getTranscriptionResult(transcript_id);
      
      await handleTranscriptionFailure({
        meetingId,
        recordingId: recording.id,
        error: transcriptResult.error || 'Transcription failed',
        assemblyAITranscriptId: transcript_id,
      });

      emitProcessingFailed(meetingId, transcriptResult.error || 'Transcription failed');

      Logger.error(`[Webhook] Transcription failed for meeting ${meetingId}: ${transcriptResult.error}`);
    }
    // For 'queued' or 'processing' status, we just acknowledge and wait

    res.status(200).json({ received: true });
  } catch (error) {
    Logger.error('[Webhook] Error processing AssemblyAI webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Health check for webhook endpoint
 * GET /api/v1/webhooks/health
 */
export async function webhookHealth(req: Request, res: Response): Promise<void> {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
}
