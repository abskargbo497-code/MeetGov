/**
 * CLEANUP SERVICE
 *
 * Handles cleanup of expired guest sessions, recordings, and related data.
 */

import { prisma } from '../lib/prisma';
import logger from '../logger/index';
import storageService from './storage.service';

interface DeleteGuestSessionResult {
  deletedMeetings: number;
  deletedRecordings: number;
  deletedObjects: number;
}

interface CleanupExpiredConversionsResult {
  scanned: number;
  deletedSessions: number;
  errors: number;
}

interface CleanupExpiredSessionsResult {
  scanned: number;
  deletedSessions: number;
  deletedMeetings: number;
  deletedRecordings?: number;
  deletedObjects?: number;
  errors: number;
}

interface CleanupLongRunningResult {
  scanned: number;
  deletedSessions: number;
  deletedMeetings: number;
  errors: number;
}

interface CleanupParams {
  limit?: number;
  dryRun?: boolean;
}

function parseObjectNameFromUrl(fileUrl: string, bucketName: string): string {
  const httpsPrefix = `https://storage.googleapis.com/${bucketName}/`;
  if (fileUrl.startsWith(httpsPrefix)) {
    return fileUrl.substring(httpsPrefix.length);
  }

  const gsPrefix = `gs://${bucketName}/`;
  if (fileUrl.startsWith(gsPrefix)) {
    return fileUrl.substring(gsPrefix.length);
  }

  throw new Error('Unsupported fileUrl format');
}

class CleanupService {
  async deleteGuestSessionAndArtifacts(
    sessionId: string,
    params?: { dryRun?: boolean }
  ): Promise<DeleteGuestSessionResult> {
    const dryRun = params?.dryRun === true;
    const bucketName = storageService.getBucketName();

    const meetings = await prisma.meeting.findMany({
      where: { guestSessionId: sessionId },
      select: { id: true, status: true, scheduledEnd: true },
    });

    const meetingIds = meetings.map((m) => m.id);

    const recordings = meetingIds.length
      ? await prisma.recording.findMany({
          where: { meetingId: { in: meetingIds } },
          select: { id: true, fileUrl: true },
        })
      : [];

    let deletedObjects = 0;

    logger.info(
      `Cleanup: deleteGuestSessionAndArtifacts session=${sessionId} meetings=${meetingIds.length} recordings=${recordings.length} dryRun=${dryRun}`
    );

    if (dryRun) {
      return {
        deletedMeetings: meetingIds.length,
        deletedRecordings: recordings.length,
        deletedObjects: 0,
      };
    }

    for (const rec of recordings) {
      try {
        const objectName = parseObjectNameFromUrl(rec.fileUrl, bucketName);
        await storageService.deleteFile(objectName);
        deletedObjects += 1;
      } catch (err: any) {
        const msg = err?.message || '';
        const code = err?.code;

        if (code === 404 || msg.includes('No such object') || msg.includes('Not Found')) {
          logger.warn(`Cleanup: GCS object missing for recording=${rec.id}, skipping`);
          continue;
        }

        logger.error(`Cleanup: Failed to delete GCS object for recording=${rec.id}: ${msg}`);
      }
    }

    await prisma.guestSession.delete({ where: { id: sessionId } });

    return {
      deletedMeetings: meetingIds.length,
      deletedRecordings: recordings.length,
      deletedObjects,
    };
  }

  async cleanupExpiredGuestConversions(
    params?: CleanupParams
  ): Promise<CleanupExpiredConversionsResult> {
    const limit = params?.limit ?? parseInt(process.env.CLEANUP_LIMIT || '50', 10);
    const dryRun = params?.dryRun === true;

    const now = new Date();

    const expired = await prisma.guestSession.findMany({
      where: {
        conversionState: 'PENDING',
        conversionDeadlineAt: { not: null, lt: now },
      },
      orderBy: { conversionDeadlineAt: 'asc' },
      take: limit,
      select: { id: true },
    });

    let deletedSessions = 0;
    let errors = 0;

    for (const session of expired) {
      try {
        await this.deleteGuestSessionAndArtifacts(session.id, { dryRun });
        if (!dryRun) deletedSessions += 1;
      } catch (err: any) {
        errors += 1;
        logger.error(
          `Cleanup: failed expired conversion cleanup for session=${session.id}: ${err.message}`
        );
      }
    }

    return { scanned: expired.length, deletedSessions, errors };
  }

  async cleanupExpiredGuestSessions(
    params?: CleanupParams
  ): Promise<CleanupExpiredSessionsResult> {
    const limit = params?.limit ?? parseInt(process.env.CLEANUP_LIMIT || '50', 10);
    const dryRun = params?.dryRun === true;

    const now = new Date();

    const expiredSessions = await prisma.guestSession.findMany({
      where: { expiresAt: { lt: now } },
      orderBy: { expiresAt: 'asc' },
      take: limit,
      select: { id: true, expiresAt: true, email: true },
    });

    let deletedSessions = 0;
    let deletedMeetings = 0;
    let deletedRecordings = 0;
    let deletedObjects = 0;
    let errors = 0;

    logger.info(
      `Cleanup: found ${expiredSessions.length} expired guest sessions (limit=${limit}, dryRun=${dryRun})`
    );

    for (const session of expiredSessions) {
      try {
        const meetings = await prisma.meeting.findMany({
          where: { guestSessionId: session.id },
          select: { id: true, status: true, scheduledEnd: true },
        });

        const meetingIds = meetings.map((m) => m.id);
        const hasLiveMeetings = meetings.some(
          (m) => m.status === 'SCHEDULED' || m.status === 'ACTIVE'
        );

        if (hasLiveMeetings) {
          const latestScheduledEnd = meetings
            .map((m) => m.scheduledEnd)
            .filter((d): d is Date => Boolean(d))
            .reduce<Date | null>((acc, d) => {
              if (!acc) return d;
              return d > acc ? d : acc;
            }, null);

          const extendedExpiresAt = new Date(
            Math.max(
              Date.now() + 60 * 60 * 1000,
              (latestScheduledEnd?.getTime() ?? 0) + 60 * 60 * 1000
            )
          );

          logger.info(
            `Cleanup: skipping expired session=${session.id} because it has active/scheduled meetings; extending expiresAt to ${extendedExpiresAt.toISOString()}`
          );

          if (!dryRun) {
            await prisma.guestSession.update({
              where: { id: session.id },
              data: {
                expiresAt: extendedExpiresAt,
                lastActiveAt: new Date(),
              },
            });
          }
          continue;
        }

        const recordings = meetingIds.length
          ? await prisma.recording.findMany({
              where: { meetingId: { in: meetingIds } },
              select: { id: true, fileUrl: true },
            })
          : [];

        logger.info(
          `Cleanup: session=${session.id} meetings=${meetingIds.length} recordings=${recordings.length}`
        );

        const del = await this.deleteGuestSessionAndArtifacts(session.id, { dryRun });

        if (!dryRun) {
          deletedSessions += 1;
          deletedMeetings += del.deletedMeetings;
          deletedRecordings += del.deletedRecordings;
          deletedObjects += del.deletedObjects;
        }
      } catch (err: any) {
        errors += 1;
        logger.error(`Cleanup: failed for session=${session.id}: ${err.message}`);
      }
    }

    logger.info(
      `Cleanup summary: scanned=${expiredSessions.length} deletedSessions=${deletedSessions} deletedMeetings=${deletedMeetings} deletedRecordings=${deletedRecordings} deletedObjects=${deletedObjects} errors=${errors}`
    );

    return {
      scanned: expiredSessions.length,
      deletedSessions,
      deletedMeetings,
      deletedRecordings,
      deletedObjects,
      errors,
    };
  }

  /**
   * Cleanup guest sessions where meetings have been running for 70+ minutes
   * Guest data should only live 1hr 10min after meeting starts
   */
  async cleanupLongRunningGuestMeetings(
    params?: CleanupParams
  ): Promise<CleanupLongRunningResult> {
    const limit = params?.limit ?? parseInt(process.env.CLEANUP_LIMIT || '50', 10);
    const dryRun = params?.dryRun === true;

    const now = new Date();
    const seventyMinutesAgo = new Date(now.getTime() - 70 * 60 * 1000);

    // Find guest sessions with meetings that started 70+ minutes ago
    const guestMeetings = await prisma.meeting.findMany({
      where: {
        guestSessionId: { not: null },
        actualStart: { not: null, lt: seventyMinutesAgo },
      },
      select: {
        id: true,
        guestSessionId: true,
        actualStart: true,
        status: true,
      },
      take: limit,
    });

    const sessionIds = [
      ...new Set(guestMeetings.map((m) => m.guestSessionId).filter(Boolean)),
    ] as string[];

    let deletedSessions = 0;
    let deletedMeetings = 0;
    let errors = 0;

    logger.info(
      `Cleanup: found ${sessionIds.length} guest sessions with meetings running 70+ minutes (limit=${limit}, dryRun=${dryRun})`
    );

    for (const sessionId of sessionIds) {
      try {
        const del = await this.deleteGuestSessionAndArtifacts(sessionId, { dryRun });

        if (!dryRun) {
          deletedSessions += 1;
          deletedMeetings += del.deletedMeetings;
        }

        logger.info(
          `Cleanup: deleted guest session ${sessionId} (meeting runtime exceeded 70 minutes)`
        );
      } catch (err: any) {
        errors += 1;
        logger.error(
          `Cleanup: failed for long-running session=${sessionId}: ${err.message}`
        );
      }
    }

    logger.info(
      `Cleanup long-running summary: scanned=${guestMeetings.length} sessionIds=${sessionIds.length} deletedSessions=${deletedSessions} deletedMeetings=${deletedMeetings} errors=${errors}`
    );

    return {
      scanned: guestMeetings.length,
      deletedSessions,
      deletedMeetings,
      errors,
    };
  }
}

export default new CleanupService();
