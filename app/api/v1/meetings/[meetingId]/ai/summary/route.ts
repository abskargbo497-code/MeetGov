import { NextRequest, NextResponse } from "next/server";
import { generateArtifact } from "@/lib/ai/generate-artifact";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;
  try {
    const result = await generateArtifact(meetingId, "SUMMARY");
    return NextResponse.json({ ...result, status: "PENDING" });
  } catch (error: any) {
    console.error("[POST /ai/summary]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
