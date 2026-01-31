/**
 * Artifact Routes
 * 
 * Routes for transcript and AI artifact endpoints
 */

import express from 'express';
import {
  getTranscript,
  getArtifacts,
  generateSummary,
  generateMinutes,
  generateActionItems,
  generateArtifact,
  updateArtifact,
  getArtifact,
  exportArtifact,
  getArtifactsStatus,
  retryArtifact,
  generateAllArtifacts,
  getMeetingUserAccessLevel
} from '../controllers/artifact.controller';

const router = express.Router();

/**
 * @route   GET /meetings/:meetingId/transcript
 * @desc    Get transcript segments for a meeting
 * @access  Public
 */
router.get('/meetings/:meetingId/transcript', getTranscript);

/**
 * @route   GET /meetings/:meetingId/artifacts
 * @desc    Get all artifacts for a meeting
 * @access  Public
 */
router.get('/meetings/:meetingId/artifacts', getArtifacts);

/**
 * @route   POST /meetings/:meetingId/ai/summary
 * @desc    Generate AI summary for a meeting
 * @access  Public
 */
router.post('/meetings/:meetingId/ai/summary', generateSummary);

/**
 * @route   POST /meetings/:meetingId/ai/minutes
 * @desc    Generate AI meeting minutes
 * @access  Public
 */
router.post('/meetings/:meetingId/ai/minutes', generateMinutes);

/**
 * @route   POST /meetings/:meetingId/ai/action-items
 * @desc    Generate AI action items
 * @access  Public
 */
router.post('/meetings/:meetingId/ai/action-items', generateActionItems);

/**
 * @route   GET /artifacts/:artifactId
 * @desc    Get a single artifact by ID
 * @access  Public
 */
router.get('/artifacts/:artifactId', getArtifact);

/**
 * @route   PUT /artifacts/:artifactId
 * @desc    Update artifact content (for user edits)
 * @access  Public
 */
router.put('/artifacts/:artifactId', updateArtifact);

/**
 * @route   GET /artifacts/:artifactId/export
 * @desc    Export artifact in txt or md format
 * @access  Public
 */
router.get('/artifacts/:artifactId/export', exportArtifact);

/**
 * @route   POST /meetings/:meetingId/artifacts/generate
 * @desc    Generate artifact by type (unified endpoint)
 * @access  Public
 */
router.post('/meetings/:meetingId/artifacts/generate', generateArtifact);

/**
 * @route   GET /meetings/:meetingId/artifacts/status
 * @desc    Get artifacts status for polling
 * @access  Public
 */
router.get('/meetings/:meetingId/artifacts/status', getArtifactsStatus);

/**
 * @route   POST /meetings/:meetingId/artifacts/:type/retry
 * @desc    Retry a failed artifact generation
 * @access  Public
 */
router.post('/meetings/:meetingId/artifacts/:type/retry', retryArtifact);

/**
 * @route   POST /meetings/:meetingId/artifacts/generate-all
 * @desc    Trigger all artifacts generation
 * @access  Public
 */
router.post('/meetings/:meetingId/artifacts/generate-all', generateAllArtifacts);

/**
 * @route   GET /meetings/:meetingId/access-level
 * @desc    Get user's access level for a meeting (for frontend read-only mode detection)
 * @access  Public
 */
router.get('/meetings/:meetingId/access-level', getMeetingUserAccessLevel);

export default router;
