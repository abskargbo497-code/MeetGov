import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMeeting } from '../context/MeetingContext';
import { useAPI } from '../hooks/useAPI';
import './MeetingCreation.css';

const MeetingCreation = () => {
  const navigate = useNavigate();
  const { createMeeting } = useMeeting();
  const { post } = useAPI();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    datetime: '',
    location: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await createMeeting(formData);

    if (result.success) {
      navigate(`/meetings/${result.meeting._id}`);
    } else {
      setError(result.error || 'Failed to create meeting');
    }

    setLoading(false);
  };

  return (
    <div className="meeting-creation">
      <div className="meeting-creation-container">
        <h1 className="meeting-creation-title">Create New Meeting</h1>
        <form onSubmit={handleSubmit} className="meeting-creation-form">
          {error && <div className="meeting-creation-error">{error}</div>}
          <div className="meeting-creation-form-group">
            <label htmlFor="title">Meeting Title *</label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              placeholder="Enter meeting title"
            />
          </div>
          <div className="meeting-creation-form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="4"
              placeholder="Enter meeting description"
            />
          </div>
          <div className="meeting-creation-form-row">
            <div className="meeting-creation-form-group">
              <label htmlFor="datetime">Date & Time *</label>
              <input
                type="datetime-local"
                id="datetime"
                name="datetime"
                value={formData.datetime}
                onChange={handleChange}
                required
              />
            </div>
            <div className="meeting-creation-form-group">
              <label htmlFor="location">Location</label>
              <input
                type="text"
                id="location"
                name="location"
                value={formData.location}
                onChange={handleChange}
                placeholder="Enter meeting location"
              />
            </div>
          </div>
          <div className="meeting-creation-form-actions">
            <button
              type="button"
              onClick={() => navigate('/meetings')}
              className="meeting-creation-button meeting-creation-button-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="meeting-creation-button meeting-creation-button-submit"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Meeting'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MeetingCreation;


