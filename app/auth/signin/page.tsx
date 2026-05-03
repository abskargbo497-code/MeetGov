"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2, Users, User, ArrowRight, Video } from "lucide-react";

// ─── Role metadata storage ────────────────────────────────────────────────────
// Stored in localStorage BEFORE Clerk opens the OAuth flow so it survives
// the Google OAuth full-page redirect.
const ROLE_KEY = "meetgov:signin_role";

export function storeSignInRole(role: "personal" | "enterprise") {
  if (typeof window !== "undefined") localStorage.setItem(ROLE_KEY, role);
}

export function consumeSignInRole(): "personal" | "enterprise" | null {
  if (typeof window === "undefined") return null;
  const role = localStorage.getItem(ROLE_KEY) as "personal" | "enterprise" | null;
  if (role) localStorage.removeItem(ROLE_KEY);
  return role;
}

// ─── Sign-in page ─────────────────────────────────────────────────────────────
function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoaded } = useUser();
  const { openSignIn } = useClerk();
  const [loadingRole, setLoadingRole] = useState<"personal" | "enterprise" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ref prevents the redirect from firing more than once
  const redirected = useRef(false);

  const callbackError = searchParams.get("error");

  useEffect(() => {
    if (callbackError) setError("Authentication failed. Please try again.");
  }, [callbackError]);

  // ── Already signed in? Route immediately — NO backend call needed ──────────
  // Role-specific routing (enterprise vs personal) happens in /auth/callback.
  // The sign-in page just needs to get the user OUT to avoid the loop.
  useEffect(() => {
    if (!isLoaded || !user || redirected.current) return;
    redirected.current = true;

    // Read intended role from localStorage (set before OAuth)
    const role = consumeSignInRole();

    if (role === "enterprise") {
      router.replace("/onboarding/enterprise");
    } else {
      router.replace("/dashboard");
    }
  }, [user, isLoaded, router]);

  const openClerkModal = (role: "personal" | "enterprise") => {
    setLoadingRole(role);
    storeSignInRole(role);

    openSignIn({
      forceRedirectUrl: `${window.location.origin}/auth/callback?type=${role}`,
      signUpForceRedirectUrl: `${window.location.origin}/auth/callback?type=${role}&new=true`,
    } as any);

    setLoadingRole(null);
  };

  // Show spinner while Clerk is checking session or performing redirect
  if (!isLoaded || (isLoaded && user)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
          <p className="text-slate-400">{user ? "Redirecting..." : "Loading..."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      {/* Ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg">
        {/* Logo + Title */}
        <div className="text-center mb-10">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-violet-500/25">
            <Video className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Welcome to MeetAssist</h1>
          <p className="mt-2 text-slate-400 text-base">Choose how you'd like to continue</p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6 bg-red-950/60 border-red-800">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          {/* Guest */}
          <button
            onClick={() => router.push("/create-meeting")}
            className="w-full group relative flex items-center gap-4 rounded-2xl border border-slate-700/60 bg-slate-800/50 px-5 py-4 text-left transition-all duration-200 hover:border-slate-500 hover:bg-slate-800 hover:shadow-lg backdrop-blur-sm"
            aria-label="Continue as guest"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-700/60 text-slate-300 transition-colors group-hover:bg-slate-600">
              <User className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white">Continue as Guest</p>
              <p className="text-sm text-slate-400 truncate">Create a quick meeting — no account needed</p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-slate-300 shrink-0" />
          </button>

          {/* Personal */}
          <button
            onClick={() => openClerkModal("personal")}
            disabled={loadingRole !== null}
            className="w-full group relative flex items-center gap-4 rounded-2xl border border-violet-500/40 bg-gradient-to-r from-violet-950/50 to-indigo-950/50 px-5 py-4 text-left transition-all duration-200 hover:border-violet-400 hover:from-violet-900/50 hover:to-indigo-900/50 hover:shadow-lg hover:shadow-violet-500/10 backdrop-blur-sm disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label="Sign in as personal user"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600/30 text-violet-300 transition-colors group-hover:bg-violet-600/50">
              {loadingRole === "personal" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white">Sign in — Personal</p>
              <p className="text-sm text-violet-300/80 truncate">AI transcription, summaries & action items</p>
            </div>
            <ArrowRight className="h-4 w-4 text-violet-400/60 transition-transform group-hover:translate-x-1 group-hover:text-violet-300 shrink-0" />
          </button>

          {/* Enterprise */}
          <button
            onClick={() => openClerkModal("enterprise")}
            disabled={loadingRole !== null}
            className="w-full group relative flex items-center gap-4 rounded-2xl border border-indigo-500/40 bg-gradient-to-r from-indigo-950/50 to-blue-950/50 px-5 py-4 text-left transition-all duration-200 hover:border-indigo-400 hover:from-indigo-900/50 hover:to-blue-900/50 hover:shadow-lg hover:shadow-indigo-500/10 backdrop-blur-sm disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label="Sign in as enterprise user"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600/30 text-indigo-300 transition-colors group-hover:bg-indigo-600/50">
              {loadingRole === "enterprise" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Users className="h-5 w-5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white">Sign in — Enterprise</p>
              <p className="text-sm text-indigo-300/80 truncate">Team analytics, roles & organisation management</p>
            </div>
            <ArrowRight className="h-4 w-4 text-indigo-400/60 transition-transform group-hover:translate-x-1 group-hover:text-indigo-300 shrink-0" />
          </button>
        </div>

        <p className="mt-8 text-xs text-center text-slate-500">
          By signing in, you agree to our{" "}
          <a href="/terms" className="underline hover:text-slate-300 transition-colors">Terms of Service</a>
          {" "}and{" "}
          <a href="/privacy" className="underline hover:text-slate-300 transition-colors">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
            <p className="text-slate-400">Loading...</p>
          </div>
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
