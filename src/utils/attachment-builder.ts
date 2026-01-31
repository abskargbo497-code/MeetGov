/**
 * AttachmentBuilder - Utility for generating email attachments
 * 
 * Generates meeting-related files (summary, minutes, action items, transcript, task details)
 * in both .txt and .md formats with Base64 encoding for SendGrid compatibility.
 * 
 * All operations are in-memory (no filesystem writes).
 */

export interface AttachmentOutput {
    filename: string;
    mimeType: string;
    content: string; // Base64-encoded
}

export interface MeetingSummaryData {
    meetingTitle: string;
    summary: string;
    keyPoints?: string[];
    decisions?: string[];
    aiModel?: string;
    createdAt?: Date;
}

export interface MeetingMinutesData {
    meetingTitle: string;
    scheduledStart?: Date;
    attendeeCount?: number;
    content: string;
    format?: string;
    createdBy?: string;
    updatedAt?: Date;
}

export interface ActionItem {
    title: string;
    assignee?: string;
    assigneeEmail?: string;
    dueDate?: Date;
    priority?: string;
    status?: string;
    description?: string;
}

export interface ActionItemsData {
    meetingTitle: string;
    tasks: ActionItem[];
}

export interface TranscriptData {
    meetingTitle: string;
    scheduledStart?: Date;
    content: string;
    language?: string;
    source?: string;
    createdAt?: Date;
    expiresAt?: Date;
}

export interface TaskDetailsData {
    taskTitle: string;
    meetingTitle: string;
    description?: string;
    assignee?: string;
    assigneeEmail?: string;
    dueDate?: Date;
    priority?: string;
    status?: string;
    createdAt?: Date;
}

export type FileFormat = 'txt' | 'md';

class AttachmentBuilder {
    /**
     * Generate meeting summary file
     */
    generateSummary(data: MeetingSummaryData, format: FileFormat = 'md', shortId?: string): AttachmentOutput {
        const filename = this.buildFilename('summary', shortId, format);
        const content = format === 'md'
            ? this.buildSummaryMarkdown(data)
            : this.buildSummaryText(data);

        return this.createAttachment(filename, content, format);
    }

    /**
     * Generate meeting minutes file
     */
    generateMinutes(data: MeetingMinutesData, format: FileFormat = 'md', shortId?: string): AttachmentOutput {
        const filename = this.buildFilename('minutes', shortId, format);
        const content = format === 'md'
            ? this.buildMinutesMarkdown(data)
            : this.buildMinutesText(data);

        return this.createAttachment(filename, content, format);
    }

    /**
     * Generate action items file
     */
    generateActionItems(data: ActionItemsData, format: FileFormat = 'md', shortId?: string): AttachmentOutput {
        const filename = this.buildFilename('action-items', shortId, format);
        const content = format === 'md'
            ? this.buildActionItemsMarkdown(data)
            : this.buildActionItemsText(data);

        return this.createAttachment(filename, content, format);
    }

    /**
     * Generate transcript file
     */
    generateTranscript(data: TranscriptData, format: FileFormat = 'txt', shortId?: string): AttachmentOutput {
        const filename = this.buildFilename('transcript', shortId, format);
        const content = format === 'md'
            ? this.buildTranscriptMarkdown(data)
            : this.buildTranscriptText(data);

        return this.createAttachment(filename, content, format);
    }

    /**
     * Generate task details file
     */
    generateTaskDetails(data: TaskDetailsData, format: FileFormat = 'md', shortId?: string): AttachmentOutput {
        const filename = this.buildFilename('task-details', shortId, format);
        const content = format === 'md'
            ? this.buildTaskDetailsMarkdown(data)
            : this.buildTaskDetailsText(data);

        return this.createAttachment(filename, content, format);
    }

    // ==================== PRIVATE HELPERS ====================

    /**
     * Build filename with optional short ID
     */
    private buildFilename(type: string, shortId: string | undefined, format: FileFormat): string {
        if (shortId) {
            return `${type}-${shortId}.${format}`;
        }
        return `${type}.${format}`;
    }

    /**
     * Create attachment object with Base64 encoding
     */
    private createAttachment(filename: string, content: string, format: FileFormat): AttachmentOutput {
        const mimeType = format === 'md' ? 'text/markdown' : 'text/plain; charset=utf-8';
        const base64Content = Buffer.from(content, 'utf8').toString('base64');

        return {
            filename,
            mimeType,
            content: base64Content,
        };
    }

    /**
     * Format date for display
     */
    private formatDate(date: Date | undefined): string {
        if (!date) return 'N/A';
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    /**
     * Format date (short version)
     */
    private formatDateShort(date: Date | undefined): string {
        if (!date) return 'N/A';
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    }

    // ==================== SUMMARY BUILDERS ====================

    private buildSummaryMarkdown(data: MeetingSummaryData): string {
        const lines: string[] = [];

        lines.push(`# Meeting Summary: ${data.meetingTitle}`);
        lines.push('');
        lines.push(data.summary);
        lines.push('');

        if (data.keyPoints && data.keyPoints.length > 0) {
            lines.push('## Key Points');
            lines.push('');
            data.keyPoints.forEach(point => {
                lines.push(`- ${point}`);
            });
            lines.push('');
        }

        if (data.decisions && data.decisions.length > 0) {
            lines.push('## Decisions Made');
            lines.push('');
            data.decisions.forEach(decision => {
                lines.push(`- ${decision}`);
            });
            lines.push('');
        }

        lines.push('---');
        if (data.aiModel) {
            lines.push(`*AI Model: ${data.aiModel}*`);
        }
        if (data.createdAt) {
            lines.push(`*Generated: ${this.formatDate(data.createdAt)}*`);
        }

        return lines.join('\n');
    }

    private buildSummaryText(data: MeetingSummaryData): string {
        const lines: string[] = [];

        lines.push(`MEETING SUMMARY: ${data.meetingTitle.toUpperCase()}`);
        lines.push('='.repeat(60));
        lines.push('');
        lines.push(data.summary);
        lines.push('');

        if (data.keyPoints && data.keyPoints.length > 0) {
            lines.push('KEY POINTS:');
            lines.push('-'.repeat(60));
            data.keyPoints.forEach((point, idx) => {
                lines.push(`${idx + 1}. ${point}`);
            });
            lines.push('');
        }

        if (data.decisions && data.decisions.length > 0) {
            lines.push('DECISIONS MADE:');
            lines.push('-'.repeat(60));
            data.decisions.forEach((decision, idx) => {
                lines.push(`${idx + 1}. ${decision}`);
            });
            lines.push('');
        }

        lines.push('-'.repeat(60));
        if (data.aiModel) {
            lines.push(`AI Model: ${data.aiModel}`);
        }
        if (data.createdAt) {
            lines.push(`Generated: ${this.formatDate(data.createdAt)}`);
        }

        return lines.join('\n');
    }

    // ==================== MINUTES BUILDERS ====================

    private buildMinutesMarkdown(data: MeetingMinutesData): string {
        const lines: string[] = [];

        lines.push(`# Meeting Minutes: ${data.meetingTitle}`);
        lines.push('');

        if (data.scheduledStart) {
            lines.push(`**Date**: ${this.formatDate(data.scheduledStart)}`);
        }
        if (data.attendeeCount !== undefined) {
            lines.push(`**Attendees**: ${data.attendeeCount} participants`);
        }
        lines.push('');
        lines.push('---');
        lines.push('');

        lines.push(data.content);
        lines.push('');

        lines.push('---');
        if (data.format) {
            lines.push(`*Format: ${data.format}*`);
        }
        if (data.createdBy) {
            lines.push(`*Created by: ${data.createdBy}*`);
        }
        if (data.updatedAt) {
            lines.push(`*Last updated: ${this.formatDate(data.updatedAt)}*`);
        }

        return lines.join('\n');
    }

    private buildMinutesText(data: MeetingMinutesData): string {
        const lines: string[] = [];

        lines.push(`MEETING MINUTES: ${data.meetingTitle.toUpperCase()}`);
        lines.push('='.repeat(60));
        lines.push('');

        if (data.scheduledStart) {
            lines.push(`Date: ${this.formatDate(data.scheduledStart)}`);
        }
        if (data.attendeeCount !== undefined) {
            lines.push(`Attendees: ${data.attendeeCount} participants`);
        }
        lines.push('');
        lines.push('-'.repeat(60));
        lines.push('');

        lines.push(data.content);
        lines.push('');

        lines.push('-'.repeat(60));
        if (data.format) {
            lines.push(`Format: ${data.format}`);
        }
        if (data.createdBy) {
            lines.push(`Created by: ${data.createdBy}`);
        }
        if (data.updatedAt) {
            lines.push(`Last updated: ${this.formatDate(data.updatedAt)}`);
        }

        return lines.join('\n');
    }

    // ==================== ACTION ITEMS BUILDERS ====================

    private buildActionItemsMarkdown(data: ActionItemsData): string {
        const lines: string[] = [];

        lines.push(`# Action Items: ${data.meetingTitle}`);
        lines.push('');

        if (data.tasks.length === 0) {
            lines.push('*No action items.*');
            return lines.join('\n');
        }

        // Count by status
        const pending = data.tasks.filter(t => t.status === 'PENDING').length;
        const inProgress = data.tasks.filter(t => t.status === 'IN_PROGRESS').length;
        const completed = data.tasks.filter(t => t.status === 'COMPLETED' || t.status === 'SUBMITTED').length;

        lines.push(`**Total Tasks**: ${data.tasks.length} | Pending: ${pending} | In Progress: ${inProgress} | Completed: ${completed}`);
        lines.push('');
        lines.push('---');
        lines.push('');

        data.tasks.forEach((task, idx) => {
            lines.push(`## ${idx + 1}. ${task.title}`);
            lines.push('');

            if (task.assignee) {
                const email = task.assigneeEmail ? ` (${task.assigneeEmail})` : '';
                lines.push(`- **Assignee**: ${task.assignee}${email}`);
            }
            if (task.dueDate) {
                lines.push(`- **Due Date**: ${this.formatDate(task.dueDate)}`);
            }
            if (task.priority) {
                lines.push(`- **Priority**: ${task.priority}`);
            }
            if (task.status) {
                lines.push(`- **Status**: ${task.status}`);
            }

            if (task.description) {
                lines.push('');
                lines.push(task.description);
            }

            lines.push('');
            lines.push('---');
            lines.push('');
        });

        return lines.join('\n');
    }

    private buildActionItemsText(data: ActionItemsData): string {
        const lines: string[] = [];

        lines.push(`ACTION ITEMS: ${data.meetingTitle.toUpperCase()}`);
        lines.push('='.repeat(60));
        lines.push('');

        if (data.tasks.length === 0) {
            lines.push('No action items.');
            return lines.join('\n');
        }

        // Count by status
        const pending = data.tasks.filter(t => t.status === 'PENDING').length;
        const inProgress = data.tasks.filter(t => t.status === 'IN_PROGRESS').length;
        const completed = data.tasks.filter(t => t.status === 'COMPLETED' || t.status === 'SUBMITTED').length;

        lines.push(`Total Tasks: ${data.tasks.length}`);
        lines.push(`Pending: ${pending} | In Progress: ${inProgress} | Completed: ${completed}`);
        lines.push('');

        data.tasks.forEach((task, idx) => {
            lines.push('-'.repeat(60));
            lines.push(`${idx + 1}. ${task.title.toUpperCase()}`);
            lines.push('-'.repeat(60));

            if (task.assignee) {
                const email = task.assigneeEmail ? ` (${task.assigneeEmail})` : '';
                lines.push(`Assignee: ${task.assignee}${email}`);
            }
            if (task.dueDate) {
                lines.push(`Due Date: ${this.formatDate(task.dueDate)}`);
            }
            if (task.priority) {
                lines.push(`Priority: ${task.priority}`);
            }
            if (task.status) {
                lines.push(`Status: ${task.status}`);
            }

            if (task.description) {
                lines.push('');
                lines.push('Description:');
                lines.push(task.description);
            }

            lines.push('');
        });

        return lines.join('\n');
    }

    // ==================== TRANSCRIPT BUILDERS ====================

    private buildTranscriptMarkdown(data: TranscriptData): string {
        const lines: string[] = [];

        lines.push(`# Meeting Transcript: ${data.meetingTitle}`);
        lines.push('');

        if (data.scheduledStart) {
            lines.push(`**Date**: ${this.formatDate(data.scheduledStart)}`);
        }
        if (data.language) {
            lines.push(`**Language**: ${data.language}`);
        }
        if (data.source) {
            lines.push(`**Source**: ${data.source}`);
        }
        lines.push('');
        lines.push('---');
        lines.push('');

        lines.push(data.content);
        lines.push('');

        lines.push('---');
        if (data.createdAt) {
            lines.push(`*Generated: ${this.formatDate(data.createdAt)}*`);
        }
        if (data.expiresAt) {
            lines.push(`*Expires: ${this.formatDate(data.expiresAt)}*`);
        }

        return lines.join('\n');
    }

    private buildTranscriptText(data: TranscriptData): string {
        const lines: string[] = [];

        lines.push(`MEETING TRANSCRIPT: ${data.meetingTitle.toUpperCase()}`);
        lines.push('='.repeat(60));

        if (data.scheduledStart) {
            lines.push(`Date: ${this.formatDate(data.scheduledStart)}`);
        }
        if (data.language) {
            lines.push(`Language: ${data.language}`);
        }
        if (data.source) {
            lines.push(`Source: ${data.source}`);
        }
        lines.push('');
        lines.push('-'.repeat(60));
        lines.push('');

        lines.push(data.content);
        lines.push('');

        lines.push('-'.repeat(60));
        if (data.createdAt) {
            lines.push(`Generated: ${this.formatDate(data.createdAt)}`);
        }
        if (data.expiresAt) {
            lines.push(`Expires: ${this.formatDate(data.expiresAt)}`);
        }

        return lines.join('\n');
    }

    // ==================== TASK DETAILS BUILDERS ====================

    private buildTaskDetailsMarkdown(data: TaskDetailsData): string {
        const lines: string[] = [];

        lines.push(`# Task Details: ${data.taskTitle}`);
        lines.push('');
        lines.push(`**Meeting**: ${data.meetingTitle}`);
        lines.push('');

        if (data.assignee) {
            const email = data.assigneeEmail ? ` (${data.assigneeEmail})` : '';
            lines.push(`**Assignee**: ${data.assignee}${email}`);
        }
        if (data.dueDate) {
            lines.push(`**Due Date**: ${this.formatDate(data.dueDate)}`);
        }
        if (data.priority) {
            lines.push(`**Priority**: ${data.priority}`);
        }
        if (data.status) {
            lines.push(`**Status**: ${data.status}`);
        }
        lines.push('');

        if (data.description) {
            lines.push('## Description');
            lines.push('');
            lines.push(data.description);
            lines.push('');
        }

        lines.push('---');
        if (data.createdAt) {
            lines.push(`*Created: ${this.formatDate(data.createdAt)}*`);
        }

        return lines.join('\n');
    }

    private buildTaskDetailsText(data: TaskDetailsData): string {
        const lines: string[] = [];

        lines.push(`TASK DETAILS: ${data.taskTitle.toUpperCase()}`);
        lines.push('='.repeat(60));
        lines.push('');
        lines.push(`Meeting: ${data.meetingTitle}`);
        lines.push('');

        if (data.assignee) {
            const email = data.assigneeEmail ? ` (${data.assigneeEmail})` : '';
            lines.push(`Assignee: ${data.assignee}${email}`);
        }
        if (data.dueDate) {
            lines.push(`Due Date: ${this.formatDate(data.dueDate)}`);
        }
        if (data.priority) {
            lines.push(`Priority: ${data.priority}`);
        }
        if (data.status) {
            lines.push(`Status: ${data.status}`);
        }
        lines.push('');

        if (data.description) {
            lines.push('DESCRIPTION:');
            lines.push('-'.repeat(60));
            lines.push(data.description);
            lines.push('');
        }

        lines.push('-'.repeat(60));
        if (data.createdAt) {
            lines.push(`Created: ${this.formatDate(data.createdAt)}`);
        }

        return lines.join('\n');
    }
}

export default new AttachmentBuilder();
