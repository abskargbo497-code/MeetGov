import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSidebar } from '../context/SidebarContext';
import { useAuth } from '../context/AuthContext';
import {
  DashboardIcon,
  PlusIcon,
  CalendarIcon,
  QRCodeIcon,
  MicrophoneIcon,
  DocumentIcon,
  TaskIcon,
  AnalyticsIcon,
  CloseIcon,
} from './icons';
import './Sidebar.css';

const Sidebar = () => {
  const location = useLocation();
  const { isOpen, closeSidebar } = useSidebar();
  const { isAdminOrSecretary, isOfficial } = useAuth();

  // Base menu items visible to all users
  const baseMenuItems = [
    { path: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
    { path: '/meetings', label: 'All Meetings', icon: CalendarIcon },
  ];

  // Admin and Secretary only items
  const adminMenuItems = [
    { path: '/meetings/create', label: 'Create Meeting', icon: PlusIcon },
    { path: '/qr-scanner', label: 'QR Scanner', icon: QRCodeIcon },
    { path: '/transcription', label: 'Transcription', icon: MicrophoneIcon },
    { path: '/minutes', label: 'Minutes', icon: DocumentIcon },
    { path: '/tasks', label: 'Tasks', icon: TaskIcon },
    { path: '/analytics', label: 'Analytics', icon: AnalyticsIcon },
  ];

  // Official only items
  const officialMenuItems = [
    { path: '/qr-scanner', label: 'QR Scanner', icon: QRCodeIcon },
    { path: '/minutes', label: 'Minutes', icon: DocumentIcon },
  ];

  // Combine menu items based on role
  const menuItems = isAdminOrSecretary()
    ? [...baseMenuItems, ...adminMenuItems]
    : isOfficial()
    ? [...baseMenuItems, ...officialMenuItems]
    : baseMenuItems;

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
          <h3 className="sidebar-title">Navigation</h3>
          <button
            className="sidebar-close"
            onClick={closeSidebar}
            aria-label="Close menu"
          >
            <CloseIcon className="sidebar-close-icon" />
          </button>
        </div>
        <nav className="sidebar-nav">
          {menuItems.map((item) => {
            const IconComponent = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`sidebar-link ${
                  location.pathname === item.path ? 'active' : ''
                }`}
                onClick={closeSidebar}
                aria-label={item.label}
              >
                <span className="sidebar-icon">
                  <IconComponent className="sidebar-icon-svg" />
                </span>
                <span className="sidebar-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;


