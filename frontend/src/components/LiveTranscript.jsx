/**
 * Live Transcript Component
 * Displays real-time transcription during meetings
 */

import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../hooks/useSocket';
import { MicrophoneIcon, DocumentIcon } from './icons';
import './LiveTranscript.css';

const LiveTranscript = ({ meetingId, isActive = false }) => {
  const { isConnected, on, off } = useSocket(meetingId);
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const transcriptEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Scroll to bottom when transcript updates
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Listen for live transcription updates
  useEffect(() => {
    if (!isConnected || !meetingId) return;

    const handleTranscription = (data) => {
      if (data.meetingId === parseInt(meetingId)) {
        setTranscript((prev) => prev + ' ' + data.transcript);
        if (data.summary) {
          setSummary(data.summary);
        }
      }
    };

    on('live-transcription', handleTranscription);

    return () => {
      off('live-transcription', handleTranscription);
    };
  }, [isConnected, meetingId, on, off]);

  // Start/stop audio recording
  const handleRecordingToggle = async () => {
    if (isRecording) {
      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
        });

        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
            // Send audio chunk to backend
            sendAudioChunk(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
        };

        mediaRecorder.start(1000); // Send chunks every 1 second
        mediaRecorderRef.current = mediaRecorder;
        setIsRecording(true);
      } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('Unable to access microphone. Please check permissions.');
      }
    }
  };

  // Send audio chunk to backend for transcription
  const sendAudioChunk = async (audioBlob) => {
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1]; // Remove data URL prefix

        const token = localStorage.getItem('accessToken');
        const response = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/meetings/${meetingId}/live-transcription/chunk`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              audioData: base64Audio,
              mimeType: 'audio/webm',
            }),
          }
        );

        if (!response.ok) {
          console.error('Error sending audio chunk:', response.statusText);
        }
      };
      reader.readAsDataURL(audioBlob);
    } catch (error) {
      console.error('Error processing audio chunk:', error);
    }
  };

  if (!isActive) {
    return (
      <div className="live-transcript-inactive">
        <DocumentIcon className="live-transcript-icon" />
        <p>Live transcription is not active for this meeting.</p>
      </div>
    );
  }

  return (
    <div className="live-transcript">
      <div className="live-transcript-header">
        <div className="live-transcript-title">
          <MicrophoneIcon className="live-transcript-title-icon" />
          <h3>Live Transcript</h3>
          {isConnected && (
            <span className="live-transcript-status live-transcript-status-connected">
              ● Live
            </span>
          )}
        </div>
        <button
          className={`live-transcript-record-btn ${isRecording ? 'recording' : ''}`}
          onClick={handleRecordingToggle}
          disabled={!isConnected}
        >
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </button>
      </div>

      {summary && (
        <div className="live-transcript-summary">
          <h4>Real-time Insights</h4>
          {summary.keyPoints && summary.keyPoints.length > 0 && (
            <div className="live-transcript-key-points">
              <strong>Key Points:</strong>
              <ul>
                {summary.keyPoints.map((point, index) => (
                  <li key={index}>{point}</li>
                ))}
              </ul>
            </div>
          )}
          {summary.insights && (
            <div className="live-transcript-insights">
              <strong>Insights:</strong>
              <p>{summary.insights}</p>
            </div>
          )}
          {summary.sentiment && (
            <div className={`live-transcript-sentiment sentiment-${summary.sentiment}`}>
              <strong>Sentiment:</strong> {summary.sentiment}
            </div>
          )}
        </div>
      )}

      <div className="live-transcript-content">
        {transcript ? (
          <div className="live-transcript-text">
            {transcript}
            <span ref={transcriptEndRef} />
          </div>
        ) : (
          <div className="live-transcript-empty">
            <p>Waiting for transcription to begin...</p>
            <p className="live-transcript-hint">
              Click "Start Recording" to begin live transcription
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveTranscript;

