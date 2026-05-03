/**
 * GET /api/tasks/my-tasks — Get tasks assigned to the current user
 * GET /api/tasks/stats   — Get task stats for the dashboard
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? undefined;
    const limit = Math.min(100, Number(searchParams.get("limit") ?? "50"));

    const tasks = await prisma.task.findMany({
      where: {
        ownerId: userId,
        ownerType: "PERSONAL",
        ...(status ? { status: status as any } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        meeting: {
          select: { id: true, title: true, scheduledStart: true },
        },
      },
    });

    return NextResponse.json({ tasks });
  } catch (error: any) {
    console.error("[GET /api/tasks/my-tasks]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
