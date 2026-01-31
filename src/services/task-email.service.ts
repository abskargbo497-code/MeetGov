/**
 * Task Email Service
 * 
 * Handles sending task-related email notifications via SendGrid
 */

import sgMail from '@sendgrid/mail';
import Logger from '../logger';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@meetassist.com';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

export interface TaskAssignmentEmailParams {
  to: string;
  assigneeName: string;
  taskTitle: string;
  taskDescription?: string;
  dueDate?: Date;
  meetingId: string;
  taskId: string;
}

/**
 * Send task assignment notification email
 */
export const sendTaskAssignmentEmail = async (params: TaskAssignmentEmailParams): Promise<void> => {
  const { to, assigneeName, taskTitle, taskDescription, dueDate, meetingId, taskId } = params;
  
  const taskUrl = `${APP_BASE_URL}/meetings/${meetingId}?tab=tasks&taskId=${taskId}`;
  const dueDateStr = dueDate ? new Date(dueDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }) : null;

  const msg = {
    to,
    from: FROM_EMAIL,
    subject: `New Task Assigned: ${taskTitle}`,
    text: `
Hello ${assigneeName},

You have been assigned a new task:

Task: ${taskTitle}
${taskDescription ? `Description: ${taskDescription}\n` : ''}${dueDateStr ? `Due Date: ${dueDateStr}\n` : ''}

View and manage this task:
${taskUrl}

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
    <h1 style="color: white; margin: 0; font-size: 24px;">New Task Assigned</h1>
  </div>
  
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px;">Hello <strong>${assigneeName}</strong>,</p>
    
    <p style="font-size: 16px;">
      You have been assigned a new task:
    </p>
    
    <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #111827;">${taskTitle}</h2>
      ${taskDescription ? `<p style="margin: 0 0 12px 0; color: #4b5563;">${taskDescription}</p>` : ''}
      ${dueDateStr ? `
      <div style="display: flex; align-items: center; color: #6b7280; font-size: 14px;">
        <span style="margin-right: 8px;">📅</span>
        <span>Due: ${dueDateStr}</span>
      </div>
      ` : ''}
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${taskUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block;">
        View Task
      </a>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
    
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
      You received this email because a task was assigned to you on MeetAssist.
    </p>
  </div>
</body>
</html>
    `.trim(),
  };

  if (!SENDGRID_API_KEY) {
    Logger.info('[Task Email] SendGrid not configured. Would send email:', {
      to,
      subject: msg.subject,
      taskUrl,
    });
    return;
  }

  try {
    await sgMail.send(msg);
    Logger.info(`[Task Email] Assignment email sent to ${to} for task ${taskId}`);
  } catch (error: unknown) {
    const err = error as Error & { response?: { body?: unknown } };
    Logger.error('[Task Email] Failed to send email:', err.response?.body || err.message);
    throw error;
  }
};

export interface TaskSubmissionNotificationParams {
  to: string;
  ownerName: string;
  submitterName: string;
  taskTitle: string;
  meetingId: string;
  taskId: string;
}

/**
 * Send task submission notification to task creator
 */
export const sendTaskSubmissionNotification = async (params: TaskSubmissionNotificationParams): Promise<void> => {
  const { to, ownerName, submitterName, taskTitle, meetingId, taskId } = params;
  
  const taskUrl = `${APP_BASE_URL}/meetings/${meetingId}?tab=tasks&taskId=${taskId}`;

  const msg = {
    to,
    from: FROM_EMAIL,
    subject: `Task Submission: ${taskTitle}`,
    text: `
Hello ${ownerName},

${submitterName} has submitted work for the task "${taskTitle}".

View the submission:
${taskUrl}

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
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Task Submission Received</h1>
  </div>
  
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px;">Hello <strong>${ownerName}</strong>,</p>
    
    <p style="font-size: 16px;">
      <strong>${submitterName}</strong> has submitted work for the task:
    </p>
    
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h2 style="margin: 0; font-size: 18px; color: #166534;">${taskTitle}</h2>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${taskUrl}" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block;">
        View Submission
      </a>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
    
    <p style="font-size: 12px; color: #9ca3af; text-align: center;">
      You received this email because you are the owner of a task on MeetAssist.
    </p>
  </div>
</body>
</html>
    `.trim(),
  };

  if (!SENDGRID_API_KEY) {
    Logger.info('[Task Email] SendGrid not configured. Would send submission notification:', {
      to,
      subject: msg.subject,
      taskUrl,
    });
    return;
  }

  try {
    await sgMail.send(msg);
    Logger.info(`[Task Email] Submission notification sent to ${to} for task ${taskId}`);
  } catch (error: unknown) {
    const err = error as Error & { response?: { body?: unknown } };
    Logger.error('[Task Email] Failed to send submission notification:', err.response?.body || err.message);
    throw error;
  }
};
