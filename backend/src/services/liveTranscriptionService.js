/**
 * Live Transcription Service
 * Handles real-time audio streaming and transcription using OpenAI Whisper
 * Supports chunked audio processing for live transcription
 */

import OpenAI from 'openai';
import { Readable } from 'stream';
import { config } from '../config.js';
import { log } from '../utils/logger.js';

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

/**
 * Transcribe audio chunk in real-time
 * @param {Buffer} audioChunk - Audio data chunk
 * @param {string} mimeType - MIME type of audio (e.g., 'audio/webm', 'audio/mp3')
 * @returns {Promise<string>} - Transcribed text
 */
export const transcribeAudioChunk = async (audioChunk, mimeType = 'audio/webm') => {
  try {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Create a Readable stream from the audio chunk buffer
    const audioStream = Readable.from(audioChunk);
    audioStream.name = `chunk-${Date.now()}.webm`;
    audioStream.type = mimeType;

    // Use OpenAI Whisper API for transcription
    const transcription = await openai.audio.transcriptions.create({
      file: audioStream,
      model: 'whisper-1',
      response_format: 'text',
      language: 'en',
    });

    return transcription.trim();
  } catch (error) {
    log.error('Error transcribing audio chunk', {
      error: error.message,
      chunkSize: audioChunk.length,
    });
    throw new Error(`Failed to transcribe audio chunk: ${error.message}`);
  }
};

/**
 * Generate real-time AI summary from accumulated transcript
 * @param {string} transcriptText - Accumulated transcript text
 * @param {string} meetingTitle - Meeting title
 * @returns {Promise<Object>} - Summary object with key points and insights
 */
export const generateRealtimeSummary = async (transcriptText, meetingTitle = 'Meeting') => {
  try {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    if (!transcriptText || transcriptText.trim().length < 50) {
      // Not enough text for meaningful summary
      return {
        keyPoints: [],
        decisions: [],
        sentiment: 'neutral',
        insights: 'Transcription in progress...',
      };
    }

    log.info('Generating real-time summary', {
      transcriptLength: transcriptText.length,
    });

    const systemPrompt = `You are a real-time meeting assistant. Analyze the ongoing meeting transcript and provide:
1. Key discussion points (top 3-5)
2. Decisions made so far
3. Overall sentiment (positive, neutral, or negative)
4. Brief insights (1-2 sentences)

Keep responses concise and update as the meeting progresses.`;

    const userPrompt = `Meeting: ${meetingTitle}

Current Transcript:
${transcriptText}

Provide a brief real-time analysis in JSON format:
{
  "keyPoints": ["point1", "point2"],
  "decisions": ["decision1"],
  "sentiment": "positive|neutral|negative",
  "insights": "Brief insight text"
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const summary = JSON.parse(completion.choices[0].message.content);

    return {
      keyPoints: summary.keyPoints || [],
      decisions: summary.decisions || [],
      sentiment: summary.sentiment || 'neutral',
      insights: summary.insights || 'Analysis in progress...',
    };
  } catch (error) {
    log.error('Error generating real-time summary', {
      error: error.message,
    });
    return {
      keyPoints: [],
      decisions: [],
      sentiment: 'neutral',
      insights: 'Unable to generate insights at this time.',
    };
  }
};

/**
 * Extract action items from transcript in real-time
 * @param {string} transcriptText - Current transcript text
 * @returns {Promise<Array>} - Array of action items
 */
export const extractRealtimeActionItems = async (transcriptText) => {
  try {
    if (!transcriptText || transcriptText.trim().length < 50) {
      return [];
    }

    const systemPrompt = `Extract action items from the meeting transcript. Return a JSON object with an "actionItems" array property:
{
  "actionItems": [
    {
      "title": "Action item title",
      "description": "Description",
      "assigned_to": "Name or TBD",
      "deadline": "YYYY-MM-DD or null"
    }
  ]
}

Return an empty array if no action items are found.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: transcriptText },
      ],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(completion.choices[0].message.content);
    
    // Handle both possible response formats for robustness
    if (Array.isArray(result)) {
      // If AI returns array directly (shouldn't happen with json_object, but handle it)
      return result;
    } else if (Array.isArray(result.actionItems)) {
      // Expected format: object with actionItems property
      return result.actionItems;
    } else if (result.actionItems && typeof result.actionItems === 'object') {
      // Handle case where actionItems might be a single object instead of array
      return [result.actionItems];
    }
    
    // Fallback: return empty array
    log.warn('Unexpected action items response format', { result });
    return [];
  } catch (error) {
    log.error('Error extracting real-time action items', {
      error: error.message,
    });
    return [];
  }
};

export default {
  transcribeAudioChunk,
  generateRealtimeSummary,
  extractRealtimeActionItems,
};

