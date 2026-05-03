/**
 * GET /api/personal/meetings/stats — Meeting statistics for dashboard
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const where = { ownerId: userId };

    const [totalMeetings, completedMeetings, liveMeetings, upcomingMeetings, durationAgg] =
      await Promise.all([
        prisma.meeting.count({ where }),
        prisma.meeting.count({ where: { ...where, status: { in: ["ENDED", "COMPLETED"] } } }),
        prisma.meeting.count({ where: { ...where, status: { in: ["LIVE", "ACTIVE"] } } }),
        prisma.meeting.count({ where: { ...where, status: { in: ["SCHEDULED", "WAITING"] } } }),
        prisma.meeting.aggregate({ where, _sum: { durationMinutes: true } }),
      ]);

    return NextResponse.json({
      stats: {
        totalMeetings,
        completedMeetings,
        liveMeetings,
        upcomingMeetings,
        totalDurationMinutes: durationAgg._sum.durationMinutes ?? 0,
      },
    });
  } catch (error: any) {
    console.error("[GET /api/personal/meetings/stats]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
