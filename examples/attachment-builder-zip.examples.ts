/**
 * ZIP Bundling Examples for AttachmentBuilder
 * 
 * Demonstrates how to use the ZIP bundling functionality with automatic
 * size-based switching and manual bundling.
 */

import AttachmentBuilder from './attachment-builder';
import { bundleAttachments, calculateTotalSize, shouldBundleAsZip } from './attachment-builder-zip';

// ==================== EXAMPLE 1: Automatic ZIP Bundling ====================

async function example1_AutomaticBundling() {
    console.log('=== Example 1: Automatic ZIP Bundling ===\n');

    // Generate attachments
    const shortId = 'a3b612';

    const attachments = [
        AttachmentBuilder.generateSummary({
            meetingTitle: 'Q1 Board Meeting',
            summary: 'Discussed Q1 results...',
            keyPoints: ['Revenue up 15%'],
            decisions: ['Approved budget'],
        }, 'md', shortId),

        AttachmentBuilder.generateMinutes({
            meetingTitle: 'Q1 Board Meeting',
            content: 'Meeting minutes content here...',
            scheduledStart: new Date(),
        }, 'md', shortId),

        AttachmentBuilder.generateActionItems({
            meetingTitle: 'Q1 Board Meeting',
            tasks: [
                {
                    title: 'Hire engineers',
                    assignee: 'HR',
                    priority: 'HIGH',
                    status: 'PENDING',
                },
            ],
        }, 'md', shortId),

        AttachmentBuilder.generateTranscript({
            meetingTitle: 'Q1 Board Meeting',
            content: 'Transcript content here...',
        }, 'txt', shortId),
    ];

    // Bundle with automatic size detection
    const result = await bundleAttachments(attachments, {
        maxTotalSizeMB: 6, // Default threshold
        zipFilename: `meeting-recap-${shortId}`,
    });

    console.log('Bundle Result:');
    console.log('- Is Zipped:', result.isZipped);
    console.log('- Total Size:', result.totalSizeMB.toFixed(2), 'MB');
    console.log('- Reason:', result.bundleReason);

    if (result.isZipped) {
        console.log('\nZIP Attachment:');
        console.log('- Filename:', result.attachment?.filename);
        console.log('- MIME Type:', result.attachment?.mimeType);
        console.log('- Size (Base64):', result.attachment?.content.length, 'chars');
    } else {
        console.log('\nIndividual Attachments:', result.attachments?.length);
    }
}

// ==================== EXAMPLE 2: Force ZIP Bundling ====================

async function example2_ForceZipBundling() {
    console.log('\n\n=== Example 2: Force ZIP Bundling ===\n');

    const attachments = [
        AttachmentBuilder.generateSummary({
            meetingTitle: 'Small Meeting',
            summary: 'Quick summary',
        }, 'md'),
    ];

    // Force ZIP even though size is small
    const result = await bundleAttachments(attachments, {
        forceZip: true,
        zipFilename: 'small-meeting-recap',
    });

    console.log('Bundle Result:');
    console.log('- Is Zipped:', result.isZipped);
    console.log('- Total Size:', result.totalSizeMB.toFixed(2), 'MB');
    console.log('- Reason:', result.bundleReason);
    console.log('- ZIP Filename:', result.attachment?.filename);
}

// ==================== EXAMPLE 3: Size Calculation ====================

function example3_SizeCalculation() {
    console.log('\n\n=== Example 3: Size Calculation ===\n');

    const attachments = [
        AttachmentBuilder.generateSummary({
            meetingTitle: 'Test Meeting',
            summary: 'Test summary',
        }, 'md'),

        AttachmentBuilder.generateMinutes({
            meetingTitle: 'Test Meeting',
            content: 'Test minutes',
        }, 'md'),
    ];

    const { bytes, mb } = calculateTotalSize(attachments);

    console.log('Total Size:');
    console.log('- Bytes:', bytes);
    console.log('- MB:', mb.toFixed(4));
    console.log('- Should bundle (6MB threshold):', shouldBundleAsZip(attachments, 6));
    console.log('- Should bundle (0.001MB threshold):', shouldBundleAsZip(attachments, 0.001));
}

// ==================== EXAMPLE 4: Integration with SendGrid ====================

async function example4_SendGridIntegration() {
    console.log('\n\n=== Example 4: SendGrid Integration ===\n');

    const shortId = 'a3b612';

    // Generate attachments
    const attachments = [
        AttachmentBuilder.generateSummary({
            meetingTitle: 'Board Meeting',
            summary: 'Summary content',
        }, 'md', shortId),

        AttachmentBuilder.generateMinutes({
            meetingTitle: 'Board Meeting',
            content: 'Minutes content',
        }, 'md', shortId),
    ];

    // Bundle attachments
    const result = await bundleAttachments(attachments, {
        maxTotalSizeMB: 6,
        zipFilename: `meeting-recap-${shortId}`,
    });

    // Prepare SendGrid payload
    let sendGridAttachments;

    if (result.isZipped) {
        // Single ZIP attachment
        sendGridAttachments = [{
            content: result.attachment!.content,
            filename: result.attachment!.filename,
            type: result.attachment!.mimeType,
            disposition: 'attachment',
        }];
    } else {
        // Multiple individual attachments
        sendGridAttachments = result.attachments!.map(att => ({
            content: att.content,
            filename: att.filename,
            type: att.mimeType,
            disposition: 'attachment',
        }));
    }

    console.log('SendGrid Payload:');
    console.log('- Attachment Count:', sendGridAttachments.length);
    console.log('- Attachments:', sendGridAttachments.map(a => a.filename));

    // Example email payload
    const emailPayload = {
        to: 'recipient@example.com',
        from: 'noreply@govmeet.com',
        subject: 'Meeting Recap',
        text: result.isZipped
            ? 'Your meeting recap is attached as a ZIP file.'
            : 'Your meeting recap files are attached.',
        html: result.isZipped
            ? '<p>Your meeting recap is attached as a ZIP file.</p>'
            : '<p>Your meeting recap files are attached.</p>',
        attachments: sendGridAttachments,
    };

    console.log('\nEmail Subject:', emailPayload.subject);
    console.log('Email Text:', emailPayload.text);
}

// ==================== EXAMPLE 5: Large Meeting with Transcript ====================

async function example5_LargeMeetingWithTranscript() {
    console.log('\n\n=== Example 5: Large Meeting (Triggers ZIP) ===\n');

    const shortId = 'b4c723';

    // Create a large transcript (simulating 2MB content)
    const largeTranscript = 'Transcript line...\n'.repeat(50000); // ~2MB

    const attachments = [
        AttachmentBuilder.generateSummary({
            meetingTitle: 'Long Board Meeting',
            summary: 'Extensive discussion...',
            keyPoints: Array(50).fill('Important point'),
        }, 'md', shortId),

        AttachmentBuilder.generateMinutes({
            meetingTitle: 'Long Board Meeting',
            content: 'Detailed minutes...\n'.repeat(1000),
        }, 'md', shortId),

        AttachmentBuilder.generateActionItems({
            meetingTitle: 'Long Board Meeting',
            tasks: Array(20).fill({
                title: 'Task',
                description: 'Description',
                assignee: 'Someone',
                priority: 'MEDIUM',
                status: 'PENDING',
            }),
        }, 'md', shortId),

        AttachmentBuilder.generateTranscript({
            meetingTitle: 'Long Board Meeting',
            content: largeTranscript,
        }, 'txt', shortId),
    ];

    const result = await bundleAttachments(attachments, {
        maxTotalSizeMB: 6,
        zipFilename: `meeting-recap-${shortId}`,
    });

    console.log('Bundle Result:');
    console.log('- Is Zipped:', result.isZipped);
    console.log('- Total Size:', result.totalSizeMB.toFixed(2), 'MB');
    console.log('- Reason:', result.bundleReason);

    if (result.isZipped) {
        const zipSizeBytes = Buffer.from(result.attachment!.content, 'base64').length;
        const zipSizeMB = zipSizeBytes / (1024 * 1024);
        const compressionRatio = ((result.totalSizeBytes - zipSizeBytes) / result.totalSizeBytes * 100).toFixed(1);

        console.log('\nZIP Compression:');
        console.log('- Original Size:', result.totalSizeMB.toFixed(2), 'MB');
        console.log('- Compressed Size:', zipSizeMB.toFixed(2), 'MB');
        console.log('- Compression Ratio:', compressionRatio, '%');
    }
}

// ==================== EXAMPLE 6: Conditional Bundling Logic ====================

async function example6_ConditionalBundling() {
    console.log('\n\n=== Example 6: Conditional Bundling Logic ===\n');

    const shortId = 'c5d834';

    const attachments = [
        AttachmentBuilder.generateSummary({
            meetingTitle: 'Test Meeting',
            summary: 'Summary',
        }, 'md', shortId),
    ];

    // Check before bundling
    const shouldBundle = shouldBundleAsZip(attachments, 6);
    console.log('Should bundle:', shouldBundle);

    if (shouldBundle) {
        console.log('→ Bundling into ZIP...');
        const result = await bundleAttachments(attachments, {
            zipFilename: `meeting-recap-${shortId}`,
        });
        console.log('→ Result: ZIP created');
    } else {
        console.log('→ Sending individual attachments');
        console.log('→ Attachment count:', attachments.length);
    }
}

// ==================== RUN ALL EXAMPLES ====================

async function runAllExamples() {
    await example1_AutomaticBundling();
    await example2_ForceZipBundling();
    example3_SizeCalculation();
    await example4_SendGridIntegration();
    await example5_LargeMeetingWithTranscript();
    await example6_ConditionalBundling();
}

// Uncomment to run:
// runAllExamples().catch(console.error);

export {
    example1_AutomaticBundling,
    example2_ForceZipBundling,
    example3_SizeCalculation,
    example4_SendGridIntegration,
    example5_LargeMeetingWithTranscript,
    example6_ConditionalBundling,
};
