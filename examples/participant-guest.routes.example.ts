/**
 * PARTICIPANT GUEST ROUTES EXAMPLE
 * 
 * Demonstrates how to set up routes for participants in guest meetings.
 * 
 * STRICT RULES:
 * - Participants may ONLY access 3 routes
 * - All other routes return 403 Forbidden
 * - Use enforceParticipantRouteAccess globally or blockParticipantAccess on protected routes
 */

import { Router } from 'express';
import { 
    resolveIdentity, 
    enforceSingleIdentity, 
    attachContext,
    requireParticipantContext,
} from '../middlewares/auth';
import { 
    enforceParticipantRouteAccess,
    requireParticipantForRoute,
    blockParticipantAccess,
} from '../middlewares/participant-route-guard.middleware';
import * as ParticipantGuestMeetingController from '../controllers/participant-guest-meeting.controller';

const router = Router();

// OPTION 1: Global participant route enforcement
// Apply this middleware to all routes to automatically block participants from unauthorized routes
router.use(enforceParticipantRouteAccess);

// ============================================================================
// ALLOWED ROUTES FOR PARTICIPANTS
// ============================================================================

/**
 * View waiting room (ALLOWED)
 * Route: /guest/meeting/:id/waiting-room
 */
router.get('/guest/meeting/:id/waiting-room',
    resolveIdentity,
    enforceSingleIdentity,
    attachContext,
    requireParticipantForRoute,
    ParticipantGuestMeetingController.viewWaitingRoom
);

/**
 * Scan QR code (ALLOWED)
 * Route: /attendance/scan
 */
router.post('/attendance/scan',
    resolveIdentity,
    enforceSingleIdentity,
    attachContext,
    requireParticipantForRoute,
    ParticipantGuestMeetingController.scanQRCode
);

/**
 * Fill attendance form (ALLOWED)
 * Route: /attendance/form
 */
router.post('/attendance/form',
    resolveIdentity,
    enforceSingleIdentity,
    attachContext,
    requireParticipantForRoute,
    ParticipantGuestMeetingController.fillAttendanceForm
);

// ============================================================================
// BLOCKED ROUTES FOR PARTICIPANTS
// ============================================================================

/**
 * Example: Meeting details (BLOCKED for participants)
 * Use blockParticipantAccess to explicitly block participants
 */
router.get('/meetings/:id',
    resolveIdentity,
    enforceSingleIdentity,
    attachContext,
    blockParticipantAccess, // Participants get 403
    // ... other middleware and controller
);

/**
 * Example: Download artifacts (BLOCKED for participants)
 */
router.get('/meetings/:id/artifacts',
    resolveIdentity,
    enforceSingleIdentity,
    attachContext,
    blockParticipantAccess, // Participants get 403
    // ... other middleware and controller
);

/**
 * Example: Create meeting (BLOCKED for participants)
 */
router.post('/meetings',
    resolveIdentity,
    enforceSingleIdentity,
    attachContext,
    blockParticipantAccess, // Participants get 403
    // ... other middleware and controller
);

/**
 * Example: List meetings (BLOCKED for participants)
 */
router.get('/meetings',
    resolveIdentity,
    enforceSingleIdentity,
    attachContext,
    blockParticipantAccess, // Participants get 403
    // ... other middleware and controller
);

/**
 * Example: Get summaries (BLOCKED for participants)
 */
router.get('/meetings/:id/summaries',
    resolveIdentity,
    enforceSingleIdentity,
    attachContext,
    blockParticipantAccess, // Participants get 403
    // ... other middleware and controller
);

/**
 * Example: Get transcripts (BLOCKED for participants)
 */
router.get('/meetings/:id/transcripts',
    resolveIdentity,
    enforceSingleIdentity,
    attachContext,
    blockParticipantAccess, // Participants get 403
    // ... other middleware and controller
);

export default router;
