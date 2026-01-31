/**
 * Auth Routes
 * 
 * Handles BetterAuth authentication routes with Express adapter
 */

import { Router, Request, Response } from 'express';
import { auth } from '../lib/auth';
import { toNodeHandler } from 'better-auth/node';

const router = Router();

// BetterAuth handles all auth routes under /api/auth/*
// This includes: /api/auth/signin/google, /api/auth/callback/google, /api/auth/session, etc.
const authHandler = toNodeHandler(auth);

// Catch all auth routes and pass to BetterAuth handler
router.all('/*path', (req: Request, res: Response) => {
  // Prepend /api/auth to the URL for BetterAuth to recognize the route
  req.url = `/api/auth${req.url}`;
  authHandler(req, res);
});

export default router;
