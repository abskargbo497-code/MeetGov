import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;
  try {
    const segments = await prisma.transcriptSegment.findMany({
      where: { meetingId },
      orderBy: { startTime: "asc" },
    });

    return NextResponse.json({
      segments: segments.map((s) => ({
        id: s.id,
        speakerLabel: s.speakerLabel,
        text: s.text,
        startTimeMs: Math.round(s.startTime * 1000),
        endTimeMs: Math.round(s.endTime * 1000),
        confidence: s.confidence,
      })),
    });
  } catch (error: any) {
    console.error("[GET /transcript]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
