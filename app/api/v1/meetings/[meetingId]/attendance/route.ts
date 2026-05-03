/**
 * GET /api/v1/meetings/[meetingId]/attendance — Get attendance list
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  try {
    const { meetingId } = await params;

    const attendances = await prisma.attendance.findMany({
      where: { meetingId },
      orderBy: { checkedInAt: "asc" },
    });

    const attendees = attendances.map((a) => ({
      id: a.id,
      name: a.participantName,
      email: a.participantEmail ?? null,
      checkedInAt: a.checkedInAt?.toISOString() ?? null,
    }));

    return NextResponse.json({
      totalCount: attendees.length,
      attendees,
    });
  } catch (error: any) {
    console.error("[GET /api/v1/meetings/[meetingId]/attendance]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
