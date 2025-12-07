import React from 'react';
import { Link } from 'react-router-dom';
import './NotFound.css';

const NotFound = () => {
  return (
    <div className="not-found">
      <div className="not-found-container">
        <h1 className="not-found-title">404</h1>
        <h2 className="not-found-subtitle">Page Not Found</h2>
        <p className="not-found-message">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="not-found-actions">
          <Link to="/dashboard" className="not-found-btn-primary">
            Go to Dashboard
          </Link>
          <Link to="/meetings" className="not-found-btn-secondary">
            View Meetings
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;

