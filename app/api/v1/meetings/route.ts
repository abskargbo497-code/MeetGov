/**
 * POST /api/v1/meetings — Create a meeting (guest or authenticated)
 * GET  /api/v1/meetings — List meetings for current user
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const GUEST_RETENTION_DAYS = 7;
const USER_RETENTION_DAYS = 30;

function generateJoinCode(length = 8): string {
  return crypto.randomBytes(length).toString("hex").toUpperCase().slice(0, length);
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    const body = await req.json();
    const { title, meetingType, scheduledAt, durationMinutes, participants, location } = body;

    if (!title || !meetingType || !durationMinutes) {
      return NextResponse.json(
        { error: "Missing required fields: title, meetingType, durationMinutes" },
        { status: 400 }
      );
    }
    if (!["INSTANT", "SCHEDULED"].includes(meetingType)) {
      return NextResponse.json({ error: "meetingType must be INSTANT or SCHEDULED" }, { status: 400 });
    }
    if (durationMinutes > 60 || durationMinutes < 5) {
      return NextResponse.json({ error: "Duration must be 5–60 minutes" }, { status: 400 });
    }
    if (meetingType === "SCHEDULED" && !scheduledAt) {
      return NextResponse.json({ error: "Scheduled meetings require scheduledAt" }, { status: 400 });
    }

    const retentionDays = userId ? USER_RETENTION_DAYS : GUEST_RETENTION_DAYS;
    const scheduledStart = scheduledAt ? new Date(scheduledAt) : new Date();
    const scheduledEnd = new Date(scheduledStart.getTime() + durationMinutes * 60 * 1000);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + retentionDays);

    // Store invited participants as JSON (no separate relation on Meeting)
    const invitedParticipants = Array.isArray(participants)
      ? participants.filter((p: any) => p.email || p.name)
      : null;

    const meeting = await prisma.meeting.create({
      data: {
        title,
        meetingType,
        durationMinutes,
        status: meetingType === "INSTANT" ? "ACTIVE" : "SCHEDULED",
        joinCode: generateJoinCode(),
        scheduledStart,
        scheduledEnd,
        location: location || null,
        expiresAt,
        invitedParticipants: invitedParticipants || undefined,
        ownerId: userId ?? "guest",
        ownerType: userId ? "PERSONAL" : "GUEST",
      },
    });

    const inviteResults = (invitedParticipants || []).map((p: any) => ({
      email: p.email,
      success: false,
      reason: "Email service not configured",
    }));

    return NextResponse.json({
      id: meeting.id,
      title: meeting.title,
      meetingType: meeting.meetingType,
      status: meeting.status,
      joinCode: meeting.joinCode,
      scheduledAt: meeting.scheduledStart,
      durationMinutes: meeting.durationMinutes,
      location: meeting.location,
      createdAt: meeting.createdAt,
      inviteResults,
    });
  } catch (error: any) {
    console.error("[POST /api/v1/meetings]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

export async function GET(_req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const meetings = await prisma.meeting.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ meetings });
  } catch (error: any) {
    console.error("[GET /api/v1/meetings]", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
