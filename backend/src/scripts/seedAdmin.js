/**
 * Seed Super Admin User
 * Creates a super admin user on server startup if one doesn't exist
 * Uses ADMIN_EMAIL and ADMIN_PASSWORD from environment variables
 */

import User from '../models/User.js';
import { config } from '../config.js';
import { log } from '../utils/logger.js';
import bcrypt from 'bcryptjs';

/**
 * Seed super admin user if it doesn't exist
 * @returns {Promise<Object|null>} Created or existing admin user
 */
export const seedAdmin = async () => {
  try {
    // Check if admin already exists
    const existingAdmin = await User.findOne({
      where: {
        role: 'super_admin',
      },
    });

    if (existingAdmin) {
      log.info('Super Admin already exists', {
        email: existingAdmin.email,
        id: existingAdmin.id,
      });
      return existingAdmin;
    }

    // Check if admin email is configured
    if (!config.admin.email || !config.admin.password) {
      log.warn('Admin seeding skipped - ADMIN_EMAIL or ADMIN_PASSWORD not configured');
      return null;
    }

    // Check if user with admin email already exists
    const existingUser = await User.findOne({
      where: {
        email: config.admin.email,
      },
    });

    if (existingUser) {
      log.warn('User with admin email already exists but is not super_admin', {
        email: config.admin.email,
        currentRole: existingUser.role,
      });
      return null;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(config.admin.password, 10);

    // Create super admin
    const admin = await User.create({
      name: 'Super Admin',
      email: config.admin.email,
      password_hash: passwordHash,
      role: 'super_admin',
      department: 'Administration',
    });

    log.info('Super Admin seeded successfully', {
      email: admin.email,
      id: admin.id,
      note: 'Please change the default password after first login',
    });

    return admin;
  } catch (error) {
    log.error('Error seeding super admin', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

export default seedAdmin;

