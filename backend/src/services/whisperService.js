import OpenAI from 'openai';
import { Readable } from 'stream';
import { config } from '../config.js';
import { log } from '../utils/logger.js';

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

/**
 * Transcribe audio file using Whisper API
 */
export const transcribeAudio = async (file) => {
  try {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    log.info('Starting audio transcription with Whisper API');

    // Create File-like object from multer file for OpenAI SDK
    // OpenAI SDK accepts File, Blob, or a stream
    const fileStream = Readable.from(file.buffer);
    fileStream.name = file.originalname;
    fileStream.type = file.mimetype;

    const transcription = await openai.audio.transcriptions.create({
      file: fileStream,
      model: 'whisper-1',
      response_format: 'text',
      language: 'en',
    });

    log.info('Audio transcription completed successfully');
    return transcription;
  } catch (error) {
    log.error('Error transcribing audio', error);
    throw new Error(`Failed to transcribe audio: ${error.message}`);
  }
};

/**
 * Transcribe audio file and return as JSON
 */
export const transcribeAudioJSON = async (file) => {
  try {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    log.info('Starting audio transcription with Whisper API (JSON format)');

    // Create File-like stream from multer file
    const fileStream = Readable.from(file.buffer);
    fileStream.name = file.originalname;
    fileStream.type = file.mimetype;

    const transcription = await openai.audio.transcriptions.create({
      file: fileStream,
      model: 'whisper-1',
      response_format: 'verbose_json',
      language: 'en',
    });

    log.info('Audio transcription completed successfully');
    return transcription;
  } catch (error) {
    log.error('Error transcribing audio', error);
    throw new Error(`Failed to transcribe audio: ${error.message}`);
  }
};
