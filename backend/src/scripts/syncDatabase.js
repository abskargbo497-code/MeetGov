/**
 * Database Sync Script
 * 
 * This script syncs all Sequelize models with the MySQL database.
 * It creates tables if they don't exist and updates existing tables
 * without dropping data (uses alter: true).
 * 
 * Usage:
 *   node src/scripts/syncDatabase.js              # Safe sync (alter: true)
 *   node src/scripts/syncDatabase.js --force      # Force sync (DROPS ALL DATA!)
 * 
 * WARNING: --force will drop all tables and recreate them, deleting all data!
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import models and database connection
// Note: Models must be imported before sync to register them with Sequelize
import { connectDatabase, sequelize } from '../database/connection.js';
import '../models/index.js'; // Import models to register them and their associations
import { log } from '../utils/logger.js';

// Get force flag from command line arguments
const force = process.argv.includes('--force');

/**
 * Sync database with all models
 * @param {boolean} forceSync - If true, drops all tables and recreates them (DESTRUCTIVE!)
 */
const syncDatabase = async (forceSync = false) => {
  try {
    log.info('Starting database synchronization...');
    
    // Connect to database first
    await connectDatabase();
    log.info('✓ Database connection established');

    if (forceSync) {
      log.warn('⚠️  FORCE SYNC MODE: This will DROP ALL TABLES and delete all data!');
      log.warn('⚠️  Press Ctrl+C within 5 seconds to cancel...');
      
      // Give user 5 seconds to cancel
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      log.warn('⚠️  Proceeding with force sync (dropping all tables)...');
      
      // Force sync: drops all tables and recreates them
      await sequelize.sync({ force: true });
      log.info('✓ Force sync completed - all tables dropped and recreated');
    } else {
      // Safe sync: alters existing tables without dropping data
      log.info('Using safe sync mode (alter: true) - existing data will be preserved');
      await sequelize.sync({ alter: true });
      log.info('✓ Safe sync completed - tables updated without data loss');
    }

    // Log all synced tables
    const tableNames = Object.keys(sequelize.models);
    log.info(`\n✓ Successfully synced ${tableNames.length} model(s):`);
    tableNames.forEach(modelName => {
      const model = sequelize.models[modelName];
      log.info(`  - ${model.tableName} (${modelName})`);
    });

    log.info('\n✅ Database synchronization completed successfully!');
    
    return true;
  } catch (error) {
    log.error('❌ Error synchronizing database:', error);
    throw error;
  } finally {
    // Close database connection
    await sequelize.close();
    log.info('Database connection closed');
  }
};

// Run sync
syncDatabase(force)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    log.error('Fatal error:', error);
    process.exit(1);
  });
