/**
 * POST /api/attendance/check-in — QR code attendance check-in (no account required)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { meetingId, name, email } = body;

    if (!meetingId || !name?.trim()) {
      return NextResponse.json({ error: "meetingId and name are required" }, { status: 400 });
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, status: true, ownerId: true, ownerType: true },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    if (["ENDED", "COMPLETED", "CANCELLED"].includes(meeting.status)) {
      return NextResponse.json({ error: "Meeting is no longer accepting check-ins" }, { status: 400 });
    }

    // Check for duplicate (same name + email in this meeting)
    const existing = await prisma.attendance.findFirst({
      where: {
        meetingId,
        participantName: name.trim(),
        ...(email ? { participantEmail: email.trim() } : {}),
      },
    });

    if (existing) {
      return NextResponse.json({ error: "Already checked in", alreadyCheckedIn: true }, { status: 400 });
    }

    const attendance = await prisma.attendance.create({
      data: {
        meetingId,
        participantName: name.trim(),
        participantEmail: email?.trim() || null,
        ownerId: meeting.ownerId,
        ownerType: meeting.ownerType,
        checkedInAt: new Date(),
        checkedInVia: "QR_SCAN",
        role: "ATTENDEE",
      },
    });

    return NextResponse.json({
      success: true,
      attendanceId: attendance.id,
      message: "Checked in successfully",
    });
  } catch (error: any) {
    console.error("[POST /api/attendance/check-in]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
