import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

/**
 * Public routes — no authentication required.
 * Everything else is automatically protected by Clerk.
 */
const isPublicRoute = createRouteMatcher([
  '/',                           // Landing page
  '/auth/signin(.*)',            // Sign-in page (all variants)
  '/auth/callback(.*)',          // OAuth callback — MUST be public so Clerk can complete the flow
  '/auth/accept-invite(.*)',     // Enterprise invite acceptance
  '/create-meeting(.*)',         // Guest meeting creation
  '/attendance(.*)',             // QR code scan / check-in (page + API)
  '/join(.*)',                   // Join meeting by code
  '/meeting/(.*)',               // Live meeting room (guests can join)
  '/meetings/(.*)',              // Participant join flow
  '/api/v1/(.*)',                // All v1 API routes handle auth internally
  '/api/attendance/(.*)',        // Attendance check-in API
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Run for API routes except the recording upload (large binary — skip middleware)
    '/(api(?!/v1/recordings/upload)|trpc)(.*)',
  ],
};
