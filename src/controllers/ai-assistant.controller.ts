import { Request, Response } from 'express';
import { generateMeetingDraft } from '../services/ai-assistant.service';
import Logger from '../logger';

/**
 * Generate a meeting draft based on natural language input
 * @route POST /api/v1/ai/generate-meeting
 */
export async function generateMeetingDraftHandler(req: Request, res: Response) {
  try {
    const { input, guestSessionToken, workflowId } = req.body;
    
    if (!input) {
      return res.status(400).json({
        success: false,
        error: 'Meeting description input is required'
      });
    }
    
    // Log the request with session info
    Logger.info(`AI meeting draft request with token: ${guestSessionToken ? '[TOKEN EXISTS]' : 'none'} and workflow: ${workflowId || 'none'}`);
    
    // Generate meeting draft using AI service
    const draft = await generateMeetingDraft(input);
    
    // Return the result
    return res.status(200).json({
      success: true,
      draft
    });
  } catch (error: any) {
    Logger.error('Error in generate meeting draft endpoint:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate meeting draft'
    });
  }
}
