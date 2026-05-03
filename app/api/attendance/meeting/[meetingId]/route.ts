/**
 * GET /api/attendance/meeting/[meetingId] — Public meeting info for check-in page
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
      select: { id: true, title: true, status: true, recordingStatus: true },
    });

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // QR code check-in only allowed before meeting ends
    const canCheckIn = !["ENDED", "COMPLETED", "CANCELLED", "FAILED"].includes(meeting.status);

    return NextResponse.json({
      id: meeting.id,
      title: meeting.title,
      status: meeting.status,
      canCheckIn,
    });
  } catch (error: any) {
    console.error("[GET /api/attendance/meeting/[meetingId]]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
