/**
 * AssemblyAI Configuration
 * 
 * Client configuration for AssemblyAI transcription service
 */

import { AssemblyAI } from 'assemblyai';

if (!process.env.ASSEMBLYAI_API_KEY) {
  console.warn('[AssemblyAI] ASSEMBLYAI_API_KEY not set - transcription will fail');
}

export const assemblyAI = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY || '',
});

// Feature flag for transcription provider
export const TRANSCRIPTION_PROVIDER = process.env.TRANSCRIPTION_PROVIDER || 'assemblyai';

// Webhook configuration
export const ASSEMBLYAI_WEBHOOK_URL = `${process.env.API_BASE_URL || 'http://localhost:3001'}/api/v1/webhooks/assemblyai`;
export const ASSEMBLYAI_WEBHOOK_SECRET = process.env.ASSEMBLYAI_WEBHOOK_SECRET || '';
