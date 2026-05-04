"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { getMeeting } from "@/lib/api/meeting";
import { Loader2, Users } from "lucide-react";

export default function ParticipantJoinPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.meetingId as string;

  const [meetingTitle, setMeetingTitle] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMeeting(meetingId).then(({ data }) => {
      if (data) setMeetingTitle(data.title);
    });
  }, [meetingId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await api.post("/api/attendance/check-in", {
        meetingId,
        name: name.trim(),
        email: email.trim() || undefined,
      });
    } catch (err: any) {
      if (!err.response?.data?.alreadyCheckedIn) {
        setError(err.response?.data?.error || "Failed to check in. Please try again.");
        setIsLoading(false);
        return;
      }
    }

    if (typeof window !== "undefined") {
      sessionStorage.setItem("meetgov:participant", JSON.stringify({ name: name.trim(), email: email.trim() || null }));
    }

    router.push(`/meetings/${meetingId}/live`);
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-xl">{meetingTitle || "Join Meeting"}</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">Enter your details to check in</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
