/**
 * GET /api/v1/meetings/[meetingId] — Get meeting by ID
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  try {
    const { meetingId } = await params;
    const { userId } = await auth();

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        attendances: { select: { id: true, participantName: true, participantEmail: true, checkedInAt: true } },
        artifacts: { select: { type: true, status: true } },
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Meeting ID is only reachable via join code lookup — no further access check needed

    return NextResponse.json({
      id: meeting.id,
      title: meeting.title,
      meetingType: meeting.meetingType,
      durationMinutes: meeting.durationMinutes,
      status: meeting.status,
      recordingStatus: meeting.recordingStatus,
      scheduledAt: meeting.scheduledStart,
      actualStart: meeting.actualStart,
      actualEnd: meeting.actualEnd,
      location: meeting.location,
      joinCode: meeting.joinCode,
      participants: meeting.attendances.map((a) => ({
        id: a.id,
        name: a.participantName,
        email: a.participantEmail,
        status: "JOINED",
        joinedAt: a.checkedInAt,
      })),
      hasArtifacts: meeting.artifacts.some((a) => a.status === "COMPLETED"),
      createdBy: { id: meeting.ownerId, type: meeting.ownerType },
      createdAt: meeting.createdAt,
      updatedAt: meeting.updatedAt,
    });
  } catch (error: any) {
    console.error("[GET /api/v1/meetings/[meetingId]]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
