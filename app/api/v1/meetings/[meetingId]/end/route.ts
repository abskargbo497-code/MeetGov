/**
 * POST /api/v1/meetings/[meetingId]/end — End meeting and stop recording
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  try {
    const { meetingId } = await params;

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const now = new Date();
    const updated = await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: "ENDED",
        recordingStatus: "STOPPED",
        actualEnd: now,
      },
    });

    return NextResponse.json({
      success: true,
      meetingId,
      status: updated.status,
      recordingState: updated.recordingStatus,
      startedAt: updated.actualStart?.toISOString() ?? null,
      endsAt: updated.actualEnd?.toISOString() ?? null,
    });
  } catch (error: any) {
    console.error("[POST /api/v1/meetings/[meetingId]/end]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
