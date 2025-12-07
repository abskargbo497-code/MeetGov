/**
 * Auto Summary Service
 * Automatically generates meeting summaries and creates tickets from action items
 * Triggered when a meeting is completed
 */

import { Op } from 'sequelize';
import Meeting from '../models/Meeting.js';
import Transcript from '../models/Transcript.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import { generateStructuredSummary, extractActionItems } from './minutesService.js';
import { log } from '../utils/logger.js';

/**
 * Generate automatic summary and create tickets from action items
 * Called when a meeting is marked as completed
 * @param {number} meetingId - Meeting ID
 */
export const generateAutoSummaryAndTickets = async (meetingId) => {
  try {
    log.info('Starting auto-summary and ticket generation', { meetingId });

    // Fetch meeting with transcript
    const meeting = await Meeting.findByPk(meetingId, {
      include: [
        {
          model: Transcript,
          as: 'transcript',
        },
      ],
    });

    if (!meeting) {
      throw new Error('Meeting not found');
    }

    // Check if transcript exists
    if (!meeting.transcript || !meeting.transcript.raw_text) {
      log.warn('No transcript found for meeting, skipping auto-summary', { meetingId });
      return {
        summaryGenerated: false,
        ticketsCreated: 0,
        reason: 'No transcript available',
      };
    }

    const transcriptText = meeting.transcript.raw_text;

    // Generate structured summary
    let structuredSummary;
    try {
      structuredSummary = await generateStructuredSummary(transcriptText, meeting.title);
      log.info('Structured summary generated', {
        meetingId,
        keyPoints: structuredSummary.key_points?.length || 0,
        decisions: structuredSummary.decisions?.length || 0,
        actionItems: structuredSummary.action_items?.length || 0,
      });
    } catch (error) {
      log.error('Error generating structured summary', { meetingId, error: error.message });
      throw error;
    }

    // Update transcript with summary
    if (meeting.transcript) {
      meeting.transcript.summary_text = structuredSummary.abstract || '';
      meeting.transcript.summary_json = structuredSummary; // Store full structured summary
      meeting.transcript.action_items_json = structuredSummary.action_items || [];
      meeting.transcript.minutes_formatted = JSON.stringify(structuredSummary);
      await meeting.transcript.save();
    }

    // Extract and create tickets from action items
    const actionItems = structuredSummary.action_items || [];
    const createdTickets = [];

    for (const actionItem of actionItems) {
      try {
        // Find user by name if assigned_to is a name
        let assignedUserId = null;
        if (actionItem.assigned_to && actionItem.assigned_to !== 'TBD') {
          // Try to find user by name (case-insensitive partial match)
          const user = await User.findOne({
            where: {
              name: {
                [Op.like]: `%${actionItem.assigned_to}%`,
              },
            },
          });
          if (user) {
            assignedUserId = user.id;
          }
        }

        // If no user found, assign to meeting organizer as fallback
        if (!assignedUserId) {
          assignedUserId = meeting.organizer_id;
        }

        // Parse deadline
        let deadline = null;
        if (actionItem.deadline) {
          deadline = new Date(actionItem.deadline);
          // If date is invalid, set to 7 days from now
          if (isNaN(deadline.getTime())) {
            deadline = new Date();
            deadline.setDate(deadline.getDate() + 7);
          }
        } else {
          // Default to 7 days from now
          deadline = new Date();
          deadline.setDate(deadline.getDate() + 7);
        }

        // Determine priority based on keywords in title/description
        let priority = 'medium';
        const text = `${actionItem.title} ${actionItem.description || ''}`.toLowerCase();
        if (text.includes('urgent') || text.includes('asap') || text.includes('critical')) {
          priority = 'high';
        } else if (text.includes('low priority') || text.includes('whenever')) {
          priority = 'low';
        }

        // Create task/ticket
        const task = await Task.create({
          meeting_id: meetingId,
          assigned_to: assignedUserId,
          assigned_by: meeting.organizer_id,
          title: actionItem.title || 'Untitled Action Item',
          description: actionItem.description || '',
          deadline: deadline,
          priority: priority,
          status: 'pending',
        });

        createdTickets.push(task);
        log.info('Ticket created from action item', {
          taskId: task.id,
          meetingId,
          assignedTo: assignedUserId,
          title: task.title,
        });
      } catch (error) {
        log.error('Error creating ticket from action item', {
          meetingId,
          actionItem,
          error: error.message,
        });
        // Continue with next action item
      }
    }

    log.info('Auto-summary and ticket generation completed', {
      meetingId,
      summaryGenerated: true,
      ticketsCreated: createdTickets.length,
    });

    return {
      summaryGenerated: true,
      ticketsCreated: createdTickets.length,
      tickets: createdTickets.map((t) => ({
        id: t.id,
        title: t.title,
        assignedTo: t.assigned_to,
      })),
    };
  } catch (error) {
    log.error('Error in auto-summary and ticket generation', {
      meetingId,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

