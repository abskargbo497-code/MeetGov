import OpenAI from "openai";
import { prisma } from "@/lib/prisma";

const openai = new OpenAI({ apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY });

const PROMPTS: Record<string, string> = {
  SUMMARY: `You are a meeting assistant. Given this meeting transcript, write a concise executive summary (3-5 paragraphs) covering: main topics discussed, key decisions made, and important outcomes. Use plain prose.`,
  MINUTES: `You are a meeting assistant. Given this meeting transcript, write formal meeting minutes in markdown. Include sections: ## Attendees (if known), ## Agenda Items, ## Discussion Points, ## Decisions Made, ## Next Steps. Be structured and professional.`,
  ACTION_ITEMS: `You are a meeting assistant. Given this meeting transcript, extract all action items. For each action item use this format:

1. **Task**: [description]
   - **Assigned To**: [name or TBD]
   - **Priority**: [HIGH / MEDIUM / LOW]
   - **Deadline**: [date or TBD]

List only concrete actionable tasks.`,
};

export async function generateArtifact(
  meetingId: string,
  type: "SUMMARY" | "MINUTES" | "ACTION_ITEMS"
): Promise<{ artifactId: string; jobId: string }> {
  const segments = await prisma.transcriptSegment.findMany({
    where: { meetingId },
    orderBy: { startTime: "asc" },
  });

  if (segments.length === 0) {
    throw new Error("No transcript found. Start transcription first.");
  }

  const transcriptText = segments
    .map((s) => `[${formatTime(s.startTime)}] ${s.speakerLabel}: ${s.text}`)
    .join("\n");

  // Upsert artifact as PENDING
  const artifact = await prisma.meetingArtifact.upsert({
    where: { meetingId_type: { meetingId, type } },
    create: { meetingId, type, status: "PENDING", content: null, errorMessage: null },
    update: { status: "PENDING", content: null, errorMessage: null, updatedAt: new Date() },
  });

  const job = await prisma.aiJob.create({
    data: {
      meetingId,
      type,
      status: "PROCESSING",
      startedAt: new Date(),
    },
  });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: PROMPTS[type] },
        { role: "user", content: `Meeting Transcript:\n\n${transcriptText}` },
      ],
      temperature: 0.3,
    });

    const content = completion.choices[0]?.message?.content ?? "";

    await prisma.meetingArtifact.update({
      where: { id: artifact.id },
      data: { status: "COMPLETED", content },
    });

    await prisma.aiJob.update({
      where: { id: job.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  } catch (err: any) {
    await prisma.meetingArtifact.update({
      where: { id: artifact.id },
      data: { status: "FAILED", errorMessage: err.message },
    });
    await prisma.aiJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorMessage: err.message },
    });
    throw err;
  }

  return { artifactId: artifact.id, jobId: job.id };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
