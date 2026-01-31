import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
// INFRASTRUCTURE-ONLY MODULE
// Business logic and user flows will be layered later
import fs from 'fs/promises';
import { existsSync } from 'fs';

export interface AudioConversionOptions {
    inputPath: string;
    outputPath: string;
    format?: 'mp3' | 'wav';
    bitrate?: string;
    sampleRate?: number;
}

export class AudioConversionService {
    /**
     * Convert audio file to MP3 format using FFmpeg
     */
    static async convertToMp3(options: AudioConversionOptions): Promise<string> {
        const {
            inputPath,
            outputPath,
            bitrate = '128k',
            sampleRate = 44100
        } = options;

        // Ensure input file exists
        if (!existsSync(inputPath)) {
            throw new Error(`Input file not found: ${inputPath}`);
        }

        // Ensure output directory exists
        const outputDir = path.dirname(outputPath);
        await fs.mkdir(outputDir, { recursive: true });

        return new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .toFormat('mp3')
                .audioBitrate(bitrate)
                .audioFrequency(sampleRate)
                .audioChannels(1) // Mono for smaller file size
                .on('end', () => {
                    console.log(`Audio conversion completed: ${outputPath}`);
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    console.error('FFmpeg conversion error:', err);
                    reject(new Error(`Audio conversion failed: ${err.message}`));
                })
                .save(outputPath);
        });
    }

    /**
     * Get audio file metadata using FFmpeg
     */
    static async getAudioMetadata(filePath: string): Promise<{
        duration?: number;
        format?: string;
        bitrate?: number;
        sampleRate?: number;
    }> {
        if (!existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(filePath, (err, metadata) => {
                if (err) {
                    reject(new Error(`Failed to read audio metadata: ${err.message}`));
                    return;
                }

                const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

                resolve({
                    duration: metadata.format.duration,
                    format: metadata.format.format_name,
                    bitrate: metadata.format.bit_rate ? parseInt(String(metadata.format.bit_rate)) : undefined,
                    sampleRate: audioStream?.sample_rate ? parseInt(String(audioStream.sample_rate)) : undefined
                });
            });
        });
    }

    /**
     * Delete temporary audio file
     */
    static async deleteFile(filePath: string): Promise<void> {
        try {
            if (existsSync(filePath)) {
                await fs.unlink(filePath);
                console.log(`Deleted temporary file: ${filePath}`);
            }
        } catch (error) {
            console.error(`Failed to delete file ${filePath}:`, error);
        }
    }
}
