import express from 'express';
import { startGuestWorkflow } from '../controllers/guest.controller';

const router = express.Router();

/**
 * @route   POST /guest/workflow/start
 * @desc    Start a guest workflow session
 * @access  Public
 */
router.post('/workflow/start', startGuestWorkflow);

export default router;
