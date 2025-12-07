import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMeeting } from '../context/MeetingContext';
import { useAPI } from '../hooks/useAPI';
import { WarningIcon, PlusIcon, CloseIcon } from '../components/icons';
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
  const [guestEmails, setGuestEmails] = useState([]);
  const [guestEmailInput, setGuestEmailInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [invitingGuests, setInvitingGuests] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleAddGuestEmail = () => {
    const email = guestEmailInput.trim().toLowerCase();
    
    if (!email) {
      setError('Please enter an email address');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (guestEmails.includes(email)) {
      setError('This email has already been added');
      return;
    }

    setGuestEmails([...guestEmails, email]);
    setGuestEmailInput('');
    setError('');
  };

  const handleRemoveGuestEmail = (emailToRemove) => {
    setGuestEmails(guestEmails.filter(email => email !== emailToRemove));
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddGuestEmail();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await createMeeting(formData);

    if (result.success) {
      const meetingId = result.meeting?.id || result.meeting?._id || result.meetingId;
      
      // If there are guest emails, invite them
      if (meetingId && guestEmails.length > 0) {
        setInvitingGuests(true);
        try {
          const inviteResult = await post(`/meetings/${meetingId}/invite-guest`, {
            emails: guestEmails,
          });
          
          if (inviteResult.success) {
            navigate(`/meetings/${meetingId}`);
          } else {
            // Meeting created but guest invitation failed
            setError(inviteResult.error || 'Meeting created but failed to invite guests');
            setInvitingGuests(false);
            setLoading(false);
            return;
          }
        } catch (err) {
          setError('Meeting created but failed to invite guests');
          setInvitingGuests(false);
          setLoading(false);
          return;
        }
      } else if (meetingId) {
        navigate(`/meetings/${meetingId}`);
      } else {
        navigate('/meetings');
      }
    } else {
      setError(result.error || 'Failed to create meeting');
    }

    setLoading(false);
    setInvitingGuests(false);
  };

  return (
    <div className="meeting-creation">
      <div className="meeting-creation-container">
        <h1 className="meeting-creation-title">Create New Meeting</h1>
        <form onSubmit={handleSubmit} className="meeting-creation-form">
          {error && (
            <div className="meeting-creation-error">
              <WarningIcon className="meeting-creation-error-icon" />
              <span>{error}</span>
            </div>
          )}
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
          
          {/* Guest Invitation Section */}
          <div className="meeting-creation-form-group">
            <label htmlFor="guestEmails">Guest Invitations (Optional)</label>
            <div className="guest-invitation-container">
              <div className="guest-email-input-group">
                <input
                  type="email"
                  id="guestEmails"
                  value={guestEmailInput}
                  onChange={(e) => setGuestEmailInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Enter guest email address"
                  className="guest-email-input"
                />
                <button
                  type="button"
                  onClick={handleAddGuestEmail}
                  className="guest-add-button"
                  disabled={!guestEmailInput.trim()}
                >
                  <PlusIcon className="guest-add-icon" />
                  Add
                </button>
              </div>
              
              {guestEmails.length > 0 && (
                <div className="guest-email-list">
                  <p className="guest-email-label">Guests to invite ({guestEmails.length}):</p>
                  <div className="guest-email-tags">
                    {guestEmails.map((email, index) => (
                      <div key={index} className="guest-email-tag">
                        <span>{email}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveGuestEmail(email)}
                          className="guest-email-remove"
                          aria-label={`Remove ${email}`}
                        >
                          <CloseIcon className="guest-email-remove-icon" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <p className="guest-invitation-note" style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.5rem' }}>
                Guests will receive an email invitation with a link to view meeting details. No account required.
              </p>
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


