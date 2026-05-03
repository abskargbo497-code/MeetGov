"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { 
  ArrowLeft, 
  FileText, 
  Sparkles, 
  Copy, 
  Download, 
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Loader2,
  Play
} from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { ensureGuestSession } from "@/lib/api/guest-session";
import { getMeeting, MeetingResponse } from "@/lib/api/meeting";
import {
  getTranscript,
  getArtifacts,
  generateSummary,
  generateMinutes,
  generateActionItems,
  updateArtifact,
  TranscriptSegment,
  MeetingArtifact,
  ArtifactType,
  ArtifactStatus,
  formatSpeakerLabel,
  formatTimestamp,
  formatTranscriptAsText,
  copyToClipboard,
  downloadAsFile
} from "@/lib/api/transcript";
import {
  startTranscription,
  getTranscriptionStatus,
  retryTranscription,
  getMeetingAccessLevel,
  TranscriptionStatusResponse,
  AccessLevelResponse
} from "@/lib/api/transcription";
import { Eye } from "lucide-react";

export default function ArtifactsPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const meetingId = params.meetingId as string;
  const { data: session, isPending: isSessionLoading } = useSession();

  // Meeting data
  const [meeting, setMeeting] = useState<MeetingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Transcription state
  const [transcriptionStatus, setTranscriptionStatus] = useState<TranscriptionStatusResponse | null>(null);
  const [isStartingTranscription, setIsStartingTranscription] = useState(false);
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);

  // Artifacts state
  const [artifacts, setArtifacts] = useState<MeetingArtifact[]>([]);
  const [generatingArtifact, setGeneratingArtifact] = useState<ArtifactType | null>(null);
  const [editingArtifact, setEditingArtifact] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<string>("");

  // Access level state (for admin read-only mode)
  const [accessLevel, setAccessLevel] = useState<AccessLevelResponse | null>(null);
  const isReadOnly = accessLevel?.isReadOnly ?? false;

  // Polling interval ref
  const pollingRef = useState<NodeJS.Timeout | null>(null);

  // Load meeting data
  const loadMeeting = useCallback(async () => {
    try {
      const { data, error: apiError } = await getMeeting(meetingId);
      if (apiError || !data) {
        throw new Error(apiError?.message || "Failed to load meeting");
      }
      setMeeting(data);
    } catch (err) {
      console.error("Error loading meeting:", err);
      setError("Unable to load meeting");
    }
  }, [meetingId]);

  // Load transcription status
  const loadTranscriptionStatus = useCallback(async () => {
    try {
      const { data, error: apiError } = await getTranscriptionStatus(meetingId);
      if (data) {
        setTranscriptionStatus(data);
        
        // If transcript exists, load it
        if (data.hasTranscript) {
          const { data: transcriptData } = await getTranscript(meetingId);
          if (transcriptData) {
            setTranscriptSegments(transcriptData.segments);
          }
        }
      }
    } catch (err) {
      console.error("Error loading transcription status:", err);
    }
  }, [meetingId]);

  // Load artifacts
  const loadArtifacts = useCallback(async () => {
    try {
      const { data, error: apiError } = await getArtifacts(meetingId);
      if (data) {
        setArtifacts(data.artifacts);
      }
    } catch (err) {
      console.error("Error loading artifacts:", err);
    }
  }, [meetingId]);

  // Load access level
  const loadAccessLevel = useCallback(async () => {
    try {
      const { data, error: apiError } = await getMeetingAccessLevel(meetingId);
      if (data) {
        setAccessLevel(data);
      }
    } catch (err) {
      console.error("Error loading access level:", err);
    }
  }, [meetingId]);

  // Initialize
  useEffect(() => {
    const init = async () => {
      if (isSessionLoading) return;

      // Check auth
      if (!session?.user) {
        const sessionValid = await ensureGuestSession();
        if (!sessionValid) {
          router.push("/");
          return;
        }
      }

      await Promise.all([loadMeeting(), loadTranscriptionStatus(), loadArtifacts(), loadAccessLevel()]);
      setIsLoading(false);
    };

    init();
  }, [loadMeeting, loadTranscriptionStatus, loadArtifacts, loadAccessLevel, router, session?.user?.id, isSessionLoading]);

  // Poll for transcription status when processing
  useEffect(() => {
    if (transcriptionStatus?.processingStatus === "PROCESSING") {
      const interval = setInterval(async () => {
        await loadTranscriptionStatus();
        await loadArtifacts();
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [transcriptionStatus?.processingStatus, loadTranscriptionStatus, loadArtifacts]);

  // Handle start transcription
  const handleStartTranscription = async () => {
    setIsStartingTranscription(true);
    try {
      const { data, error: apiError } = await startTranscription(meetingId);
      if (apiError || !data?.success) {
        throw new Error(apiError?.message || "Failed to start transcription");
      }

      toast({
        title: "Transcription Started",
        description: "This may take a few minutes depending on recording length.",
      });

      // Reload status
      await loadTranscriptionStatus();
    } catch (err) {
      console.error("Error starting transcription:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to start transcription",
        variant: "destructive"
      });
    } finally {
      setIsStartingTranscription(false);
    }
  };

  // Handle retry transcription
  const handleRetryTranscription = async () => {
    setIsStartingTranscription(true);
    try {
      const { data, error: apiError } = await retryTranscription(meetingId);
      if (apiError || !data?.success) {
        throw new Error(apiError?.message || "Failed to retry transcription");
      }

      toast({
        title: "Transcription Retry Started",
        description: "Retrying transcription...",
      });

      await loadTranscriptionStatus();
    } catch (err) {
      console.error("Error retrying transcription:", err);
      toast({
        title: "Error",
        description: "Failed to retry transcription",
        variant: "destructive"
      });
    } finally {
      setIsStartingTranscription(false);
    }
  };

  // Handle generate artifact
  const handleGenerateArtifact = async (type: ArtifactType) => {
    setGeneratingArtifact(type);
    try {
      let result;
      switch (type) {
        case "SUMMARY":
          result = await generateSummary(meetingId);
          break;
        case "MINUTES":
          result = await generateMinutes(meetingId);
          break;
        case "ACTION_ITEMS":
          result = await generateActionItems(meetingId);
          break;
      }

      if (result.error) {
        throw new Error(result.error.message);
      }

      toast({
        title: `Generating ${type.replace("_", " ").toLowerCase()}...`,
        description: "This will take a moment.",
      });

      // Start polling for artifact completion
      const pollInterval = setInterval(async () => {
        await loadArtifacts();
        const artifact = artifacts.find(a => a.type === type);
        if (artifact?.status === "COMPLETED" || artifact?.status === "FAILED") {
          clearInterval(pollInterval);
          setGeneratingArtifact(null);
        }
      }, 2000);

      // Timeout after 2 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setGeneratingArtifact(null);
      }, 120000);
    } catch (err) {
      console.error(`Error generating ${type}:`, err);
      toast({
        title: "Error",
        description: `Failed to generate ${type.replace("_", " ").toLowerCase()}`,
        variant: "destructive"
      });
      setGeneratingArtifact(null);
    }
  };

  // Handle copy artifact
  const handleCopyArtifact = async (content: string) => {
    const success = await copyToClipboard(content);
    toast({
      title: success ? "Copied!" : "Copy failed",
      description: success ? "Content copied to clipboard" : "Failed to copy to clipboard",
      variant: success ? "default" : "destructive"
    });
  };

  // Handle download artifact
  const handleDownloadArtifact = (artifact: MeetingArtifact) => {
    if (!artifact.content) return;
    const filename = `${meeting?.title || "meeting"}-${artifact.type.toLowerCase()}.txt`;
    downloadAsFile(artifact.content, filename);
  };

  // Handle save artifact edit
  const handleSaveArtifact = async (artifactId: string) => {
    try {
      const { error: apiError } = await updateArtifact(artifactId, editContent);
      if (apiError) {
        throw new Error(apiError.message);
      }

      toast({
        title: "Saved",
        description: "Artifact updated successfully",
      });

      setEditingArtifact(null);
      await loadArtifacts();
    } catch (err) {
      console.error("Error saving artifact:", err);
      toast({
        title: "Error",
        description: "Failed to save changes",
        variant: "destructive"
      });
    }
  };

  // Handle copy transcript
  const handleCopyTranscript = async () => {
    const text = formatTranscriptAsText(transcriptSegments);
    const success = await copyToClipboard(text);
    toast({
      title: success ? "Copied!" : "Copy failed",
      description: success ? "Transcript copied to clipboard" : "Failed to copy",
      variant: success ? "default" : "destructive"
    });
  };

  // Handle download transcript
  const handleDownloadTranscript = () => {
    const text = formatTranscriptAsText(transcriptSegments);
    const filename = `${meeting?.title || "meeting"}-transcript.txt`;
    downloadAsFile(text, filename);
  };

  // Get artifact by type
  const getArtifact = (type: ArtifactType): MeetingArtifact | undefined => {
    return artifacts.find(a => a.type === type);
  };

  // Check if transcript exists
  const hasTranscript = transcriptionStatus?.hasTranscript && transcriptSegments.length > 0;

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-t-primary border-muted rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading artifacts...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !meeting) {
    return (
      <div className="container max-w-4xl mx-auto py-12 px-4">
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <p className="text-destructive">{error || "Meeting not found"}</p>
            <Button onClick={() => router.push("/dashboard")}>
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/dashboard")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Dashboard
            </Button>
            <div className="h-6 w-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/meeting/${meetingId}`)}
            >
              Meeting Room
            </Button>
            <div className="h-6 w-px bg-border" />
            <h1 className="font-semibold text-lg truncate max-w-[200px] sm:max-w-none">
              {meeting.title} - Artifacts
            </h1>
            {isReadOnly && (
              <Badge variant="secondary" className="ml-2 bg-blue-100 text-blue-800">
                <Eye className="h-3 w-3 mr-1" />
                View Only
              </Badge>
            )}
          </div>
        </div>
      </header>

      {/* Read-only banner for admin users */}
      {isReadOnly && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2">
          <div className="container max-w-6xl mx-auto flex items-center gap-2 text-sm text-blue-800">
            <Eye className="h-4 w-4" />
            <span>You have view-only access as an admin. Only meeting organizers can start transcription and generate artifacts.</span>
          </div>
        </div>
      )}

      <main className="container max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT: Transcript Card */}
          <Card className="lg:row-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Transcript
              </CardTitle>
              <CardDescription>
                {hasTranscript 
                  ? `${transcriptSegments.length} segments`
                  : "Start transcription to generate transcript"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* No recording state */}
              {!transcriptionStatus?.hasRecording && (
                <div className="text-center py-12">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-2">No recording found</p>
                  <p className="text-sm text-muted-foreground">
                    Return to meeting and complete a recording first.
                  </p>
                  <Button 
                    className="mt-4" 
                    variant="outline"
                    onClick={() => router.push(`/meeting/${meetingId}`)}
                  >
                    Go to Meeting
                  </Button>
                </div>
              )}

              {/* Has recording but no transcript - show Start Transcription */}
              {transcriptionStatus?.hasRecording && !hasTranscript && transcriptionStatus?.processingStatus !== "PROCESSING" && (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">
                    No transcript yet. Start transcription to generate one.
                  </p>
                  {transcriptionStatus?.processingStatus === "FAILED" ? (
                    <div className="space-y-3">
                      <p className="text-sm text-destructive">
                        {transcriptionStatus.processingError || "Transcription failed"}
                      </p>
                      <Button
                        onClick={handleRetryTranscription}
                        disabled={isStartingTranscription}
                      >
                        {isStartingTranscription ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Retrying...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Retry Transcription
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    isReadOnly ? (
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground mb-2">Waiting for transcription to be started by meeting organizer.</p>
                        <Badge variant="secondary">
                          <Eye className="h-3 w-3 mr-1" />
                          View Only
                        </Badge>
                      </div>
                    ) : (
                      <Button
                        size="lg"
                        onClick={handleStartTranscription}
                        disabled={isStartingTranscription}
                      >
                        {isStartingTranscription ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Starting...
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4 mr-2" />
                            Start Transcription
                          </>
                        )}
                      </Button>
                    )
                  )}
                </div>
              )}

              {/* Transcription in progress */}
              {transcriptionStatus?.processingStatus === "PROCESSING" && (
                <div className="text-center py-12">
                  <Loader2 className="h-12 w-12 text-primary mx-auto mb-4 animate-spin" />
                  <p className="text-muted-foreground mb-2">Transcribing...</p>
                  <p className="text-sm text-muted-foreground">
                    This may take a few minutes depending on recording length.
                  </p>
                  <div className="mt-4 space-y-2">
                    <Skeleton className="h-4 w-3/4 mx-auto" />
                    <Skeleton className="h-4 w-1/2 mx-auto" />
                    <Skeleton className="h-4 w-2/3 mx-auto" />
                  </div>
                </div>
              )}

              {/* Transcript content */}
              {hasTranscript && (
                <div className="space-y-4">
                  {/* Actions */}
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={handleCopyTranscript}>
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownloadTranscript}>
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </div>

                  {/* Transcript segments */}
                  <div className="max-h-[500px] overflow-y-auto space-y-4 pr-2">
                    {transcriptSegments.map((segment) => (
                      <div key={segment.id} className="border-l-2 border-primary/30 pl-3 py-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-primary">
                            {formatSpeakerLabel(segment.speakerLabel)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatTimestamp(segment.startTimeMs)}
                          </span>
                        </div>
                        <p className="text-sm">{segment.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* RIGHT: AI Actions Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI Actions
              </CardTitle>
              <CardDescription>
                Generate summaries, minutes, and action items
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Summary */}
              <ArtifactButton
                type="SUMMARY"
                label="Generate Summary"
                artifact={getArtifact("SUMMARY")}
                isGenerating={generatingArtifact === "SUMMARY"}
                disabled={!hasTranscript}
                onGenerate={() => handleGenerateArtifact("SUMMARY")}
                isReadOnly={isReadOnly}
              />

              {/* Minutes */}
              <ArtifactButton
                type="MINUTES"
                label="Generate Minutes"
                artifact={getArtifact("MINUTES")}
                isGenerating={generatingArtifact === "MINUTES"}
                disabled={!hasTranscript}
                onGenerate={() => handleGenerateArtifact("MINUTES")}
                isReadOnly={isReadOnly}
              />

              {/* Action Items */}
              <ArtifactButton
                type="ACTION_ITEMS"
                label="Generate Action Items"
                artifact={getArtifact("ACTION_ITEMS")}
                isGenerating={generatingArtifact === "ACTION_ITEMS"}
                disabled={!hasTranscript}
                onGenerate={() => handleGenerateArtifact("ACTION_ITEMS")}
                isReadOnly={isReadOnly}
              />

              {!hasTranscript && !isReadOnly && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  Complete transcription to enable artifact generation
                </p>
              )}
              {isReadOnly && (
                <p className="text-xs text-blue-600 text-center pt-2">
                  View-only access. Artifact generation requires organizer permissions.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Artifacts Display */}
          {artifacts.filter(a => a.status === "COMPLETED" && a.content).map((artifact) => (
            <Card key={artifact.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {artifact.type === "SUMMARY" && "Summary"}
                    {artifact.type === "MINUTES" && "Meeting Minutes"}
                    {artifact.type === "ACTION_ITEMS" && "Action Items"}
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Complete
                    </Badge>
                  </span>
                  <div className="flex gap-1">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleCopyArtifact(artifact.content!)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleDownloadArtifact(artifact)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {editingArtifact === artifact.id ? (
                  <div className="space-y-3">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="min-h-[200px] font-mono text-sm"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setEditingArtifact(null)}
                      >
                        Cancel
                      </Button>
                      <Button 
                        size="sm"
                        onClick={() => handleSaveArtifact(artifact.id)}
                      >
                        Save Changes
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div 
                    className={`prose prose-sm dark:prose-invert max-w-none max-h-[300px] overflow-y-auto p-2 rounded-md transition-colors ${isReadOnly ? '' : 'cursor-pointer hover:bg-muted/50'}`}
                    onClick={() => {
                      if (!isReadOnly) {
                        setEditingArtifact(artifact.id);
                        setEditContent(artifact.content || "");
                      }
                    }}
                  >
                    <pre className="whitespace-pre-wrap text-sm font-sans">
                      {artifact.content}
                    </pre>
                  </div>
                )}
                {!isReadOnly && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Click to edit
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}

// Artifact generation button component
function ArtifactButton({ 
  type, 
  label, 
  artifact, 
  isGenerating, 
  disabled, 
  onGenerate,
  isReadOnly = false
}: {
  type: ArtifactType;
  label: string;
  artifact?: MeetingArtifact;
  isGenerating: boolean;
  disabled: boolean;
  onGenerate: () => void;
  isReadOnly?: boolean;
}) {
  const hasContent = artifact?.status === "COMPLETED" && artifact.content;
  const isPending = artifact?.status === "PENDING" || isGenerating;
  const isFailed = artifact?.status === "FAILED";

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        {hasContent && (
          <CheckCircle className="h-5 w-5 text-green-500" />
        )}
        {isPending && (
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
        )}
        {isFailed && (
          <AlertCircle className="h-5 w-5 text-destructive" />
        )}
        {!hasContent && !isPending && !isFailed && (
          <Sparkles className="h-5 w-5 text-muted-foreground" />
        )}
        <div>
          <p className="font-medium text-sm">{label}</p>
          {hasContent && (
            <p className="text-xs text-green-600">Generated</p>
          )}
          {isPending && (
            <p className="text-xs text-muted-foreground">Generating...</p>
          )}
          {isFailed && (
            <p className="text-xs text-destructive">{artifact?.errorMessage || "Failed"}</p>
          )}
          {!hasContent && !isPending && !isFailed && isReadOnly && (
            <p className="text-xs text-muted-foreground">Not yet generated</p>
          )}
        </div>
      </div>
      {!isReadOnly && (
        <Button
          size="sm"
          variant={hasContent ? "outline" : "default"}
          disabled={disabled || isPending}
          onClick={onGenerate}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : hasContent ? (
            "Regenerate"
          ) : (
            "Generate"
          )}
        </Button>
      )}
    </div>
  );
}
