/**
 * Email Service
 * 
 * Handles sending emails via SendGrid
 */

import sgMail from '@sendgrid/mail';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@meetassist.com';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

interface EnterpriseInviteEmailParams {
  to: string;
  inviteeName: string;
  organizationName: string;
  inviterName: string;
  role: string;
  inviteToken: string;
}

export const sendEnterpriseInviteEmail = async (params: EnterpriseInviteEmailParams): Promise<void> => {
  const { to, inviteeName, organizationName, inviterName, role, inviteToken } = params;
  
  const inviteUrl = `${APP_BASE_URL}/auth/accept-invite?token=${inviteToken}`;
  
  const roleDisplayName = {
    ADMIN: 'Administrator',
    ORGANIZER: 'Organizer',
    ASSIGNEE: 'Participant',
  }[role] || role;

  const msg = {
    to,
    from: FROM_EMAIL,
    subject: `You've been invited to join ${organizationName} on MeetAssist`,
    text: `
Hello${inviteeName ? ` ${inviteeName}` : ''},

${inviterName} has invited you to join ${organizationName} on MeetAssist as a ${roleDisplayName}.

Click the link below to accept the invitation:
${inviteUrl}

This invitation will expire in 7 days.

If you didn't expect this invitation, you can safely ignore this email.

Best regards,
The MeetAssist Team
    `.trim(),
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">You're Invited!</h1>
  </div>
  
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px;">Hello${inviteeName ? ` <strong>${inviteeName}</strong>` : ''},</p>
    
    <p style="font-size: 16px;">
      <strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> on MeetAssist as a <strong>${roleDisplayName}</strong>.
    </p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${inviteUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block;">
        Accept Invitation
      </a>
    </div>
    
    <p style="font-size: 14px; color: #6b7280;">
      This invitation will expire in 7 days.
    </p>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
    
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
      If you didn't expect this invitation, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
    `.trim(),
  };

  if (!SENDGRID_API_KEY) {
    console.log('[Email Service] SendGrid not configured. Would send email:', {
      to,
      subject: msg.subject,
      inviteUrl,
    });
    return;
  }

  try {
    await sgMail.send(msg);
    console.log(`[Email Service] Invite email sent to ${to}`);
  } catch (error: unknown) {
    const err = error as Error & { response?: { body?: unknown } };
    console.error('[Email Service] Failed to send email:', err.response?.body || err.message);
    throw error;
  }
};
