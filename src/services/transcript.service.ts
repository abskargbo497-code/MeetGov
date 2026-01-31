/**
 * Transcript Service
 * 
 * Handles transcript retrieval and formatting
 */

import Logger from '../logger';
import { prisma } from '../lib/prisma';

export type TranscriptSegmentResponse = {
  id: string;
  speakerLabel: string;
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  confidence?: number | null;
};

export type TranscriptResponse = {
  segments: TranscriptSegmentResponse[];
  fullText?: string;
  language?: string;
};

/**
 * Get transcript segments for a meeting
 * Returns segments ordered by start time
 */
export async function getTranscriptByMeetingId(meetingId: string): Promise<TranscriptResponse | null> {
  try {
    // Check if meeting exists
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, processingStatus: true }
    });

    if (!meeting) {
      return null;
    }

    // Get transcript segments ordered by start time
    const segments = await prisma.transcriptSegment.findMany({
      where: { meetingId },
      orderBy: { startTime: 'asc' }
    });

    // Get the full transcript if available
    const transcript = await prisma.transcript.findFirst({
      where: { meetingId },
      orderBy: { createdAt: 'desc' }
    });

    // Convert segments to response format (seconds to ms)
    const segmentResponses: TranscriptSegmentResponse[] = segments.map(seg => ({
      id: seg.id,
      speakerLabel: seg.speakerLabel,
      text: seg.text,
      startTimeMs: Math.round(seg.startTime * 1000),
      endTimeMs: Math.round(seg.endTime * 1000),
      confidence: seg.confidence
    }));

    return {
      segments: segmentResponses,
      fullText: transcript?.content,
      language: transcript?.language || 'en'
    };
  } catch (error) {
    Logger.error(`Error fetching transcript for meeting ${meetingId}:`, error);
    throw error;
  }
}

/**
 * Format transcript segments as plain text for download
 */
export function formatTranscriptAsText(segments: TranscriptSegmentResponse[]): string {
  return segments.map(seg => {
    const timestamp = formatTimestamp(seg.startTimeMs);
    return `[${timestamp}] ${seg.speakerLabel}: ${seg.text}`;
  }).join('\n\n');
}

/**
 * Format transcript segments as markdown
 */
export function formatTranscriptAsMarkdown(segments: TranscriptSegmentResponse[]): string {
  let markdown = '# Meeting Transcript\n\n';
  
  let currentSpeaker = '';
  
  for (const seg of segments) {
    const timestamp = formatTimestamp(seg.startTimeMs);
    
    if (seg.speakerLabel !== currentSpeaker) {
      currentSpeaker = seg.speakerLabel;
      markdown += `\n## ${seg.speakerLabel}\n\n`;
    }
    
    markdown += `**[${timestamp}]** ${seg.text}\n\n`;
  }
  
  return markdown;
}

/**
 * Format milliseconds to HH:MM:SS
 */
function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Get full transcript text for AI processing
 */
export async function getFullTranscriptText(meetingId: string): Promise<string | null> {
  try {
    // First try to get the stored full transcript
    const transcript = await prisma.transcript.findFirst({
      where: { meetingId },
      orderBy: { createdAt: 'desc' }
    });

    if (transcript?.content) {
      return transcript.content;
    }

    // Fall back to concatenating segments
    const segments = await prisma.transcriptSegment.findMany({
      where: { meetingId },
      orderBy: { startTime: 'asc' }
    });

    if (segments.length === 0) {
      return null;
    }

    // Format as text for AI consumption
    return segments.map(seg => `${seg.speakerLabel}: ${seg.text}`).join('\n');
  } catch (error) {
    Logger.error(`Error getting full transcript for meeting ${meetingId}:`, error);
    throw error;
  }
}
