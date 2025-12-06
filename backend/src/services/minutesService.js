import OpenAI from 'openai';
import { config } from '../config.js';
import { log } from '../utils/logger.js';

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

/**
 * Structured summary format for meeting minutes
 */
const SUMMARY_STRUCTURE = {
  abstract: 'A brief overview of the meeting in 2-3 sentences',
  key_points: ['Array of key discussion points'],
  decisions: ['Array of decisions made during the meeting'],
  action_items: [
    {
      title: 'Action item title',
      description: 'Detailed description',
      assigned_to: 'Name or TBD',
      deadline: 'Date string or null',
    },
  ],
};

/**
 * Generate structured summary using GPT-4o-mini
 * Returns: { abstract, key_points, decisions, action_items }
 */
export const generateStructuredSummary = async (transcriptText, meetingTitle = 'Meeting') => {
  try {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    log.info('Generating structured meeting summary with GPT-4o-mini');

    const systemPrompt = `You are a professional meeting minutes assistant. Analyze the meeting transcript and generate a structured summary in JSON format with the following structure:
{
  "abstract": "A brief 2-3 sentence overview of the meeting",
  "key_points": ["Key discussion point 1", "Key discussion point 2", ...],
  "decisions": ["Decision made 1", "Decision made 2", ...],
  "action_items": [
    {
      "title": "Action item title",
      "description": "Detailed description",
      "assigned_to": "Person name or 'TBD'",
      "deadline": "YYYY-MM-DD or null"
    }
  ]
}

Be concise but comprehensive. Extract all important information.`;

    const userPrompt = `Meeting Title: ${meetingTitle}

Transcript:
${transcriptText}

Please analyze this transcript and generate the structured summary. Return ONLY valid JSON, no markdown formatting.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const summaryJson = JSON.parse(completion.choices[0].message.content);
    
    // Validate structure
    const structuredSummary = {
      abstract: summaryJson.abstract || 'No summary available',
      key_points: Array.isArray(summaryJson.key_points) ? summaryJson.key_points : [],
      decisions: Array.isArray(summaryJson.decisions) ? summaryJson.decisions : [],
      action_items: Array.isArray(summaryJson.action_items) ? summaryJson.action_items : [],
    };

    log.info('Structured summary generated successfully', {
      keyPoints: structuredSummary.key_points.length,
      decisions: structuredSummary.decisions.length,
      actionItems: structuredSummary.action_items.length,
    });

    return structuredSummary;
  } catch (error) {
    log.error('Error generating structured summary', error);
    throw new Error(`Failed to generate structured summary: ${error.message}`);
  }
};

/**
 * Summarize transcript (legacy method - returns plain text)
 * @deprecated Use generateStructuredSummary instead
 */
export const summarizeTranscript = async (transcriptText) => {
  try {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    log.info('Generating transcript summary');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
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
 * Extract action items from transcript using GPT-4o-mini
 * Returns array of action items
 */
export const extractActionItems = async (transcriptText) => {
  try {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    log.info('Extracting action items from transcript');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a professional meeting minutes assistant. Extract action items from the meeting transcript and return them as a JSON object with an "action_items" array. Each action item should have: title (string), description (string), assigned_to (name or "TBD"), and deadline (date string in YYYY-MM-DD format or null).',
        },
        {
          role: 'user',
          content: `Extract action items from the following meeting transcript:\n\n${transcriptText}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    });

    const response = JSON.parse(completion.choices[0].message.content);
    const actionItems = Array.isArray(response.action_items) ? response.action_items : [];
    
    log.info(`Extracted ${actionItems.length} action items`);
    return actionItems;
  } catch (error) {
    log.error('Error extracting action items', error);
    throw new Error(`Failed to extract action items: ${error.message}`);
  }
};

/**
 * Format meeting minutes with structured summary
 */
export const formatMeetingMinutes = async (meeting, transcript, structuredSummary, actionItems) => {
  try {
    log.info('Formatting meeting minutes');

    const formatDate = (date) => {
      return new Date(date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    };

    const formatTime = (date) => {
      return new Date(date).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    let minutes = `# MEETING MINUTES\n\n`;
    minutes += `**Title:** ${meeting.title}\n`;
    minutes += `**Date:** ${formatDate(meeting.datetime)}\n`;
    minutes += `**Time:** ${formatTime(meeting.datetime)}\n`;
    minutes += `**Location:** ${meeting.location || 'N/A'}\n`;
    if (meeting.participants && meeting.participants.length > 0) {
      minutes += `**Participants:** ${meeting.participants.join(', ')}\n`;
    }
    minutes += `\n---\n\n`;

    // Abstract/Summary
    minutes += `## SUMMARY\n\n${structuredSummary?.abstract || 'No summary available'}\n\n`;

    // Key Points
    if (structuredSummary?.key_points && structuredSummary.key_points.length > 0) {
      minutes += `## KEY POINTS\n\n`;
      structuredSummary.key_points.forEach((point, index) => {
        minutes += `${index + 1}. ${point}\n`;
      });
      minutes += `\n`;
    }

    // Decisions
    if (structuredSummary?.decisions && structuredSummary.decisions.length > 0) {
      minutes += `## DECISIONS MADE\n\n`;
      structuredSummary.decisions.forEach((decision, index) => {
        minutes += `${index + 1}. ${decision}\n`;
      });
      minutes += `\n`;
    }

    // Action Items
    const allActionItems = actionItems || structuredSummary?.action_items || [];
    if (allActionItems.length > 0) {
      minutes += `## ACTION ITEMS\n\n`;
      allActionItems.forEach((item, index) => {
        minutes += `### ${index + 1}. ${item.title || 'Untitled'}\n`;
        if (item.description) minutes += `   **Description:** ${item.description}\n`;
        minutes += `   **Assigned to:** ${item.assigned_to || item.assignedTo || 'TBD'}\n`;
        const deadline = item.deadline || item.suggested_deadline;
        minutes += `   **Deadline:** ${deadline || 'TBD'}\n\n`;
      });
    }

    minutes += `---\n\n`;
    minutes += `## FULL TRANSCRIPT\n\n${transcript}\n`;

    log.info('Meeting minutes formatted successfully');
    return minutes;
  } catch (error) {
    log.error('Error formatting meeting minutes', error);
    throw new Error(`Failed to format meeting minutes: ${error.message}`);
  }
};
