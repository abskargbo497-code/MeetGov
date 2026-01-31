import { OpenAI } from 'openai';
import Logger from '../logger';

// Define types
export type MeetingDraft = {
  title: string;
  meetingType: 'INSTANT' | 'SCHEDULED';
  scheduledAt?: string;
  durationMinutes: number;
  participants?: Array<{
    name?: string;
    email?: string;
  }>;
  location?: string;
};

// Initialize OpenAI
let openai: OpenAI;

try {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  Logger.info('OpenAI service initialized');
} catch (error) {
  Logger.error('Failed to initialize OpenAI service:', error);
}

/**
 * Generate a meeting draft using OpenAI
 * @param input Natural language description of the meeting
 * @returns Promise resolving to structured meeting draft
 */
export async function generateMeetingDraft(input: string): Promise<MeetingDraft> {
  try {
    if (!input || input.trim() === '') {
      Logger.error('Empty input provided to generateMeetingDraft');
      throw new Error('Meeting description is required');
    }

    if (!openai) {
      Logger.error('OpenAI client is not initialized');
      throw new Error('AI service is not available');
    }
    
    Logger.info(`Generating meeting draft from: ${input}`);
    Logger.debug('API Key status:', {
      exists: !!process.env.OPENAI_API_KEY,
      length: process.env.OPENAI_API_KEY?.length || 0
    });
    
    // Set a timeout for the OpenAI API call
    const timeoutMs = 25000; // 25 seconds
    
    // Create a promise that rejects after the timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('OpenAI API request timed out')), timeoutMs);
    });
    
    // Create the completion with GPT-4 with a race against timeout
    const responsePromise = openai.chat.completions.create({
      model: "gpt-4o-mini", // Use GPT-4o-mini as mentioned in the frontend comments
      messages: [
        {
          role: "system",
          content: 
            "You are an AI assistant that helps extract meeting details from natural language. " +
            "Convert user input into structured meeting information. " +
            "IMPORTANT RULES for determining meeting type:\n" +
            "- If the user provides ANY specific date, time, or scheduling reference (e.g., 'tomorrow', 'next Monday', 'at 3pm', 'in 2 hours'), set isScheduled to TRUE\n" +
            "- If the user does NOT provide any date or time, set isScheduled to FALSE (this means it's an instant meeting)\n" +
            "You MUST follow this format for your JSON response:\n" +
            "{\n" +
            "  \"title\": \"Meeting title\",\n" +
            "  \"isScheduled\": true/false,\n" +
            "  \"scheduledAt\": \"ISO date string or null\",\n" +
            "  \"durationMinutes\": 30,\n" +
            "  \"participants\": [{\"name\": \"Person 1\"}, {\"name\": \"Person 2\"}],\n" +
            "  \"location\": \"Location or null\"\n" +
            "}\n"
        },
        {
          role: "user",
          content: input
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2, // Lower temperature for more predictable responses
      // Using standard options without timeout as it's not supported in the API
    });

    // Race between the API call and the timeout
    const response = await Promise.race([responsePromise, timeoutPromise]) as any;
    Logger.info('Received response from OpenAI');

    // Use type assertion to handle the response
    const responseText = response?.choices?.[0]?.message?.content;
    if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
      Logger.error('Unexpected OpenAI response format:', response);
      throw new Error('Invalid response format from OpenAI');
    }
    
    if (!responseText) {
      Logger.error('Empty content in OpenAI response');
      throw new Error('Empty response from OpenAI');
    }
    
    Logger.debug('OpenAI response:', responseText);
    
    try {
      // Parse the JSON response
      const parsedResponse = JSON.parse(responseText);
      
      // Validate required fields
      if (!parsedResponse.title) {
        Logger.warn('Missing title in OpenAI response');
      }
      
      // Map the OpenAI response to our MeetingDraft structure with defaults
      const meetingDraft: MeetingDraft = {
        title: parsedResponse.title || "Untitled Meeting",
        meetingType: parsedResponse.isScheduled ? 'SCHEDULED' : 'INSTANT',
        durationMinutes: parsedResponse.durationMinutes || 30,
        participants: Array.isArray(parsedResponse.participants) ? parsedResponse.participants : [],
        location: parsedResponse.location || undefined
      };
      
      // Handle date if it's a scheduled meeting
      if (meetingDraft.meetingType === 'SCHEDULED' && parsedResponse.scheduledAt) {
        try {
          // Validate the date
          const date = new Date(parsedResponse.scheduledAt);
          if (isNaN(date.getTime())) {
            Logger.warn('Invalid date in OpenAI response');
          } else {
            meetingDraft.scheduledAt = date.toISOString();
          }
        } catch (dateError) {
          Logger.error('Error parsing date:', dateError);
        }
      }

      Logger.info('Successfully generated meeting draft');
      return meetingDraft;
    } catch (parseError) {
      Logger.error('Failed to parse OpenAI response JSON:', parseError);
      // Create a fallback meeting draft
      return {
        title: "Meeting from: " + input.substring(0, 20) + "...",
        meetingType: 'INSTANT',
        durationMinutes: 30,
        participants: []
      };
    }
  } catch (error: any) {
    Logger.error('Error generating meeting draft with OpenAI:', error);
    if (error.message === 'OpenAI API request timed out') {
      throw new Error('AI service timed out. Please try again.');
    } else if (error.status === 401) {
      throw new Error('Authentication error with AI service');
    } else if (error.status >= 500) {
      throw new Error('AI service unavailable. Please try again later.');
    } else {
      throw new Error('Failed to generate meeting draft');
    }
  }
}
