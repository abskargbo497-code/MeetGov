/**
 * ZIP Bundling Extension for AttachmentBuilder
 * 
 * Provides ZIP bundling functionality with automatic size-based switching.
 * All operations are in-memory (no filesystem writes).
 * 
 * Usage:
 * import { bundleAttachments } from './attachment-builder-zip';
 */

import JSZip from 'jszip';
import type { AttachmentOutput } from './attachment-builder';

/**
 * Configuration for ZIP bundling
 */
export interface ZipBundleOptions {
    /**
     * Maximum total size in MB before switching to ZIP
     * Default: 6 MB
     */
    maxTotalSizeMB?: number;

    /**
     * Force ZIP bundling regardless of size
     * Default: false
     */
    forceZip?: boolean;

    /**
     * ZIP filename (without extension)
     * Default: 'meeting-recap-{shortId}'
     */
    zipFilename?: string;
}

/**
 * Result of bundling operation
 */
export interface BundleResult {
    /**
     * Whether files were bundled into ZIP
     */
    isZipped: boolean;

    /**
     * Single attachment (ZIP if bundled)
     */
    attachment?: AttachmentOutput;

    /**
     * Multiple attachments (if not bundled)
     */
    attachments?: AttachmentOutput[];

    /**
     * Total size in bytes (before Base64 encoding)
     */
    totalSizeBytes: number;

    /**
     * Total size in MB (before Base64 encoding)
     */
    totalSizeMB: number;

    /**
     * Reason for bundling decision
     */
    bundleReason?: string;
}

/**
 * Default max size threshold for ZIP bundling (6 MB)
 */
const DEFAULT_MAX_SIZE_MB = 6;

/**
 * Bundle multiple attachments into a ZIP file if needed
 * 
 * Automatically switches to ZIP when total size exceeds threshold
 * 
 * @param attachments - Array of attachments to bundle
 * @param options - ZIP bundling options
 * @returns Bundle result with decision metadata
 */
export async function bundleAttachments(
    attachments: AttachmentOutput[],
    options: ZipBundleOptions = {}
): Promise<BundleResult> {
    const maxSizeMB = options.maxTotalSizeMB ?? DEFAULT_MAX_SIZE_MB;
    const forceZip = options.forceZip ?? false;

    // Calculate total size (decode Base64 to get actual size)
    const totalSizeBytes = attachments.reduce((sum, att) => {
        const decoded = Buffer.from(att.content, 'base64');
        return sum + decoded.length;
    }, 0);

    const totalSizeMB = totalSizeBytes / (1024 * 1024);

    // Decide whether to bundle
    const shouldBundle = forceZip || totalSizeMB > maxSizeMB;

    if (!shouldBundle) {
        return {
            isZipped: false,
            attachments,
            totalSizeBytes,
            totalSizeMB,
            bundleReason: `Total size (${totalSizeMB.toFixed(2)} MB) is below threshold (${maxSizeMB} MB)`,
        };
    }

    // Create ZIP bundle
    const zipAttachment = await createZipBundle(attachments, options.zipFilename);

    const bundleReason = forceZip
        ? 'ZIP bundling forced by options'
        : `Total size (${totalSizeMB.toFixed(2)} MB) exceeds threshold (${maxSizeMB} MB)`;

    return {
        isZipped: true,
        attachment: zipAttachment,
        totalSizeBytes,
        totalSizeMB,
        bundleReason,
    };
}

/**
 * Create a ZIP bundle from multiple attachments
 * 
 * @param attachments - Attachments to bundle
 * @param zipFilename - Optional custom ZIP filename (without extension)
 * @returns ZIP attachment
 */
async function createZipBundle(
    attachments: AttachmentOutput[],
    zipFilename?: string
): Promise<AttachmentOutput> {
    const zip = new JSZip();

    // Add each attachment to ZIP (decode Base64 first)
    for (const attachment of attachments) {
        const decoded = Buffer.from(attachment.content, 'base64');
        zip.file(attachment.filename, decoded);
    }

    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: {
            level: 6, // Balanced compression (0-9, where 9 is max)
        },
    });

    // Create attachment
    const filename = zipFilename ? `${zipFilename}.zip` : 'meeting-recap.zip';
    const base64Content = zipBuffer.toString('base64');

    return {
        filename,
        mimeType: 'application/zip',
        content: base64Content,
    };
}

/**
 * Calculate total size of attachments (in bytes, before Base64 encoding)
 */
export function calculateTotalSize(attachments: AttachmentOutput[]): { bytes: number; mb: number } {
    const bytes = attachments.reduce((sum, att) => {
        const decoded = Buffer.from(att.content, 'base64');
        return sum + decoded.length;
    }, 0);

    return {
        bytes,
        mb: bytes / (1024 * 1024),
    };
}

/**
 * Check if attachments should be bundled into ZIP
 */
export function shouldBundleAsZip(attachments: AttachmentOutput[], maxSizeMB: number = DEFAULT_MAX_SIZE_MB): boolean {
    const { mb } = calculateTotalSize(attachments);
    return mb > maxSizeMB;
}
