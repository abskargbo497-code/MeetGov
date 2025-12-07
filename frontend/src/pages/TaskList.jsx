import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAPI } from '../hooks/useAPI';
import TaskCard from '../components/TaskCard';
import { WarningIcon, DocumentIcon } from '../components/icons';
import './TaskList.css';

const TaskList = () => {
  const navigate = useNavigate();
  const { get, put } = useAPI();
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    overdue: 0,
  });

  useEffect(() => {
    fetchTasks();
  }, [filter]);

  const fetchTasks = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filter === 'overdue') {
        params.overdue = 'true';
      } else if (filter !== 'all') {
        params.status = filter;
      }

      const result = await get('/tasks', { params });
      if (result.success) {
        const tasksData = result.data.data.tasks || [];
        setTasks(tasksData);
        
        // Calculate stats
        setStats({
          total: tasksData.length,
          pending: tasksData.filter(t => t.status === 'pending').length,
          inProgress: tasksData.filter(t => t.status === 'in-progress').length,
          completed: tasksData.filter(t => t.status === 'completed').length,
          overdue: tasksData.filter(t => t.status === 'overdue' || (new Date(t.deadline) < new Date() && t.status !== 'completed')).length,
        });
      } else {
        setError(result.error || 'Failed to fetch tasks');
      }
    } catch (err) {
      setError('Failed to fetch tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleTaskUpdate = async (taskId, updates) => {
    try {
      const result = await put(`/tasks/${taskId}`, updates);
      if (result.success) {
        await fetchTasks();
      } else {
        setError(result.error || 'Failed to update task');
      }
    } catch (err) {
      setError('Failed to update task');
    }
  };

  return (
    <div className="task-list">
      <div className="task-list-header">
        <div>
          <h1 className="task-list-title">My Tasks</h1>
          <p className="task-list-subtitle">Manage and track your assigned tasks</p>
        </div>
        <button
          onClick={() => navigate('/tasks/create')}
          className="task-list-create-btn"
        >
          <span>+</span> Create Task
        </button>
      </div>

      {/* Stats Cards */}
      <div className="task-list-stats">
        <div className="task-list-stat-card">
          <div className="task-list-stat-value">{stats.total}</div>
          <div className="task-list-stat-label">Total Tasks</div>
        </div>
        <div className="task-list-stat-card">
          <div className="task-list-stat-value">{stats.pending}</div>
          <div className="task-list-stat-label">Pending</div>
        </div>
        <div className="task-list-stat-card">
          <div className="task-list-stat-value">{stats.inProgress}</div>
          <div className="task-list-stat-label">In Progress</div>
        </div>
        <div className="task-list-stat-card">
          <div className="task-list-stat-value">{stats.completed}</div>
          <div className="task-list-stat-label">Completed</div>
        </div>
        <div className="task-list-stat-card task-list-stat-card-warning">
          <div className="task-list-stat-value">{stats.overdue}</div>
          <div className="task-list-stat-label">Overdue</div>
        </div>
      </div>

      {/* Filters */}
      <div className="task-list-filters">
        <button
          onClick={() => setFilter('all')}
          className={`task-list-filter ${filter === 'all' ? 'active' : ''}`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`task-list-filter ${filter === 'pending' ? 'active' : ''}`}
        >
          Pending
        </button>
        <button
          onClick={() => setFilter('in-progress')}
          className={`task-list-filter ${filter === 'in-progress' ? 'active' : ''}`}
        >
          In Progress
        </button>
        <button
          onClick={() => setFilter('completed')}
          className={`task-list-filter ${filter === 'completed' ? 'active' : ''}`}
        >
          Completed
        </button>
        <button
          onClick={() => setFilter('overdue')}
          className={`task-list-filter ${filter === 'overdue' ? 'active' : ''}`}
        >
          Overdue
        </button>
      </div>

      {error && (
        <div className="task-list-error">
          <WarningIcon className="task-list-error-icon" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="task-list-loading">
          <div className="task-list-spinner"></div>
          <p>Loading tasks...</p>
        </div>
      ) : tasks.length > 0 ? (
        <div className="task-list-grid">
          {tasks.map((task) => (
            <TaskCard
              key={task.id || task._id || Math.random()}
              task={task}
              onUpdate={handleTaskUpdate}
            />
          ))}
        </div>
      ) : (
        <div className="task-list-empty">
          <DocumentIcon className="task-list-empty-icon" />
          <p>No tasks found</p>
          <button
            onClick={() => navigate('/tasks/create')}
            className="task-list-empty-btn"
          >
            Create Your First Task
          </button>
        </div>
      )}
    </div>
  );
};

export default TaskList;


