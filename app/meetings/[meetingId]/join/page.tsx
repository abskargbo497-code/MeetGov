"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getMeetingJoinInfo,
  joinMeeting,
  checkIn,
  getMyStatus,
  type MeetingJoinInfo,
  type ParticipantStatus,
} from "@/lib/api/participant";
import {
  Loader2,
  Video,
  Calendar,
  User,
  CheckCircle2,
  Clock,
  Users,
  LogIn,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

type PageState = "loading" | "unauthenticated" | "joining" | "ready" | "checked-in" | "error";

export default function ParticipantJoinPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.meetingId as string;
  
  const { user, isLoaded } = useUser();
  const { openSignIn } = useClerk();
  
  const [pageState, setPageState] = useState<PageState>("loading");
  const [meetingInfo, setMeetingInfo] = useState<MeetingJoinInfo | null>(null);
  const [participantStatus, setParticipantStatus] = useState<ParticipantStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  // Fetch meeting info
  const fetchMeetingInfo = useCallback(async () => {
    const { data, error: fetchError } = await getMeetingJoinInfo(meetingId);
    if (fetchError || !data) {
      setError(fetchError?.message || "Meeting not found");
      setPageState("error");
      return null;
    }
    setMeetingInfo(data);
    return data;
  }, [meetingId]);

  // Fetch participant status (if authenticated)
  const fetchParticipantStatus = useCallback(async () => {
    const { data, error: fetchError } = await getMyStatus(meetingId);
    if (!fetchError && data) {
      setParticipantStatus(data);
      return data;
    }
    return null;
  }, [meetingId]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      // Always fetch meeting info first
      const info = await fetchMeetingInfo();
      if (!info) return;

      if (!isLoaded) return;

      // If not authenticated, show auth screen
      if (!user) {
        setPageState("unauthenticated");
        return;
      }

      // Authenticated - check participant status
      const status = await fetchParticipantStatus();
      
      if (status?.isOwner) {
        // Redirect owners to the main meeting page
        router.push(`/meeting/${meetingId}`);
        return;
      }

      if (status?.isCheckedIn) {
        setPageState("checked-in");
      } else if (status?.isParticipant) {
        setPageState("ready");
      } else {
        // Join the meeting first
        setPageState("joining");
        const { error: joinError } = await joinMeeting(meetingId);
        if (joinError) {
          setError(joinError.message);
          setPageState("error");
          return;
        }
        await fetchParticipantStatus();
        setPageState("ready");
      }
    };

    init();
  }, [meetingId, user, isLoaded, fetchMeetingInfo, fetchParticipantStatus, router]);

  // Handle check-in
  const handleCheckIn = async () => {
    setIsCheckingIn(true);
    try {
      const { data, error: checkInError } = await checkIn(meetingId);
      if (checkInError) {
        setError(checkInError.message);
        return;
      }
      setPageState("checked-in");
      await fetchParticipantStatus();
    } catch (err) {
      setError("Failed to check in");
    } finally {
      setIsCheckingIn(false);
    }
  };

  // Handle Google sign-in via Clerk
  const handleSignIn = () => {
    openSignIn({
      forceRedirectUrl: `${window.location.origin}/meetings/${meetingId}/join`,
    } as any);
  };

  // Navigate to live meeting
  const handleEnterMeeting = () => {
    router.push(`/meetings/${meetingId}/live`);
  };

  // Get status badge
  const getStatusBadge = () => {
    if (!meetingInfo) return null;
    
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      WAITING: { label: "Waiting", variant: "secondary" },
      SCHEDULED: { label: "Scheduled", variant: "secondary" },
      LIVE: { label: "Live", variant: "default" },
      ACTIVE: { label: "Live", variant: "default" },
      ENDED: { label: "Ended", variant: "outline" },
      COMPLETED: { label: "Completed", variant: "outline" },
      PROCESSING: { label: "Processing", variant: "secondary" },
    };
    
    const status = statusMap[meetingInfo.meetingStatus] || { label: meetingInfo.meetingStatus, variant: "outline" as const };
    
    return (
      <Badge variant={status.variant} className="ml-2">
        {status.label}
      </Badge>
    );
  };

  // Loading state
  if (pageState === "loading" || !isLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Skeleton className="h-8 w-48 mx-auto mb-2" />
            <Skeleton className="h-4 w-64 mx-auto" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (pageState === "error") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Video className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle>Unable to Join</CardTitle>
            <CardDescription>{error || "Something went wrong"}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => router.push("/join")}>
              Try Another Code
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Unauthenticated state - show sign-in
  if (pageState === "unauthenticated") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Video className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="flex items-center justify-center">
              {meetingInfo?.meetingTitle}
              {getStatusBadge()}
            </CardTitle>
            <CardDescription>
              {meetingInfo?.organizerName && (
                <span className="flex items-center justify-center gap-1 mt-1">
                  <User className="h-3 w-3" />
                  Hosted by {meetingInfo.organizerName}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {meetingInfo?.scheduledStart && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{format(new Date(meetingInfo.scheduledStart), "PPP 'at' p")}</span>
              </div>
            )}

            <div className="border-t pt-6">
              <p className="text-center text-sm text-muted-foreground mb-4">
                Sign in to join this meeting
              </p>
              <Button className="w-full" size="lg" onClick={handleSignIn}>
                <LogIn className="h-4 w-4 mr-2" />
                Sign in with Google
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Ready / Checked-in state
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
            pageState === "checked-in" ? "bg-green-100 dark:bg-green-900/30" : "bg-primary/10"
          }`}>
            {pageState === "checked-in" ? (
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            ) : (
              <Video className="h-8 w-8 text-primary" />
            )}
          </div>
          <CardTitle className="flex items-center justify-center flex-wrap gap-2">
            {meetingInfo?.meetingTitle}
            {getStatusBadge()}
          </CardTitle>
          <CardDescription>
            {meetingInfo?.organizerName && (
              <span className="flex items-center justify-center gap-1 mt-1">
                <User className="h-3 w-3" />
                Hosted by {meetingInfo.organizerName}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Meeting Time Info */}
          {meetingInfo?.scheduledStart && (
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{format(new Date(meetingInfo.scheduledStart), "PPP 'at' p")}</span>
              </div>
              {meetingInfo.meetingStatus === "WAITING" || meetingInfo.meetingStatus === "SCHEDULED" ? (
                <div className="flex items-center gap-2 text-sm mt-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>
                    Starts {formatDistanceToNow(new Date(meetingInfo.scheduledStart), { addSuffix: true })}
                  </span>
                </div>
              ) : null}
            </div>
          )}

          {/* User Info */}
          {user && (
            <div className="flex items-center gap-3 bg-muted/30 rounded-lg p-3">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{user.fullName}</p>
                <p className="text-sm text-muted-foreground">{user.primaryEmailAddress?.emailAddress}</p>
              </div>
            </div>
          )}

          {/* Check-in Status */}
          {pageState === "checked-in" ? (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">You're checked in!</span>
              </div>
              {participantStatus?.checkedInAt && (
                <p className="text-sm text-green-600 dark:text-green-500 mt-1">
                  Checked in at {format(new Date(participantStatus.checkedInAt), "p")}
                </p>
              )}
            </div>
          ) : (
            meetingInfo?.canCheckIn && (
              <Button
                className="w-full"
                size="lg"
                onClick={handleCheckIn}
                disabled={isCheckingIn}
              >
                {isCheckingIn ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Checking in...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Check In
                  </>
                )}
              </Button>
            )
          )}

          {/* Enter Meeting Button (for live meetings) */}
          {(meetingInfo?.meetingStatus === "LIVE" || meetingInfo?.meetingStatus === "ACTIVE") && (
            <Button
              className="w-full"
              size="lg"
              variant={pageState === "checked-in" ? "default" : "outline"}
              onClick={handleEnterMeeting}
            >
              <Video className="h-4 w-4 mr-2" />
              Enter Meeting
            </Button>
          )}

          {/* Waiting message for scheduled meetings */}
          {(meetingInfo?.meetingStatus === "WAITING" || meetingInfo?.meetingStatus === "SCHEDULED") && pageState === "checked-in" && (
            <p className="text-center text-sm text-muted-foreground">
              The meeting hasn't started yet. You'll be able to enter once it begins.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
