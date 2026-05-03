"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useUser, UserButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { Mic, Users, Sparkles, CheckCircle, LogIn } from "lucide-react"
import { JoinMeetingWidget } from "@/components/join-meeting-widget"

export default function Home() {
  const router = useRouter()
  const { user, isLoaded } = useUser()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Start meeting creation
  const handleCreateMeeting = async () => {
    // Authenticated users go to their full dashboard create page
    if (user) {
      router.push('/dashboard/create-meeting')
      return
    }
    // Guests go directly to the create-meeting page — no backend needed
    router.push('/create-meeting')
  }
  return (
    <main className="min-h-screen flex flex-col">
      {/* Header with Sign In */}
      <header className="absolute top-0 right-0 p-4 md:p-6 z-10 flex items-center" role="banner">
        {isLoaded && user ? (
          // Signed in — show Clerk avatar with built-in sign-out / profile dropdown
          <UserButton
            appearance={{
              elements: {
                avatarBox: "h-9 w-9",
              },
            }}
          />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => router.push("/auth/signin")}
            aria-label="Sign in to your account"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Sign In
          </Button>
        )}
      </header>

      {/* Hero Section */}
      <section 
        className="flex flex-col items-center justify-center min-h-screen px-4 md:px-6 py-12 md:py-24 relative bg-gradient-to-b from-background to-secondary/20"
        role="main"
        aria-labelledby="hero-heading"
      >
        <div className="container max-w-5xl mx-auto flex flex-col items-center gap-6 text-center">
          {/* Primary Headline */}
          <h1 
            id="hero-heading"
            className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight max-w-3xl"
          >
            Turn real meetings into clear outcomes
          </h1>

          {/* Supporting Text */}
          <p className="text-xl text-muted-foreground max-w-2xl">
            Record your meetings, let AI handle the rest — from transcription to actionable insights.
          </p>

          {/* Icon/Visual Set */}
          <div 
            className="flex flex-wrap justify-center gap-8 my-8"
            role="list"
            aria-label="Key features"
          >
            <div className="flex flex-col items-center gap-2 w-24" role="listitem">
              <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center" aria-hidden="true">
                <Mic className="h-7 w-7 text-accent" />
              </div>
              <span className="text-sm font-medium">Record Meetings</span>
            </div>
            <div className="flex flex-col items-center gap-2 w-24" role="listitem">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center" aria-hidden="true">
                <Users className="h-7 w-7 text-primary" />
              </div>
              <span className="text-sm font-medium">Track Attendance</span>
            </div>
            <div className="flex flex-col items-center gap-2 w-24" role="listitem">
              <div className="w-14 h-14 rounded-full bg-chart-1/10 flex items-center justify-center" aria-hidden="true">
                <Sparkles className="h-7 w-7 text-chart-1" />
              </div>
              <span className="text-sm font-medium">AI Summaries</span>
            </div>
            <div className="flex flex-col items-center gap-2 w-24" role="listitem">
              <div className="w-14 h-14 rounded-full bg-chart-2/10 flex items-center justify-center" aria-hidden="true">
                <CheckCircle className="h-7 w-7 text-chart-2" />
              </div>
              <span className="text-sm font-medium">Action Items</span>
            </div>
          </div>

          {/* Call to Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 mt-4" role="group" aria-label="Get started options">
            {/* Primary CTA */}
            <Button 
              size="lg" 
              className="text-base px-8 py-6 h-auto" 
              onClick={handleCreateMeeting}
              disabled={isLoading}
              aria-label={isLoading ? 'Starting meeting creation' : 'Create a new meeting'}
              aria-busy={isLoading}
            >
              {isLoading ? 'Starting...' : 'Create a Meeting'}
            </Button>

            {/* Secondary CTA */}
            <Dialog>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="text-base px-8 py-6 h-auto"
                  aria-label="Open AI meeting assistant dialog"
                >
                  Let AI help me create a meeting
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]" aria-describedby="ai-dialog-description">
                <div className="space-y-4">
                  <h3 id="ai-dialog-title" className="text-lg font-semibold">Describe your meeting</h3>
                  <p id="ai-dialog-description" className="sr-only">Enter a description of your meeting and AI will help set it up</p>
                  <textarea 
                    className="w-full h-32 p-3 border rounded-md bg-background" 
                    placeholder="E.g., Weekly team check-in for 5 people, need to discuss project updates and capture action items..."
                    aria-label="Meeting description for AI assistant"
                  />
                  <Button className="w-full" aria-label="Generate meeting from description">Generate Meeting</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Microcopy */}
          <p className="text-sm text-muted-foreground mt-2">
            No account required. One meeting. Free.
          </p>

          {/* Divider */}
          <div className="flex items-center gap-4 w-full max-w-md mt-8">
            <div className="flex-1 h-px bg-border" />
            <span className="text-sm text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Join Meeting Widget */}
          <JoinMeetingWidget className="mt-4" />
          
          {/* Error message - only shows if denial occurs */}
          {error && (
            <div 
              className="mt-4 p-4 bg-destructive/10 text-destructive rounded-md"
              role="alert"
              aria-live="polite"
            >
              {error}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
