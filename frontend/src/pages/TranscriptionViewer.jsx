import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAPI } from '../hooks/useAPI';
import { useUpload } from '../hooks/useUpload';
import SummaryPanel from '../components/SummaryPanel';
import './TranscriptionViewer.css';

const TranscriptionViewer = () => {
  const { meetingId } = useParams();
  const { get, post } = useAPI();
  const { upload, uploading, progress } = useUpload();
  const [transcript, setTranscript] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);

  React.useEffect(() => {
    if (meetingId) {
      fetchTranscript();
    }
  }, [meetingId]);

  const fetchTranscript = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await get(`/transcription/${meetingId}`);
      if (result.success) {
        setTranscript(result.data.data.transcript);
      } else {
        setError(result.error || 'Failed to fetch transcript');
      }
    } catch (err) {
      setError('Failed to fetch transcript');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    setError('');
    const result = await upload(`/transcription/upload/${meetingId}`, file);

    if (result.success) {
      await fetchTranscript();
      setFile(null);
    } else {
      setError(result.error || 'Upload failed');
    }
  };

  const handleGenerateMinutes = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await post(`/transcription/generate-minutes/${meetingId}`);
      if (result.success) {
        await fetchTranscript();
      } else {
        setError(result.error || 'Failed to generate minutes');
      }
    } catch (err) {
      setError('Failed to generate minutes');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !transcript) {
    return <div className="transcription-viewer-loading">Loading...</div>;
  }

  return (
    <div className="transcription-viewer">
      <div className="transcription-viewer-header">
        <h1>Transcription & Minutes</h1>
        {transcript && (
          <button
            onClick={handleGenerateMinutes}
            className="transcription-viewer-button"
            disabled={loading || !transcript.raw_text}
          >
            Generate Minutes
          </button>
        )}
      </div>

      {error && <div className="transcription-viewer-error">{error}</div>}

      {/* Only show upload option if no transcript exists and meeting is not in-progress */}
      {!transcript && !loading && (
        <div className="transcription-viewer-upload">
          <h2>Audio Transcription</h2>
          <p style={{ marginBottom: '1rem', color: '#666' }}>
            For live meetings, use the "Start Recording" button in the meeting details page.
            You can upload audio files here for completed meetings.
          </p>
          <div className="transcription-viewer-upload-controls">
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              className="transcription-viewer-file-input"
            />
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="transcription-viewer-upload-button"
            >
              {uploading ? `Uploading... ${progress}%` : 'Upload & Transcribe'}
            </button>
          </div>
        </div>
      )}

      {transcript && (
        <div className="transcription-viewer-content">
          {transcript.raw_text && (
            <div className="transcription-viewer-section">
              <h2>Raw Transcript</h2>
              <div className="transcription-viewer-text">{transcript.raw_text}</div>
            </div>
          )}

          {(transcript.summary_text || transcript.action_items_json || transcript.summary_json) && (
            <SummaryPanel
              summary={transcript.summary_text || transcript.summary_json?.summary}
              actionItems={transcript.action_items_json || transcript.summary_json?.actionItems}
              minutes={transcript.minutes_formatted || transcript.summary_json?.minutes}
              rawText={transcript.raw_text}
            />
          )}
        </div>
      )}

      {!transcript && !loading && (
        <div className="transcription-viewer-empty">
          <p>No transcript available. Upload an audio file to get started.</p>
        </div>
      )}
    </div>
  );
};

export default TranscriptionViewer;


