import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Sidebar.css';

const Sidebar = () => {
  const location = useLocation();

  const menuItems = [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/meetings/create', label: 'Create Meeting', icon: '➕' },
    { path: '/meetings', label: 'All Meetings', icon: '📅' },
    { path: '/qr-scanner', label: 'QR Scanner', icon: '📷' },
    { path: '/transcription', label: 'Transcription', icon: '🎤' },
    { path: '/minutes', label: 'Minutes', icon: '📝' },
    { path: '/tasks', label: 'Tasks', icon: '✅' },
  ];

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`sidebar-link ${
              location.pathname === item.path ? 'active' : ''
            }`}
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;


