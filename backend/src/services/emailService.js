/**
 * Email Service
 * Handles sending transactional emails using Nodemailer
 * Supports Gmail, SendGrid, and other SMTP providers
 */

import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { log } from '../utils/logger.js';

// Create reusable transporter
let transporter = null;

/**
 * Initialize email transporter
 */
const initTransporter = () => {
  if (transporter) {
    return transporter;
  }

  try {
    transporter = nodemailer.createTransport({
      service: config.email.service,
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure, // true for 465, false for other ports
      auth: {
        user: config.email.auth.user,
        pass: config.email.auth.pass,
      },
    });

    log.info('Email transporter initialized', {
      service: config.email.service,
      host: config.email.host,
      port: config.email.port,
    });

    return transporter;
  } catch (error) {
    log.error('Failed to initialize email transporter', error);
    throw error;
  }
};

/**
 * Verify email configuration
 */
export const verifyEmailConfig = async () => {
  try {
    const transport = initTransporter();
    await transport.verify();
    log.info('Email configuration verified successfully');
    return true;
  } catch (error) {
    log.warn('Email configuration verification failed', {
      error: error.message,
      note: 'Email sending may not work. Please check EMAIL_* environment variables.',
    });
    return false;
  }
};

/**
 * Send email
 * @param {Object} options - Email options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML email body
 * @param {string} options.text - Plain text email body (optional)
 * @returns {Promise<Object>} - Send result
 */
export const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const transport = initTransporter();

    // Check if email is configured
    if (!config.email.auth.user || !config.email.auth.pass) {
      log.warn('Email not configured - skipping send', {
        to,
        subject,
        note: 'Set EMAIL_USER and EMAIL_PASSWORD environment variables to enable email sending.',
      });
      return { success: false, error: 'Email not configured' };
    }

    const mailOptions = {
      from: config.email.from,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML if no plain text provided
    };

    const info = await transport.sendMail(mailOptions);

    log.info('Email sent successfully', {
      to,
      subject,
      messageId: info.messageId,
    });

    return {
      success: true,
      messageId: info.messageId,
      response: info.response,
    };
  } catch (error) {
    log.error('Failed to send email', {
      error: error.message,
      to,
      subject,
    });

    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Send guest invitation email
 * @param {Object} options
 * @param {string} options.email - Guest email
 * @param {Object} options.meeting - Meeting object
 * @param {string} options.accessToken - Unique access token for guest
 * @returns {Promise<Object>}
 */
export const sendGuestInvitation = async ({ email, meeting, accessToken }) => {
  const accessLink = `${config.frontendUrl}/guest/meeting/${meeting.id}?token=${accessToken}`;

  const subject = `Invitation to Meeting: ${meeting.title}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Meeting Invitation</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #2563eb 0%, #64748b 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">Meeting Invitation</h1>
      </div>
      
      <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; margin-bottom: 20px;">Hello,</p>
        
        <p style="font-size: 16px; margin-bottom: 20px;">
          You have been invited to attend the following meeting:
        </p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
          <h2 style="margin-top: 0; color: #2563eb;">${meeting.title}</h2>
          <p style="margin: 10px 0;"><strong>Date & Time:</strong> ${new Date(meeting.datetime).toLocaleString()}</p>
          ${meeting.location ? `<p style="margin: 10px 0;"><strong>Location:</strong> ${meeting.location}</p>` : ''}
          ${meeting.description ? `<p style="margin: 10px 0;"><strong>Description:</strong> ${meeting.description}</p>` : ''}
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${accessLink}" style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
            View Meeting Details
          </a>
        </div>
        
        <p style="font-size: 14px; color: #64748b; margin-top: 30px;">
          You can access this meeting using the link above. No account registration is required.
        </p>
        
        <p style="font-size: 14px; color: #64748b; margin-top: 20px;">
          If you did not expect this invitation, please ignore this email.
        </p>
      </div>
      
      <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #94a3b8;">
        <p>This is an automated message from MeetGov Meeting Assistant</p>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ to: email, subject, html });
};

/**
 * Send meeting summary email
 * @param {Object} options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {Object} options.meeting - Meeting object
 * @param {Object} options.transcript - Transcript object
 * @param {Array} options.tasks - Task array
 * @returns {Promise<Object>}
 */
export const sendMeetingSummary = async ({ to, meeting, transcript, tasks = [] }) => {
  const subject = `Meeting Summary: ${meeting.title}`;
  
  const tasksHtml = tasks.length > 0
    ? `
      <h3 style="color: #2563eb; margin-top: 30px;">Action Items</h3>
      <ul style="background: white; padding: 20px; border-radius: 8px; list-style: none;">
        ${tasks.map(task => `
          <li style="padding: 10px; margin: 5px 0; border-left: 3px solid #2563eb;">
            <strong>${task.title}</strong>
            ${task.description ? `<p style="margin: 5px 0; color: #64748b;">${task.description}</p>` : ''}
            ${task.deadline ? `<p style="margin: 5px 0; font-size: 14px; color: #64748b;">Deadline: ${new Date(task.deadline).toLocaleDateString()}</p>` : ''}
          </li>
        `).join('')}
      </ul>
    `
    : '<p style="color: #64748b;">No action items assigned.</p>';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Meeting Summary</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #2563eb 0%, #64748b 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">Meeting Summary</h1>
      </div>
      
      <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px;">
        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #2563eb;">
          <h2 style="margin-top: 0; color: #2563eb;">${meeting.title}</h2>
          <p style="margin: 10px 0;"><strong>Date & Time:</strong> ${new Date(meeting.datetime).toLocaleString()}</p>
          <p style="margin: 10px 0;"><strong>Status:</strong> ${meeting.status}</p>
        </div>
        
        ${transcript?.summary_text ? `
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #2563eb; margin-top: 0;">Summary</h3>
            <p style="white-space: pre-wrap;">${transcript.summary_text}</p>
          </div>
        ` : ''}
        
        ${transcript?.raw_text ? `
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #2563eb; margin-top: 0;">Full Transcript</h3>
            <div style="max-height: 300px; overflow-y: auto; white-space: pre-wrap; font-size: 14px; color: #64748b;">
              ${transcript.raw_text}
            </div>
          </div>
        ` : ''}
        
        ${tasksHtml}
        
        <p style="font-size: 14px; color: #64748b; margin-top: 30px;">
          This summary was automatically generated after the meeting was marked as completed.
        </p>
      </div>
      
      <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #94a3b8;">
        <p>This is an automated message from MeetGov Meeting Assistant</p>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ to, subject, html });
};

export default {
  sendEmail,
  sendGuestInvitation,
  sendMeetingSummary,
  verifyEmailConfig,
};

