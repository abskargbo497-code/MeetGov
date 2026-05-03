import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI, { toFile } from "openai";
import { createReadStream, existsSync } from "fs";

const openai = new OpenAI({ apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY });

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;
  try {
    const recording = await prisma.recording.findFirst({
      where: { meetingId },
      orderBy: { uploadedAt: "desc" },
    });

    if (!recording) {
      return NextResponse.json({ error: "No recording found" }, { status: 404 });
    }

    const existingSegments = await prisma.transcriptSegment.count({ where: { meetingId } });
    if (existingSegments > 0) {
      return NextResponse.json({ error: "Transcript already exists" }, { status: 409 });
    }

    await prisma.recording.update({
      where: { id: recording.id },
      data: { processingStatus: "PROCESSING" },
    });

    if (!existsSync(recording.fileUrl)) {
      await prisma.recording.update({
        where: { id: recording.id },
        data: { processingStatus: "FAILED" },
      });
      return NextResponse.json({ error: "Recording file not found on server" }, { status: 422 });
    }

    const ext = recording.fileUrl.endsWith(".webm") ? "webm" : "mp3";
    const mimeType = ext === "webm" ? "audio/webm" : "audio/mpeg";
    const audioFile = await toFile(createReadStream(recording.fileUrl), `audio.${ext}`, { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      response_format: "verbose_json",
    });

    const segments = (transcription as any).segments ?? [];

    if (segments.length > 0) {
      await prisma.transcriptSegment.createMany({
        data: segments.map((seg: any) => ({
          meetingId,
          speakerLabel: "SPEAKER_1",
          text: seg.text.trim(),
          startTime: seg.start,
          endTime: seg.end,
          confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : null,
        })),
      });
    } else if ((transcription as any).text) {
      await prisma.transcriptSegment.create({
        data: {
          meetingId,
          speakerLabel: "SPEAKER_1",
          text: (transcription as any).text.trim(),
          startTime: 0,
          endTime: 0,
          confidence: null,
        },
      });
    }

    await prisma.recording.update({
      where: { id: recording.id },
      data: { processingStatus: "COMPLETED" },
    });

    return NextResponse.json({
      success: true,
      meetingId,
      jobId: recording.id,
      status: "PROCESSING",
      message: "Transcription completed",
    });
  } catch (error: any) {
    console.error("[POST /transcription/start]", error);
    await prisma.recording.updateMany({
      where: { meetingId, processingStatus: "PROCESSING" },
      data: { processingStatus: "FAILED" },
    }).catch(() => {});
    return NextResponse.json({ error: error.message || "Transcription failed" }, { status: 500 });
  }
}
