"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

type CheckInState = "idle" | "loading" | "success" | "error";

function CheckInContent() {
  const searchParams = useSearchParams();
  // Support both ?meeting= and ?meetingId= parameters
  const meetingId = searchParams.get("meetingId") || searchParams.get("meeting");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<CheckInState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [meetingTitle, setMeetingTitle] = useState<string | null>(null);
  const [canCheckIn, setCanCheckIn] = useState(true);

  // Load meeting info for display
  useEffect(() => {
    if (!meetingId) return;

    const loadMeetingInfo = async () => {
      try {
        // Use the new public attendance endpoint for minimal meeting info
        const response = await api.get(`/api/attendance/meeting/${meetingId}`);
        if (response.data?.title) {
          setMeetingTitle(response.data.title);
        }
        if (response.data?.canCheckIn === false) {
          setCanCheckIn(false);
          setErrorMessage("This meeting is no longer accepting check-ins.");
          setState("error");
        }
      } catch (err: any) {
        console.error("Could not load meeting info:", err);
        if (err.response?.status === 404) {
          setErrorMessage("Meeting not found.");
          setState("error");
        }
      }
    };

    loadMeetingInfo();
  }, [meetingId]);

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!meetingId) {
      setErrorMessage("No meeting specified. Please scan a valid QR code.");
      setState("error");
      return;
    }

    // Name is required
    if (!name.trim()) {
      setErrorMessage("Please enter your name.");
      setState("error");
      return;
    }

    setState("loading");
    setErrorMessage("");

    try {
      // Use the new attendance check-in endpoint
      await api.post(`/api/attendance/check-in`, {
        meetingId,
        name: name.trim(),
        email: email.trim() || undefined,
      });
      setState("success");
    } catch (err: any) {
      console.error("Check-in failed:", err);
      // Handle duplicate check-in
      if (err.response?.data?.alreadyCheckedIn) {
        setErrorMessage("You have already checked in to this meeting.");
      } else {
        const message = err.response?.data?.error || "Unable to check in. Please try again.";
        setErrorMessage(message);
      }
      setState("error");
    }
  };

  // No meeting ID provided
  if (!meetingId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
        <Card className="max-w-sm w-full">
          <CardContent className="pt-6 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-amber-600 dark:text-amber-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="font-semibold text-lg mb-2">Invalid Check-in Link</h2>
            <p className="text-sm text-muted-foreground">
              Please scan a valid QR code from the meeting to check in.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (state === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
        <Card className="max-w-sm w-full">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-10 h-10 text-green-600 dark:text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2">You're checked in!</h2>
            <p className="text-muted-foreground">
              {meetingTitle && (
                <span className="block mb-2">
                  <span className="font-medium text-foreground">{meetingTitle}</span>
                </span>
              )}
              You can now close this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
      <Card className="max-w-sm w-full">
        <CardHeader className="text-center pb-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-6 h-6 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <CardTitle className="text-xl">Check In</CardTitle>
          {meetingTitle && (
            <p className="text-sm text-muted-foreground mt-1">{meetingTitle}</p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCheckIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your name *</Label>
              <Input
                id="name"
                type="text"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={state === "loading" || !canCheckIn}
                autoComplete="name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={state === "loading" || !canCheckIn}
                autoComplete="email"
              />
            </div>

            {state === "error" && errorMessage && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                {errorMessage}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={state === "loading" || !canCheckIn}
            >
              {state === "loading" ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-t-white border-white/30 rounded-full animate-spin" />
                  Checking in...
                </span>
              ) : (
                "Check in"
              )}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-4">
            No account required
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CheckInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
        <Card className="max-w-sm w-full">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-8 h-8 border-4 border-t-primary border-primary/30 rounded-full animate-spin mx-auto" />
          </CardContent>
        </Card>
      </div>
    }>
      <CheckInContent />
    </Suspense>
  );
}
