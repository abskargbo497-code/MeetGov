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
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioChunksReceived, setAudioChunksReceived] = useState(0);
  const [lastChunkTime, setLastChunkTime] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioFilePath, setAudioFilePath] = useState(null);
  const [audioFiles, setAudioFiles] = useState([]);
  const [isLoadingAudioFiles, setIsLoadingAudioFiles] = useState(false);
  const [transcribingFile, setTranscribingFile] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const transcriptEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioPlayerRef = useRef(null);
  const recordingTimerRef = useRef(null);

  // Scroll to bottom when transcript updates
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Fetch all audio files for the meeting
  useEffect(() => {
    const fetchAudioFiles = async () => {
      if (!meetingId) return;
      
      setIsLoadingAudioFiles(true);
      try {
        const token = localStorage.getItem('accessToken');
        if (!token) return;

        const response = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/meetings/${meetingId}/audio/list`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data.audioFiles) {
            setAudioFiles(result.data.audioFiles);
            
            // Set the latest audio file for playback
            if (result.data.audioFiles.length > 0) {
              const latestFile = result.data.audioFiles[0];
              const audioResponse = await fetch(
                `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}${latestFile.url}`,
                {
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                }
              );
              
              if (audioResponse.ok) {
                const blob = await audioResponse.blob();
                const url = URL.createObjectURL(blob);
                setAudioUrl(url);
                setAudioFilePath(latestFile.url);
              }
            }
          }
        }
      } catch (error) {
        console.log('Error fetching audio files:', error);
      } finally {
        setIsLoadingAudioFiles(false);
      }
    };

    if (!isRecording) {
      fetchAudioFiles();
    }
  }, [meetingId, isRecording]);

  // Recording timer
  useEffect(() => {
    if (isRecording && !isPaused) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }

    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, [isRecording, isPaused]);

  // Format time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Note: Live transcription via WebSocket is disabled
  // Transcription only happens in 2-minute chunks or when recording stops

  // Start/stop audio recording
  const handleRecordingToggle = async () => {
    if (isRecording) {
      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream?.getTracks().forEach((track) => track.stop());
      }
      setIsRecording(false);
      setIsPaused(false);
      setRecordingTime(0);
      setAudioChunksReceived(0);
      setLastChunkTime(null);
      
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
        console.log('Starting recording for meeting:', meetingId);
        
        // First, ensure live transcription is started on backend
        const token = localStorage.getItem('accessToken');
        if (!token) {
          throw new Error('No authentication token found. Please log in again.');
        }
        
        console.log('Calling backend to start transcription session...');
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
          
          // If it's a 400 error saying transcription already started, that's okay - continue
          if (startResponse.status === 400 && errorMessage.includes('already')) {
            console.log('Transcription session already exists, continuing...');
          } else {
            throw new Error(`Failed to start transcription: ${errorMessage}`);
          }
        } else {
          console.log('Backend transcription session started successfully');
        }

        // Get user media
        console.log('Requesting microphone access...');
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        });
        console.log('Microphone access granted, stream active:', stream.active);

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
        let transcriptionChunkBuffer = []; // Buffer for 2-minute transcription chunks
        let transcriptionChunkStartTime = Date.now();
        const TRANSCRIPTION_CHUNK_INTERVAL = 2 * 60 * 1000; // 2 minutes in milliseconds

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunkCounter++;
            console.log(`Audio chunk ${chunkCounter} received: ${event.data.size} bytes, type: ${event.data.type}`);
            audioChunksRef.current.push(event.data);
            
            // Add to transcription buffer (for 2-minute chunks)
            transcriptionChunkBuffer.push(event.data);
            
            // Update UI to show audio is being captured
            setAudioChunksReceived(chunkCounter);
            setLastChunkTime(new Date());
            
            // Check if 2 minutes have passed since last transcription
            const timeSinceLastTranscription = Date.now() - transcriptionChunkStartTime;
            if (timeSinceLastTranscription >= TRANSCRIPTION_CHUNK_INTERVAL) {
              // Combine all chunks in buffer into a single blob for transcription
              const combinedBlob = new Blob(transcriptionChunkBuffer, { type: selectedMimeType });
              console.log(`Sending 2-minute transcription chunk: ${combinedBlob.size} bytes`);
              
              // Send combined chunk for transcription (no live updates, just transcribe)
              sendAudioChunkForTranscription(combinedBlob, selectedMimeType);
              
              // Clear buffer and reset timer
              transcriptionChunkBuffer = [];
              transcriptionChunkStartTime = Date.now();
            }
          } else {
            console.warn('Empty audio chunk received');
          }
        };

        mediaRecorder.onerror = (event) => {
          console.error('MediaRecorder error:', event.error);
          setIsRecording(false);
        };

        mediaRecorder.onstop = async () => {
          console.log('Recording stopped, total chunks:', audioChunksRef.current.length);
          
          // Send any remaining buffered chunks for transcription
          if (transcriptionChunkBuffer.length > 0) {
            const finalBlob = new Blob(transcriptionChunkBuffer, { type: selectedMimeType });
            console.log(`Sending final transcription chunk: ${finalBlob.size} bytes`);
            await sendAudioChunkForTranscription(finalBlob, selectedMimeType);
          }
          
          // Send all recorded audio to backend for saving
          if (audioChunksRef.current.length > 0) {
            const completeAudioBlob = new Blob(audioChunksRef.current, { type: selectedMimeType });
            console.log(`Saving complete audio file: ${completeAudioBlob.size} bytes`);
            const result = await saveCompleteAudioFile(completeAudioBlob, selectedMimeType);
            
            // Create local URL for playback
            const url = URL.createObjectURL(completeAudioBlob);
            setAudioUrl(url);
            if (result?.data?.audioFilePath) {
              setAudioFilePath(result.data.audioFilePath);
            }
          }
          
          stream.getTracks().forEach((track) => {
            track.stop();
            console.log('Audio track stopped');
          });
        };

        // Start recording with timeslice (chunks every 2 seconds for saving)
        // Transcription will be sent every 2 minutes
        mediaRecorder.start(2000);
        mediaRecorderRef.current = mediaRecorder;
        setIsRecording(true);
        setAudioChunksReceived(0);
        setLastChunkTime(null);
        console.log('Recording started with MIME type:', selectedMimeType);
        console.log('Transcription chunks will be sent every 2 minutes');
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

  // Send audio chunk for transcription (2-minute chunks or when recording stops)
  // This is NOT live transcription - it only transcribes when explicitly called
  const sendAudioChunkForTranscription = async (audioBlob, mimeType = 'audio/webm') => {
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

          console.log('Sending audio chunk for transcription', {
            chunkSize: audioBlob.size,
            mimeType,
          });

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
                isTranscriptionChunk: true, // Always true - this is for transcription only
              }),
            }
          );

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Error sending audio chunk:', response.status, errorData);
          } else {
            const result = await response.json().catch(() => ({}));
            if (result.data?.transcribed && result.data.transcribed.trim()) {
              // Update transcript from response
              setTranscript((prev) => {
                const newText = prev + ' ' + result.data.transcribed;
                return newText.trim();
              });
              console.log('Transcription received and added to transcript', {
                transcribedLength: result.data.transcribed.length,
                totalLength: result.data.accumulatedLength || 0,
              });
            } else {
              console.log('No transcription text in response (may be silence or processing)');
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

  // Save complete audio file to backend
  const saveCompleteAudioFile = async (audioBlob, mimeType = 'audio/webm') => {
    try {
      if (!audioBlob || audioBlob.size === 0) {
        console.warn('Empty audio blob, skipping save');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64Audio = reader.result.split(',')[1];
          
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
            `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/meetings/${meetingId}/live-transcription/save-audio`,
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
            console.error('Error saving audio file:', response.status, errorData);
          } else {
            const result = await response.json().catch(() => ({}));
            console.log('Audio file saved successfully', result);
            return result; // Return result for URL creation
          }
        } catch (error) {
          console.error('Error in saveCompleteAudioFile onloadend:', error);
        }
      };

      reader.onerror = (error) => {
        console.error('FileReader error:', error);
      };

      reader.readAsDataURL(audioBlob);
    } catch (error) {
      console.error('Error saving complete audio file:', error);
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
          {isRecording ? (
            <span className="live-transcript-status live-transcript-status-connected">
              Recording
            </span>
          ) : isConnected && isActive ? (
            <span className="live-transcript-status live-transcript-status-connected">
              Live
            </span>
          ) : (
            <span className="live-transcript-status live-transcript-status-inactive">
              Inactive
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {isRecording && (
            <button
              className="live-transcript-record-btn"
              onClick={() => {
                if (isPaused) {
                  mediaRecorderRef.current?.resume();
                  setIsPaused(false);
                } else {
                  mediaRecorderRef.current?.pause();
                  setIsPaused(true);
                }
              }}
              title={isPaused ? 'Resume recording' : 'Pause recording'}
              style={{ fontSize: '0.9em', padding: '0.5rem 1rem' }}
            >
              {isPaused ? 'Resume' : 'Pause'}
            </button>
          )}
          <button
            className={`live-transcript-record-btn ${isRecording ? 'recording' : ''}`}
            onClick={handleRecordingToggle}
            disabled={false}
            title={isRecording ? 'Click to stop recording' : 'Click to start recording. Transcription will begin automatically.'}
          >
            {isRecording ? 'Stop' : 'Start Recording'}
          </button>
        </div>
      </div>
      
      {!isRecording && !isActive && (
        <div className="live-transcript-inactive-notice">
          <p>Click "Start Recording" to begin live transcription. The system will automatically start transcription when recording begins.</p>
        </div>
      )}
      
      {isRecording && (
        <div className="live-transcript-recording-notice">
          <p>
            Recording in progress... 
            {audioChunksReceived > 0 ? (
              <>
                <br />
                <strong>Audio captured:</strong> {audioChunksReceived} chunk{audioChunksReceived !== 1 ? 's' : ''} received
                {lastChunkTime && (
                  <> (last: {new Date(lastChunkTime).toLocaleTimeString()})</>
                )}
                <br />
                <strong>Recording time:</strong> {formatTime(recordingTime)}
                {isPaused && <span style={{ color: '#ff9800', marginLeft: '0.5rem' }}>(Paused)</span>}
                {!transcript && recordingTime > 120 && (
                  <>
                    <br />
                    <span style={{ color: '#ff9800', fontSize: '0.9em' }}>
                      ⚠️ No transcription yet. Transcription is sent every 2 minutes. If this persists, check OpenAI API key configuration.
                    </span>
                  </>
                )}
              </>
            ) : (
              <> Waiting for audio chunks...</>
            )}
          </p>
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

      {/* Audio Files List and Player */}
      {!isRecording && (
        <div className="live-transcript-audio-section" style={{
          marginTop: '2rem',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
          }}>
            <div>
              <h2 style={{
                fontSize: '1.5rem',
                fontWeight: 600,
                margin: 0,
                color: 'var(--text)',
              }}>Recorded Audio Sessions</h2>
              <p style={{
                margin: '0.5rem 0 0 0',
                color: 'var(--text-muted)',
                fontSize: '0.875rem',
              }}>View and manage all recorded audio files for this meeting</p>
            </div>
          </div>
          
          {isLoadingAudioFiles ? (
            <div style={{
              textAlign: 'center',
              padding: '3rem',
              color: 'var(--text-muted)',
            }}>Loading audio files...</div>
          ) : audioFiles.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '3rem',
              color: 'var(--text-muted)',
              fontStyle: 'italic',
            }}>No audio recordings available yet.</div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
              gap: '1.5rem',
            }}>
              {audioFiles.map((file, index) => {
                const isLatest = index === 0;
                const fileDate = new Date(file.createdAt);
                const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
                
                return (
                  <div
                    key={index}
                    className="audio-file-card"
                    style={{
                      background: 'var(--white)',
                      border: isLatest ? '2px solid var(--primary)' : '1px solid var(--border)',
                      borderRadius: '12px',
                      padding: '1.5rem',
                      boxShadow: 'var(--shadow-md)',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'start',
                      marginBottom: '1.25rem',
                      gap: '1rem',
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          marginBottom: '0.5rem',
                        }}>
                          <h3 style={{
                            fontSize: '1.1rem',
                            fontWeight: 700,
                            color: 'var(--dark-gray)',
                            margin: 0,
                            flex: 1,
                          }}>{file.filename}</h3>
                          {isLatest && (
                            <span style={{
                              padding: '0.4rem 0.8rem',
                              borderRadius: '12px',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              background: 'var(--primary)',
                              color: 'var(--white)',
                              boxShadow: 'var(--shadow-primary)',
                              whiteSpace: 'nowrap',
                            }}>Latest</span>
                          )}
                        </div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          fontSize: '0.875rem',
                          color: 'var(--text-muted)',
                          marginTop: '0.5rem',
                        }}>
                          <span>{fileDate.toLocaleString()}</span>
                          <span>•</span>
                          <span>{fileSizeMB} MB</span>
                        </div>
                      </div>
                    </div>
                    
                    <div style={{
                      display: 'flex',
                      gap: '0.75rem',
                      paddingTop: '1.25rem',
                      borderTop: '1px solid var(--border)',
                      flexWrap: 'wrap',
                    }}>
                        <button
                          onClick={async () => {
                            try {
                              setTranscribingFile(file.filename);
                              const token = localStorage.getItem('accessToken');
                              
                              if (!token) {
                                alert('No authentication token found. Please log in again.');
                                return;
                              }
                              
                              const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/meetings/${meetingId}/audio/${encodeURIComponent(file.filename)}/transcribe`;
                              console.log('Transcribing audio file:', {
                                url,
                                filename: file.filename,
                                meetingId,
                                fileSize: file.size,
                                fileDate: file.createdAt,
                              });
                              
                              const response = await fetch(url, {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  Authorization: `Bearer ${token}`,
                                },
                              });

                              console.log('Transcription response status:', response.status, response.statusText);

                              if (response.ok) {
                                const result = await response.json();
                                console.log('Transcription successful:', result);
                                alert(`Audio transcribed successfully! ${result.data?.transcribedText?.length || 0} characters transcribed. The transcript has been added to the meeting.`);
                                // Refresh transcript if needed
                                window.location.reload();
                              } else {
                                const errorData = await response.json().catch(() => ({}));
                                console.error('Transcription failed:', {
                                  status: response.status,
                                  statusText: response.statusText,
                                  error: errorData,
                                });
                                alert(`Transcription failed: ${errorData.message || 'Unknown error'}`);
                              }
                            } catch (error) {
                              console.error('Error transcribing audio:', error);
                              alert(`Failed to transcribe audio: ${error.message || 'Please try again.'}`);
                            } finally {
                              setTranscribingFile(null);
                            }
                          }}
                          disabled={transcribingFile === file.filename}
                          style={{
                            padding: '0.6rem 1.2rem',
                            background: 'var(--secondary)',
                            color: 'var(--white)',
                            border: 'none',
                            borderRadius: '10px',
                            cursor: transcribingFile === file.filename ? 'not-allowed' : 'pointer',
                            fontSize: '0.95rem',
                            fontWeight: 600,
                            opacity: transcribingFile === file.filename ? 0.6 : 1,
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: 'var(--shadow-teal)',
                            flex: 1,
                            minWidth: '120px',
                            textAlign: 'center',
                          }}
                          onMouseEnter={(e) => {
                            if (transcribingFile !== file.filename) {
                              e.currentTarget.style.background = 'var(--secondary-dark)';
                              e.currentTarget.style.transform = 'translateY(-2px)';
                              e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (transcribingFile !== file.filename) {
                              e.currentTarget.style.background = 'var(--secondary)';
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = 'var(--shadow-teal)';
                            }
                          }}
                        >
                          {transcribingFile === file.filename ? 'Transcribing...' : 'Transcribe'}
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              const token = localStorage.getItem('accessToken');
                              if (!token) {
                                alert('No authentication token found. Please log in again.');
                                return;
                              }

                              const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}${file.url}`;
                              console.log('Downloading audio file:', url);

                              const response = await fetch(url, {
                                method: 'GET',
                                headers: {
                                  Authorization: `Bearer ${token}`,
                                },
                              });

                              if (!response.ok) {
                                const errorData = await response.json().catch(() => ({}));
                                alert(`Failed to download audio: ${errorData.message || 'Unknown error'}`);
                                return;
                              }

                              // Get the blob from the response
                              const blob = await response.blob();
                              
                              // Create a temporary URL for the blob
                              const blobUrl = URL.createObjectURL(blob);
                              
                              // Create a temporary anchor element to trigger download
                              const downloadLink = document.createElement('a');
                              downloadLink.href = blobUrl;
                              downloadLink.download = file.filename;
                              document.body.appendChild(downloadLink);
                              downloadLink.click();
                              
                              // Clean up
                              document.body.removeChild(downloadLink);
                              URL.revokeObjectURL(blobUrl);
                              
                              console.log('Audio file downloaded successfully:', file.filename);
                            } catch (error) {
                              console.error('Error downloading audio file:', error);
                              alert(`Failed to download audio: ${error.message || 'Please try again.'}`);
                            }
                          }}
                          style={{
                            padding: '0.6rem 1.2rem',
                            background: 'var(--primary)',
                            color: 'var(--white)',
                            border: 'none',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontSize: '0.95rem',
                            fontWeight: 600,
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: 'var(--shadow-primary)',
                            flex: 1,
                            minWidth: '120px',
                            textAlign: 'center',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--primary-dark)';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--primary)';
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'var(--shadow-primary)';
                          }}
                        >
                          Download
                        </button>
                      </div>
                    
                    {/* Audio player - show for latest file, or allow playing any file */}
                    <div style={{ marginTop: '1rem' }}>
                      <button
                        onClick={async () => {
                          try {
                            const token = localStorage.getItem('accessToken');
                            const response = await fetch(
                              `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}${file.url}`,
                              {
                                headers: {
                                  Authorization: `Bearer ${token}`,
                                },
                              }
                            );
                            
                            if (response.ok) {
                              const blob = await response.blob();
                              const url = URL.createObjectURL(blob);
                              setAudioUrl(url);
                              setAudioFilePath(file.url);
                            }
                          } catch (error) {
                            console.error('Error loading audio file:', error);
                          }
                        }}
                        style={{
                          padding: '0.6rem 1.2rem',
                          background: 'var(--accent-yellow)',
                          color: 'var(--dark-gray)',
                          border: 'none',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          fontSize: '0.95rem',
                          fontWeight: 600,
                          marginBottom: '0.75rem',
                          width: '100%',
                          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                          boxShadow: '0 2px 8px rgba(255, 193, 7, 0.2)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--accent-yellow-dark)';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 193, 7, 0.3)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'var(--accent-yellow)';
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 2px 8px rgba(255, 193, 7, 0.2)';
                        }}
                      >
                        Play Audio
                      </button>
                      {audioUrl && file.url === audioFilePath && (
                        <div>
                          <audio
                            ref={audioPlayerRef}
                            src={audioUrl}
                            controls
                            style={{ width: '100%', marginBottom: '0.5rem' }}
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                            onEnded={() => setIsPlaying(false)}
                          />
                          <div style={{
                            display: 'flex',
                            gap: '1rem',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            marginTop: '0.75rem',
                            padding: '0.75rem',
                            background: 'var(--card-bg-teal)',
                            borderRadius: '8px',
                          }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                            }}>
                              <label htmlFor={`playback-speed-${index}`} style={{
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                color: 'var(--text)',
                              }}>Speed:</label>
                              <select
                                id={`playback-speed-${index}`}
                                value={playbackSpeed}
                                onChange={(e) => {
                                  const speed = parseFloat(e.target.value);
                                  setPlaybackSpeed(speed);
                                  if (audioPlayerRef.current) {
                                    audioPlayerRef.current.playbackRate = speed;
                                  }
                                }}
                                style={{
                                  padding: '0.5rem 0.75rem',
                                  fontSize: '0.875rem',
                                  borderRadius: '6px',
                                  border: '1px solid var(--border)',
                                  background: 'var(--white)',
                                  color: 'var(--text)',
                                  cursor: 'pointer',
                                }}
                              >
                                <option value="0.5">0.5x</option>
                                <option value="0.75">0.75x</option>
                                <option value="1">1x</option>
                                <option value="1.25">1.25x</option>
                                <option value="1.5">1.5x</option>
                                <option value="2">2x</option>
                              </select>
                            </div>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                            }}>
                              <label htmlFor={`volume-${index}`} style={{
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                color: 'var(--text)',
                              }}>Volume:</label>
                              <input
                                id={`volume-${index}`}
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={volume}
                                onChange={(e) => {
                                  const vol = parseFloat(e.target.value);
                                  setVolume(vol);
                                  if (audioPlayerRef.current) {
                                    audioPlayerRef.current.volume = vol;
                                  }
                                }}
                                style={{
                                  width: '100px',
                                  cursor: 'pointer',
                                }}
                              />
                              <span style={{
                                fontSize: '0.875rem',
                                minWidth: '40px',
                                color: 'var(--text-muted)',
                                fontWeight: 500,
                              }}>{Math.round(volume * 100)}%</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LiveTranscript;

