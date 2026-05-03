import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;
  try {
    const artifacts = await prisma.meetingArtifact.findMany({
      where: { meetingId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      artifacts: artifacts.map((a) => ({
        id: a.id,
        meetingId: a.meetingId,
        type: a.type,
        content: a.content,
        status: a.status,
        errorMessage: a.errorMessage,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })),
    });
  } catch (error: any) {
    console.error("[GET /artifacts]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
