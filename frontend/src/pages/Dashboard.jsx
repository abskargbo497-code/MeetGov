import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAPI } from '../hooks/useAPI';
import MeetingCard from '../components/MeetingCard';
import TaskCard from '../components/TaskCard';
import './Dashboard.css';

const Dashboard = () => {
  const { user } = useAuth();
  const { get } = useAPI();
  const [meetings, setMeetings] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState({
    totalMeetings: 0,
    upcomingMeetings: 0,
    totalTasks: 0,
    overdueTasks: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // Fetch recent meetings
      const meetingsRes = await get('/meetings?status=scheduled');
      if (meetingsRes.success) {
        const upcoming = meetingsRes.data.data.meetings
          .filter((m) => new Date(m.datetime) > new Date())
          .slice(0, 5);
        setMeetings(upcoming);
        setStats((prev) => ({
          ...prev,
          totalMeetings: meetingsRes.data.data.meetings.length,
          upcomingMeetings: upcoming.length,
        }));
      }

      // Fetch user tasks
      const tasksRes = await get('/tasks');
      if (tasksRes.success) {
        const userTasks = tasksRes.data.data.tasks.slice(0, 5);
        setTasks(userTasks);
        const overdue = tasksRes.data.data.tasks.filter(
          (t) => t.status === 'overdue'
        ).length;
        setStats((prev) => ({
          ...prev,
          totalTasks: tasksRes.data.data.tasks.length,
          overdueTasks: overdue,
        }));
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="dashboard-loading">Loading...</div>;
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Welcome, {user?.name}!</h1>
        <p className="dashboard-subtitle">Here's what's happening today</p>
      </div>

      <div className="dashboard-stats">
        <div className="dashboard-stat-card">
          <div className="dashboard-stat-value">{stats.totalMeetings}</div>
          <div className="dashboard-stat-label">Total Meetings</div>
        </div>
        <div className="dashboard-stat-card">
          <div className="dashboard-stat-value">{stats.upcomingMeetings}</div>
          <div className="dashboard-stat-label">Upcoming</div>
        </div>
        <div className="dashboard-stat-card">
          <div className="dashboard-stat-value">{stats.totalTasks}</div>
          <div className="dashboard-stat-label">Total Tasks</div>
        </div>
        <div className="dashboard-stat-card dashboard-stat-card-warning">
          <div className="dashboard-stat-value">{stats.overdueTasks}</div>
          <div className="dashboard-stat-label">Overdue Tasks</div>
        </div>
      </div>

      <div className="dashboard-content">
        <div className="dashboard-section">
          <h2 className="dashboard-section-title">Upcoming Meetings</h2>
          {meetings.length > 0 ? (
            <div className="dashboard-meetings">
              {meetings.map((meeting) => (
                <MeetingCard key={meeting.id || meeting._id || Math.random()} meeting={meeting} />
              ))}
            </div>
          ) : (
            <p className="dashboard-empty">No upcoming meetings</p>
          )}
        </div>

        <div className="dashboard-section">
          <h2 className="dashboard-section-title">My Tasks</h2>
          {tasks.length > 0 ? (
            <div className="dashboard-tasks">
              {tasks.map((task) => (
                <TaskCard key={task.id || task._id || Math.random()} task={task} />
              ))}
            </div>
          ) : (
            <p className="dashboard-empty">No tasks assigned</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;


