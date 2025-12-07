import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { log } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads/audio');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  log.info('Created uploads directory:', uploadsDir);
}

/**
 * Multer configuration for audio file uploads
 * Stores files on disk with organized folder structure
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create meeting-specific directory
    const meetingId = req.params.meetingId || req.params.id || 'temp';
    const meetingDir = path.join(uploadsDir, `meeting-${meetingId}`);
    
    if (!fs.existsSync(meetingDir)) {
      fs.mkdirSync(meetingDir, { recursive: true });
    }
    
    cb(null, meetingDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    const filename = `${baseName}-${uniqueSuffix}${ext}`;
    cb(null, filename);
  },
});

/**
 * File filter for audio files
 */
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/m4a',
    'audio/x-m4a',
    'audio/webm',
    'audio/ogg',
    'audio/x-m4a',
    'audio/aac',
  ];

  const allowedExtensions = ['.mp3', '.wav', '.m4a', '.webm', '.ogg', '.aac', '.flac'];

  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${allowedMimes.join(', ')}`), false);
  }
};

/**
 * Multer upload configuration
 */
export const uploadAudio = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: fileFilter,
});

/**
 * Multer upload for memory storage (for immediate processing)
 */
export const uploadAudioMemory = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: fileFilter,
});

/**
 * Get relative file path for storage in database
 */
export const getRelativeFilePath = (filePath) => {
  // Return path relative to project root
  const projectRoot = path.join(__dirname, '../..');
  return path.relative(projectRoot, filePath);
};

/**
 * Get absolute file path from relative path
 */
export const getAbsoluteFilePath = (relativePath) => {
  const projectRoot = path.join(__dirname, '../..');
  return path.resolve(projectRoot, relativePath);
};

/**
 * Delete file from filesystem
 */
export const deleteFile = async (filePath) => {
  try {
    const absolutePath = getAbsoluteFilePath(filePath);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      log.info('File deleted:', absolutePath);
      return true;
    }
    return false;
  } catch (error) {
    log.error('Error deleting file:', error);
    return false;
  }
};

/**
 * Delete directory and all its contents
 */
export const deleteDirectory = async (dirPath) => {
  try {
    const absolutePath = getAbsoluteFilePath(dirPath);
    if (fs.existsSync(absolutePath)) {
      fs.rmSync(absolutePath, { recursive: true, force: true });
      log.info('Directory deleted:', absolutePath);
      return true;
    }
    return false;
  } catch (error) {
    log.error('Error deleting directory:', error);
    return false;
  }
};

export default {
  uploadAudio,
  uploadAudioMemory,
  getRelativeFilePath,
  getAbsoluteFilePath,
  deleteFile,
  deleteDirectory,
};

