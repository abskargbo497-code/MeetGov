import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: NextRequest,
  { params }: { params: { artifactId: string } }
) {
  const { artifactId } = params;
  try {
    const { content } = await req.json();
    if (typeof content !== "string") {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const artifact = await prisma.meetingArtifact.update({
      where: { id: artifactId },
      data: { content, updatedAt: new Date() },
    });

    return NextResponse.json({
      artifact: {
        id: artifact.id,
        meetingId: artifact.meetingId,
        type: artifact.type,
        content: artifact.content,
        status: artifact.status,
        errorMessage: artifact.errorMessage,
        createdAt: artifact.createdAt.toISOString(),
        updatedAt: artifact.updatedAt.toISOString(),
      },
    });
  } catch (error: any) {
    console.error("[PUT /artifacts/:id]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
