import React, { useState, useEffect } from 'react';
import { useAPI } from '../hooks/useAPI';
import SummaryPanel from '../components/SummaryPanel';
import { DocumentIcon, CalendarIcon, LocationIcon, UserIcon } from '../components/icons';
import './MinutesReview.css';

const MinutesReview = () => {
  const { get } = useAPI();
  const [meetings, setMeetings] = useState([]);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);

  useEffect(() => {
    fetchMeetings();
  }, []);

  const fetchMeetings = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await get('/meetings?status=completed');
      if (result.success) {
        const meetingsData = result.data.data.meetings || [];
        // Ensure meetings have required fields
        const meetingsWithData = meetingsData.map(meeting => ({
          id: meeting.id,
          title: meeting.title || 'Untitled Meeting',
          datetime: meeting.datetime,
          location: meeting.location,
          organizer: meeting.organizer,
          status: meeting.status,
        }));
        setMeetings(meetingsWithData);
      } else {
        setError(result.error || 'Failed to fetch meetings');
      }
    } catch (err) {
      const errorMsg = err.message === 'Network Error' 
        ? 'Cannot connect to server. Please ensure the backend is running.'
        : 'Failed to fetch meetings';
      setError(errorMsg);
      console.error('Error fetching meetings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMeetingSelect = async (meetingId) => {
    setLoading(true);
    setError('');
    try {
      // Fetch both meeting details and transcript
      const [meetingResult, transcriptResult] = await Promise.all([
        get(`/meetings/${meetingId}`),
        get(`/transcription/${meetingId}`),
      ]);

      if (meetingResult.success && transcriptResult.success) {
        const meeting = meetingResult.data.data.meeting;
        const transcript = transcriptResult.data.data.transcript;
        
        // Combine meeting and transcript data
        setTranscript({
          ...transcript,
          meeting: {
            id: meeting.id,
            title: meeting.title,
            datetime: meeting.datetime,
            location: meeting.location,
            organizer: meeting.organizer,
          },
        });
        setSelectedMeeting(meetingId);
      } else {
        const errorMsg = transcriptResult.error || meetingResult.error || 'Failed to fetch data';
        setError(errorMsg);
      }
    } catch (err) {
      const errorMsg = err.message === 'Network Error'
        ? 'Cannot connect to server. Please ensure the backend is running.'
        : 'Failed to fetch transcript';
      setError(errorMsg);
      console.error('Error fetching transcript:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!selectedMeeting) return;

    setGeneratingReport(true);
    setError('');

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const token = localStorage.getItem('accessToken');
      
      // Generate PDF report
      const response = await fetch(
        `${apiUrl}/api/meetings/${selectedMeeting}/generate-report?format=pdf`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to generate report');
      }

      // Download the PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meeting-report-${selectedMeeting}-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err.message || 'Failed to generate report');
      console.error('Error generating report:', err);
    } finally {
      setGeneratingReport(false);
    }
  };

  return (
    <div className="minutes-review">
      <div className="minutes-review-container">
        <h1 className="minutes-review-title">Meeting Minutes Review</h1>

        <div className="minutes-review-content">
          <div className="minutes-review-sidebar">
            <h2>Completed Meetings</h2>
            {loading && !meetings.length ? (
              <div className="minutes-review-loading">Loading...</div>
            ) : meetings.length > 0 ? (
              <div className="minutes-review-meetings">
                {meetings.map((meeting) => {
                  const meetingId = meeting.id || meeting._id;
                  return (
                  <button
                    key={meetingId}
                    onClick={() => handleMeetingSelect(meetingId)}
                    className={`minutes-review-meeting-item ${
                      selectedMeeting === meetingId ? 'active' : ''
                    }`}
                  >
                    <div className="minutes-review-meeting-title">
                      {meeting.title}
                    </div>
                    <div className="minutes-review-meeting-date">
                      {new Date(meeting.datetime).toLocaleDateString()}
                    </div>
                  </button>
                  );
                })}
              </div>
            ) : (
              <p className="minutes-review-empty">No completed meetings</p>
            )}
          </div>

          <div className="minutes-review-main">
            {error && <div className="minutes-review-error">{error}</div>}
            {loading && selectedMeeting && (
              <div className="minutes-review-loading">Loading minutes...</div>
            )}
            {transcript && transcript.meeting && (
              <div className="minutes-review-meeting-header">
                <div className="minutes-review-meeting-info">
                  <h2 className="minutes-review-meeting-name">
                    {transcript.meeting.title || 'Untitled Meeting'}
                  </h2>
                  <div className="minutes-review-meeting-details">
                    <span className="minutes-review-meeting-detail-item">
                      <CalendarIcon className="minutes-review-icon" />
                      {new Date(transcript.meeting.datetime).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {transcript.meeting.location && (
                      <span className="minutes-review-meeting-detail-item">
                        <LocationIcon className="minutes-review-icon" />
                        {transcript.meeting.location}
                      </span>
                    )}
                    {transcript.meeting.organizer && (
                      <span className="minutes-review-meeting-detail-item">
                        <UserIcon className="minutes-review-icon" />
                        Organizer: {transcript.meeting.organizer.name || transcript.meeting.organizer.email}
                      </span>
                    )}
                  </div>
                </div>
                <div className="minutes-review-actions">
                  <button
                    onClick={handleGenerateReport}
                    disabled={generatingReport}
                    className="minutes-review-btn minutes-review-btn-primary"
                  >
                    <DocumentIcon className="minutes-review-btn-icon" />
                    {generatingReport ? 'Generating...' : 'Generate Report'}
                  </button>
                </div>
              </div>
            )}
            {transcript && (
              <SummaryPanel
                summary={transcript.summary_text}
                actionItems={transcript.action_items_json}
                minutes={transcript.minutes_formatted}
                rawText={transcript.raw_text}
              />
            )}
            {!selectedMeeting && !loading && (
              <div className="minutes-review-placeholder">
                <DocumentIcon className="minutes-review-placeholder-icon" />
                <p>Select a completed meeting to view minutes, summary, and action items</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MinutesReview;


