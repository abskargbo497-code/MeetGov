/**
 * GUEST CLEANUP JOB
 *
 * Scheduled job to enforce guest user flow constraints:
 * - Auto-end meetings that exceed 1 hour duration
 * - Delete guest data after 10-minute grace period
 * - Clean up expired guest sessions
 */

import logger from '../logger/index';
import guestMeetingLimitService from '../services/guest-meeting-limit.service';
import cleanupService from '../services/cleanup.service';

class GuestCleanupJob {
  async runAutoEndExpiredMeetings(): Promise<void> {
    try {
      logger.info('Starting auto-end expired guest meetings job');
      const result = await guestMeetingLimitService.autoEndExpiredGuestMeetings({
        limit: 100,
        dryRun: false,
      });
      logger.info(
        `Auto-end job completed: scanned=${result.scanned}, ended=${result.ended}, errors=${result.errors}`
      );
    } catch (error: any) {
      logger.error(`Auto-end job failed: ${error.message}`);
    }
  }

  async runGracePeriodCleanup(): Promise<void> {
    try {
      logger.info('Starting grace period cleanup job');
      const result = await guestMeetingLimitService.cleanupGuestMeetingsAfterGrace({
        limit: 100,
        dryRun: false,
      });
      logger.info(
        `Grace period cleanup completed: scanned=${result.scanned}, deleted=${result.deleted}, errors=${result.errors}`
      );
    } catch (error: any) {
      logger.error(`Grace period cleanup job failed: ${error.message}`);
    }
  }

  async runExpiredSessionCleanup(): Promise<void> {
    try {
      logger.info('Starting expired guest session cleanup job');
      const result = await cleanupService.cleanupExpiredGuestSessions({
        limit: 50,
        dryRun: false,
      });
      logger.info(
        `Expired session cleanup completed: scanned=${result.scanned}, deletedSessions=${result.deletedSessions}, deletedMeetings=${result.deletedMeetings}, errors=${result.errors}`
      );
    } catch (error: any) {
      logger.error(`Expired session cleanup job failed: ${error.message}`);
    }
  }

  async runLongRunningMeetingCleanup(): Promise<void> {
    try {
      logger.info('Starting long-running guest meeting cleanup job');
      const result = await cleanupService.cleanupLongRunningGuestMeetings({
        limit: 50,
        dryRun: false,
      });
      logger.info(
        `Long-running meeting cleanup completed: scanned=${result.scanned}, deletedSessions=${result.deletedSessions}, deletedMeetings=${result.deletedMeetings}, errors=${result.errors}`
      );
    } catch (error: any) {
      logger.error(`Long-running meeting cleanup job failed: ${error.message}`);
    }
  }

  async runAllCleanupJobs(): Promise<void> {
    logger.info('=== Starting all guest cleanup jobs ===');
    await this.runAutoEndExpiredMeetings();
    await this.runGracePeriodCleanup();
    await this.runExpiredSessionCleanup();
    await this.runLongRunningMeetingCleanup();
    logger.info('=== All guest cleanup jobs completed ===');
  }
}

export default new GuestCleanupJob();
