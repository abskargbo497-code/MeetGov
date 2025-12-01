import React, { useState, useEffect } from 'react';
import { useAPI } from '../hooks/useAPI';
import SummaryPanel from '../components/SummaryPanel';
import './MinutesReview.css';

const MinutesReview = () => {
  const { get } = useAPI();
  const [meetings, setMeetings] = useState([]);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMeetings();
  }, []);

  const fetchMeetings = async () => {
    setLoading(true);
    try {
      const result = await get('/meetings?status=completed');
      if (result.success) {
        setMeetings(result.data.data.meetings);
      }
    } catch (err) {
      setError('Failed to fetch meetings');
    } finally {
      setLoading(false);
    }
  };

  const handleMeetingSelect = async (meetingId) => {
    setLoading(true);
    setError('');
    try {
      const result = await get(`/transcription/${meetingId}`);
      if (result.success) {
        setTranscript(result.data.data.transcript);
        setSelectedMeeting(meetingId);
      } else {
        setError(result.error || 'Failed to fetch transcript');
      }
    } catch (err) {
      setError('Failed to fetch transcript');
    } finally {
      setLoading(false);
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
                {meetings.map((meeting) => (
                  <button
                    key={meeting._id}
                    onClick={() => handleMeetingSelect(meeting._id)}
                    className={`minutes-review-meeting-item ${
                      selectedMeeting === meeting._id ? 'active' : ''
                    }`}
                  >
                    <div className="minutes-review-meeting-title">
                      {meeting.title}
                    </div>
                    <div className="minutes-review-meeting-date">
                      {new Date(meeting.datetime).toLocaleDateString()}
                    </div>
                  </button>
                ))}
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
            {transcript && (
              <SummaryPanel
                summary={transcript.summary_text}
                actionItems={transcript.action_items_json}
                minutes={transcript.minutes_formatted}
              />
            )}
            {!selectedMeeting && !loading && (
              <div className="minutes-review-placeholder">
                Select a meeting to view minutes
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MinutesReview;


