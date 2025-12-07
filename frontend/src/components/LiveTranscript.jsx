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
        mediaRecorderRef.current.stream?.getTracks().forEach((track) => track.stop());
      }
      setIsRecording(false);
      
      // Stop live transcription on backend to finalize transcript
      try {
        const token = localStorage.getItem('accessToken');
        const stopResponse = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/meetings/${meetingId}/live-transcription/stop`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!stopResponse.ok) {
          const errorData = await stopResponse.json().catch(() => ({}));
          console.warn('Failed to stop live transcription on server:', errorData.message || 'Unknown error');
        } else {
          console.log('Live transcription stopped and finalized');
        }
      } catch (error) {
        console.error('Error stopping live transcription:', error);
        // Don't block UI if stop fails
      }
    } else {
      // Start recording
      try {
        // First, ensure live transcription is started on backend
        const token = localStorage.getItem('accessToken');
        const startResponse = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/meetings/${meetingId}/live-transcription/start`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!startResponse.ok) {
          const errorData = await startResponse.json().catch(() => ({}));
          const errorMessage = errorData.message || errorData.error || 'Failed to start live transcription on server';
          console.error('Failed to start live transcription:', errorMessage);
          throw new Error(`Failed to start transcription: ${errorMessage}`);
        }

        // Get user media
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        });

        // Check for supported MIME types
        const supportedTypes = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/ogg;codecs=opus',
        ];
        
        let selectedMimeType = 'audio/webm';
        for (const mimeType of supportedTypes) {
          if (MediaRecorder.isTypeSupported(mimeType)) {
            selectedMimeType = mimeType;
            break;
          }
        }

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: selectedMimeType,
        });

        audioChunksRef.current = [];
        let chunkCounter = 0;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunkCounter++;
            console.log(`Audio chunk ${chunkCounter} received: ${event.data.size} bytes, type: ${event.data.type}`);
            audioChunksRef.current.push(event.data);
            // Send audio chunk to backend immediately
            sendAudioChunk(event.data, selectedMimeType);
          } else {
            console.warn('Empty audio chunk received');
          }
        };

        mediaRecorder.onerror = (event) => {
          console.error('MediaRecorder error:', event.error);
          setIsRecording(false);
        };

        mediaRecorder.onstop = () => {
          console.log('Recording stopped, total chunks:', audioChunksRef.current.length);
          stream.getTracks().forEach((track) => {
            track.stop();
            console.log('Audio track stopped');
          });
        };

        // Start recording with timeslice (chunks every 2 seconds for better quality)
        mediaRecorder.start(2000);
        mediaRecorderRef.current = mediaRecorder;
        setIsRecording(true);
        console.log('Recording started with MIME type:', selectedMimeType);
      } catch (error) {
        console.error('Error starting recording:', error);
        // Show user-friendly error message
        let errorMessage = error.message || 'Unknown error occurred';
        
        // Check if it's a microphone permission error
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          errorMessage = 'Microphone access denied. Please grant microphone permissions in your browser settings.';
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          errorMessage = 'No microphone found. Please connect a microphone and try again.';
        } else if (error.message.includes('transcription')) {
          // Backend transcription error
          errorMessage = error.message;
        } else if (error.message.includes('microphone')) {
          errorMessage = error.message;
        }
        
        alert(errorMessage);
        setIsRecording(false);
      }
    }
  };

  // Send audio chunk to backend for transcription
  const sendAudioChunk = async (audioBlob, mimeType = 'audio/webm') => {
    try {
      // Validate blob
      if (!audioBlob || audioBlob.size === 0) {
        console.warn('Empty audio blob, skipping');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64Audio = reader.result.split(',')[1]; // Remove data URL prefix
          
          if (!base64Audio || base64Audio.length === 0) {
            console.warn('Empty base64 audio data');
            return;
          }

          const token = localStorage.getItem('accessToken');
          if (!token) {
            console.error('No authentication token found');
            return;
          }

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
                mimeType: mimeType,
              }),
            }
          );

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Error sending audio chunk:', response.status, errorData);
          } else {
            const result = await response.json().catch(() => ({}));
            if (result.data?.transcribed) {
              // Update transcript immediately from response
              setTranscript((prev) => prev + ' ' + result.data.transcribed);
            }
          }
        } catch (error) {
          console.error('Error in sendAudioChunk onloadend:', error);
        }
      };

      reader.onerror = (error) => {
        console.error('FileReader error:', error);
      };

      reader.readAsDataURL(audioBlob);
    } catch (error) {
      console.error('Error processing audio chunk:', error);
    }
  };

  // Show inactive message but still allow starting recording
  // The component will handle starting transcription when recording begins

  return (
    <div className="live-transcript">
      <div className="live-transcript-header">
        <div className="live-transcript-title">
          <MicrophoneIcon className="live-transcript-title-icon" />
          <h3>Live Transcript</h3>
          {isConnected && isActive && (
            <span className="live-transcript-status live-transcript-status-connected">
              ● Live
            </span>
          )}
          {!isActive && (
            <span className="live-transcript-status live-transcript-status-inactive">
              Inactive
            </span>
          )}
        </div>
        <button
          className={`live-transcript-record-btn ${isRecording ? 'recording' : ''}`}
          onClick={handleRecordingToggle}
          disabled={isRecording && !isActive}
          title={!isActive ? 'Click to start recording. Transcription will begin automatically.' : ''}
        >
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </button>
      </div>
      
      {!isActive && !isRecording && (
        <div className="live-transcript-inactive-notice">
          <p>Click "Start Recording" to begin live transcription. The system will automatically start transcription when recording begins.</p>
        </div>
      )}

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

