import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAPI } from '../hooks/useAPI';
import { useAuth } from '../context/AuthContext';
import MeetingCard from '../components/MeetingCard';
import './MeetingList.css';

const MeetingList = () => {
  const navigate = useNavigate();
  const { get } = useAPI();
  const { isAdminOrSecretary } = useAuth();
  const [meetings, setMeetings] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    total: 0,
    scheduled: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0,
  });

  useEffect(() => {
    fetchMeetings();
  }, [filter]);

  const fetchMeetings = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filter !== 'all') {
        params.status = filter;
      }

      const result = await get('/meetings', { params });
      if (result.success) {
        const meetingsData = result.data.data.meetings || [];
        setMeetings(meetingsData);
        
        // Calculate stats
        setStats({
          total: meetingsData.length,
          scheduled: meetingsData.filter(m => m.status === 'scheduled').length,
          inProgress: meetingsData.filter(m => m.status === 'in-progress').length,
          completed: meetingsData.filter(m => m.status === 'completed').length,
          rescheduled: meetingsData.filter(m => m.status === 'rescheduled').length,
          cancelled: meetingsData.filter(m => m.status === 'cancelled').length,
        });
      } else {
        const errorMsg = result.error || 'Failed to fetch meetings';
        setError(errorMsg);
        console.error('Failed to fetch meetings:', result);
      }
    } catch (err) {
      // Better error handling for network errors
      let errorMsg = 'Failed to fetch meetings';
      if (err.message === 'Network Error' || err.code === 'ECONNABORTED') {
        errorMsg = 'Cannot connect to server. Please ensure the backend is running on http://localhost:3000';
      } else if (err.response) {
        errorMsg = err.response.data?.message || err.response.data?.error || `Server error: ${err.response.status}`;
      } else if (err.message) {
        errorMsg = err.message;
      }
      setError(errorMsg);
      console.error('Error fetching meetings:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="meeting-list">
      <div className="meeting-list-header">
        <div>
          <h1 className="meeting-list-title">All Meetings</h1>
          <p className="meeting-list-subtitle">View and manage all meetings</p>
        </div>
        {isAdminOrSecretary() && (
          <button
            onClick={() => navigate('/meetings/create')}
            className="meeting-list-btn-create"
          >
            + Create Meeting
          </button>
        )}
      </div>

      <div className="meeting-list-stats">
        <div className="meeting-list-stat-card" onClick={() => setFilter('all')}>
          <div className="meeting-list-stat-value">{stats.total}</div>
          <div className="meeting-list-stat-label">Total</div>
        </div>
        <div className="meeting-list-stat-card" onClick={() => setFilter('scheduled')}>
          <div className="meeting-list-stat-value">{stats.scheduled}</div>
          <div className="meeting-list-stat-label">Scheduled</div>
        </div>
        <div className="meeting-list-stat-card" onClick={() => setFilter('in-progress')}>
          <div className="meeting-list-stat-value">{stats.inProgress}</div>
          <div className="meeting-list-stat-label">In Progress</div>
        </div>
        <div className="meeting-list-stat-card" onClick={() => setFilter('completed')}>
          <div className="meeting-list-stat-value">{stats.completed}</div>
          <div className="meeting-list-stat-label">Completed</div>
        </div>
        <div className="meeting-list-stat-card" onClick={() => setFilter('cancelled')}>
          <div className="meeting-list-stat-value">{stats.cancelled}</div>
          <div className="meeting-list-stat-label">Cancelled</div>
        </div>
      </div>

      <div className="meeting-list-filters">
        <button
          className={`meeting-list-filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          className={`meeting-list-filter-btn ${filter === 'scheduled' ? 'active' : ''}`}
          onClick={() => setFilter('scheduled')}
        >
          Scheduled
        </button>
        <button
          className={`meeting-list-filter-btn ${filter === 'in-progress' ? 'active' : ''}`}
          onClick={() => setFilter('in-progress')}
        >
          In Progress
        </button>
        <button
          className={`meeting-list-filter-btn ${filter === 'completed' ? 'active' : ''}`}
          onClick={() => setFilter('completed')}
        >
          Completed
        </button>
        <button
          className={`meeting-list-filter-btn ${filter === 'rescheduled' ? 'active' : ''}`}
          onClick={() => setFilter('rescheduled')}
        >
          Rescheduled
        </button>
        <button
          className={`meeting-list-filter-btn ${filter === 'cancelled' ? 'active' : ''}`}
          onClick={() => setFilter('cancelled')}
        >
          Cancelled
        </button>
      </div>

      {error && <div className="meeting-list-error">{error}</div>}

      {loading ? (
        <div className="meeting-list-loading">Loading meetings...</div>
      ) : meetings.length > 0 ? (
        <div className="meeting-list-grid">
          {meetings.map((meeting) => (
            <MeetingCard key={meeting.id || meeting._id || Math.random()} meeting={meeting} />
          ))}
        </div>
      ) : (
        <div className="meeting-list-empty">
          <p>No meetings found</p>
          <button
            onClick={() => navigate('/meetings/create')}
            className="meeting-list-btn-create-empty"
          >
            Create Your First Meeting
          </button>
        </div>
      )}
    </div>
  );
};

export default MeetingList;

