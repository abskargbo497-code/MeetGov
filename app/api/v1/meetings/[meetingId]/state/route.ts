/**
 * GET /api/v1/meetings/[meetingId]/state — Get current recording state
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  try {
    const { meetingId } = await params;

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        status: true,
        recordingStatus: true,
        actualStart: true,
        scheduledEnd: true,
        durationMinutes: true,
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Compute endsAt from actualStart + durationMinutes (if recording started)
    let endsAt: string | null = null;
    if (meeting.actualStart && meeting.durationMinutes) {
      const end = new Date(meeting.actualStart.getTime() + meeting.durationMinutes * 60 * 1000);
      endsAt = end.toISOString();
    } else if (meeting.scheduledEnd) {
      endsAt = meeting.scheduledEnd.toISOString();
    }

    return NextResponse.json({
      status: meeting.status,
      recordingState: meeting.recordingStatus,
      startedAt: meeting.actualStart?.toISOString() ?? null,
      endsAt,
      durationMinutes: meeting.durationMinutes,
    });
  } catch (error: any) {
    console.error("[GET /api/v1/meetings/[meetingId]/state]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
