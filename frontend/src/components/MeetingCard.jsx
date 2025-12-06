import React from 'react';
import { Link } from 'react-router-dom';
import { ClockIcon, LocationIcon, UserIcon } from './icons';
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
      rescheduled: 'status-rescheduled',
      cancelled: 'status-cancelled',
    };
    return statusClasses[status] || 'status-scheduled';
  };

  const getStatusLabel = (status) => {
    const statusLabels = {
      scheduled: 'Scheduled',
      'in-progress': 'In Progress',
      completed: 'Completed',
      rescheduled: 'Rescheduled',
      cancelled: 'Cancelled',
    };
    return statusLabels[status] || status;
  };

  return (
    <div className="meeting-card">
      <div className="meeting-card-header">
        <h3 className="meeting-card-title">{meeting.title}</h3>
        <span className={`meeting-card-status ${getStatusBadge(meeting.status)}`}>
          {getStatusLabel(meeting.status)}
        </span>
      </div>
      <div className="meeting-card-body">
        <div className="meeting-card-datetime">
          <ClockIcon className="meeting-card-icon" />
          <span>{formatDate(meeting.datetime)}</span>
        </div>
        {meeting.location && (
          <div className="meeting-card-location">
            <LocationIcon className="meeting-card-icon" />
            <span>{meeting.location}</span>
          </div>
        )}
        {meeting.description && (
          <p className="meeting-card-description">{meeting.description}</p>
        )}
        {meeting.organizer_id && (
          <div className="meeting-card-organizer">
            <UserIcon className="meeting-card-icon" />
            <span>Organizer: {meeting.organizer_id.name || meeting.organizer_id.email}</span>
          </div>
        )}
      </div>
      <div className="meeting-card-footer">
        <Link
          to={`/meetings/${meeting.id || meeting._id}`}
          className="meeting-card-link"
        >
          View Details
        </Link>
        {meeting.qr_code_url && (
          <Link
            to={`/meetings/${meeting.id || meeting._id}/qr`}
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


