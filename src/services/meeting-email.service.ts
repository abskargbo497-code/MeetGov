/**
 * Meeting Email Service
 * 
 * Handles sending meeting invite emails to participants using SendGrid
 */

import sgMail from '@sendgrid/mail';
import Logger from '../logger';

// Initialize SendGrid with API key
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
  Logger.info('[MeetingEmail] SendGrid initialized');
} else {
  Logger.warn('[MeetingEmail] SENDGRID_API_KEY not set - emails will be mocked');
}

// Email configuration - uses environment variables
const EMAIL_FROM = process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM || 'noreply@govmeetings.app';
const APP_URL = process.env.APP_BASE_URL || process.env.APP_URL || 'http://localhost:3000';

// Use mock email only if SendGrid is not configured
const USE_MOCK_EMAIL = !SENDGRID_API_KEY;

export type ParticipantInvite = {
  email: string;
  name?: string;
};

export type MeetingInviteData = {
  meetingId: string;
  meetingTitle: string;
  accessCode: string;
  scheduledAt?: Date;
  durationMinutes: number;
  location?: string;
  organizerName?: string;
};

export type InviteResult = {
  email: string;
  success: boolean;
  error?: string;
};

/**
 * Generate the meeting join URL with access code
 */
function getMeetingJoinUrl(meetingId: string, accessCode: string): string {
  return `${APP_URL}/join?code=${accessCode}`;
}

/**
 * Generate email HTML content for meeting invite
 */
function generateInviteEmailHtml(
  participant: ParticipantInvite,
  meeting: MeetingInviteData
): string {
  const joinUrl = getMeetingJoinUrl(meeting.meetingId, meeting.accessCode);
  const greeting = participant.name ? `Hi ${participant.name},` : 'Hi,';
  
  const scheduledInfo = meeting.scheduledAt 
    ? `<p><strong>Scheduled:</strong> ${meeting.scheduledAt.toLocaleString()}</p>`
    : '<p><strong>Type:</strong> Instant Meeting</p>';
  
  const locationInfo = meeting.location 
    ? `<p><strong>Location:</strong> ${meeting.location}</p>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4F46E5; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .footer { background: #f3f4f6; padding: 15px; border-radius: 0 0 8px 8px; font-size: 12px; color: #6b7280; }
    .button { display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; }
    .code-box { background: #fff; border: 2px dashed #d1d5db; padding: 15px; text-align: center; margin: 15px 0; border-radius: 6px; }
    .access-code { font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #4F46E5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">You're Invited to a Meeting</h1>
    </div>
    <div class="content">
      ${greeting}
      <p>You've been invited to join <strong>${meeting.meetingTitle}</strong>.</p>
      
      ${scheduledInfo}
      <p><strong>Duration:</strong> ${meeting.durationMinutes} minutes</p>
      ${locationInfo}
      ${meeting.organizerName ? `<p><strong>Organizer:</strong> ${meeting.organizerName}</p>` : ''}
      
      <div class="code-box">
        <p style="margin: 0 0 10px 0;">Your Access Code:</p>
        <span class="access-code">${meeting.accessCode}</span>
      </div>
      
      <p style="text-align: center;">
        <a href="${joinUrl}" class="button">Join Meeting</a>
      </p>
      
      <p style="font-size: 14px; color: #6b7280;">
        Or visit <a href="${APP_URL}/join">${APP_URL}/join</a> and enter your access code.
      </p>
    </div>
    <div class="footer">
      <p>This meeting will be recorded and transcribed automatically.</p>
      <p>If you didn't expect this invitation, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text email content for meeting invite
 */
function generateInviteEmailText(
  participant: ParticipantInvite,
  meeting: MeetingInviteData
): string {
  const joinUrl = getMeetingJoinUrl(meeting.meetingId, meeting.accessCode);
  const greeting = participant.name ? `Hi ${participant.name},` : 'Hi,';
  
  const scheduledInfo = meeting.scheduledAt 
    ? `Scheduled: ${meeting.scheduledAt.toLocaleString()}`
    : 'Type: Instant Meeting';

  return `
${greeting}

You've been invited to join "${meeting.meetingTitle}".

${scheduledInfo}
Duration: ${meeting.durationMinutes} minutes
${meeting.location ? `Location: ${meeting.location}` : ''}
${meeting.organizerName ? `Organizer: ${meeting.organizerName}` : ''}

Your Access Code: ${meeting.accessCode}

Join the meeting: ${joinUrl}

Or visit ${APP_URL}/join and enter your access code.

---
This meeting will be recorded and transcribed automatically.
If you didn't expect this invitation, you can safely ignore this email.
  `.trim();
}

/**
 * Send a single meeting invite email
 */
async function sendInviteEmail(
  participant: ParticipantInvite,
  meeting: MeetingInviteData
): Promise<InviteResult> {
  try {
    const htmlContent = generateInviteEmailHtml(participant, meeting);
    const textContent = generateInviteEmailText(participant, meeting);
    const subject = `Meeting Invite: ${meeting.meetingTitle}`;

    if (USE_MOCK_EMAIL) {
      // Mock email sending - log the email details
      Logger.info(`[MeetingEmail] MOCK - Would send invite to ${participant.email}:`, {
        to: participant.email,
        from: EMAIL_FROM,
        subject,
        meetingId: meeting.meetingId,
        accessCode: meeting.accessCode,
      });
      
      // Simulate async email sending
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return { email: participant.email, success: true };
    }

    // Send email via SendGrid
    const msg = {
      to: participant.email,
      from: EMAIL_FROM,
      subject,
      text: textContent,
      html: htmlContent,
    };
    
    await sgMail.send(msg);
    Logger.info(`[MeetingEmail] Sent invite to ${participant.email} for meeting ${meeting.meetingId}`);
    return { email: participant.email, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    Logger.error(`[MeetingEmail] Failed to send invite to ${participant.email}:`, error);
    return { email: participant.email, success: false, error: errorMessage };
  }
}

/**
 * Send meeting invite emails to all participants
 * 
 * @param participants - Array of participant emails/names
 * @param meeting - Meeting invite data
 * @returns Array of results for each email sent
 */
export async function sendMeetingInvites(
  participants: ParticipantInvite[],
  meeting: MeetingInviteData
): Promise<InviteResult[]> {
  if (!participants || participants.length === 0) {
    Logger.info(`[MeetingEmail] No participants to invite for meeting ${meeting.meetingId}`);
    return [];
  }

  // Filter out participants without valid emails
  const validParticipants = participants.filter(p => {
    if (!p.email || !isValidEmail(p.email)) {
      Logger.warn(`[MeetingEmail] Skipping invalid email: ${p.email}`);
      return false;
    }
    return true;
  });

  if (validParticipants.length === 0) {
    Logger.info(`[MeetingEmail] No valid email addresses to send invites for meeting ${meeting.meetingId}`);
    return [];
  }

  Logger.info(`[MeetingEmail] Sending ${validParticipants.length} invites for meeting ${meeting.meetingId}`);

  // Send emails in parallel with concurrency limit
  const results: InviteResult[] = [];
  const BATCH_SIZE = 5; // Send 5 emails at a time to avoid rate limiting

  for (let i = 0; i < validParticipants.length; i += BATCH_SIZE) {
    const batch = validParticipants.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(participant => sendInviteEmail(participant, meeting))
    );
    results.push(...batchResults);
  }

  // Log summary
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;
  
  Logger.info(`[MeetingEmail] Invite summary for meeting ${meeting.meetingId}: ${successCount} sent, ${failureCount} failed`);
  
  if (failureCount > 0) {
    const failedEmails = results.filter(r => !r.success).map(r => r.email);
    Logger.warn(`[MeetingEmail] Failed to send invites to: ${failedEmails.join(', ')}`);
  }

  return results;
}

/**
 * Validate email address format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Extract participant emails from invitedParticipants JSON
 * Handles various formats: string[], {email}[], {name, email}[]
 */
export function parseParticipantsFromJson(
  invitedParticipants: unknown
): ParticipantInvite[] {
  if (!invitedParticipants) return [];
  
  if (!Array.isArray(invitedParticipants)) return [];

  return invitedParticipants
    .map((p: unknown) => {
      if (typeof p === 'string') {
        // Check if it's an email
        if (isValidEmail(p)) {
          return { email: p };
        }
        // Treat as name only - no email
        return null;
      }
      
      if (typeof p === 'object' && p !== null) {
        const obj = p as Record<string, unknown>;
        if (typeof obj.email === 'string' && isValidEmail(obj.email)) {
          return {
            email: obj.email,
            name: typeof obj.name === 'string' ? obj.name : undefined,
          };
        }
      }
      
      return null;
    })
    .filter((p): p is ParticipantInvite => p !== null);
}

export default {
  sendMeetingInvites,
  parseParticipantsFromJson,
};
