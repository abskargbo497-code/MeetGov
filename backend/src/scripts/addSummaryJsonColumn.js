/**
 * Script to add the missing 'summary_json' column to the transcripts table
 */

import dotenv from 'dotenv';
dotenv.config();

import { sequelize } from '../database/connection.js';
import { log } from '../utils/logger.js';

const addSummaryJsonColumn = async () => {
  try {
    // Connect to database
    await sequelize.authenticate();
    log.info('✓ Database connection established');

    // Check if column already exists
    const [results] = await sequelize.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'transcripts' 
      AND COLUMN_NAME = 'summary_json'
    `);

    if (results.length > 0) {
      log.info('✓ Column "summary_json" already exists in transcripts table');
      return;
    }

    // Add the summary_json column
    log.info('Adding "summary_json" column to transcripts table...');
    await sequelize.query(`
      ALTER TABLE transcripts 
      ADD COLUMN summary_json JSON DEFAULT NULL 
      COMMENT 'Structured summary with abstract, key_points, decisions, action_items'
    `);

    log.info('✓ Successfully added "summary_json" column to transcripts table');
    
  } catch (error) {
    log.error('❌ Error adding summary_json column:', error.message);
    
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
addSummaryJsonColumn()
  .then(() => {
    log.info('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    log.error('❌ Script failed:', error);
    process.exit(1);
  });

