"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getAttendance, type AttendanceResponse } from "@/lib/api/participant";
import { getMeeting, type MeetingResponse } from "@/lib/api/meeting";
import {
  Video,
  Users,
  FileText,
  CheckCircle2,
  AlertCircle,
  LogOut,
} from "lucide-react";
import { format } from "date-fns";

export default function ParticipantLiveMeetingPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.meetingId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [meeting, setMeeting] = useState<MeetingResponse | null>(null);
  const [attendees, setAttendees] = useState<AttendanceResponse["attendees"]>([]);
  const [attendeeCount, setAttendeeCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState<string | null>(null);

  // Poll interval ref
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Read participant identity stored at check-in
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = sessionStorage.getItem("meetgov:participant");
        if (stored) {
          const parsed = JSON.parse(stored);
          setParticipantName(parsed.name ?? null);
        }
      } catch {}
    }
  }, []);

  const fetchAttendance = useCallback(async () => {
    const { data } = await getAttendance(meetingId);
    if (data) {
      setAttendees(data.attendees);
      setAttendeeCount(data.totalCount);
    }
  }, [meetingId]);

  const fetchMeeting = useCallback(async () => {
    const { data, error: apiError } = await getMeeting(meetingId);
    if (apiError || !data) {
      setError("Unable to load meeting. It may have ended or been removed.");
      return;
    }
    setMeeting(data);
  }, [meetingId]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchMeeting(), fetchAttendance()]);
      setIsLoading(false);
    };
    init();
  }, [fetchMeeting, fetchAttendance]);

  // Poll attendance every 30s
  useEffect(() => {
    pollRef.current = setInterval(fetchAttendance, 30000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchAttendance]);

  const handleLeave = () => {
    router.push("/join");
  };

  const handleArtifacts = () => {
    router.push(`/meeting/${meetingId}/artifacts`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-16 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <p className="text-destructive">{error}</p>
            <Button variant="outline" onClick={() => router.push("/join")}>
              Back to Join
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLive = meeting?.status === "LIVE" || meeting?.status === "ACTIVE";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              isLive ? "bg-green-100 dark:bg-green-900/30" : "bg-primary/10"
            }`}>
              <Video className={`h-5 w-5 ${isLive ? "text-green-600 dark:text-green-400" : "text-primary"}`} />
            </div>
            <div>
              <h1 className="font-semibold">{meeting?.title}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant={isLive ? "default" : "secondary"}>
                  {isLive ? "Live" : (meeting?.status ?? "—")}
                </Badge>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {attendeeCount}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleArtifacts}>
              <FileText className="h-4 w-4 mr-2" />
              Artifacts
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLeave}>
              <LogOut className="h-4 w-4 mr-2" />
              Leave
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* You card */}
          {participantName && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Checked In
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium text-lg">{participantName}</p>
                <p className="text-sm text-muted-foreground mt-1">You're checked in to this meeting</p>
              </CardContent>
            </Card>
          )}

          {/* Attendance */}
          <Card className={participantName ? "" : "md:col-span-2"}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-5 w-5" />
                Participants
              </CardTitle>
              <CardDescription>{attendeeCount} checked in</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-48">
                {attendees.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No one has checked in yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {attendees.map((attendee) => (
                      <div key={attendee.id} className="flex items-center gap-2 text-sm">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium shrink-0">
                          {attendee.name[0].toUpperCase()}
                        </div>
                        <span className="truncate">{attendee.name}</span>
                        {attendee.checkedInAt && (
                          <span className="text-xs text-muted-foreground ml-auto shrink-0">
                            {format(new Date(attendee.checkedInAt), "p")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
