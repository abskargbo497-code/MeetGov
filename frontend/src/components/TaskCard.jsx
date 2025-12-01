import React from 'react';
import './TaskCard.css';

const TaskCard = ({ task, onUpdate }) => {
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

  return (
    <div
      className={`task-card ${isOverdue(task.deadline, task.status) ? 'task-overdue' : ''}`}
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
        <p className="task-card-deadline">
          📅 Deadline: {formatDate(task.deadline)}
          {isOverdue(task.deadline, task.status) && (
            <span className="task-overdue-indicator"> (Overdue)</span>
          )}
        </p>
        {task.assigned_to && (
          <p className="task-card-assigned">
            👤 Assigned to: {task.assigned_to.name || task.assigned_to.email}
          </p>
        )}
        {task.meeting_id && (
          <p className="task-card-meeting">
            📅 Meeting: {task.meeting_id.title || 'N/A'}
          </p>
        )}
      </div>
      {onUpdate && (
        <div className="task-card-footer">
          {task.status !== 'completed' && (
            <button
              onClick={() => onUpdate(task._id, { status: 'completed' })}
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


