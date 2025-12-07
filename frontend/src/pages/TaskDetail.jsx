import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAPI } from '../hooks/useAPI';
import { WarningIcon, ClockIcon, UserIcon, DocumentIcon, CalendarIcon, SuccessIcon } from '../components/icons';
import './TaskDetail.css';

const TaskDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { get, put, del } = useAPI();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);

  useEffect(() => {
    fetchTask();
  }, [id]);

  const fetchTask = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await get(`/tasks/${id}`);
      if (result.success) {
        setTask(result.data.data.task);
      } else {
        setError(result.error || 'Failed to fetch task');
      }
    } catch (err) {
      setError('Failed to fetch task');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (newStatus) => {
    setUpdating(true);
    try {
      const result = await put(`/tasks/${id}`, { status: newStatus });
      if (result.success) {
        await fetchTask();
      } else {
        setError(result.error || 'Failed to update task');
      }
    } catch (err) {
      setError('Failed to update task');
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this task?')) {
      return;
    }

    setUpdating(true);
    try {
      const result = await del(`/tasks/${id}`);
      if (result.success) {
        navigate('/tasks');
      } else {
        setError(result.error || 'Failed to delete task');
      }
    } catch (err) {
      setError('Failed to delete task');
    } finally {
      setUpdating(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isOverdue = (deadline, status) => {
    return deadline && new Date(deadline) < new Date() && status !== 'completed';
  };

  if (loading) {
    return (
      <div className="task-detail-loading">
        <div className="task-detail-spinner"></div>
        <p>Loading task details...</p>
      </div>
    );
  }

  if (error && !task) {
    return (
      <div className="task-detail-error">
        <WarningIcon className="task-detail-error-icon" />
        <span>{error}</span>
        <button onClick={() => navigate('/tasks')} className="task-detail-back-btn">
          Back to Tasks
        </button>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="task-detail-empty">
        <p>Task not found</p>
        <button onClick={() => navigate('/tasks')} className="task-detail-back-btn">
          Back to Tasks
        </button>
      </div>
    );
  }

  return (
    <div className="task-detail">
      <div className="task-detail-header">
        <button onClick={() => navigate('/tasks')} className="task-detail-back">
          ← Back to Tasks
        </button>
        <div className="task-detail-actions">
          {task.status !== 'completed' && (
            <button
              onClick={() => handleStatusUpdate('completed')}
              disabled={updating}
              className="task-detail-action-btn task-detail-complete"
            >
              Mark Complete
            </button>
          )}
          <button
            onClick={() => setShowEditForm(!showEditForm)}
            className="task-detail-action-btn task-detail-edit"
          >
            {showEditForm ? 'Cancel Edit' : 'Edit'}
          </button>
        </div>
      </div>

      <div className="task-detail-container">
        {error && (
          <div className="task-detail-error-message">
            <WarningIcon className="task-detail-error-icon" />
            <span>{error}</span>
          </div>
        )}

        <div className="task-detail-main">
          <div className="task-detail-title-section">
            <h1 className="task-detail-title">{task.title}</h1>
            <div className="task-detail-badges">
              <span className={`task-detail-status task-detail-status-${task.status}`}>
                {task.status}
              </span>
              <span className={`task-detail-priority task-detail-priority-${task.priority}`}>
                {task.priority}
              </span>
            </div>
          </div>

          {task.description && (
            <div className="task-detail-section">
              <h2 className="task-detail-section-title">Description</h2>
              <p className="task-detail-description">{task.description}</p>
            </div>
          )}

          <div className="task-detail-info-grid">
            <div className="task-detail-info-item">
              <span className="task-detail-info-label">
                <ClockIcon className="task-detail-label-icon" />
                Deadline
              </span>
              <span className={`task-detail-info-value ${isOverdue(task.deadline, task.status) ? 'task-detail-overdue' : ''}`}>
                {formatDate(task.deadline)}
              </span>
            </div>

            {task.assignedTo && (
              <div className="task-detail-info-item">
                <span className="task-detail-info-label">
                  <UserIcon className="task-detail-label-icon" />
                  Assigned To
                </span>
                <span className="task-detail-info-value">
                  {task.assignedTo.name || task.assignedTo.email}
                </span>
              </div>
            )}

            {task.assignedBy && (
              <div className="task-detail-info-item">
                <span className="task-detail-info-label">
                  <DocumentIcon className="task-detail-label-icon" />
                  Assigned By
                </span>
                <span className="task-detail-info-value">
                  {task.assignedBy.name || task.assignedBy.email}
                </span>
              </div>
            )}

            {task.meeting && (
              <div className="task-detail-info-item">
                <span className="task-detail-info-label">
                  <CalendarIcon className="task-detail-label-icon" />
                  Related Meeting
                </span>
                <span className="task-detail-info-value">
                  {task.meeting.title}
                </span>
              </div>
            )}

            {task.completed_at && (
              <div className="task-detail-info-item">
                <span className="task-detail-info-label">
                  <SuccessIcon className="task-detail-label-icon" />
                  Completed At
                </span>
                <span className="task-detail-info-value">
                  {formatDate(task.completed_at)}
                </span>
              </div>
            )}
          </div>

          {/* Status Update Buttons */}
          {task.status !== 'completed' && (
            <div className="task-detail-status-actions">
              <h2 className="task-detail-section-title">Update Status</h2>
              <div className="task-detail-status-buttons">
                {task.status !== 'pending' && (
                  <button
                    onClick={() => handleStatusUpdate('pending')}
                    disabled={updating}
                    className="task-detail-status-btn task-detail-status-btn-pending"
                  >
                    Set to Pending
                  </button>
                )}
                {task.status !== 'in-progress' && (
                  <button
                    onClick={() => handleStatusUpdate('in-progress')}
                    disabled={updating}
                    className="task-detail-status-btn task-detail-status-btn-progress"
                  >
                    Set to In Progress
                  </button>
                )}
                <button
                  onClick={() => handleStatusUpdate('completed')}
                  disabled={updating}
                  className="task-detail-status-btn task-detail-status-btn-complete"
                >
                  Mark as Completed
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskDetail;

