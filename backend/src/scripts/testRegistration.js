/**
 * Test Registration Script
 * 
 * This script tests the registration functionality by attempting
 * to create a test user directly in the database.
 * 
 * Usage: node src/scripts/testRegistration.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { connectDatabase, sequelize } from '../database/connection.js';
import User from '../models/User.js';
import { log } from '../utils/logger.js';

const testRegistration = async () => {
  try {
    log.info('Testing user registration...');
    
    // Connect to database
    await connectDatabase();
    log.info('✓ Database connection established');

    // Check if users table exists
    try {
      const tableExists = await sequelize.getQueryInterface().showAllTables();
      log.info(`✓ Found ${tableExists.length} table(s) in database`);
      
      if (!tableExists.includes('users')) {
        log.error('❌ Users table does not exist!');
        log.info('Run: npm run db:setup');
        process.exit(1);
      }
      log.info('✓ Users table exists');
    } catch (error) {
      log.error('❌ Error checking tables:', error.message);
      log.info('Run: npm run db:setup');
      process.exit(1);
    }

    // Test user data
    const testUser = {
      name: 'Test User',
      email: `test${Date.now()}@example.com`, // Unique email
      password_hash: 'testpassword123', // Will be hashed by hook
      role: 'official',
    };

    log.info('Attempting to create test user...');
    log.info(`Email: ${testUser.email}`);

    // Create user
    const user = await User.create(testUser);

    log.info('✓ User created successfully!');
    log.info(`  ID: ${user.id}`);
    log.info(`  Name: ${user.name}`);
    log.info(`  Email: ${user.email}`);
    log.info(`  Role: ${user.role}`);
    log.info(`  Password hash: ${user.password_hash.substring(0, 20)}...`);

    // Verify password hash was created
    if (!user.password_hash || user.password_hash.length < 50) {
      log.error('❌ Password was not hashed correctly!');
      process.exit(1);
    }
    log.info('✓ Password hash verified');

    // Test password comparison
    const isValid = await user.comparePassword('testpassword123');
    if (!isValid) {
      log.error('❌ Password comparison failed!');
      process.exit(1);
    }
    log.info('✓ Password comparison works');

    // Clean up - delete test user
    await user.destroy();
    log.info('✓ Test user deleted');

    log.info('\n✅ All registration tests passed!');
    
  } catch (error) {
    log.error('❌ Registration test failed:', error);
    
    if (error.name === 'SequelizeValidationError') {
      log.error('Validation errors:');
      error.errors.forEach(err => {
        log.error(`  - ${err.path}: ${err.message}`);
      });
    } else if (error.name === 'SequelizeUniqueConstraintError') {
      log.error('❌ Email already exists');
    } else if (error.name === 'SequelizeDatabaseError') {
      log.error('❌ Database error:', error.message);
      if (error.message.includes("doesn't exist")) {
        log.info('Run: npm run db:setup');
      }
    }
    
    process.exit(1);
  } finally {
    await sequelize.close();
  }
};

testRegistration();

