import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import Logger from '../logger';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'guest-session-secret-key';
const SESSION_EXPIRY_HOURS = 24; // Guest session valid for 24 hours

// =============================================================================
// DEV MODE: BYPASS GUEST MEETING LIMITS
// Set to true during development/testing to allow unlimited meetings per guest
// TODO: Set to false before deploying to production
// =============================================================================
const DEV_MODE_BYPASS_MEETING_LIMIT = true;

/**
 * Generate a fingerprint hash for abuse prevention
 * Uses IP + user-agent to create a lightweight device fingerprint
 */
const generateDeviceFingerprint = (req: Request): string => {
  const ip = req.ip || req.socket.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';
  
  // Create a hash from IP and user agent
  const rawFingerprint = `${ip}-${userAgent}`;
  return crypto.createHash('sha256').update(rawFingerprint).digest('hex');
};

/**
 * Start a guest workflow session
 * - Creates a guest session if one doesn't exist
 * - Issues a signed JWT token
 * - Enforces one workflow per guest policy
 */
export const startGuestWorkflow = async (req: Request, res: Response): Promise<void> => {
  try {
    // Generate device fingerprint for abuse prevention
    const browserFingerprint = generateDeviceFingerprint(req);
    
    // Check if a guest session already exists for this device
    let guestSession = await prisma.guestSession.findFirst({
      where: {
        browserFingerprint,
        expiresAt: {
          gt: new Date() // Only consider non-expired sessions
        }
      }
    });

    const expirationDate = new Date();
    expirationDate.setHours(expirationDate.getHours() + SESSION_EXPIRY_HOURS);

    // If guest session exists, check if they've exhausted their workflow
    if (guestSession) {
      // If the guest has already completed a workflow, deny the request
      // DEV MODE: Skip this check if bypass is enabled
      if (!DEV_MODE_BYPASS_MEETING_LIMIT && (guestSession.usageState === 'EXHAUSTED' || guestSession.workflowCount >= 1)) {
        await prisma.guestSession.update({
          where: { id: guestSession.id },
          data: {
            usageState: 'EXHAUSTED',
            exhaustedAt: guestSession.exhaustedAt || new Date(),
            lastActiveAt: new Date()
          }
        });

        res.status(200).json({
          workflowAllowed: false,
          reason: 'GUEST_WORKFLOW_EXHAUSTED'
        });
        return;
      }
      
      // DEV MODE: Log when bypass is active
      if (DEV_MODE_BYPASS_MEETING_LIMIT && guestSession.workflowCount >= 1) {
        Logger.info(`DEV MODE: Bypassing meeting limit for guest ${guestSession.id} (workflow count: ${guestSession.workflowCount})`);
      }

      // If the guest has an active session with no workflows yet, update the session
      await prisma.guestSession.update({
        where: { id: guestSession.id },
        data: {
          lastActiveAt: new Date(),
          expiresAt: expirationDate,
          workflowCount: {
            increment: 1
          }
        }
      });
      
      // Generate signed JWT token
      const guestToken = jwt.sign(
        { guestId: guestSession.id, fingerprint: browserFingerprint },
        JWT_SECRET,
        { expiresIn: `${SESSION_EXPIRY_HOURS}h` }
      );

      res.status(200).json({
        guestSessionToken: guestToken,
        workflowId: guestSession.id,
        workflowAllowed: true,
        expiresAt: expirationDate.toISOString(),
        guestInfo: {
          id: guestSession.id,
          remainingMeetings: DEV_MODE_BYPASS_MEETING_LIMIT ? 999 : Math.max(0, 1 - guestSession.workflowCount)
        }
      });
      return;
    }

    // Create a new guest session if none exists
    const newGuestSession = await prisma.guestSession.create({
      data: {
        token: crypto.randomUUID(),
        browserFingerprint,
        expiresAt: expirationDate,
        usageState: 'ACTIVE',
        workflowCount: 1,
        metadata: { ipHash: crypto.createHash('sha256').update(req.ip || '').digest('hex') }
      }
    });

    // Generate signed JWT token
    const guestToken = jwt.sign(
      { guestId: newGuestSession.id, fingerprint: browserFingerprint },
      JWT_SECRET,
      { expiresIn: `${SESSION_EXPIRY_HOURS}h` }
    );

    res.status(200).json({
      guestSessionToken: guestToken,
      workflowId: newGuestSession.id,
      workflowAllowed: true,
      expiresAt: expirationDate.toISOString(),
      guestInfo: {
        id: newGuestSession.id,
        remainingMeetings: DEV_MODE_BYPASS_MEETING_LIMIT ? 999 : 1
      }
    });
    return;
  } catch (error) {
    Logger.error(`Error starting guest workflow: ${error}`);
    res.status(500).json({ error: 'Failed to start guest workflow' });
  }
};
