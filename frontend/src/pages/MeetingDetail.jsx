/**
 * Meeting Detail Page
 * Displays detailed information about a meeting
 * Role-based access: Admin/Secretary can manage status, Officials can view only
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAPI } from '../hooks/useAPI';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import LiveTranscript from '../components/LiveTranscript';
import { WarningIcon, CheckIcon, UserIcon, CalendarIcon, TaskIcon } from '../components/icons';
import './MeetingDetail.css';

const MeetingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { get, patch, post } = useAPI();
  const { isAdminOrSecretary } = useAuth();
  const { isConnected, on, off } = useSocket(id);
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [attendance, setAttendance] = useState([]);
  const [liveTranscriptionActive, setLiveTranscriptionActive] = useState(false);
  const [isStartingTranscription, setIsStartingTranscription] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [startingMeeting, setStartingMeeting] = useState(false);
  const [stoppingMeeting, setStoppingMeeting] = useState(false);

  const statusOptions = [
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'in-progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'rescheduled', label: 'Rescheduled' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  useEffect(() => {
    fetchMeeting();
    fetchAttendance();
    checkLiveTranscriptionStatus();
    fetchTasks();
    
    // Set up interval to refresh meeting status periodically (for auto-status updates)
    const statusInterval = setInterval(() => {
      fetchMeeting();
    }, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(statusInterval);
  }, [id]);

  // Listen for real-time updates via WebSocket
  useEffect(() => {
    if (!isConnected || !id) return;

    const handleAttendanceUpdate = (data) => {
      if (data.meetingId === parseInt(id)) {
        setAttendance((prev) => {
          const existing = prev.find((a) => a.id === data.attendance.id);
          if (existing) {
            return prev.map((a) => (a.id === data.attendance.id ? data.attendance : a));
          }
          return [...prev, data.attendance];
        });
      }
    };

    const handleStatusUpdate = (data) => {
      if (data.meetingId === parseInt(id)) {
        setMeeting((prev) => (prev ? { ...prev, status: data.status } : null));
        // Refresh meeting data and tasks when status changes
        fetchMeeting();
        if (data.status === 'completed') {
          // Wait a bit for backend to generate summary and tickets
          setTimeout(() => {
            fetchTasks();
          }, 2000);
        }
      }
    };

    on('attendance-updated', handleAttendanceUpdate);
    on('meeting-status-updated', handleStatusUpdate);

    return () => {
      off('attendance-updated', handleAttendanceUpdate);
      off('meeting-status-updated', handleStatusUpdate);
    };
  }, [isConnected, id, on, off]);

  const fetchMeeting = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await get(`/meetings/${id}`);
      if (result.success) {
        setMeeting(result.data.data.meeting);
      } else {
        setError(result.error || 'Failed to fetch meeting');
      }
    } catch (err) {
      setError('Failed to fetch meeting');
      console.error('Error fetching meeting:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendance = async () => {
    try {
      const result = await get(`/meetings/${id}/attendance`);
      if (result.success) {
        setAttendance(result.data.data.attendance || []);
      }
    } catch (err) {
      console.error('Error fetching attendance:', err);
    }
  };

  const checkLiveTranscriptionStatus = async () => {
    try {
      const result = await get(`/meetings/${id}/live-transcription/status`);
      if (result.success) {
        setLiveTranscriptionActive(result.data.data.isActive || false);
      }
    } catch (err) {
      console.error('Error checking transcription status:', err);
    }
  };

  const handleStartLiveTranscription = async () => {
    if (!isAdminOrSecretary()) {
      setError('Only Administrators and Secretaries can start live transcription');
      return;
    }

    setIsStartingTranscription(true);
    setError('');

    try {
      const result = await post(`/meetings/${id}/live-transcription/start`, {});
      if (result.success) {
        setLiveTranscriptionActive(true);
        setStatusMessage('Live transcription started');
        setTimeout(() => setStatusMessage(''), 3000);
      } else {
        setError(result.error || 'Failed to start live transcription');
      }
    } catch (err) {
      setError('Failed to start live transcription');
      console.error('Error starting transcription:', err);
    } finally {
      setIsStartingTranscription(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (!isAdminOrSecretary()) {
      setError('Only Administrators and Secretaries can change meeting status');
      return;
    }

    setStatusLoading(true);
    setStatusMessage('');
    setError('');

    try {
      const result = await patch(`/meetings/${id}/status`, { status: newStatus });
      if (result.success) {
        setMeeting(result.data.data.meeting);
        setStatusMessage('Meeting status updated successfully');
        setTimeout(() => {
          setStatusMessage('');
          fetchMeeting(); // Refresh meeting data
          // Refresh tasks if meeting was completed
          if (newStatus === 'completed') {
            // Wait a bit for backend to generate summary and tickets
            setTimeout(() => {
              fetchTasks();
            }, 2000);
          }
        }, 3000);
      } else {
        // Extract error message from response
        const errorMsg = result.error || result.data?.message || 'Failed to update status';
        setError(errorMsg);
        console.error('Status update error:', result);
      }
    } catch (err) {
      // Better error handling
      const errorMsg = err.response?.data?.message || 
                      err.response?.data?.error || 
                      err.message || 
                      'Failed to update meeting status';
      setError(errorMsg);
      console.error('Error updating status:', err);
      if (err.response?.data?.errors) {
        console.error('Validation errors:', err.response.data.errors);
      }
    } finally {
      setStatusLoading(false);
    }
  };

  const handleStartMeeting = async () => {
    if (!isAdminOrSecretary()) {
      setError('Only Administrators and Secretaries can start meetings');
      return;
    }

    setStartingMeeting(true);
    setError('');
    setStatusMessage('');

    try {
      const result = await post(`/meetings/${id}/start`, {});
      if (result.success) {
        setMeeting(result.data.data.meeting);
        setStatusMessage('Meeting started successfully');
        setTimeout(() => {
          setStatusMessage('');
          fetchMeeting(); // Refresh to get latest status
        }, 3000);
      } else {
        setError(result.error || 'Failed to start meeting');
      }
    } catch (err) {
      setError('Failed to start meeting');
      console.error('Error starting meeting:', err);
    } finally {
      setStartingMeeting(false);
    }
  };

  const handleStopMeeting = async () => {
    if (!isAdminOrSecretary()) {
      setError('Only Administrators and Secretaries can stop meetings');
      return;
    }

    setStoppingMeeting(true);
    setError('');
    setStatusMessage('');

    try {
      const result = await post(`/meetings/${id}/stop`, {});
      if (result.success) {
        setMeeting(result.data.data.meeting);
        setStatusMessage('Meeting stopped. Summary and tickets are being generated...');
        setTimeout(() => {
          setStatusMessage('');
          fetchTasks(); // Refresh tasks after generation
          fetchMeeting(); // Refresh meeting to get updated transcript
        }, 3000);
      } else {
        setError(result.error || 'Failed to stop meeting');
      }
    } catch (err) {
      setError('Failed to stop meeting');
      console.error('Error stopping meeting:', err);
    } finally {
      setStoppingMeeting(false);
    }
  };

  const fetchTasks = async () => {
    setLoadingTasks(true);
    try {
      const result = await get(`/tasks?meeting_id=${id}`);
      if (result.success) {
        // Ensure assignedTo is properly handled
        const tasksWithSafeData = (result.data.data.tasks || []).map(task => ({
          ...task,
          assignedTo: task.assignedTo || task.assigned_to || null,
        }));
        setTasks(tasksWithSafeData);
      }
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setTasks([]); // Set empty array on error
    } finally {
      setLoadingTasks(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadgeClass = (status) => {
    const statusMap = {
      scheduled: 'meeting-status-scheduled',
      'in-progress': 'meeting-status-in-progress',
      completed: 'meeting-status-completed',
      rescheduled: 'meeting-status-rescheduled',
      cancelled: 'meeting-status-cancelled',
    };
    return statusMap[status] || 'meeting-status-default';
  };

  if (loading) {
    return <div className="meeting-detail-loading">Loading meeting details...</div>;
  }

  if (error && !meeting) {
    return (
      <div className="meeting-detail-error">
        <WarningIcon className="meeting-detail-error-icon" />
        <p>{error}</p>
        <button onClick={() => navigate('/meetings')} className="meeting-detail-btn">
          Back to Meetings
        </button>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="meeting-detail-error">
        <WarningIcon className="meeting-detail-error-icon" />
        <p>Meeting not found</p>
        <button onClick={() => navigate('/meetings')} className="meeting-detail-btn">
          Back to Meetings
        </button>
      </div>
    );
  }

  return (
    <div className="meeting-detail">
      <div className="meeting-detail-header">
        <button onClick={() => navigate('/meetings')} className="meeting-detail-back">
          ← Back to Meetings
        </button>
        <div className="meeting-detail-actions">
          {isAdminOrSecretary() && meeting.qr_code_url && (
            <Link
              to={`/meetings/${id}/qr`}
              className="meeting-detail-btn meeting-detail-btn-primary"
            >
              View QR Code
            </Link>
          )}
          {meeting.transcript && (
            <Link
              to={`/transcription/${id}`}
              className="meeting-detail-btn meeting-detail-btn-secondary"
            >
              View Transcript
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="meeting-detail-message meeting-detail-error-message">
          <WarningIcon className="meeting-detail-message-icon" />
          <span>{error}</span>
        </div>
      )}

      {statusMessage && (
        <div className="meeting-detail-message meeting-detail-success-message">
          <CheckIcon className="meeting-detail-message-icon" />
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="meeting-detail-content">
        <div className="meeting-detail-main">
          <h1 className="meeting-detail-title">{meeting.title}</h1>

          {/* Quick Actions - Start/Stop Meeting - Admin/Secretary Only */}
          {isAdminOrSecretary() && (
            <div className="meeting-detail-quick-actions">
              {meeting.status === 'scheduled' && (
                <button
                  onClick={handleStartMeeting}
                  disabled={startingMeeting}
                  className="meeting-detail-btn meeting-detail-btn-primary meeting-detail-btn-large"
                >
                  {startingMeeting ? 'Starting...' : '▶ Start Meeting'}
                </button>
              )}
              {meeting.status === 'in-progress' && (
                <button
                  onClick={handleStopMeeting}
                  disabled={stoppingMeeting}
                  className="meeting-detail-btn meeting-detail-btn-danger meeting-detail-btn-large"
                >
                  {stoppingMeeting ? 'Stopping...' : '⏹ Stop Meeting & Generate Summary'}
                </button>
              )}
            </div>
          )}

          {/* Status Management Section - Admin/Secretary Only */}
          {isAdminOrSecretary() && (
            <div className="meeting-detail-status-section">
              <label className="meeting-detail-status-label">Meeting Status</label>
              <div className="meeting-detail-status-controls">
                {statusOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleStatusChange(option.value)}
                    disabled={statusLoading || meeting.status === option.value}
                    className={`meeting-detail-status-btn ${
                      meeting.status === option.value ? 'active' : ''
                    } ${getStatusBadgeClass(option.value)}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="meeting-detail-info">
            <div className="meeting-detail-info-item">
              <span className="meeting-detail-info-label">Status:</span>
              <span className={`meeting-detail-status-badge ${getStatusBadgeClass(meeting.status)}`}>
                {statusOptions.find((opt) => opt.value === meeting.status)?.label || meeting.status}
              </span>
            </div>
            <div className="meeting-detail-info-item">
              <span className="meeting-detail-info-label">Date & Time:</span>
              <span className="meeting-detail-info-value">{formatDate(meeting.datetime)}</span>
            </div>
            {meeting.location && (
              <div className="meeting-detail-info-item">
                <span className="meeting-detail-info-label">Location:</span>
                <span className="meeting-detail-info-value">{meeting.location}</span>
              </div>
            )}
            {meeting.organizer && (
              <div className="meeting-detail-info-item">
                <span className="meeting-detail-info-label">Organizer:</span>
                <span className="meeting-detail-info-value">
                  {meeting.organizer.name || meeting.organizer.email}
                </span>
              </div>
            )}
          </div>

          {meeting.description && (
            <div className="meeting-detail-section">
              <h2 className="meeting-detail-section-title">Description</h2>
              <p className="meeting-detail-description">{meeting.description}</p>
            </div>
          )}

          {/* Live Transcription Section - Show for scheduled and in-progress meetings */}
          {(meeting.status === 'scheduled' || meeting.status === 'in-progress') && (
            <div className="meeting-detail-section">
              <div className="meeting-detail-section-header">
                <h2 className="meeting-detail-section-title">Live Transcription</h2>
                {isAdminOrSecretary() && (
                  <>
                    {meeting.status === 'scheduled' && (
                      <p className="meeting-detail-info-value" style={{ marginBottom: '1rem' }}>
                        Start the meeting first to begin live transcription.
                      </p>
                    )}
                    {meeting.status === 'in-progress' && !liveTranscriptionActive && (
                      <button
                        onClick={handleStartLiveTranscription}
                        disabled={isStartingTranscription}
                        className="meeting-detail-btn meeting-detail-btn-primary"
                      >
                        {isStartingTranscription ? 'Starting...' : 'Start Recording'}
                      </button>
                    )}
                  </>
                )}
              </div>
              {meeting.status === 'in-progress' && (
                <LiveTranscript meetingId={id} isActive={liveTranscriptionActive} />
              )}
            </div>
          )}

          {meeting.transcript && meeting.status !== 'in-progress' && (
            <div className="meeting-detail-section">
              <h2 className="meeting-detail-section-title">Transcript Available</h2>
              <p className="meeting-detail-info-value">
                This meeting has a transcript available for review.
              </p>
              <Link
                to={`/transcription/${id}`}
                className="meeting-detail-btn meeting-detail-btn-secondary"
              >
                View Full Transcript
              </Link>
            </div>
          )}

          {/* Real-time Attendance Section */}
          <div className="meeting-detail-section">
            <div className="meeting-detail-section-header">
              <h2 className="meeting-detail-section-title">
                <UserIcon className="meeting-detail-section-icon" />
                Attendance ({attendance.length})
              </h2>
              {isConnected && (
                <span className="live-transcript-status live-transcript-status-connected">
                  ● Live
                </span>
              )}
            </div>
            {attendance.length > 0 ? (
              <div className="meeting-attendance-list">
                {attendance.map((record) => (
                  <div key={record.id} className="meeting-attendance-item">
                    <div className="meeting-attendance-user">
                      <strong>{record.user?.name || record.user?.email}</strong>
                      <span className="meeting-attendance-role">{record.user?.role}</span>
                    </div>
                    <div className="meeting-attendance-meta">
                      <span className={`meeting-attendance-status status-${record.status}`}>
                        {record.status}
                      </span>
                      <span className="meeting-attendance-time">
                        {new Date(record.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="meeting-detail-info-value">No attendance recorded yet.</p>
            )}
          </div>

          {/* Action Items / Tickets Section */}
          {(meeting.status === 'completed' || tasks.length > 0) && (
            <div className="meeting-detail-section">
              <div className="meeting-detail-section-header">
                <h2 className="meeting-detail-section-title">
                  <TaskIcon className="meeting-detail-section-icon" />
                  Action Items & Tickets ({tasks.length})
                </h2>
              </div>
              {loadingTasks ? (
                <p className="meeting-detail-info-value">Loading action items...</p>
              ) : tasks.length > 0 ? (
                <div className="meeting-action-items-list">
                  {tasks.map((task) => (
                    <div key={task.id} className="meeting-action-item">
                      <div className="meeting-action-item-header">
                        <h3 className="meeting-action-item-title">{task.title}</h3>
                        <span className={`meeting-action-item-status status-${task.status}`}>
                          {task.status}
                        </span>
                      </div>
                      {task.description && (
                        <p className="meeting-action-item-description">{task.description}</p>
                      )}
                      <div className="meeting-action-item-meta">
                        <span className="meeting-action-item-assigned">
                          Assigned to: {task.assignedTo?.name || task.assignedTo?.email || 'Unassigned'}
                        </span>
                        <span className="meeting-action-item-deadline">
                          Deadline: {task.deadline ? new Date(task.deadline).toLocaleDateString() : 'Not set'}
                        </span>
                        <span className={`meeting-action-item-priority priority-${task.priority || 'medium'}`}>
                          {task.priority || 'medium'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="meeting-detail-info-value">
                  No action items yet. They will be automatically generated when the meeting is completed.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MeetingDetail;
