import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSidebar } from '../context/SidebarContext';
import './Navbar.css';

const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { toggleSidebar } = useSidebar();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-left">
          {isAuthenticated && (
            <button
              className="navbar-menu-toggle"
              onClick={toggleSidebar}
              aria-label="Toggle menu"
            >
              <span className="navbar-menu-icon">☰</span>
            </button>
          )}
          <Link to="/" className="navbar-brand">
            Digital Meeting Assistant
          </Link>
        </div>
        <div className="navbar-menu">
          {isAuthenticated ? (
            <>
              <Link to="/dashboard" className="navbar-link navbar-link-desktop">
                Dashboard
              </Link>
              <Link to="/meetings" className="navbar-link navbar-link-desktop">
                Meetings
              </Link>
              <Link to="/tasks" className="navbar-link navbar-link-desktop">
                Tasks
              </Link>
              <div className="navbar-user">
                <span className="navbar-user-name">{user?.name}</span>
                <span className="navbar-user-role navbar-user-role-desktop">
                  ({user?.role})
                </span>
                <button onClick={handleLogout} className="navbar-logout-btn">
                  Logout
                </button>
              </div>
            </>
          ) : (
            <Link to="/login" className="navbar-link">
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;


