"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMeeting, MeetingResponse } from "@/lib/api/meeting";
import { ensureGuestSession } from "@/lib/api/guest-session";
import { getAttendance, AttendeeInfo } from "@/lib/api/attendance";
import { useMeetingWebSocket, AttendanceEvent } from "@/hooks/use-meeting-websocket";
import { format } from "date-fns";
import { QRCode } from "@/components/ui/qr-code";

export default function WaitingRoomPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.meetingId as string;

  const [meeting, setMeeting] = useState<MeetingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [checkedInCount, setCheckedInCount] = useState(0);
  const [attendees, setAttendees] = useState<AttendeeInfo[]>([]);
  const [wsReady, setWsReady] = useState(false);

  // Handle real-time attendance updates via WebSocket
  const handleAttendanceUpdate = useCallback((event: AttendanceEvent) => {
    console.log('[WaitingRoom] Attendance update received:', event);
    // Append new attendee to list (backend dictates totals)
    setAttendees(prev => {
      // Check if attendee already exists (by name to prevent duplicates)
      const exists = prev.some(a => a.name === event.attendee.name);
      if (exists) return prev;
      return [{
        id: `ws-${Date.now()}`,
        name: event.attendee.name,
        email: event.attendee.email,
        checkedInAt: event.attendee.checkedInAt
      }, ...prev];
    });
    // Use totalCount from backend
    setCheckedInCount(event.totalCount);
  }, []);

  // WebSocket connection for real-time attendance updates
  const { isSubscribed, error: wsError } = useMeetingWebSocket({
    meetingId,
    onAttendanceUpdate: handleAttendanceUpdate,
    enabled: !isTransitioning && !!meeting
  });

  // Track when WebSocket is ready
  useEffect(() => {
    if (isSubscribed) {
      setWsReady(true);
    }
  }, [isSubscribed]);

  // Load meeting data
  const loadMeeting = useCallback(async () => {
    try {
      const { data, error: apiError } = await getMeeting(meetingId);
      if (apiError || !data) {
        throw new Error(apiError?.message || "Failed to load meeting");
      }
      setMeeting(data);

      // If this is an INSTANT meeting, redirect to meeting room directly
      if (data.meetingType === "INSTANT") {
        router.replace(`/meetings/${meetingId}/live`);
        return;
      }

      // If meeting is already active, redirect to meeting room
      if (data.status === "ACTIVE") {
        setIsTransitioning(true);
        setTimeout(() => {
          router.push(`/meetings/${meetingId}/live`);
        }, 1500);
        return;
      }

      // Initial attendance count from meeting data
      const joined = data.participants?.filter((p) => p.status === "JOINED").length || 0;
      setCheckedInCount(joined);
      
      // Set initial attendees from meeting data
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
      setError("Unable to load meeting. It may have been cancelled or removed.");
    } finally {
      setIsLoading(false);
    }
  }, [meetingId, router]);

  // Initialize session and load meeting
  useEffect(() => {
    const init = async () => {
      const sessionValid = await ensureGuestSession();
      if (!sessionValid) {
        router.push("/");
        return;
      }
      await loadMeeting();
    };
    init();
  }, [loadMeeting, router]);

  // Countdown timer
  useEffect(() => {
    if (!meeting?.scheduledAt) return;

    const updateCountdown = () => {
      const now = new Date().getTime();
      const scheduledTime = new Date(meeting.scheduledAt!).getTime();
      const diff = scheduledTime - now;

      if (diff <= 0) {
        // Meeting should start now
        setCountdown({ hours: 0, minutes: 0, seconds: 0 });
        setIsTransitioning(true);
        setTimeout(() => {
          router.push(`/meetings/${meetingId}/live`);
        }, 1500);
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setCountdown({ hours, minutes, seconds });
    };

    // Update immediately
    updateCountdown();

    // Then update every second
    const timer = setInterval(updateCountdown, 1000);

    return () => clearInterval(timer);
  }, [meeting?.scheduledAt, meetingId, router]);

  // Fetch initial attendance data on mount
  useEffect(() => {
    if (!meeting || isTransitioning) return;

    const fetchAttendance = async () => {
      try {
        const { data } = await getAttendance(meetingId);
        if (data) {
          setAttendees(data.attendees);
          setCheckedInCount(data.totalCount);
        }
      } catch (err) {
        console.error("Error fetching attendance:", err);
      }
    };

    fetchAttendance();
  }, [meeting, meetingId, isTransitioning]);

  // Format countdown display
  const formatCountdownUnit = (value: number): string => {
    return value.toString().padStart(2, "0");
  };

  // Generate check-in URL with meetingId parameter
  const getCheckInUrl = (): string => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/attendance/check-in?meetingId=${meetingId}`;
  };

  // Handle start now (if allowed)
  const handleStartNow = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      router.push(`/meetings/${meetingId}/live`);
    }, 500);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-t-primary border-muted rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading meeting...</p>
        </div>
      </div>
    );
  }

  // Transition state
  if (isTransitioning) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-t-primary border-muted rounded-full animate-spin mx-auto mb-4" />
          <p className="text-lg font-medium">Meeting is starting...</p>
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-center relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/")}
              className="absolute left-0"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m12 19-7-7 7-7" />
                <path d="M19 12H5" />
              </svg>
            </Button>
            <h1 className="text-2xl font-bold">{meeting.title}</h1>
          </div>
          {meeting.scheduledAt && (
            <p className="text-muted-foreground text-center mt-2">
              {format(new Date(meeting.scheduledAt), "EEEE, MMMM d, yyyy 'at' h:mm a")}
            </p>
          )}
          <p className="text-sm text-muted-foreground mt-1 text-center">
            Duration: {meeting.durationMinutes} minutes
          </p>
        </div>
      </header>

      <main className="container max-w-4xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Countdown Section */}
          <div className="space-y-6">
            <Card className="overflow-hidden">
              <CardContent className="p-8 text-center">
                <p className="text-sm text-muted-foreground mb-4 uppercase tracking-wide">
                  Meeting starts in
                </p>
                {countdown && (
                  <div className="flex items-center justify-center gap-2">
                    <div className="flex flex-col items-center">
                      <span className="text-5xl font-bold font-mono">
                        {formatCountdownUnit(countdown.hours)}
                      </span>
                      <span className="text-xs text-muted-foreground mt-1">HOURS</span>
                    </div>
                    <span className="text-4xl font-bold text-muted-foreground pb-4">:</span>
                    <div className="flex flex-col items-center">
                      <span className="text-5xl font-bold font-mono">
                        {formatCountdownUnit(countdown.minutes)}
                      </span>
                      <span className="text-xs text-muted-foreground mt-1">MINUTES</span>
                    </div>
                    <span className="text-4xl font-bold text-muted-foreground pb-4">:</span>
                    <div className="flex flex-col items-center">
                      <span className="text-5xl font-bold font-mono">
                        {formatCountdownUnit(countdown.seconds)}
                      </span>
                      <span className="text-xs text-muted-foreground mt-1">SECONDS</span>
                    </div>
                  </div>
                )}
                <div className="mt-8">
                  <Button size="lg" onClick={handleStartNow}>
                    Start Now
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Meeting Details Card */}
            <Card>
              <CardContent className="p-6">
                <h3 className="font-medium mb-4">Meeting Details</h3>
                <dl className="space-y-3 text-sm">
                  {meeting.participants && meeting.participants.length > 0 && (
                    <div>
                      <dt className="text-muted-foreground">Location</dt>
                      <dd>{meeting.joinUrl ? "Online" : "Not specified"}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-muted-foreground">Organizer</dt>
                    <dd>Guest</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Meeting Type</dt>
                    <dd className="flex items-center gap-2">
                      <Badge variant="secondary">Scheduled</Badge>
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>

          {/* QR Code & Attendance Section */}
          <div className="space-y-6">
            {/* QR Code Card */}
            <Card>
              <CardContent className="p-6 text-center">
                <h3 className="font-medium mb-4">Check-in QR Code</h3>
                <div className="bg-white p-4 rounded-lg inline-block mb-4">
                  <QRCode value={getCheckInUrl()} size={192} />
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Scan to check in — no account required
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(getCheckInUrl());
                  }}
                >
                  Copy check-in link
                </Button>
              </CardContent>
            </Card>

            {/* Attendance Preview */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium">Checked In</h3>
                  <Badge variant="secondary">{checkedInCount}</Badge>
                </div>
                {checkedInCount === 0 ? (
                  <div className="text-center py-6">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                      <svg
                        className="w-6 h-6 text-muted-foreground"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                        />
                      </svg>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      No one has checked in yet
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {attendees
                      .slice(0, 5)
                      .map((attendee, index) => (
                        <li
                          key={attendee.id || `attendee-${index}`}
                          className="flex items-center gap-2 py-2 px-3 rounded-md bg-muted/40 animate-in fade-in slide-in-from-top-2 duration-300"
                        >
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                            {(attendee.name || "G")[0].toUpperCase()}
                          </div>
                          <span className="text-sm truncate">
                            {attendee.name || "Guest"}
                          </span>
                        </li>
                      ))}
                    {checkedInCount > 5 && (
                      <li className="text-sm text-muted-foreground text-center py-1">
                        +{checkedInCount - 5} more
                      </li>
                    )}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
