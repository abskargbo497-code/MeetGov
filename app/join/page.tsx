"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMeetingByAccessCode, AccessCodeResponse } from "@/lib/api/meeting";
import { ensureGuestSession } from "@/lib/api/guest-session";
import { api } from "@/lib/api";
import { ArrowLeft, Loader2, Users } from "lucide-react";

type Step = "code" | "identity";

export default function JoinMeetingPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("code");
  const [accessCode, setAccessCode] = useState("");
  const [meeting, setMeeting] = useState<AccessCodeResponse | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const routeBasedOnState = useCallback(
    (m: AccessCodeResponse, code: string) => {
      const { id, status, processingStatus } = m;
      const codeParam = `?code=${code}`;

      if (status === "WAITING" || status === "SCHEDULED") {
        router.push(`/meeting/${id}/waiting${codeParam}`);
        return;
      }
      if (status === "LIVE" || status === "ACTIVE") {
        router.push(`/meetings/${id}/live`);
        return;
      }
      if (status === "ENDED" || status === "COMPLETED") {
        if (processingStatus === "PROCESSING") {
          router.push(`/meeting/${id}/processing${codeParam}`);
          return;
        }
        router.push(`/meeting/${id}/results${codeParam}`);
        return;
      }
      if (status === "CANCELLED" || status === "FAILED") {
        setError("This meeting has been cancelled or is no longer available.");
        return;
      }
      router.push(`/meeting/${id}${codeParam}`);
    },
    [router]
  );

  // Step 1: look up meeting by code
  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCode.trim()) {
      setError("Please enter an access code");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const sessionValid = await ensureGuestSession();
      if (!sessionValid) {
        setError("Failed to create session. Please refresh and try again.");
        return;
      }

      const { data, error: apiError } = await getMeetingByAccessCode(accessCode.trim());
      if (apiError || !data) {
        setError(apiError?.message || "Meeting not found. Please check your access code.");
        return;
      }

      // Ended meetings — no check-in needed, route immediately
      if (["ENDED", "COMPLETED", "CANCELLED", "FAILED"].includes(data.status)) {
        routeBasedOnState(data, accessCode.trim());
        return;
      }

      setMeeting(data);
      setStep("identity");
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: submit name/email → check-in → route
  const handleIdentitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!meeting) return;

    setIsLoading(true);
    setError(null);

    try {
      await api.post("/api/attendance/check-in", {
        meetingId: meeting.id,
        name: name.trim(),
        email: email.trim() || undefined,
      });
    } catch (err: any) {
      // Already checked in is fine — just proceed
      if (!err.response?.data?.alreadyCheckedIn) {
        setError(err.response?.data?.error || "Failed to check in. Please try again.");
        setIsLoading(false);
        return;
      }
    }

    // Store participant identity for the live page
    if (typeof window !== "undefined") {
      sessionStorage.setItem("meetgov:participant", JSON.stringify({ name: name.trim(), email: email.trim() || null }));
    }

    routeBasedOnState(meeting, accessCode.trim());
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        {step === "code" ? (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Join Meeting</CardTitle>
              <p className="text-muted-foreground text-sm mt-2">
                Enter your access code to join or view a meeting
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCodeSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="accessCode">Access Code</Label>
                  <Input
                    id="accessCode"
                    type="text"
                    placeholder="Enter access code (e.g., A1B2C3D4)"
                    value={accessCode}
                    onChange={(e) => {
                      setAccessCode(e.target.value.toUpperCase());
                      setError(null);
                    }}
                    className="text-center text-lg font-mono tracking-wider"
                    maxLength={12}
                    autoComplete="off"
                    autoFocus
                  />
                </div>

                {error && (
                  <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md text-center" role="alert">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={isLoading || !accessCode.trim()}>
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Looking up...
                    </>
                  ) : (
                    "Continue"
                  )}
                </Button>

                <div className="text-center text-sm text-muted-foreground">
                  <p>Don't have an access code?</p>
                  <Button
                    type="button"
                    variant="link"
                    className="p-0 h-auto"
                    onClick={() => router.push("/create-meeting")}
                  >
                    Create a new meeting
                  </Button>
                </div>
              </form>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-xl">{meeting?.title || "Join Meeting"}</CardTitle>
              <p className="text-muted-foreground text-sm mt-1">
                Enter your details to check in
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleIdentitySubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Your name *</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Enter your name"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setError(null); }}
                    autoComplete="name"
                    autoFocus
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
                    autoComplete="email"
                  />
                </div>

                {error && (
                  <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md" role="alert">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" size="lg" disabled={isLoading || !name.trim()}>
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Checking in...
                    </>
                  ) : (
                    "Check In & Join"
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => { setStep("code"); setMeeting(null); setError(null); }}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}
