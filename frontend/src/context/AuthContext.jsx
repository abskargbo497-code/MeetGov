import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await api.get('/auth/me');
      setUser(response.data.data.user);
      setIsAuthenticated(true);
    } catch (error) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      const { user, accessToken, refreshToken } = response.data.data;

      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      setUser(user);
      setIsAuthenticated(true);

      return { success: true, user };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Login failed',
      };
    }
  };

  const register = async (userData) => {
    try {
      const response = await api.post('/auth/register', userData);
      const { user, accessToken, refreshToken } = response.data.data;

      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      setUser(user);
      setIsAuthenticated(true);

      return { success: true, user };
    } catch (error) {
      // Extract error message from various possible formats
      let errorMessage = 'Registration failed';
      
      // Network errors (backend not reachable)
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        errorMessage = 'Cannot connect to server. Please ensure the backend server is running on http://localhost:3000';
      }
      // Request timeout
      else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Request timeout. The server took too long to respond.';
      }
      // Server responded with error
      else if (error.response?.data) {
        // Check for message field
        if (error.response.data.message) {
          errorMessage = error.response.data.message;
        }
        // Check for errors array (validation errors)
        else if (error.response.data.errors && Array.isArray(error.response.data.errors)) {
          errorMessage = error.response.data.errors.map(err => err.msg || err.message).join(', ');
        }
        // Check for error field
        else if (error.response.data.error) {
          errorMessage = error.response.data.error;
        }
      } 
      // Other errors
      else if (error.message) {
        errorMessage = error.message;
      }
      
      console.error('Registration error:', {
        code: error.code,
        message: error.message,
        response: error.response?.data,
        config: error.config?.url,
      });
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
    setIsAuthenticated(false);
  };

  // Helper functions for role checking
  const isAdminOrSecretary = () => {
    return user && (user.role === 'super_admin' || user.role === 'secretary');
  };

  const isOfficial = () => {
    return user && user.role === 'official';
  };

  const hasRole = (role) => {
    return user && user.role === role;
  };

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    register,
    logout,
    checkAuth,
    isAdminOrSecretary,
    isOfficial,
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};


