import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;
  try {
    const recording = await prisma.recording.findFirst({
      where: { meetingId },
      orderBy: { uploadedAt: "desc" },
    });

    const segmentCount = await prisma.transcriptSegment.count({ where: { meetingId } });
    const hasTranscript = segmentCount > 0;

    if (!recording) {
      return NextResponse.json({
        meetingId,
        hasRecording: false,
        hasTranscript: false,
        transcriptId: null,
        segmentCount: 0,
        processingStatus: "IDLE",
        processingError: null,
        canStartTranscription: false,
      });
    }

    const ps = recording.processingStatus;
    let processingStatus: "IDLE" | "PROCESSING" | "COMPLETED" | "FAILED" = "IDLE";
    if (ps === "PROCESSING") processingStatus = "PROCESSING";
    else if (ps === "COMPLETED" || hasTranscript) processingStatus = "COMPLETED";
    else if (ps === "FAILED") processingStatus = "FAILED";

    return NextResponse.json({
      meetingId,
      hasRecording: true,
      hasTranscript,
      transcriptId: hasTranscript ? meetingId : null,
      segmentCount,
      processingStatus,
      processingError: null,
      canStartTranscription: processingStatus === "IDLE" || processingStatus === "FAILED",
    });
  } catch (error: any) {
    console.error("[GET /transcription/status]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
