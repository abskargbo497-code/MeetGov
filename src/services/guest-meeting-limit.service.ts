/**
 * GUEST MEETING LIMIT SERVICE
 *
 * Enforces strict guest user flow:
 * - ONE meeting only per guest session
 * - Max duration: 1 hour
 * - Auto-end when duration reached
 * - 10-minute grace window for downloads after end
 * - Hard delete all guest data after grace period
 */

import { prisma } from '../lib/prisma';
import logger from '../logger/index';

interface CheckGuestMeetingLimitResult {
  canCreate: boolean;
  reason?: string;
  existingMeetingId?: string;
}

interface AutoEndResult {
  scanned: number;
  ended: number;
  errors: number;
}

interface CleanupResult {
  scanned: number;
  deleted: number;
  errors: number;
}

interface CleanupParams {
  limit?: number;
  dryRun?: boolean;
}

class GuestMeetingLimitService {
  private readonly MAX_DURATION_MINUTES = 60;
  private readonly GRACE_PERIOD_MINUTES = 10;

  async checkGuestMeetingLimit(guestSessionId: string): Promise<CheckGuestMeetingLimitResult> {
    try {
      const existingMeetings = await prisma.meeting.findMany({
        where: {
          guestSessionId,
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
        },
      });

      if (existingMeetings.length === 0) {
        return { canCreate: true };
      }

      return {
        canCreate: false,
        reason: 'Guest users can only create ONE meeting. You have already created a meeting.',
        existingMeetingId: existingMeetings[0].id,
      };
    } catch (error: any) {
      logger.error(`Failed to check guest meeting limit: ${error.message}`);
      throw error;
    }
  }

  async enforceGuestMeetingConstraints(meetingId: string): Promise<void> {
    try {
      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        select: {
          id: true,
          guestSessionId: true,
          scheduledStart: true,
          scheduledEnd: true,
          actualStart: true,
        },
      });

      if (!meeting || !meeting.guestSessionId) {
        return;
      }

      const now = new Date();
      const maxEndTime = new Date(now.getTime() + this.MAX_DURATION_MINUTES * 60 * 1000);

      const updates: { scheduledEnd?: Date; expiresAt: Date } = {
        expiresAt: new Date(maxEndTime.getTime() + this.GRACE_PERIOD_MINUTES * 60 * 1000),
      };

      if (!meeting.scheduledEnd || meeting.scheduledEnd > maxEndTime) {
        updates.scheduledEnd = maxEndTime;
      }

      if (Object.keys(updates).length > 0) {
        await prisma.meeting.update({
          where: { id: meetingId },
          data: updates,
        });
        logger.info(
          `Guest meeting constraints enforced: ${meetingId} - scheduledEnd: ${updates.scheduledEnd?.toISOString()}, expiresAt: ${updates.expiresAt.toISOString()}`
        );
      }
    } catch (error: any) {
      logger.error(`Failed to enforce guest meeting constraints: ${error.message}`);
      throw error;
    }
  }

  async autoEndExpiredGuestMeetings(params?: CleanupParams): Promise<AutoEndResult> {
    const limit = params?.limit ?? 100;
    const dryRun = params?.dryRun === true;

    try {
      const now = new Date();

      const expiredMeetings = await prisma.meeting.findMany({
        where: {
          guestSessionId: { not: null },
          status: { in: ['SCHEDULED', 'ACTIVE'] },
          scheduledEnd: { not: null, lt: now },
        },
        select: {
          id: true,
          title: true,
          guestSessionId: true,
          scheduledEnd: true,
          actualStart: true,
        },
        take: limit,
      });

      let ended = 0;
      let errors = 0;

      logger.info(
        `Auto-end: found ${expiredMeetings.length} expired guest meetings (limit=${limit}, dryRun=${dryRun})`
      );

      for (const meeting of expiredMeetings) {
        try {
          if (!dryRun) {
            await prisma.meeting.update({
              where: { id: meeting.id },
              data: {
                status: 'COMPLETED',
                actualEnd: now,
              },
            });
          }
          ended += 1;
          logger.info(
            `Auto-ended guest meeting: ${meeting.id} (scheduledEnd: ${meeting.scheduledEnd?.toISOString()})`
          );
        } catch (err: any) {
          errors += 1;
          logger.error(`Failed to auto-end meeting ${meeting.id}: ${err.message}`);
        }
      }

      return {
        scanned: expiredMeetings.length,
        ended,
        errors,
      };
    } catch (error: any) {
      logger.error(`Failed to auto-end expired guest meetings: ${error.message}`);
      throw error;
    }
  }

  async cleanupGuestMeetingsAfterGrace(params?: CleanupParams): Promise<CleanupResult> {
    const limit = params?.limit ?? 100;
    const dryRun = params?.dryRun === true;

    try {
      const now = new Date();

      const expiredMeetings = await prisma.meeting.findMany({
        where: {
          guestSessionId: { not: null },
          expiresAt: { lt: now },
        },
        select: {
          id: true,
          guestSessionId: true,
          expiresAt: true,
        },
        take: limit,
      });

      const sessionIds = [
        ...new Set(expiredMeetings.map((m) => m.guestSessionId).filter(Boolean)),
      ] as string[];

      let deleted = 0;
      let errors = 0;

      logger.info(
        `Grace cleanup: found ${expiredMeetings.length} meetings past grace period, ${sessionIds.length} unique sessions (limit=${limit}, dryRun=${dryRun})`
      );

      for (const sessionId of sessionIds) {
        try {
          if (!dryRun) {
            await this.hardDeleteGuestData(sessionId);
          }
          deleted += 1;
          logger.info(`Hard deleted guest session after grace period: ${sessionId}`);
        } catch (err: any) {
          errors += 1;
          logger.error(`Failed to delete guest session ${sessionId}: ${err.message}`);
        }
      }

      return {
        scanned: expiredMeetings.length,
        deleted,
        errors,
      };
    } catch (error: any) {
      logger.error(`Failed to cleanup guest meetings after grace: ${error.message}`);
      throw error;
    }
  }

  async hardDeleteGuestData(guestSessionId: string): Promise<void> {
    try {
      logger.info(`Starting hard delete for guest session: ${guestSessionId}`);

      const meetings = await prisma.meeting.findMany({
        where: { guestSessionId },
        select: { id: true },
      });

      const meetingIds = meetings.map((m) => m.id);

      if (meetingIds.length > 0) {
        await prisma.taskSubmissionFile.deleteMany({
          where: {
            submission: {
              task: {
                meetingId: { in: meetingIds },
              },
            },
          },
        });

        await prisma.taskSubmission.deleteMany({
          where: {
            task: {
              meetingId: { in: meetingIds },
            },
          },
        });

        await prisma.taskSubmissionToken.deleteMany({
          where: {
            task: {
              meetingId: { in: meetingIds },
            },
          },
        });

        await prisma.task.deleteMany({
          where: { meetingId: { in: meetingIds } },
        });

        await prisma.transcriptSnapshot.deleteMany({
          where: { meetingId: { in: meetingIds } },
        });

        await prisma.aiJob.deleteMany({
          where: { meetingId: { in: meetingIds } },
        });

        await prisma.meetingMinutes.deleteMany({
          where: { meetingId: { in: meetingIds } },
        });

        await prisma.meetingSummary.deleteMany({
          where: { meetingId: { in: meetingIds } },
        });

        await prisma.transcript.deleteMany({
          where: { meetingId: { in: meetingIds } },
        });

        await prisma.recording.deleteMany({
          where: { meetingId: { in: meetingIds } },
        });

        await prisma.attendanceToken.deleteMany({
          where: { meetingId: { in: meetingIds } },
        });

        await prisma.attendance.deleteMany({
          where: { meetingId: { in: meetingIds } },
        });

        await prisma.meeting.deleteMany({
          where: { id: { in: meetingIds } },
        });
      }

      await prisma.guestSession.delete({
        where: { id: guestSessionId },
      });

      logger.info(
        `Hard delete completed for guest session: ${guestSessionId} (${meetingIds.length} meetings deleted)`
      );
    } catch (error: any) {
      logger.error(`Failed to hard delete guest data: ${error.message}`);
      throw error;
    }
  }

  getMaxDurationMinutes(): number {
    return this.MAX_DURATION_MINUTES;
  }

  getGracePeriodMinutes(): number {
    return this.GRACE_PERIOD_MINUTES;
  }
}

export default new GuestMeetingLimitService();
