import React, { useState, useEffect } from 'react';
import { useAPI } from '../hooks/useAPI';
import TaskCard from '../components/TaskCard';
import './TaskList.css';

const TaskList = () => {
  const { get, put } = useAPI();
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
        setTasks(result.data.data.tasks);
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
        <h1>My Tasks</h1>
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
      </div>

      {error && <div className="task-list-error">{error}</div>}

      {loading ? (
        <div className="task-list-loading">Loading tasks...</div>
      ) : tasks.length > 0 ? (
        <div className="task-list-grid">
          {tasks.map((task) => (
            <TaskCard
              key={task._id}
              task={task}
              onUpdate={handleTaskUpdate}
            />
          ))}
        </div>
      ) : (
        <div className="task-list-empty">No tasks found</div>
      )}
    </div>
  );
};

export default TaskList;


