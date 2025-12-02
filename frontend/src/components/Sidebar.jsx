import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSidebar } from '../context/SidebarContext';
import './Sidebar.css';

const Sidebar = () => {
  const location = useLocation();
  const { isOpen, closeSidebar } = useSidebar();

  const menuItems = [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/meetings/create', label: 'Create Meeting', icon: '➕' },
    { path: '/meetings', label: 'All Meetings', icon: '📅' },
    { path: '/qr-scanner', label: 'QR Scanner', icon: '📷' },
    { path: '/transcription', label: 'Transcription', icon: '🎤' },
    { path: '/minutes', label: 'Minutes', icon: '📝' },
    { path: '/tasks', label: 'Tasks', icon: '✅' },
  ];

  // Close sidebar when route changes on mobile
  useEffect(() => {
    if (window.innerWidth <= 768) {
      closeSidebar();
    }
  }, [location.pathname, closeSidebar]);

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div className="sidebar-overlay" onClick={closeSidebar}></div>
      )}
      <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <h3 className="sidebar-title">Menu</h3>
          <button
            className="sidebar-close"
            onClick={closeSidebar}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>
        <nav className="sidebar-nav">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`sidebar-link ${
                location.pathname === item.path ? 'active' : ''
              }`}
              onClick={closeSidebar}
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span className="sidebar-label">{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;


