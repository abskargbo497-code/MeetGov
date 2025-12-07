import React, { useState, useEffect } from 'react';
import { useAPI } from '../hooks/useAPI';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { WarningIcon } from '../components/icons';
import './Analytics.css';

const COLORS = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#95E1D3', '#F38181'];

const Analytics = () => {
  const { get } = useAPI();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Analytics data
  const [attendanceData, setAttendanceData] = useState(null);
  const [taskData, setTaskData] = useState(null);
  const [meetingData, setMeetingData] = useState(null);
  const [departmentData, setDepartmentData] = useState(null);
  
  // Filters
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: '',
  });
  const [selectedDepartment, setSelectedDepartment] = useState('all');

  // Fetch analytics data when filters change
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');

      try {
        const params = {};
        if (dateRange.startDate) params.startDate = dateRange.startDate;
        if (dateRange.endDate) params.endDate = dateRange.endDate;
        if (selectedDepartment !== 'all') params.department = selectedDepartment;

        // Fetch all analytics data in parallel
        const [attendanceRes, tasksRes, meetingsRes, deptRes] = await Promise.all([
          get('/analytics/attendance', { params }),
          get('/analytics/tasks', { params }),
          get('/analytics/meetings', { params }),
          get('/analytics/department-performance'),
        ]);

        if (attendanceRes.success) {
          setAttendanceData(attendanceRes.data.data);
        }
        if (tasksRes.success) {
          setTaskData(tasksRes.data.data);
        }
        if (meetingsRes.success) {
          setMeetingData(meetingsRes.data.data);
        }
        if (deptRes.success) {
          setDepartmentData(deptRes.data.data);
        }
      } catch (err) {
        setError('Failed to fetch analytics data');
        console.error('Analytics error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [dateRange.startDate, dateRange.endDate, selectedDepartment, get]);


  // Prepare chart data
  const attendanceChartData = attendanceData?.byMeeting?.slice(0, 10).map(item => ({
    name: item.meeting?.title?.substring(0, 20) || 'Meeting',
    present: item.present || 0,
    late: item.late || 0,
    absent: item.absent || 0,
  })) || [];

  const taskStatusData = taskData?.summary ? [
    { name: 'Pending', value: taskData.summary.pending },
    { name: 'In Progress', value: taskData.summary.inProgress },
    { name: 'Completed', value: taskData.summary.completed },
    { name: 'Overdue', value: taskData.summary.overdue },
  ] : [];

  const meetingTrendsData = meetingData?.trends?.map(trend => ({
    month: trend.month,
    total: trend.total,
    completed: trend.completed,
    attendance: trend.attendance || 0,
  })) || [];

  const taskPriorityData = taskData?.byPriority ? [
    { name: 'Low', value: taskData.byPriority.low },
    { name: 'Medium', value: taskData.byPriority.medium },
    { name: 'High', value: taskData.byPriority.high },
  ] : [];

  if (loading) {
    return (
      <div className="analytics-loading">
        <div className="analytics-spinner"></div>
        <p>Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="analytics">
      <div className="analytics-header">
        <h1 className="analytics-title">Analytics Dashboard</h1>
        <p className="analytics-subtitle">Comprehensive insights into meetings, attendance, and tasks</p>
      </div>

      {error && (
        <div className="analytics-error">
          <WarningIcon className="analytics-error-icon" />
          <span>{error}</span>
        </div>
      )}

      {/* Filters */}
      <div className="analytics-filters">
        <div className="analytics-filter-group">
          <label htmlFor="startDate">Start Date</label>
          <input
            type="date"
            id="startDate"
            value={dateRange.startDate}
            onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
            className="analytics-filter-input"
          />
        </div>
        <div className="analytics-filter-group">
          <label htmlFor="endDate">End Date</label>
          <input
            type="date"
            id="endDate"
            value={dateRange.endDate}
            onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
            className="analytics-filter-input"
          />
        </div>
        <button
          onClick={() => setDateRange({ startDate: '', endDate: '' })}
          className="analytics-filter-clear"
        >
          Clear Filters
        </button>
      </div>

      {/* KPI Cards */}
      <div className="analytics-kpis">
        <div className="analytics-kpi-card">
          <div className="analytics-kpi-content">
            <div className="analytics-kpi-value">
              {attendanceData?.summary?.total || 0}
            </div>
            <div className="analytics-kpi-label">Total Attendance Records</div>
            <div className="analytics-kpi-change">
              {attendanceData?.summary?.present || 0} Present
            </div>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="analytics-kpi-content">
            <div className="analytics-kpi-value">
              {taskData?.summary?.completed || 0}
            </div>
            <div className="analytics-kpi-label">Tasks Completed</div>
            <div className="analytics-kpi-change">
              {taskData?.summary?.total ? 
                ((taskData.summary.completed / taskData.summary.total) * 100).toFixed(1) : 0}% Rate
            </div>
          </div>
        </div>

        <div className="analytics-kpi-card analytics-kpi-card-warning">
          <div className="analytics-kpi-content">
            <div className="analytics-kpi-value">
              {taskData?.summary?.overdue || 0}
            </div>
            <div className="analytics-kpi-label">Overdue Tasks</div>
            <div className="analytics-kpi-change">
              Action Required
            </div>
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="analytics-kpi-content">
            <div className="analytics-kpi-value">
              {meetingData?.summary?.avgAttendance?.toFixed(1) || 0}
            </div>
            <div className="analytics-kpi-label">Avg. Attendance/Meeting</div>
            <div className="analytics-kpi-change">
              {meetingData?.summary?.completionRate || 0}% Completion Rate
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="analytics-charts">
        {/* Attendance Chart */}
        <div className="analytics-chart-card">
          <h2 className="analytics-chart-title">Meeting Attendance</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={attendanceChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
              <XAxis 
                dataKey="name" 
                stroke="#FFFFFF"
                fontSize={12}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis stroke="#FFFFFF" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(26, 26, 46, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  color: '#FFFFFF'
                }}
              />
              <Legend />
              <Bar dataKey="present" fill="#4ECDC4" name="Present" />
              <Bar dataKey="late" fill="#FFD93D" name="Late" />
              <Bar dataKey="absent" fill="#FF6B6B" name="Absent" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Task Status Pie Chart */}
        <div className="analytics-chart-card">
          <h2 className="analytics-chart-title">Task Status Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={taskStatusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {taskStatusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(26, 26, 46, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  color: '#FFFFFF'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Meeting Trends */}
        <div className="analytics-chart-card">
          <h2 className="analytics-chart-title">Meeting Trends Over Time</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={meetingTrendsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
              <XAxis 
                dataKey="month" 
                stroke="#FFFFFF"
                fontSize={12}
              />
              <YAxis stroke="#FFFFFF" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(26, 26, 46, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  color: '#FFFFFF'
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="total" 
                stroke="#FF6B6B" 
                strokeWidth={2}
                name="Total Meetings"
              />
              <Line 
                type="monotone" 
                dataKey="completed" 
                stroke="#4ECDC4" 
                strokeWidth={2}
                name="Completed"
              />
              <Line 
                type="monotone" 
                dataKey="attendance" 
                stroke="#FFD93D" 
                strokeWidth={2}
                name="Avg. Attendance"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Task Priority */}
        <div className="analytics-chart-card">
          <h2 className="analytics-chart-title">Tasks by Priority</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={taskPriorityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
              <XAxis 
                dataKey="name" 
                stroke="#FFFFFF"
                fontSize={12}
              />
              <YAxis stroke="#FFFFFF" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'rgba(26, 26, 46, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  color: '#FFFFFF'
                }}
              />
              <Bar dataKey="value" fill="#4ECDC4" name="Tasks" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Department Performance Table */}
      {departmentData && (
        <div className="analytics-table-card">
          <h2 className="analytics-chart-title">Department Performance</h2>
          <div className="analytics-table-container">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Attendance Rate</th>
                  <th>Total Tasks</th>
                  <th>Completion Rate</th>
                  <th>Overdue Tasks</th>
                </tr>
              </thead>
              <tbody>
                {departmentData.attendance?.map((dept, index) => {
                  const deptTasks = departmentData.tasks?.find(t => t.department === dept.department);
                  return (
                    <tr key={index}>
                      <td>{dept.department}</td>
                      <td>{dept.attendanceRate?.toFixed(1) || 0}%</td>
                      <td>{deptTasks?.totalTasks || 0}</td>
                      <td>{deptTasks?.completionRate?.toFixed(1) || 0}%</td>
                      <td className={deptTasks?.overdue > 0 ? 'analytics-overdue' : ''}>
                        {deptTasks?.overdue || 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Analytics;

