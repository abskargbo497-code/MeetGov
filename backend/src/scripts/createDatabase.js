/**
 * Create Database Script
 * 
 * This script creates the MySQL database if it doesn't exist.
 * It connects to MySQL without specifying a database first,
 * creates the database, then exits.
 * 
 * Usage:
 *   node src/scripts/createDatabase.js
 */

import dotenv from 'dotenv';
import { Sequelize } from 'sequelize';
import { config } from '../config.js';
import { log } from '../utils/logger.js';

dotenv.config();

/**
 * Create the database if it doesn't exist
 */
const createDatabase = async () => {
  // Connect to MySQL without specifying database
  const sequelize = new Sequelize(
    '', // No database specified
    config.database.username,
    config.database.password,
    {
      host: config.database.host,
      port: config.database.port,
      dialect: 'mysql',
      logging: false, // Disable logging for this script
    }
  );

  try {
    log.info('Connecting to MySQL server...');
    await sequelize.authenticate();
    log.info('✓ Connected to MySQL server');

    // Create database if it doesn't exist
    const dbName = config.database.database;
    log.info(`Creating database '${dbName}' if it doesn't exist...`);
    
    await sequelize.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    
    log.info(`✓ Database '${dbName}' is ready`);
    return true;
  } catch (error) {
    log.error('❌ Error creating database:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
};

// Run create database
createDatabase()
  .then(() => {
    log.info('\n✅ Database creation completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    log.error('Fatal error:', error);
    process.exit(1);
  });

