import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAPI } from '../hooks/useAPI';
import { useAuth } from '../context/AuthContext';
import { SuccessIcon, WarningIcon } from '../components/icons';
import './TaskCreation.css';

const TaskCreation = () => {
  const navigate = useNavigate();
  const { post } = useAPI();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    meeting_id: '',
    assigned_to: '',
    priority: 'medium',
    deadline: '',
  });

  // Options for dropdowns
  const [meetings, setMeetings] = useState([]);
  const [users, setUsers] = useState([]);
  const { get } = useAPI();

  useEffect(() => {
    fetchOptions();
  }, []);

  const fetchOptions = async () => {
    try {
      // Fetch meetings
      const meetingsRes = await get('/meetings');
      if (meetingsRes.success) {
        setMeetings(meetingsRes.data.data.meetings || []);
      }

      // Fetch users (for assignment)
      // Note: You may need to add a GET /users endpoint or get from meetings
      // For now, we'll handle assignment via user ID
    } catch (err) {
      console.error('Error fetching options:', err);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.title || !formData.deadline || !formData.meeting_id) {
        setError('Please fill in all required fields');
        setLoading(false);
        return;
      }

      const result = await post('/tasks', {
        ...formData,
        assigned_to: formData.assigned_to || user.id,
        meeting_id: parseInt(formData.meeting_id),
      });

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          navigate('/tasks');
        }, 1500);
      } else {
        setError(result.error || 'Failed to create task');
      }
    } catch (err) {
      setError('Failed to create task. Please try again.');
      console.error('Task creation error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="task-creation">
      <div className="task-creation-header">
        <h1 className="task-creation-title">Create New Task</h1>
        <p className="task-creation-subtitle">Assign action items from meetings</p>
      </div>

      <div className="task-creation-container">
        {success && (
          <div className="task-creation-success">
            <SuccessIcon className="task-creation-success-icon" />
            <span>Task created successfully! Redirecting...</span>
          </div>
        )}

        {error && (
          <div className="task-creation-error">
            <WarningIcon className="task-creation-error-icon" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="task-creation-form">
          <div className="task-form-group">
            <label htmlFor="title" className="task-form-label">
              Task Title <span className="task-form-required">*</span>
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              className="task-form-input"
              placeholder="Enter task title"
              required
            />
          </div>

          <div className="task-form-group">
            <label htmlFor="description" className="task-form-label">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="task-form-textarea"
              placeholder="Enter task description"
              rows={4}
            />
          </div>

          <div className="task-form-row">
            <div className="task-form-group">
              <label htmlFor="meeting_id" className="task-form-label">
                Related Meeting <span className="task-form-required">*</span>
              </label>
              <select
                id="meeting_id"
                name="meeting_id"
                value={formData.meeting_id}
                onChange={handleChange}
                className="task-form-select"
                required
              >
                <option value="">Select a meeting</option>
                {meetings.map((meeting) => (
                  <option key={meeting.id} value={meeting.id}>
                    {meeting.title} - {new Date(meeting.datetime).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>

            <div className="task-form-group">
              <label htmlFor="assigned_to" className="task-form-label">
                Assign To
              </label>
              <input
                type="text"
                id="assigned_to"
                name="assigned_to"
                value={formData.assigned_to}
                onChange={handleChange}
                className="task-form-input"
                placeholder="User ID (or leave blank for yourself)"
              />
            </div>
          </div>

          <div className="task-form-row">
            <div className="task-form-group">
              <label htmlFor="priority" className="task-form-label">
                Priority
              </label>
              <select
                id="priority"
                name="priority"
                value={formData.priority}
                onChange={handleChange}
                className="task-form-select"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div className="task-form-group">
              <label htmlFor="deadline" className="task-form-label">
                Deadline <span className="task-form-required">*</span>
              </label>
              <input
                type="datetime-local"
                id="deadline"
                name="deadline"
                value={formData.deadline}
                onChange={handleChange}
                className="task-form-input"
                required
              />
            </div>
          </div>

          <div className="task-form-actions">
            <button
              type="button"
              onClick={() => navigate('/tasks')}
              className="task-form-btn task-form-btn-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="task-form-btn task-form-btn-submit"
            >
              {loading ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskCreation;

