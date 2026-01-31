import crypto from 'crypto';

type MeetingLike = {
    actualEnd?: Date | null;
    scheduledEnd?: Date | null;
    scheduledStart?: Date | null;
    createdAt?: Date | null;
};

export function generateGuestAccessCode(): string {
    return crypto.randomBytes(6).toString('hex').toUpperCase();
}

export const generateTrackingCode = generateGuestAccessCode;

export function computeEndsAtDate(meeting: MeetingLike, now: Date = new Date()): Date {
    return meeting.actualEnd || meeting.scheduledEnd || meeting.scheduledStart || meeting.createdAt || now;
}

export function computeDownloadAvailableUntilDate(endsAt: Date): Date {
    return new Date(endsAt.getTime() + 10 * 60 * 1000);
}
