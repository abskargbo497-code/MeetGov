/**
 * Script to add the missing 'audio_file_path' column to the meetings table
 */

import dotenv from 'dotenv';
dotenv.config();

import { sequelize } from '../database/connection.js';
import { log } from '../utils/logger.js';

const addAudioFilePathColumn = async () => {
  try {
    // Connect to database
    await sequelize.authenticate();
    log.info('✓ Database connection established');

    // Check if column already exists
    const [results] = await sequelize.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'meetings' 
      AND COLUMN_NAME = 'audio_file_path'
    `);

    if (results.length > 0) {
      log.info('✓ Column "audio_file_path" already exists in meetings table');
      return;
    }

    // Add the audio_file_path column
    log.info('Adding "audio_file_path" column to meetings table...');
    await sequelize.query(`
      ALTER TABLE meetings 
      ADD COLUMN audio_file_path VARCHAR(500) DEFAULT NULL 
      COMMENT 'Path to uploaded audio file'
    `);

    log.info('✓ Successfully added "audio_file_path" column to meetings table');
    
  } catch (error) {
    log.error('❌ Error adding audio_file_path column:', error.message);
    
    // If column already exists, that's okay
    if (error.message.includes('Duplicate column name') || 
        error.message.includes('already exists')) {
      log.info('✓ Column already exists (this is fine)');
      return;
    }
    
    throw error;
  } finally {
    await sequelize.close();
    log.info('Database connection closed');
  }
};

// Run the script
addAudioFilePathColumn()
  .then(() => {
    log.info('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    log.error('❌ Script failed:', error);
    process.exit(1);
  });

