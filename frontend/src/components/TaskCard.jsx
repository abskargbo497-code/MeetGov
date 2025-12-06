import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ClockIcon, UserIcon, CalendarIcon } from './icons';
import './TaskCard.css';

const TaskCard = ({ task, onUpdate }) => {
  const navigate = useNavigate();
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const isOverdue = (deadline, status) => {
    return new Date(deadline) < new Date() && status !== 'completed';
  };

  const getStatusBadge = (status) => {
    const statusClasses = {
      pending: 'status-pending',
      'in-progress': 'status-in-progress',
      completed: 'status-completed',
      overdue: 'status-overdue',
      cancelled: 'status-cancelled',
    };
    return statusClasses[status] || 'status-pending';
  };

  const getPriorityBadge = (priority) => {
    const priorityClasses = {
      low: 'priority-low',
      medium: 'priority-medium',
      high: 'priority-high',
    };
    return priorityClasses[priority] || 'priority-medium';
  };

  const handleCardClick = () => {
    const taskId = task.id || task._id;
    if (taskId) {
      navigate(`/tasks/${taskId}`);
    }
  };

  return (
    <div
      className={`task-card ${isOverdue(task.deadline, task.status) ? 'task-overdue' : ''}`}
      onClick={handleCardClick}
      style={{ cursor: 'pointer' }}
    >
      <div className="task-card-header">
        <h3 className="task-card-title">{task.title}</h3>
        <div className="task-card-badges">
          <span className={`task-card-status ${getStatusBadge(task.status)}`}>
            {task.status}
          </span>
          <span className={`task-card-priority ${getPriorityBadge(task.priority)}`}>
            {task.priority}
          </span>
        </div>
      </div>
      <div className="task-card-body">
        {task.description && (
          <p className="task-card-description">{task.description}</p>
        )}
        <div className="task-card-deadline">
          <ClockIcon className="task-card-icon" />
          <span>Deadline: {formatDate(task.deadline)}</span>
          {isOverdue(task.deadline, task.status) && (
            <span className="task-overdue-indicator"> (Overdue)</span>
          )}
        </div>
        {task.assignedTo && (
          <div className="task-card-assigned">
            <UserIcon className="task-card-icon" />
            <span>Assigned to: {task.assignedTo.name || task.assignedTo.email}</span>
          </div>
        )}
        {task.assigned_to && !task.assignedTo && (
          <div className="task-card-assigned">
            <UserIcon className="task-card-icon" />
            <span>Assigned to: {task.assigned_to.name || task.assigned_to.email || 'N/A'}</span>
          </div>
        )}
        {task.meeting && (
          <div className="task-card-meeting">
            <CalendarIcon className="task-card-icon" />
            <span>Meeting: {task.meeting.title || 'N/A'}</span>
          </div>
        )}
        {task.meeting_id && !task.meeting && typeof task.meeting_id === 'number' && (
          <div className="task-card-meeting">
            <CalendarIcon className="task-card-icon" />
            <span>Meeting ID: {task.meeting_id}</span>
          </div>
        )}
      </div>
      {onUpdate && (
        <div className="task-card-footer" onClick={(e) => e.stopPropagation()}>
          {task.status !== 'completed' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const taskId = task.id || task._id;
                onUpdate(taskId, { status: 'completed' });
              }}
              className="task-card-btn task-card-btn-complete"
            >
              Mark Complete
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default TaskCard;


