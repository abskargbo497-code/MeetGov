/**
 * AttachmentBuilder Usage Examples
 * 
 * Demonstrates how to use the AttachmentBuilder utility to generate
 * email attachments for meetings and tasks.
 */

import AttachmentBuilder from './attachment-builder';

// ==================== EXAMPLE 1: Meeting Summary ====================

const summaryData = {
    meetingTitle: 'Q1 Board Meeting',
    summary: 'The board discussed Q1 financial results, approved the new marketing budget, and reviewed the product roadmap for 2026.',
    keyPoints: [
        'Revenue increased 15% YoY',
        'Marketing budget approved at $500K for Q2',
        'Product launch scheduled for March 2026',
    ],
    decisions: [
        'Approved hiring 3 new engineers',
        'Postponed office expansion until Q3',
    ],
    aiModel: 'gpt-4o-mini',
    createdAt: new Date('2026-01-24T13:00:00Z'),
};

// Generate markdown version
const summaryMd = AttachmentBuilder.generateSummary(summaryData, 'md', 'a3b612');
console.log('Summary (Markdown):');
console.log('Filename:', summaryMd.filename); // summary-a3b612.md
console.log('MIME Type:', summaryMd.mimeType); // text/markdown
console.log('Content (Base64):', summaryMd.content.substring(0, 50) + '...');

// Generate text version
const summaryTxt = AttachmentBuilder.generateSummary(summaryData, 'txt', 'a3b612');
console.log('\nSummary (Text):');
console.log('Filename:', summaryTxt.filename); // summary-a3b612.txt
console.log('MIME Type:', summaryTxt.mimeType); // text/plain; charset=utf-8

// ==================== EXAMPLE 2: Meeting Minutes ====================

const minutesData = {
    meetingTitle: 'Q1 Board Meeting',
    scheduledStart: new Date('2026-01-24T10:00:00Z'),
    attendeeCount: 8,
    content: `## Opening Remarks
The meeting was called to order at 10:00 AM by Chair John Smith.

## Financial Report
CFO Jane Doe presented Q1 financial results:
- Revenue: $2.5M (+15% YoY)
- Expenses: $1.8M
- Net Profit: $700K

## Marketing Budget Approval
The board voted unanimously to approve the Q2 marketing budget of $500K.

## Product Roadmap Review
CTO Bob Johnson presented the 2026 product roadmap, highlighting the March launch.

## Closing
Meeting adjourned at 11:30 AM.`,
    format: 'MARKDOWN',
    createdBy: 'AI',
    updatedAt: new Date('2026-01-24T13:00:00Z'),
};

const minutesMd = AttachmentBuilder.generateMinutes(minutesData, 'md', 'a3b612');
console.log('\nMinutes (Markdown):');
console.log('Filename:', minutesMd.filename); // minutes-a3b612.md

// ==================== EXAMPLE 3: Action Items ====================

const actionItemsData = {
    meetingTitle: 'Q1 Board Meeting',
    tasks: [
        {
            title: 'Hire 3 new engineers',
            assignee: 'HR Manager',
            assigneeEmail: 'hr@company.com',
            dueDate: new Date('2026-02-15T17:00:00Z'),
            priority: 'HIGH',
            status: 'PENDING',
            description: 'Focus on backend and frontend developers with 3+ years experience.',
        },
        {
            title: 'Finalize Q2 marketing plan',
            assignee: 'Marketing Director',
            assigneeEmail: 'marketing@company.com',
            dueDate: new Date('2026-02-01T17:00:00Z'),
            priority: 'MEDIUM',
            status: 'IN_PROGRESS',
            description: 'Allocate $500K budget across digital and traditional channels.',
        },
        {
            title: 'Prepare product launch materials',
            assignee: 'Product Manager',
            assigneeEmail: 'product@company.com',
            dueDate: new Date('2026-03-01T17:00:00Z'),
            priority: 'HIGH',
            status: 'PENDING',
        },
    ],
};

const actionItemsMd = AttachmentBuilder.generateActionItems(actionItemsData, 'md', 'a3b612');
console.log('\nAction Items (Markdown):');
console.log('Filename:', actionItemsMd.filename); // action-items-a3b612.md

const actionItemsTxt = AttachmentBuilder.generateActionItems(actionItemsData, 'txt', 'a3b612');
console.log('Action Items (Text):');
console.log('Filename:', actionItemsTxt.filename); // action-items-a3b612.txt

// ==================== EXAMPLE 4: Transcript ====================

const transcriptData = {
    meetingTitle: 'Q1 Board Meeting',
    scheduledStart: new Date('2026-01-24T10:00:00Z'),
    content: `[00:00:00] John Smith: Good morning everyone, let's get started.

[00:00:15] Jane Doe: I'll begin with the financial report. Revenue for Q1 was $2.5 million, which represents a 15% increase year-over-year.

[00:02:30] Bob Johnson: That's excellent news. Our product investments are paying off.

[00:03:00] John Smith: Agreed. Let's move on to the marketing budget discussion.

[00:03:15] Marketing Director: We're requesting $500K for Q2 to support the product launch.

[00:05:00] John Smith: All in favor? [Unanimous approval]

[00:05:30] Bob Johnson: I'd like to present the product roadmap for 2026...

[00:15:00] John Smith: Thank you all. Meeting adjourned.`,
    language: 'en',
    source: 'AI',
    createdAt: new Date('2026-01-24T13:00:00Z'),
    expiresAt: new Date('2026-01-31T23:59:59Z'),
};

const transcriptTxt = AttachmentBuilder.generateTranscript(transcriptData, 'txt', 'a3b612');
console.log('\nTranscript (Text):');
console.log('Filename:', transcriptTxt.filename); // transcript-a3b612.txt

// ==================== EXAMPLE 5: Task Details ====================

const taskDetailsData = {
    taskTitle: 'Hire 3 new engineers',
    meetingTitle: 'Q1 Board Meeting',
    description: 'Focus on backend and frontend developers with 3+ years experience. Priority skills: TypeScript, React, Node.js, PostgreSQL.',
    assignee: 'HR Manager',
    assigneeEmail: 'hr@company.com',
    dueDate: new Date('2026-02-15T17:00:00Z'),
    priority: 'HIGH',
    status: 'PENDING',
    createdAt: new Date('2026-01-24T13:00:00Z'),
};

const taskDetailsMd = AttachmentBuilder.generateTaskDetails(taskDetailsData, 'md', 'a3b612');
console.log('\nTask Details (Markdown):');
console.log('Filename:', taskDetailsMd.filename); // task-details-a3b612.md

// ==================== EXAMPLE 6: Using in Email Service ====================

/**
 * Example: Integrating with SendGrid email service
 */
function sendMeetingRecapEmail(meetingId: string) {
    // 1. Fetch meeting data from database
    const meeting = {
        id: meetingId,
        title: 'Q1 Board Meeting',
        // ... other fields
    };

    // 2. Generate short ID
    const shortId = meetingId.substring(0, 6);

    // 3. Generate attachments
    const attachments = [
        AttachmentBuilder.generateSummary(summaryData, 'md', shortId),
        AttachmentBuilder.generateMinutes(minutesData, 'md', shortId),
        AttachmentBuilder.generateActionItems(actionItemsData, 'md', shortId),
        AttachmentBuilder.generateTranscript(transcriptData, 'txt', shortId),
    ];

    // 4. Send via SendGrid
    const emailPayload = {
        to: 'recipient@example.com',
        from: 'noreply@govmeet.com',
        subject: `Meeting Recap: ${meeting.title}`,
        text: 'Your meeting recap is attached.',
        html: '<p>Your meeting recap is attached.</p>',
        attachments: attachments.map(att => ({
            content: att.content, // Already Base64-encoded
            filename: att.filename,
            type: att.mimeType,
            disposition: 'attachment',
        })),
    };

    // sendEmail(emailPayload);
    console.log('\nEmail Payload:');
    console.log('Attachments:', emailPayload.attachments.length);
}

// ==================== EXAMPLE 7: Decoding Attachment (for testing) ====================

/**
 * Helper to decode Base64 content for inspection
 */
function decodeAttachment(attachment: { content: string }): string {
    return Buffer.from(attachment.content, 'base64').toString('utf8');
}

console.log('\n\n=== DECODED SUMMARY (Markdown) ===');
console.log(decodeAttachment(summaryMd));

console.log('\n\n=== DECODED ACTION ITEMS (Text) ===');
console.log(decodeAttachment(actionItemsTxt));

// ==================== EXAMPLE 8: Without Short ID ====================

const summaryNoId = AttachmentBuilder.generateSummary(summaryData, 'md');
console.log('\n\nSummary without short ID:');
console.log('Filename:', summaryNoId.filename); // summary.md

export { };
