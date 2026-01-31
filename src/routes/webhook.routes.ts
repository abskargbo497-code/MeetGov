/**
 * Webhook Routes
 * 
 * Endpoints for external service webhooks (AssemblyAI, etc.)
 */

import express from 'express';
import { assemblyAIWebhook, webhookHealth } from '../controllers/webhook.controller';

const router = express.Router();

/**
 * @route   POST /api/v1/webhooks/assemblyai
 * @desc    AssemblyAI transcription completion webhook
 * @access  External (verified by webhook secret)
 */
router.post('/assemblyai', assemblyAIWebhook);

/**
 * @route   GET /api/v1/webhooks/health
 * @desc    Webhook endpoint health check
 * @access  Public
 */
router.get('/health', webhookHealth);

export default router;
