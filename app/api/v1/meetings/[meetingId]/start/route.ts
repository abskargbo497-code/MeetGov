/**
 * POST /api/v1/meetings/[meetingId]/start — Start meeting recording
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
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

    if (meeting.ownerType !== "GUEST") {
      const { userId } = await auth();
      if (!userId || userId !== meeting.ownerId) {
        return NextResponse.json({ error: "Only the meeting organizer can perform this action" }, { status: 403 });
      }
    }

    if (meeting.recordingStatus === "RECORDING") {
      return NextResponse.json({ error: "Recording already in progress" }, { status: 400 });
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + meeting.durationMinutes * 60 * 1000);

    const updated = await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: "LIVE",
        recordingStatus: "RECORDING",
        actualStart: now,
        scheduledEnd: endsAt,
      },
    });

    return NextResponse.json({
      success: true,
      meetingId,
      status: updated.status,
      recordingState: updated.recordingStatus,
      startedAt: updated.actualStart?.toISOString() ?? null,
      endsAt: endsAt.toISOString(),
    });
  } catch (error: any) {
    console.error("[POST /api/v1/meetings/[meetingId]/start]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
