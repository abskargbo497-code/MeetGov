import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  try {
    const meeting = await prisma.meeting.findFirst({
      where: { joinCode: code.toUpperCase() },
      include: {
        recordings: {
          orderBy: { uploadedAt: "desc" },
          take: 1,
          select: { processingStatus: true },
        },
      },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const recording = meeting.recordings[0];

    return NextResponse.json({
      id: meeting.id,
      title: meeting.title,
      status: meeting.status,
      processingStatus: meeting.processingStatus,
      processingError: null,
      recordingStatus: meeting.recordingStatus,
      scheduledStart: meeting.scheduledStart?.toISOString() ?? null,
      scheduledEnd: meeting.scheduledEnd?.toISOString() ?? null,
      actualStart: meeting.actualStart?.toISOString() ?? null,
      actualEnd: meeting.actualEnd?.toISOString() ?? null,
      durationMinutes: meeting.durationMinutes,
      accessCode: meeting.joinCode,
      workflowCompletedAt: null,
      isReadOnly: false,
    });
  } catch (error: any) {
    console.error("[GET /api/v1/meetings/access/:code]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
