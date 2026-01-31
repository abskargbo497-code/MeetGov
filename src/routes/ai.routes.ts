/**
 * AI Routes
 * 
 * REST API endpoints for AI-powered features
 */

import express from 'express';
import { generateMeetingDraftHandler } from '../controllers/ai-assistant.controller';

const router = express.Router();

/**
 * @route   POST /api/ai/meeting-draft
 * @desc    Generate a meeting draft from natural language input
 * @access  Public (for both guest and authenticated users)
 */
router.post('/meeting-draft', generateMeetingDraftHandler);

export default router;
