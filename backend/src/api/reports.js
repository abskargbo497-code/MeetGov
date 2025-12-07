import express from 'express';
import { Op } from 'sequelize';
import Meeting from '../models/Meeting.js';
import Attendance from '../models/Attendance.js';
import Transcript from '../models/Transcript.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import { asyncHandler, errorResponse, successResponse } from '../utils/helpers.js';
import { authenticateToken } from '../utils/jwt.js';
import { allowOnlyAdminOrSecretary, allowAuthenticatedUsers, allowMeetingParticipants } from '../utils/authorization.js';
import { log } from '../utils/logger.js';
import { generatePDFReport } from '../services/reportService.js';

const router = express.Router();

/**
 * @route   GET /api/reports/meeting/:id
 * @desc    Generate PDF report for a specific meeting
 * @access  Private (meeting participants)
 */
router.get(
  '/meeting/:id',
  authenticateToken,
  allowMeetingParticipants,
  asyncHandler(async (req, res) => {
    const meetingId = parseInt(req.params.id);
    const format = req.query.format || 'pdf'; // pdf or json

    // Find meeting with all related data
    const meeting = await Meeting.findByPk(meetingId, {
      include: [
        {
          model: User,
          as: 'organizer',
          attributes: ['id', 'name', 'email', 'department'],
        },
        {
          model: Attendance,
          as: 'attendances',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'email', 'department'],
            },
          ],
        },
        {
          model: Transcript,
          as: 'transcript',
        },
        {
          model: Task,
          as: 'tasks',
          include: [
            {
              model: User,
              as: 'assignedTo',
              attributes: ['id', 'name', 'email'],
            },
          ],
        },
      ],
    });

    if (!meeting) {
      return errorResponse(res, 404, 'Meeting not found');
    }

    try {
      if (format === 'pdf') {
        // Generate PDF report
        const pdfBuffer = await generatePDFReport(meeting);

        // Set response headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="meeting-report-${meetingId}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);

        log.info('PDF report generated', { meetingId });

        return res.send(pdfBuffer);
      } else {
        // Return JSON report
        const report = {
          meeting: {
            id: meeting.id,
            title: meeting.title,
            datetime: meeting.datetime,
            location: meeting.location,
            description: meeting.description,
            status: meeting.status,
            organizer: meeting.organizer ? {
              name: meeting.organizer.name,
              email: meeting.organizer.email,
              department: meeting.organizer.department,
            } : null,
          },
          attendance: meeting.attendances ? meeting.attendances.map((att) => ({
            user: att.user ? {
              name: att.user.name,
              email: att.user.email,
              department: att.user.department,
            } : null,
            checked_in_at: att.checked_in_at,
            checked_out_at: att.checked_out_at,
          })) : [],
          transcript: meeting.transcript ? {
            summary: meeting.transcript.summary_text,
            key_points: meeting.transcript.summary_json?.key_points || [],
            decisions: meeting.transcript.summary_json?.decisions || [],
            action_items: meeting.transcript.action_items_json || [],
            minutes: meeting.transcript.minutes_formatted,
          } : null,
          tasks: meeting.tasks ? meeting.tasks.map((task) => ({
            id: task.id,
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            deadline: task.deadline,
            assigned_to: task.assignedTo ? {
              name: task.assignedTo.name,
              email: task.assignedTo.email,
            } : null,
          })) : [],
          generated_at: new Date().toISOString(),
        };

        return successResponse(res, 200, report, 'Report generated successfully');
      }
    } catch (error) {
      log.error('Error generating report', error);
      return errorResponse(res, 500, 'Failed to generate report');
    }
  })
);

/**
 * @route   GET /api/reports/meetings
 * @desc    Generate summary report for multiple meetings
 * @access  Private (super_admin, secretary)
 */
router.get(
  '/meetings',
  authenticateToken,
  allowOnlyAdminOrSecretary,
  asyncHandler(async (req, res) => {
    const { startDate, endDate, status, format } = req.query;
    const formatType = format || 'json';

    // Build query filters
    const where = {};
    if (startDate || endDate) {
      where.datetime = {};
      if (startDate) where.datetime[Op.gte] = new Date(startDate);
      if (endDate) where.datetime[Op.lte] = new Date(endDate);
    }
    if (status) {
      where.status = status;
    }

    // Get meetings
    const meetings = await Meeting.findAll({
      where,
      include: [
        {
          model: User,
          as: 'organizer',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: Attendance,
          as: 'attendances',
        },
        {
          model: Task,
          as: 'tasks',
        },
      ],
      order: [['datetime', 'DESC']],
    });

    // Generate summary statistics
    const stats = {
      total_meetings: meetings.length,
      by_status: {},
      total_attendances: 0,
      total_tasks: 0,
      completed_tasks: 0,
    };

    meetings.forEach((meeting) => {
      // Count by status
      stats.by_status[meeting.status] = (stats.by_status[meeting.status] || 0) + 1;

      // Count attendances
      if (meeting.attendances) {
        stats.total_attendances += meeting.attendances.length;
      }

      // Count tasks
      if (meeting.tasks) {
        stats.total_tasks += meeting.tasks.length;
        stats.completed_tasks += meeting.tasks.filter((t) => t.status === 'completed').length;
      }
    });

    const report = {
      period: {
        start_date: startDate || null,
        end_date: endDate || null,
      },
      statistics: stats,
      meetings: meetings.map((m) => ({
        id: m.id,
        title: m.title,
        datetime: m.datetime,
        status: m.status,
        organizer: m.organizer ? m.organizer.name : null,
        attendance_count: m.attendances ? m.attendances.length : 0,
        task_count: m.tasks ? m.tasks.length : 0,
      })),
      generated_at: new Date().toISOString(),
    };

    if (formatType === 'pdf') {
      try {
        // Generate PDF for summary report
        const pdfBuffer = await generatePDFReport(null, report);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="meetings-summary-${Date.now()}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);

        return res.send(pdfBuffer);
      } catch (error) {
        log.error('Error generating PDF summary report', error);
        return errorResponse(res, 500, 'Failed to generate PDF report');
      }
    }

    return successResponse(res, 200, report, 'Summary report generated successfully');
  })
);

/**
 * @route   GET /api/reports/user/:id
 * @desc    Generate report for a specific user's meetings and tasks
 * @access  Private (user can view own report, admin/secretary can view any)
 */
router.get(
  '/user/:id',
  authenticateToken,
  allowAuthenticatedUsers,
  asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.id);

    // Check permissions
    if (req.user.role !== 'super_admin' && req.user.role !== 'secretary' && req.user.userId !== userId) {
      return errorResponse(res, 403, 'Insufficient permissions');
    }

    // Find user
    const user = await User.findByPk(userId);
    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    // Get user's meetings (as organizer or participant)
    const organizedMeetings = await Meeting.findAll({
      where: { organizer_id: userId },
      include: [
        {
          model: Attendance,
          as: 'attendances',
        },
        {
          model: Task,
          as: 'tasks',
        },
      ],
    });

    // Get meetings user attended
    const attendances = await Attendance.findAll({
      where: { user_id: userId },
      include: [
        {
          model: Meeting,
          as: 'meeting',
          include: [
            {
              model: Task,
              as: 'tasks',
            },
          ],
        },
      ],
    });

    // Get user's tasks
    const tasks = await Task.findAll({
      where: { assigned_to: userId },
      include: [
        {
          model: Meeting,
          as: 'meeting',
          attributes: ['id', 'title', 'datetime'],
        },
      ],
      order: [['deadline', 'ASC']],
    });

    const report = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        department: user.department,
        role: user.role,
      },
      statistics: {
        meetings_organized: organizedMeetings.length,
        meetings_attended: attendances.length,
        total_tasks: tasks.length,
        completed_tasks: tasks.filter((t) => t.status === 'completed').length,
        pending_tasks: tasks.filter((t) => t.status === 'pending' || t.status === 'in-progress').length,
        overdue_tasks: tasks.filter((t) => {
          if (t.status === 'completed') return false;
          return new Date(t.deadline) < new Date();
        }).length,
      },
      meetings_organized: organizedMeetings.map((m) => ({
        id: m.id,
        title: m.title,
        datetime: m.datetime,
        status: m.status,
        attendance_count: m.attendances ? m.attendances.length : 0,
        task_count: m.tasks ? m.tasks.length : 0,
      })),
      meetings_attended: attendances.map((a) => ({
        id: a.meeting.id,
        title: a.meeting.title,
        datetime: a.meeting.datetime,
        checked_in_at: a.checked_in_at,
        checked_out_at: a.checked_out_at,
      })),
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        deadline: t.deadline,
        meeting: t.meeting ? {
          id: t.meeting.id,
          title: t.meeting.title,
        } : null,
      })),
      generated_at: new Date().toISOString(),
    };

    return successResponse(res, 200, report, 'User report generated successfully');
  })
);

export default router;


