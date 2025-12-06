/**
 * Transcription Page
 * Standalone page for uploading audio files for transcription
 * Allows selecting a meeting and uploading audio files
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAPI } from '../hooks/useAPI';
import { useUpload } from '../hooks/useUpload';
import { WarningIcon, MicrophoneIcon } from '../components/icons';
import './Transcription.css';

const Transcription = () => {
  const navigate = useNavigate();
  const { get } = useAPI();
  const { upload, uploading, progress } = useUpload();
  const [meetings, setMeetings] = useState([]);
  const [selectedMeeting, setSelectedMeeting] = useState('');
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch available meetings
  useEffect(() => {
    fetchMeetings();
  }, []);

  const fetchMeetings = async () => {
    setLoading(true);
    try {
      const result = await get('/meetings?status=scheduled,in-progress');
      if (result.success) {
        setMeetings(result.data.data.meetings || []);
      }
    } catch (err) {
      console.error('Error fetching meetings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Validate file type
      const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/m4a', 'audio/webm', 'audio/ogg', 'audio/aac'];
      if (!allowedTypes.includes(selectedFile.type)) {
        setError('Please select a valid audio file (MP3, WAV, M4A, WebM, OGG, AAC)');
        return;
      }

      // Validate file size (100MB limit)
      const maxSize = 100 * 1024 * 1024; // 100MB
      if (selectedFile.size > maxSize) {
        setError('File size must be less than 100MB');
        return;
      }

      setFile(selectedFile);
      setFileName(selectedFile.name);
      setError('');
      setSuccess('');
    }
  };

  const handleUpload = async () => {
    if (!selectedMeeting) {
      setError('Please select a meeting');
      return;
    }

    if (!file) {
      setError('Please select an audio file');
      return;
    }

    setError('');
    setSuccess('');
    
    try {
      const result = await upload(`/meetings/${selectedMeeting}/audio`, file);
      
      if (result.success) {
        setSuccess('Audio file uploaded successfully! Processing transcription...');
        setFile(null);
        setFileName('');
        // Redirect to transcription viewer after a short delay
        setTimeout(() => {
          navigate(`/transcription/${selectedMeeting}`);
        }, 2000);
      } else {
        setError(result.error || 'Upload failed');
      }
    } catch (err) {
      setError('Failed to upload file. Please try again.');
      console.error('Upload error:', err);
    }
  };

  return (
    <div className="transcription-page">
      <div className="transcription-container">
        <div className="transcription-header">
          <div className="transcription-header-icon">
            <MicrophoneIcon className="transcription-icon-large" />
          </div>
          <div>
            <h1 className="transcription-title">Audio Transcription</h1>
            <p className="transcription-subtitle">
              Upload audio files to generate meeting transcripts and minutes
            </p>
          </div>
        </div>

        {error && (
          <div className="transcription-message transcription-error">
            <WarningIcon className="transcription-message-icon" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="transcription-message transcription-success">
            <span>{success}</span>
          </div>
        )}

        <div className="transcription-card">
          <div className="transcription-form-group">
            <label htmlFor="meeting-select" className="transcription-label">
              Select Meeting *
            </label>
            <select
              id="meeting-select"
              value={selectedMeeting}
              onChange={(e) => {
                setSelectedMeeting(e.target.value);
                setError('');
              }}
              className="transcription-select"
              required
            >
              <option value="">Choose a meeting...</option>
              {meetings.map((meeting) => (
                <option key={meeting.id || meeting._id} value={meeting.id || meeting._id}>
                  {meeting.title} - {new Date(meeting.datetime).toLocaleDateString()}
                </option>
              ))}
            </select>
            {meetings.length === 0 && !loading && (
              <p className="transcription-hint">
                No meetings available. Create a meeting first.
              </p>
            )}
          </div>

          <div className="transcription-form-group">
            <label htmlFor="audio-file" className="transcription-label">
              Audio File *
            </label>
            <div className="transcription-file-upload">
              <input
                type="file"
                id="audio-file"
                accept="audio/*"
                onChange={handleFileChange}
                className="transcription-file-input"
              />
              <label htmlFor="audio-file" className="transcription-file-label">
                <span className="transcription-file-button">Choose File</span>
                <span className="transcription-file-name">
                  {fileName || 'No file selected'}
                </span>
              </label>
            </div>
            <p className="transcription-hint">
              Supported formats: MP3, WAV, M4A, WebM, OGG, AAC (Max 100MB)
            </p>
          </div>

          {uploading && (
            <div className="transcription-progress">
              <div className="transcription-progress-bar">
                <div
                  className="transcription-progress-fill"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="transcription-progress-text">Uploading... {progress}%</p>
            </div>
          )}

          <div className="transcription-actions">
            <button
              type="button"
              onClick={() => navigate('/meetings')}
              className="transcription-button transcription-button-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={!selectedMeeting || !file || uploading || loading}
              className="transcription-button transcription-button-primary"
            >
              {uploading ? 'Uploading...' : 'Upload & Transcribe'}
            </button>
          </div>
        </div>

        {selectedMeeting && (
          <div className="transcription-footer">
            <button
              onClick={() => navigate(`/transcription/${selectedMeeting}`)}
              className="transcription-link-button"
            >
              View Existing Transcription
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Transcription;

