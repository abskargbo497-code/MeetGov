import OpenAI from 'openai';
import { config } from '../config.js';
import { log } from '../utils/logger.js';

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

/**
 * Summarize transcript
 */
export const summarizeTranscript = async (transcriptText) => {
  try {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    log.info('Generating transcript summary');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a professional meeting minutes assistant. Summarize the following meeting transcript in a clear and concise manner.',
        },
        {
          role: 'user',
          content: `Please summarize the following meeting transcript:\n\n${transcriptText}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const summary = completion.choices[0].message.content;
    log.info('Transcript summary generated successfully');
    return summary;
  } catch (error) {
    log.error('Error summarizing transcript', error);
    throw new Error(`Failed to summarize transcript: ${error.message}`);
  }
};

/**
 * Extract action items from transcript
 */
export const extractActionItems = async (transcriptText) => {
  try {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    log.info('Extracting action items from transcript');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a professional meeting minutes assistant. Extract action items from the meeting transcript and return them as a JSON array. Each action item should have: title, description, assigned_to (name or "TBD"), and suggested_deadline (date string or null).',
        },
        {
          role: 'user',
          content: `Extract action items from the following meeting transcript:\n\n${transcriptText}`,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const response = JSON.parse(completion.choices[0].message.content);
    const actionItems = response.action_items || [];
    
    log.info(`Extracted ${actionItems.length} action items`);
    return actionItems;
  } catch (error) {
    log.error('Error extracting action items', error);
    throw new Error(`Failed to extract action items: ${error.message}`);
  }
};

/**
 * Format meeting minutes
 */
export const formatMeetingMinutes = async (meeting, transcript, summary, actionItems) => {
  try {
    log.info('Formatting meeting minutes');

    const minutes = `
MEETING MINUTES

Title: ${meeting.title}
Date: ${new Date(meeting.datetime).toLocaleDateString()}
Time: ${new Date(meeting.datetime).toLocaleTimeString()}
Location: ${meeting.location || 'N/A'}

SUMMARY
${summary}

ACTION ITEMS
${actionItems.map((item, index) => `
${index + 1}. ${item.title}
   Description: ${item.description || 'N/A'}
   Assigned to: ${item.assigned_to || 'TBD'}
   Deadline: ${item.suggested_deadline || 'TBD'}
`).join('')}

FULL TRANSCRIPT
${transcript}
`;

    log.info('Meeting minutes formatted successfully');
    return minutes;
  } catch (error) {
    log.error('Error formatting meeting minutes', error);
    throw new Error(`Failed to format meeting minutes: ${error.message}`);
  }
};
