"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText } from "lucide-react";
import { 
  getMeeting, 
  MeetingResponse,
  getMeetingState,
  startMeetingRecording,
  pauseMeetingRecording,
  resumeMeetingRecording,
  endMeetingRecording,
  RecordingState as BackendRecordingState
} from "@/lib/api/meeting";
import { ensureGuestSession } from "@/lib/api/guest-session";
import { useSession } from "@/lib/auth-client";
import { getAttendance, AttendeeInfo } from "@/lib/api/attendance";
import { uploadRecording } from "@/lib/api/recording";
import { 
  useMeetingWebSocket, 
  AttendanceEvent,
  MeetingAutoEndedEvent
} from "@/hooks/use-meeting-websocket";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useToast } from "@/components/ui/use-toast";
import { QRCode } from "@/components/ui/qr-code";

export default function MeetingRoomPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const meetingId = params.meetingId as string;
  const { data: session, isPending: isSessionLoading } = useSession();

  // Core state
  const [meeting, setMeeting] = useState<MeetingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Backend-authoritative state
  const [recordingState, setRecordingState] = useState<BackendRecordingState>("NOT_STARTED");
  const [endsAt, setEndsAt] = useState<Date | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  
  // UI state
  const [showEndConfirmation, setShowEndConfirmation] = useState(false);
  const [attendees, setAttendees] = useState<AttendeeInfo[]>([]);
  const [attendeeCount, setAttendeeCount] = useState(0);
  const [showQRCode, setShowQRCode] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [meetingAutoEnded, setMeetingAutoEnded] = useState(false);
  
  // Refs for cleanup
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Audio recorder hook
  const {
    state: recorderState,
    error: recorderError,
    errorMessage: recorderErrorMessage,
    audioBlob,
    startRecording: startAudioRecording,
    pauseRecording: pauseAudioRecording,
    resumeRecording: resumeAudioRecording,
    stopRecording: stopAudioRecording,
    isSupported: isRecordingSupported
  } = useAudioRecorder({
    onError: (errorType, message) => {
      console.error('[MeetingRoom] Audio recorder error:', errorType, message);
      toast({
        title: "Recording Error",
        description: message,
        variant: "destructive"
      });
    }
  });

  // Handle meeting auto-ended event from WebSocket
  const handleMeetingAutoEnded = useCallback((event: MeetingAutoEndedEvent) => {
    console.log('[MeetingRoom] Meeting auto-ended:', event);
    setMeetingAutoEnded(true);
    setRecordingState("STOPPED");
    
    // Force stop the audio recorder
    stopAudioRecording().then(async (blob) => {
      if (blob) {
        // Attempt to upload the recording
        await handleUploadRecording(blob);
      }
    });
    
    toast({
      title: "Meeting Duration Reached",
      description: "Recording stopped — meeting duration reached.",
    });
  }, [toast]);

  // Handle real-time attendance updates via WebSocket
  const handleAttendanceUpdate = useCallback((event: AttendanceEvent) => {
    console.log('[MeetingRoom] Attendance update received:', event);
    setAttendees(prev => {
      const exists = prev.some(a => a.name === event.attendee.name);
      if (exists) return prev;
      return [{
        id: `ws-${Date.now()}`,
        name: event.attendee.name,
        email: event.attendee.email,
        checkedInAt: event.attendee.checkedInAt
      }, ...prev];
    });
    setAttendeeCount(event.totalCount);
    toast({
      title: "New attendee",
      description: `${event.attendee.name} has checked in.`,
    });
  }, [toast]);

  // WebSocket connection for real-time updates
  useMeetingWebSocket({
    meetingId,
    onAttendanceUpdate: handleAttendanceUpdate,
    onMeetingAutoEnded: handleMeetingAutoEnded,
    enabled: !!meeting
  });

  // Upload recording to backend
  const handleUploadRecording = async (blob: Blob) => {
    if (!blob || blob.size === 0) {
      console.warn('[MeetingRoom] No audio data to upload');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // Upload directly through backend (avoids CORS issues)
      const { data, error } = await uploadRecording(meetingId, blob);

      if (error || !data?.success) {
        throw new Error(error?.message || 'Upload failed');
      }

      toast({
        title: "Recording Saved",
        description: "Your recording has been uploaded. Transcription started automatically.",
      });
    } catch (err) {
      console.error('[MeetingRoom] Upload error:', err);
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
      toast({
        title: "Upload Failed",
        description: "Failed to save recording. You can retry.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Load meeting data and state
  const loadMeeting = useCallback(async () => {
    try {
      const { data, error: apiError } = await getMeeting(meetingId);
      if (apiError || !data) {
        throw new Error(apiError?.message || "Failed to load meeting");
      }
      setMeeting(data);
      
      // Get current meeting state from backend
      const { data: stateData } = await getMeetingState(meetingId);
      if (stateData) {
        setRecordingState(stateData.recordingState);
        if (stateData.endsAt) {
          setEndsAt(new Date(stateData.endsAt));
        }
      }
      
      // Set initial attendee count
      const joined = data.participants?.filter((p) => p.status === "JOINED").length || 0;
      setAttendeeCount(joined);
      
      const initialAttendees = data.participants
        ?.filter((p) => p.status === "JOINED")
        .map(p => ({
          id: p.id,
          name: p.name || "Guest",
          email: p.email || null,
          checkedInAt: p.joinedAt || null
        })) || [];
      setAttendees(initialAttendees);
    } catch (err) {
      console.error("Error loading meeting:", err);
      setError("Unable to load meeting. It may have ended or been removed.");
    } finally {
      setIsLoading(false);
    }
  }, [meetingId]);

  // Initialize session and load meeting
  useEffect(() => {
    const init = async () => {
      // Skip if still loading auth session
      if (isSessionLoading) return;
      
      // If user is authenticated via BetterAuth, allow access
      if (session?.user) {
        await loadMeeting();
        return;
      }
      
      // Otherwise, try guest session
      const sessionValid = await ensureGuestSession();
      if (!sessionValid) {
        router.push("/");
        return;
      }
      await loadMeeting();
    };
    init();
  }, [loadMeeting, router, session?.user?.id, isSessionLoading]);

  // Fetch initial attendance data
  useEffect(() => {
    if (!meeting) return;

    const fetchAttendance = async () => {
      try {
        const { data } = await getAttendance(meetingId);
        if (data) {
          setAttendees(data.attendees);
          setAttendeeCount(data.totalCount);
        }
      } catch (err) {
        console.error("Error fetching attendance:", err);
      }
    };

    fetchAttendance();
  }, [meeting, meetingId]);

  // Timer countdown using backend endsAt (display only)
  useEffect(() => {
    if (!endsAt) return;

    const updateTimer = () => {
      const now = new Date();
      const remaining = Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / 1000));
      setRemainingSeconds(remaining);
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [endsAt]);

  // Generate check-in URL
  const getCheckInUrl = (): string => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/attendance/check-in?meetingId=${meetingId}`;
  };

  // Format time as MM:SS or HH:MM:SS
  const formatTime = (seconds: number | null): string => {
    if (seconds === null) return "--:--";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return [
        hrs.toString().padStart(2, "0"),
        mins.toString().padStart(2, "0"),
        secs.toString().padStart(2, "0"),
      ].join(":");
    }
    return [
      mins.toString().padStart(2, "0"),
      secs.toString().padStart(2, "0"),
    ].join(":");
  };

  // Start recording (backend + browser)
  const handleStartRecording = async () => {
    if (!isRecordingSupported) {
      toast({
        title: "Not Supported",
        description: "Audio recording is not supported in this browser.",
        variant: "destructive"
      });
      return;
    }

    setIsActionPending(true);
    try {
      // Start browser audio recording first (to get mic permission)
      const started = await startAudioRecording();
      if (!started) {
        return; // Error already shown by hook
      }

      // Then notify backend
      const { data, error: apiError } = await startMeetingRecording(meetingId);
      if (apiError || !data?.success) {
        await stopAudioRecording();
        throw new Error(apiError?.message || "Failed to start meeting");
      }

      setRecordingState("RECORDING");
      if (data.endsAt) {
        setEndsAt(new Date(data.endsAt));
      }

      toast({
        title: "Recording Started",
        description: "Your meeting is now being recorded.",
      });
    } catch (err) {
      console.error("Error starting recording:", err);
      toast({
        title: "Error",
        description: "Failed to start recording. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsActionPending(false);
    }
  };

  // Pause recording
  const handlePauseRecording = async () => {
    setIsActionPending(true);
    try {
      const { data, error: apiError } = await pauseMeetingRecording(meetingId);
      if (apiError || !data?.success) {
        throw new Error(apiError?.message || "Failed to pause");
      }

      pauseAudioRecording();
      setRecordingState("PAUSED");

      toast({
        title: "Recording Paused",
        description: "Recording has been paused. Time continues running.",
      });
    } catch (err) {
      console.error("Error pausing recording:", err);
      toast({
        title: "Error",
        description: "Failed to pause recording.",
        variant: "destructive"
      });
    } finally {
      setIsActionPending(false);
    }
  };

  // Resume recording
  const handleResumeRecording = async () => {
    setIsActionPending(true);
    try {
      const { data, error: apiError } = await resumeMeetingRecording(meetingId);
      if (apiError || !data?.success) {
        throw new Error(apiError?.message || "Failed to resume");
      }

      resumeAudioRecording();
      setRecordingState("RECORDING");

      toast({
        title: "Recording Resumed",
        description: "Recording has resumed.",
      });
    } catch (err) {
      console.error("Error resuming recording:", err);
      toast({
        title: "Error",
        description: "Failed to resume recording.",
        variant: "destructive"
      });
    } finally {
      setIsActionPending(false);
    }
  };

  // End meeting
  const handleEndMeeting = () => {
    setShowEndConfirmation(true);
  };

  const confirmEndMeeting = async () => {
    setShowEndConfirmation(false);
    setIsActionPending(true);

    try {
      // Stop audio recording and get the blob
      const blob = await stopAudioRecording();

      // End meeting on backend
      const { error: apiError } = await endMeetingRecording(meetingId);
      if (apiError) {
        console.error("Error ending meeting:", apiError);
      }

      setRecordingState("STOPPED");

      // Upload recording if we have data
      if (blob && blob.size > 0) {
        await handleUploadRecording(blob);
      }

      toast({
        title: "Recording Saved",
        description: "Your recording has been saved. Go to Artifacts tab to start transcription.",
      });

      // DO NOT redirect to processing page
      // User stays on meeting page and can navigate to Artifacts tab manually
    } catch (err) {
      console.error("Error ending meeting:", err);
      toast({
        title: "Error",
        description: "Failed to end meeting properly.",
        variant: "destructive"
      });
    } finally {
      setIsActionPending(false);
    }
  };

  // Retry upload
  const handleRetryUpload = async () => {
    if (audioBlob) {
      await handleUploadRecording(audioBlob);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-t-primary border-muted rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Joining meeting...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !meeting) {
    return (
      <div className="container max-w-md mx-auto py-12 px-4">
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <div className="bg-destructive/10 p-4 rounded-md">
              <p className="text-destructive">{error || "Meeting not found"}</p>
            </div>
            <Button onClick={() => router.push("/create-meeting")}>
              Create New Meeting
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Determine if meeting is ended
  const isMeetingEnded = recordingState === "STOPPED" || meetingAutoEnded;

  // Check if recording is saved (can navigate to artifacts)
  const hasRecording = recordingState === "STOPPED" || meetingAutoEnded;

  return (
    <div className="min-h-screen bg-background">
      {/* Auto-ended overlay */}
      {meetingAutoEnded && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-lg">Meeting Duration Reached</h3>
              <p className="text-muted-foreground text-sm">
                Recording stopped — maximum meeting duration reached.
              </p>
              {isUploading && (
                <p className="text-sm text-muted-foreground">Saving recording...</p>
              )}
              {uploadError && (
                <div className="space-y-2">
                  <p className="text-sm text-destructive">{uploadError}</p>
                  <Button size="sm" onClick={handleRetryUpload}>Retry Upload</Button>
                </div>
              )}
              {!isUploading && !uploadError && (
                <div className="flex flex-col gap-2">
                  <Button onClick={() => router.push(`/meeting/${meetingId}/artifacts`)}>
                    <FileText className="h-4 w-4 mr-2" />
                    Go to Artifacts
                  </Button>
                  <Button variant="outline" onClick={() => setMeetingAutoEnded(false)}>
                    Stay on Meeting Page
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Top Bar with Back to Dashboard */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Back to Dashboard - MANDATORY */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/dashboard")}
              className="mr-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Dashboard
            </Button>
            <div className="h-6 w-px bg-border" />
            <h1 className="font-semibold text-lg truncate max-w-[200px] sm:max-w-none">
              {meeting.title}
            </h1>
            {recordingState === "RECORDING" && (
              <Badge variant="default" className="bg-red-500 hover:bg-red-500">
                RECORDING
              </Badge>
            )}
            {recordingState === "PAUSED" && (
              <Badge variant="secondary" className="bg-amber-500 hover:bg-amber-500 text-white">
                PAUSED
              </Badge>
            )}
            {recordingState === "STOPPED" && (
              <Badge variant="secondary" className="bg-green-600 hover:bg-green-600 text-white">
                RECORDED
              </Badge>
            )}
          </div>
          {/* Time remaining display (backend-authoritative) */}
          <div className="flex items-center gap-4">
            {endsAt && recordingState !== "NOT_STARTED" && recordingState !== "STOPPED" && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Time Remaining</p>
                <span className={`font-mono text-2xl font-bold ${remainingSeconds !== null && remainingSeconds < 300 ? 'text-red-500' : ''}`}>
                  {formatTime(remainingSeconds)}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container max-w-6xl mx-auto px-4 py-8">
        {/* 2x2 Grid Layout for Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Left: Recording Controls */}
          <Card>
            <CardHeader>
              <CardTitle>Recording Controls</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center min-h-[250px] space-y-6">
                {/* Recording Status Indicator */}
                <div className="text-center">
                  {recordingState === "NOT_STARTED" && (
                    <>
                      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                        <div className="w-10 h-10 rounded-full bg-red-500/20" />
                      </div>
                      <p className="text-muted-foreground">Ready to record</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        This app records the room — ensure voices are clear.
                      </p>
                    </>
                  )}
                  {recordingState === "RECORDING" && (
                    <>
                      <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
                        <div className="w-10 h-10 rounded-full bg-red-500" />
                      </div>
                      <p className="text-red-500 font-medium text-lg">Recording...</p>
                      {recorderState === "recording" && (
                        <p className="text-xs text-green-600 mt-1">● Microphone active</p>
                      )}
                    </>
                  )}
                  {recordingState === "PAUSED" && (
                    <>
                      <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
                        <div className="w-10 h-10 rounded-full bg-amber-500" />
                      </div>
                      <p className="text-amber-500 font-medium text-lg">Paused</p>
                      <p className="text-xs text-muted-foreground mt-1">Time continues running</p>
                    </>
                  )}
                  {recordingState === "STOPPED" && !meetingAutoEnded && (
                    <>
                      <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="text-green-600 font-medium">Recording Saved</p>
                      {isUploading && <p className="text-sm text-muted-foreground mt-2">Uploading...</p>}
                    </>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col items-center gap-3 w-full max-w-xs">
                  {recordingState === "NOT_STARTED" && (
                    <Button
                      size="lg"
                      className="bg-red-600 hover:bg-red-700 text-white w-full"
                      onClick={handleStartRecording}
                      disabled={isActionPending || !isRecordingSupported}
                    >
                      {isActionPending ? "Starting..." : "Start Recording"}
                    </Button>
                  )}
                  {recordingState === "RECORDING" && (
                    <>
                      <Button
                        size="lg"
                        variant="outline"
                        className="w-full"
                        onClick={handlePauseRecording}
                        disabled={isActionPending}
                      >
                        {isActionPending ? "..." : "Pause"}
                      </Button>
                      <Button
                        size="lg"
                        variant="destructive"
                        className="w-full"
                        onClick={handleEndMeeting}
                        disabled={isActionPending}
                      >
                        End Recording
                      </Button>
                    </>
                  )}
                  {recordingState === "PAUSED" && (
                    <>
                      <Button
                        size="lg"
                        className="bg-red-600 hover:bg-red-700 text-white w-full"
                        onClick={handleResumeRecording}
                        disabled={isActionPending}
                      >
                        {isActionPending ? "..." : "Resume Recording"}
                      </Button>
                      <Button
                        size="lg"
                        variant="destructive"
                        className="w-full"
                        onClick={handleEndMeeting}
                        disabled={isActionPending}
                      >
                        End Recording
                      </Button>
                    </>
                  )}
                </div>

                {/* Errors */}
                {recorderError && (
                  <div className="bg-destructive/10 p-3 rounded-md text-center w-full">
                    <p className="text-destructive text-sm">{recorderErrorMessage}</p>
                  </div>
                )}
                {uploadError && recordingState === "STOPPED" && (
                  <div className="bg-destructive/10 p-3 rounded-md text-center space-y-2 w-full">
                    <p className="text-destructive text-sm">{uploadError}</p>
                    <Button size="sm" variant="outline" onClick={handleRetryUpload} disabled={isUploading}>
                      {isUploading ? "Uploading..." : "Retry Upload"}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Top Right: QR Code Attendance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>QR Code Attendance</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowQRCode(!showQRCode)}
                >
                  {showQRCode ? "Hide" : "Show"}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {showQRCode ? (
                <div className="text-center">
                  <div className="bg-white p-4 rounded-lg inline-block mb-4">
                    <QRCode value={getCheckInUrl()} size={180} />
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Scan to check in — no account required
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard?.writeText(getCheckInUrl());
                      toast({ title: "Link copied", description: "Check-in link copied to clipboard." });
                    }}
                  >
                    Copy Check-in Link
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">QR code hidden</p>
                  <Button variant="outline" onClick={() => setShowQRCode(true)}>
                    Show QR Code
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bottom Left: Participants */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Participants</span>
                <Badge variant="secondary">{attendeeCount}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {attendeeCount === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                    <svg
                      className="w-8 h-8 text-muted-foreground"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Waiting for participants...
                  </p>
                  <Button
                    variant="link"
                    size="sm"
                    className="mt-2"
                    onClick={() => setShowQRCode(true)}
                  >
                    Show QR code
                  </Button>
                </div>
              ) : (
                <ul className="space-y-2 max-h-[200px] overflow-y-auto">
                  {attendees.map((attendee, index) => (
                    <li
                      key={attendee.id || `attendee-${index}`}
                      className="flex items-center gap-2 py-2 px-3 rounded-md bg-muted/40 animate-in fade-in slide-in-from-top-2 duration-300"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                        {(attendee.name || "G")[0].toUpperCase()}
                      </div>
                      <span className="text-sm truncate">
                        {attendee.name || "Guest"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Bottom Right: Meeting Info + Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Meeting Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Meeting ID</dt>
                  <dd className="font-mono">{meetingId.slice(0, 8)}...</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Duration</dt>
                  <dd>{meeting.durationMinutes} minutes</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Type</dt>
                  <dd className="capitalize">{meeting.meetingType.toLowerCase()}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Recording Status</dt>
                  <dd>
                    <Badge variant={
                      recordingState === "RECORDING" ? "default" :
                      recordingState === "STOPPED" ? "secondary" : "outline"
                    } className={
                      recordingState === "RECORDING" ? "bg-red-500" :
                      recordingState === "STOPPED" ? "bg-green-600 text-white" : ""
                    }>
                      {recordingState === "NOT_STARTED" ? "Idle" :
                       recordingState === "RECORDING" ? "Recording" :
                       recordingState === "PAUSED" ? "Paused" : "Recorded"}
                    </Badge>
                  </dd>
                </div>
              </dl>

              {/* Actions */}
              <div className="pt-4 border-t space-y-3">
                {/* Go to Artifacts button - enabled only when recording exists */}
                <Button
                  className="w-full"
                  onClick={() => router.push(`/meeting/${meetingId}/artifacts`)}
                  disabled={!hasRecording}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  {hasRecording ? "Go to Artifacts" : "Artifacts (Record First)"}
                </Button>
                {!hasRecording && (
                  <p className="text-xs text-muted-foreground text-center">
                    Complete a recording to access transcription and AI artifacts
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* End Meeting Confirmation Modal */}
      {showEndConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-sm w-full">
            <CardContent className="pt-6 space-y-4">
              <h3 className="font-semibold text-lg">End Meeting?</h3>
              <p className="text-muted-foreground text-sm">
                This will stop recording and save your audio. You can start transcription from the Artifacts tab.
              </p>
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowEndConfirmation(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={confirmEndMeeting}
                >
                  End Meeting
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
