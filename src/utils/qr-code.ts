import QRCode from 'qrcode';
import Logger from '../logger/index';

/**
 * Generate QR code as base64-encoded data URI
 */
export async function generateQRCode(data: string): Promise<string> {
    try {
        const qrCodeDataURI = await QRCode.toDataURL(data, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            width: 300,
            margin: 1,
        });

        Logger.debug(`QR code generated for: ${data.substring(0, 50)}...`);
        return qrCodeDataURI;
    } catch (error: any) {
        Logger.error(`QR code generation failed: ${error.message}`);
        throw error;
    }
}

/**
 * Generate QR code for meeting attendance
 */
export async function generateMeetingQRCode(meetingLink: string): Promise<string> {
    return generateQRCode(meetingLink);
}
