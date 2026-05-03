/**
 * POST /api/v1/recordings/upload — Upload recording audio file
 *
 * Accepts multipart/form-data with 'audio' file and 'meetingId'.
 * Stores recording metadata in DB. Actual file storage can be wired up
 * to a cloud provider later — for now stores locally in /tmp.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audio = formData.get("audio") as File | null;
    const meetingId = formData.get("meetingId") as string | null;

    if (!audio || !meetingId) {
      return NextResponse.json({ error: "audio and meetingId are required" }, { status: 400 });
    }

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Save file to tmp (in production, replace with S3/R2/GCS upload)
    const buffer = Buffer.from(await audio.arrayBuffer());
    const fileName = `recording-${meetingId}-${Date.now()}.webm`;
    const filePath = join(tmpdir(), fileName);
    await writeFile(filePath, buffer);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const recording = await prisma.recording.create({
      data: {
        meetingId,
        status: "COMPLETED",
        startedAt: meeting.actualStart ?? new Date(),
        endedAt: new Date(),
        fileUrl: filePath,
        fileSize: BigInt(buffer.byteLength),
        mimeType: audio.type || "audio/webm",
        processingStatus: "PENDING",
        expiresAt,
      },
    });

    // Mark meeting as having a recording
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { status: "ENDED" },
    });

    return NextResponse.json({
      success: true,
      recordingId: recording.id,
      recordingUrl: filePath,
      status: recording.status,
      processingStatus: recording.processingStatus,
      message: "Recording saved successfully",
    });
  } catch (error: any) {
    console.error("[POST /api/v1/recordings/upload]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
