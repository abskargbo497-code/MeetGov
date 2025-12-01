import React from 'react';
import { Link } from 'react-router-dom';
import './MeetingCard.css';

const MeetingCard = ({ meeting }) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status) => {
    const statusClasses = {
      scheduled: 'status-scheduled',
      'in-progress': 'status-in-progress',
      completed: 'status-completed',
      cancelled: 'status-cancelled',
    };
    return statusClasses[status] || 'status-scheduled';
  };

  return (
    <div className="meeting-card">
      <div className="meeting-card-header">
        <h3 className="meeting-card-title">{meeting.title}</h3>
        <span className={`meeting-card-status ${getStatusBadge(meeting.status)}`}>
          {meeting.status}
        </span>
      </div>
      <div className="meeting-card-body">
        <p className="meeting-card-datetime">
          📅 {formatDate(meeting.datetime)}
        </p>
        {meeting.location && (
          <p className="meeting-card-location">📍 {meeting.location}</p>
        )}
        {meeting.description && (
          <p className="meeting-card-description">{meeting.description}</p>
        )}
        {meeting.organizer_id && (
          <p className="meeting-card-organizer">
            👤 Organizer: {meeting.organizer_id.name || meeting.organizer_id.email}
          </p>
        )}
      </div>
      <div className="meeting-card-footer">
        <Link
          to={`/meetings/${meeting._id}`}
          className="meeting-card-link"
        >
          View Details
        </Link>
        {meeting.qr_code_url && (
          <Link
            to={`/meetings/${meeting._id}/qr`}
            className="meeting-card-link"
          >
            View QR Code
          </Link>
        )}
      </div>
    </div>
  );
};

export default MeetingCard;


