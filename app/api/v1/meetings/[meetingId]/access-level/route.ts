import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await params;
  try {
    const { userId } = await auth();
    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    const isOwner =
      meeting.ownerType === "GUEST" ||
      (meeting.ownerType === "PERSONAL" && meeting.ownerId === userId);

    return NextResponse.json({
      meetingId,
      accessLevel: isOwner ? "OWNER" : "NONE",
      canModify: isOwner,
      canView: isOwner,
      isReadOnly: !isOwner,
      enterpriseRole: null,
    });
  } catch (error: any) {
    console.error("[GET /access-level]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
