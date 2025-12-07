/**
 * Live Transcription Service
 * Handles real-time audio streaming and transcription using OpenAI Audio Input API
 * Supports chunked audio processing for live transcription
 * Uses gpt-4o-audio-preview model for transcription
 */

import OpenAI from 'openai';
import { Readable } from 'stream';
import { config } from '../config.js';
import { log } from '../utils/logger.js';

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

/**
 * Transcribe audio chunk using OpenAI Audio Transcriptions API
 * @param {Buffer} audioChunk - Audio data chunk
 * @param {string} mimeType - MIME type of audio (e.g., 'audio/webm', 'audio/mp3')
 * @returns {Promise<string>} - Transcribed text
 */
export const transcribeAudioChunk = async (audioChunk, mimeType = 'audio/webm') => {
  try {
    // Check if OpenAI API key is configured
    const apiKey = config.openaiApiKey;
    log.debug('Checking OpenAI API key', {
      hasKey: !!apiKey,
      keyLength: apiKey?.length || 0,
      keyStartsWith: apiKey?.substring(0, 7) || 'none',
      isPlaceholder: apiKey?.includes('your-openai') || false,
    });
    
    if (!apiKey || apiKey.trim() === '' || apiKey.includes('your-openai')) {
      log.warn('OpenAI API key not configured. Audio is being recorded but not transcribed.', {
        apiKeyPresent: !!apiKey,
        apiKeyLength: apiKey?.length || 0,
      });
      // Return empty string instead of throwing error - allows recording to continue
      return '';
    }

    // Validate audio chunk
    if (!audioChunk || audioChunk.length === 0) {
      log.warn('Empty audio chunk received');
      return '';
    }

    // Determine file extension and format from mimeType
    let fileExtension = 'webm';
    if (mimeType.includes('wav')) {
      fileExtension = 'wav';
    } else if (mimeType.includes('mp3') || mimeType.includes('mpeg')) {
      fileExtension = 'mp3';
    } else if (mimeType.includes('ogg')) {
      fileExtension = 'ogg';
    } else if (mimeType.includes('m4a')) {
      fileExtension = 'm4a';
    } else if (mimeType.includes('mp4')) {
      fileExtension = 'mp4';
    } else if (mimeType.includes('flac')) {
      fileExtension = 'flac';
    } else if (mimeType.includes('mpga')) {
      fileExtension = 'mpga';
    }

    log.debug('Sending audio chunk to OpenAI Audio Transcriptions API', {
      chunkSize: audioChunk.length,
      mimeType,
      fileExtension,
    });

    // Helper function to create a file-like object for OpenAI API
    // The OpenAI SDK in Node.js works best with Readable streams or File objects
    // However, Node.js File objects may not work correctly, so we'll use a stream approach
    const createAudioFile = () => {
      // Use Readable stream - this is the most reliable approach for Node.js
      // The OpenAI SDK accepts streams with a name property
      const stream = Readable.from(audioChunk);
      const fileName = `audio.${fileExtension}`;
      
      // Add name property (required by OpenAI SDK)
      Object.defineProperty(stream, 'name', {
        value: fileName,
        writable: false,
        enumerable: true,
        configurable: false,
      });
      
      // Add type property for better compatibility
      Object.defineProperty(stream, 'type', {
        value: mimeType,
        writable: false,
        enumerable: true,
        configurable: false,
      });
      
      // Add size property
      Object.defineProperty(stream, 'size', {
        value: audioChunk.length,
        writable: false,
        enumerable: true,
        configurable: false,
      });
      
      log.debug('Using Readable stream for audio upload', {
        fileName,
        fileSize: audioChunk.length,
        mimeType,
        streamType: stream.constructor.name,
        hasName: !!stream.name,
      });
      
      return stream;
    };

    // Try using gpt-4o-transcribe first (newer, better model)
    try {
      const audioFile = createAudioFile();
      
      log.debug('Calling OpenAI gpt-4o-transcribe API', {
        chunkSize: audioChunk.length,
        mimeType,
        fileExtension,
        fileType: audioFile.constructor.name,
        hasName: !!audioFile.name,
      });
      
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'gpt-4o-transcribe',
        response_format: 'json',
        language: 'en',
      });

      log.info('OpenAI API response received', {
        responseType: typeof transcription,
        responseIsString: typeof transcription === 'string',
        responseIsObject: typeof transcription === 'object',
        hasText: !!(transcription?.text),
        responseKeys: transcription ? Object.keys(transcription) : [],
        fullResponse: JSON.stringify(transcription).substring(0, 500),
      });

      // Handle different response formats
      let transcribedText = '';
      if (typeof transcription === 'string') {
        transcribedText = transcription.trim();
      } else if (transcription && typeof transcription === 'object') {
        // Check for text property
        if (transcription.text) {
          transcribedText = transcription.text.trim();
        } else if (transcription.transcript) {
          transcribedText = transcription.transcript.trim();
        } else {
          // If it's an object but no text property, log the full response
          log.warn('Unexpected response format from OpenAI', {
            transcription: JSON.stringify(transcription),
          });
        }
      }
      
      if (transcribedText) {
        log.info('Audio chunk transcribed successfully using gpt-4o-transcribe', {
          transcribedLength: transcribedText.length,
          model: 'gpt-4o-transcribe',
          preview: transcribedText.substring(0, 100),
        });
        return transcribedText;
      } else {
        log.warn('No transcription text in gpt-4o-transcribe response, falling back to whisper-1', {
          transcription: JSON.stringify(transcription).substring(0, 500),
          responseType: typeof transcription,
        });
        // Fall through to Whisper fallback
      }
    } catch (gpt4oError) {
      log.warn('gpt-4o-transcribe API error, falling back to whisper-1', {
        error: gpt4oError.message,
        errorCode: gpt4oError.code,
        errorType: gpt4oError.type,
        stack: gpt4oError.stack?.substring(0, 500),
      });
      // Fall through to Whisper fallback
    }

    // Fallback to Whisper API if gpt-4o-transcribe fails or is unavailable
    log.debug('Using Whisper API as fallback', {
      chunkSize: audioChunk.length,
      mimeType,
    });

    // Create a new file/stream for Whisper (streams can only be read once)
    const audioFile = createAudioFile();

    // Use OpenAI Whisper API as fallback
    log.debug('Calling OpenAI Whisper API as fallback', {
      chunkSize: audioChunk.length,
      mimeType,
      fileExtension,
      fileType: audioFile.constructor.name,
    });
    
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      response_format: 'text',
      language: 'en',
    });

    log.info('Whisper API response received', {
      responseType: typeof transcription,
      responseIsString: typeof transcription === 'string',
      responseIsObject: typeof transcription === 'object',
      hasText: !!(transcription?.text || (typeof transcription === 'string' && transcription)),
      responsePreview: typeof transcription === 'string' 
        ? transcription.substring(0, 200) 
        : JSON.stringify(transcription).substring(0, 200),
    });

    // Handle different response formats
    let transcribedText = '';
    if (typeof transcription === 'string') {
      transcribedText = transcription.trim();
    } else if (transcription && typeof transcription === 'object') {
      if (transcription.text) {
        transcribedText = transcription.text.trim();
      } else if (transcription.transcript) {
        transcribedText = transcription.transcript.trim();
      }
    }
    
    if (transcribedText) {
      log.info('Audio chunk transcribed successfully using Whisper fallback', {
        transcribedLength: transcribedText.length,
        model: 'whisper-1',
        preview: transcribedText.substring(0, 100),
      });
    } else {
      log.warn('No transcription text received from Whisper API', {
        responseType: typeof transcription,
        response: typeof transcription === 'string' ? transcription.substring(0, 200) : JSON.stringify(transcription).substring(0, 200),
      });
    }

    return transcribedText;
  } catch (error) {
    log.error('Error transcribing audio chunk', {
      error: error.message,
      errorCode: error.code,
      errorType: error.type,
      chunkSize: audioChunk?.length || 0,
      stack: error.stack,
    });
    
    // Don't throw error - return empty string to allow recording to continue
    // The frontend will handle the lack of transcription gracefully
    return '';
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

