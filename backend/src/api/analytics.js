import express from 'express';
import { Op } from 'sequelize';
import Attendance from '../models/Attendance.js';
import Task from '../models/Task.js';
import Meeting from '../models/Meeting.js';
import User from '../models/User.js';
import { asyncHandler, errorResponse, successResponse } from '../utils/helpers.js';
import { log } from '../utils/logger.js';

const router = express.Router();

/**
 * @route   GET /api/analytics/attendance
 * @desc    Get attendance statistics
 * @access  Private
 */
router.get(
  '/attendance',
  asyncHandler(async (req, res) => {
    const { userId, meetingId, startDate, endDate } = req.query;

    const where = {};

    if (userId) {
      where.user_id = parseInt(userId);
    }

    if (meetingId) {
      where.meeting_id = parseInt(meetingId);
    }

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp[Op.gte] = new Date(startDate);
      if (endDate) where.timestamp[Op.lte] = new Date(endDate);
    }

    const attendance = await Attendance.findAll({
      where,
      include: [
        {
          model: Meeting,
          as: 'meeting',
          attributes: ['id', 'title', 'datetime'],
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'department'],
        },
      ],
      order: [['timestamp', 'DESC']],
    });

    // Calculate statistics
    const totalAttendance = attendance.length;
    const presentCount = attendance.filter(a => a.status === 'present').length;
    const lateCount = attendance.filter(a => a.status === 'late').length;
    const absentCount = attendance.filter(a => a.status === 'absent').length;

    // Group by user
    const byUser = {};
    attendance.forEach(a => {
      const userId = a.user_id.toString();
      if (!byUser[userId]) {
        byUser[userId] = {
          user: a.user,
          total: 0,
          present: 0,
          late: 0,
          absent: 0,
        };
      }
      byUser[userId].total++;
      byUser[userId][a.status]++;
    });

    // Group by meeting
    const byMeeting = {};
    attendance.forEach(a => {
      const meetingId = a.meeting_id.toString();
      if (!byMeeting[meetingId]) {
        byMeeting[meetingId] = {
          meeting: a.meeting,
          total: 0,
          present: 0,
          late: 0,
          absent: 0,
        };
      }
      byMeeting[meetingId].total++;
      byMeeting[meetingId][a.status]++;
    });

    return successResponse(res, 200, {
      summary: {
        total: totalAttendance,
        present: presentCount,
        late: lateCount,
        absent: absentCount,
      },
      byUser: Object.values(byUser),
      byMeeting: Object.values(byMeeting),
      attendance,
    });
  })
);

/**
 * @route   GET /api/analytics/tasks
 * @desc    Get task statistics
 * @access  Private
 */
router.get(
  '/tasks',
  asyncHandler(async (req, res) => {
    const { assigned_to, meeting_id, overdue } = req.query;

    const where = {};

    if (assigned_to) {
      where.assigned_to = parseInt(assigned_to);
    }

    if (meeting_id) {
      where.meeting_id = parseInt(meeting_id);
    }

    if (overdue === 'true') {
      where.deadline = { [Op.lt]: new Date() };
      where.status = { [Op.in]: ['pending', 'in-progress'] };
    }

    const tasks = await Task.findAll({
      where,
      include: [
        {
          model: User,
          as: 'assignedTo',
          attributes: ['id', 'name', 'email', 'department'],
        },
        {
          model: Meeting,
          as: 'meeting',
          attributes: ['id', 'title', 'datetime'],
        },
      ],
      order: [['deadline', 'ASC']],
    });

    // Calculate statistics
    const totalTasks = tasks.length;
    const pendingCount = tasks.filter(t => t.status === 'pending').length;
    const inProgressCount = tasks.filter(t => t.status === 'in-progress').length;
    const completedCount = tasks.filter(t => t.status === 'completed').length;
    const overdueCount = tasks.filter(t => t.status === 'overdue').length;

    // Group by user
    const byUser = {};
    tasks.forEach(t => {
      const userId = t.assigned_to.toString();
      if (!byUser[userId]) {
        byUser[userId] = {
          user: t.assignedTo,
          total: 0,
          pending: 0,
          inProgress: 0,
          completed: 0,
          overdue: 0,
        };
      }
      byUser[userId].total++;
      byUser[userId][t.status === 'in-progress' ? 'inProgress' : t.status]++;
    });

    // Group by priority
    const byPriority = {
      low: tasks.filter(t => t.priority === 'low').length,
      medium: tasks.filter(t => t.priority === 'medium').length,
      high: tasks.filter(t => t.priority === 'high').length,
    };

    return successResponse(res, 200, {
      summary: {
        total: totalTasks,
        pending: pendingCount,
        inProgress: inProgressCount,
        completed: completedCount,
        overdue: overdueCount,
      },
      byUser: Object.values(byUser),
      byPriority,
      tasks,
    });
  })
);

/**
 * @route   GET /api/analytics/overdue-tasks
 * @desc    Get overdue tasks
 * @access  Private
 */
router.get(
  '/overdue-tasks',
  asyncHandler(async (req, res) => {
    const overdueTasks = await Task.findAll({
      where: {
        deadline: { [Op.lt]: new Date() },
        status: { [Op.in]: ['pending', 'in-progress'] },
      },
      include: [
        {
          model: User,
          as: 'assignedTo',
          attributes: ['id', 'name', 'email', 'department'],
        },
        {
          model: Meeting,
          as: 'meeting',
          attributes: ['id', 'title', 'datetime'],
        },
      ],
      order: [['deadline', 'ASC']],
    });

    return successResponse(res, 200, {
      count: overdueTasks.length,
      tasks: overdueTasks,
    });
  })
);

/**
 * @route   GET /api/analytics/department-performance
 * @desc    Get department performance trends
 * @access  Private (admin only)
 */
router.get(
  '/department-performance',
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'admin') {
      return errorResponse(res, 403, 'Admin access required');
    }

    // Get all users with departments
    const users = await User.findAll({
      where: {
        department: {
          [Op.ne]: null,
          [Op.ne]: '',
        },
      },
    });

    // Get attendance by department
    const attendanceByDept = {};
    const tasksByDept = {};

    for (const user of users) {
      const dept = user.department;
      
      if (!attendanceByDept[dept]) {
        attendanceByDept[dept] = {
          department: dept,
          totalMeetings: 0,
          totalAttendance: 0,
          present: 0,
          late: 0,
        };
      }

      if (!tasksByDept[dept]) {
        tasksByDept[dept] = {
          department: dept,
          totalTasks: 0,
          completed: 0,
          overdue: 0,
        };
      }

      // Get user attendance
      const userAttendance = await Attendance.findAll({
        where: { user_id: user.id },
      });
      attendanceByDept[dept].totalAttendance += userAttendance.length;
      userAttendance.forEach(a => {
        attendanceByDept[dept][a.status]++;
      });

      // Get user tasks
      const userTasks = await Task.findAll({
        where: { assigned_to: user.id },
      });
      tasksByDept[dept].totalTasks += userTasks.length;
      userTasks.forEach(t => {
        if (t.status === 'completed') tasksByDept[dept].completed++;
        if (t.status === 'overdue') tasksByDept[dept].overdue++;
      });
    }

    // Calculate attendance rate
    const totalMeetings = await Meeting.count();
    Object.keys(attendanceByDept).forEach(dept => {
      attendanceByDept[dept].totalMeetings = totalMeetings;
      attendanceByDept[dept].attendanceRate = 
        attendanceByDept[dept].totalAttendance > 0
          ? ((attendanceByDept[dept].present + attendanceByDept[dept].late) / 
             attendanceByDept[dept].totalAttendance) * 100
          : 0;
    });

    // Calculate task completion rate
    Object.keys(tasksByDept).forEach(dept => {
      tasksByDept[dept].completionRate =
        tasksByDept[dept].totalTasks > 0
          ? (tasksByDept[dept].completed / tasksByDept[dept].totalTasks) * 100
          : 0;
    });

    return successResponse(res, 200, {
      attendance: Object.values(attendanceByDept),
      tasks: Object.values(tasksByDept),
    });
  })
);

export default router;
