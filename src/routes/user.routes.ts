/**
 * User Routes
 * 
 * Handles user-related endpoints
 */

import { Router } from 'express';
import { getCurrentUser, checkEnterpriseOnboardingStatus } from '../controllers/user.controller';

const router = Router();

// GET /api/users/me - Get current authenticated user info
router.get('/me', getCurrentUser);

// GET /api/users/onboarding-status - Check enterprise onboarding status
router.get('/onboarding-status', checkEnterpriseOnboardingStatus);

export default router;
