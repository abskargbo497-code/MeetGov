import React, { createContext, useContext, useState } from 'react';
import api from '../utils/api';

const MeetingContext = createContext(null);

export const useMeeting = () => {
  const context = useContext(MeetingContext);
  if (!context) {
    throw new Error('useMeeting must be used within a MeetingProvider');
  }
  return context;
};

export const MeetingProvider = ({ children }) => {
  const [meetings, setMeetings] = useState([]);
  const [currentMeeting, setCurrentMeeting] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchMeetings = async (filters = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams(filters);
      const response = await api.get(`/meetings?${params}`);
      setMeetings(response.data.data.meetings);
      return { success: true, meetings: response.data.data.meetings };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to fetch meetings',
      };
    } finally {
      setLoading(false);
    }
  };

  const createMeeting = async (meetingData) => {
    setLoading(true);
    try {
      const response = await api.post('/meetings', meetingData);
      const newMeeting = response.data.data.meeting;
      setMeetings([newMeeting, ...meetings]);
      return { success: true, meeting: newMeeting };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to create meeting',
      };
    } finally {
      setLoading(false);
    }
  };

  const fetchMeeting = async (meetingId) => {
    setLoading(true);
    try {
      const response = await api.get(`/meetings/${meetingId}`);
      const meeting = response.data.data.meeting;
      setCurrentMeeting(meeting);
      return { success: true, meeting };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to fetch meeting',
      };
    } finally {
      setLoading(false);
    }
  };

  const logAttendance = async (meetingId, qrToken = null, location = null) => {
    try {
      const response = await api.post(`/meetings/${meetingId}/attendance`, {
        qrToken,
        location,
      });
      return { success: true, attendance: response.data.data.attendance };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to log attendance',
      };
    }
  };

  const value = {
    meetings,
    currentMeeting,
    loading,
    fetchMeetings,
    createMeeting,
    fetchMeeting,
    logAttendance,
    setCurrentMeeting,
  };

  return (
    <MeetingContext.Provider value={value}>{children}</MeetingContext.Provider>
  );
};


