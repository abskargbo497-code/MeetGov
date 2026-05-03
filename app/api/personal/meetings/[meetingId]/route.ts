/**
 * GET    /api/personal/meetings/[meetingId] — Get meeting details
 * DELETE /api/personal/meetings/[meetingId] — Delete meeting
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

async function getOwner(userId: string) {
  return { ownerId: userId };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  try {
    const { meetingId } = await params;
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId, ownerId: userId },
      include: {
        attendances: {
          select: { id: true, participantName: true, participantEmail: true, checkedInAt: true },
        },
        artifacts: { select: { type: true, status: true } },
        transcripts: { select: { id: true } },
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: meeting.id,
      title: meeting.title,
      description: meeting.description,
      meetingType: meeting.meetingType,
      status: meeting.status,
      processingStatus: meeting.processingStatus,
      scheduledAt: meeting.scheduledStart,
      durationMinutes: meeting.durationMinutes,
      location: meeting.location,
      joinCode: meeting.joinCode,
      participants: meeting.attendances.map((a) => ({
        id: a.id,
        name: a.participantName,
        email: a.participantEmail ?? null,
        status: "JOINED",
        joinedAt: a.checkedInAt,
      })),
      hasTranscript: meeting.transcripts.length > 0,
      hasArtifacts: {
        summary: meeting.artifacts.some((a) => a.type === "SUMMARY" && a.status === "COMPLETED"),
        minutes: meeting.artifacts.some((a) => a.type === "MINUTES" && a.status === "COMPLETED"),
        actionItems: meeting.artifacts.some((a) => a.type === "ACTION_ITEMS" && a.status === "COMPLETED"),
      },
      createdAt: meeting.createdAt,
      updatedAt: meeting.updatedAt,
    });
  } catch (error: any) {
    console.error("[GET /api/personal/meetings/[meetingId]]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  try {
    const { meetingId } = await params;
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId, ownerId: userId },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    await prisma.meeting.delete({ where: { id: meetingId } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[DELETE /api/personal/meetings/[meetingId]]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
