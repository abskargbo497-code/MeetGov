import QRCode from 'qrcode';
import { generateToken } from '../utils/helpers.js';
import { log } from '../utils/logger.js';

/**
 * Generate QR code for a meeting
 */
export const generateQRCode = async (meetingId, qrToken) => {
  try {
    const qrData = {
      meetingId: meetingId.toString(),
      token: qrToken,
      timestamp: Date.now(),
    };

    const qrDataString = JSON.stringify(qrData);
    
    // Generate QR code as data URL
    const qrCodeUrl = await QRCode.toDataURL(qrDataString, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });

    log.info('QR code generated successfully', { meetingId });
    return qrCodeUrl;
  } catch (error) {
    log.error('Error generating QR code', error);
    throw new Error('Failed to generate QR code');
  }
};

/**
 * Generate unique QR token for meeting
 */
export const generateQRToken = () => {
  return generateToken(32);
};

/**
 * Verify QR code token
 */
export const verifyQRToken = (token, meetingToken) => {
  return token === meetingToken;
};
