import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, authenticateToken } from '../utils/jwt.js';
import { asyncHandler, errorResponse, successResponse } from '../utils/helpers.js';
import { log } from '../utils/logger.js';

const router = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').optional().isIn(['secretary', 'official']).withMessage('Invalid role. Must be secretary or official'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Format validation errors into a single message
      const errorMessages = errors.array().map(err => err.msg).join(', ');
      return errorResponse(res, 400, errorMessages || 'Validation failed', errors.array());
    }

    const { name, email, password, role, department } = req.body;

    try {
      // Check if user already exists
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return errorResponse(res, 400, 'User with this email already exists');
      }

      // Prevent admin registration via normal registration
      if (role === 'super_admin' || role === 'administrator' || role === 'admin') {
        return errorResponse(res, 403, 'Admin role cannot be registered. Admin must be seeded in the database.');
      }

      // Only allow official or secretary registration
      const allowedRoles = ['official', 'secretary'];
      const finalRole = role && allowedRoles.includes(role) ? role : 'official';

      // Create new user (password will be hashed by hook)
      const user = await User.create({
        name,
        email,
        password_hash: password, // Will be hashed by beforeCreate hook
        role: finalRole,
        department: department || null,
      });

      // Generate tokens
      const accessToken = generateAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const refreshToken = generateRefreshToken({
        userId: user.id,
      });

      log.info('User registered successfully', { userId: user.id, email: user.email });

      return successResponse(res, 201, {
        user: user.toJSON(),
        accessToken,
        refreshToken,
      }, 'User registered successfully');
    } catch (error) {
      log.error('Registration error:', error);
      
      // Handle Sequelize validation errors
      if (error.name === 'SequelizeValidationError') {
        const validationErrors = error.errors.map(err => err.message).join(', ');
        return errorResponse(res, 400, validationErrors || 'Validation failed');
      }
      
      // Handle unique constraint errors (duplicate email)
      if (error.name === 'SequelizeUniqueConstraintError') {
        return errorResponse(res, 400, 'User with this email already exists');
      }
      
      // Handle database connection errors
      if (error.name === 'SequelizeConnectionError' || error.name === 'SequelizeDatabaseError') {
        log.error('Database error during registration:', error.message);
        return errorResponse(res, 500, 'Database connection error. Please try again later.');
      }
      
      // Generic error
      return errorResponse(res, 500, error.message || 'Registration failed. Please try again.');
    }
  })
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 400, 'Validation failed', errors.array());
    }

    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return errorResponse(res, 401, 'Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return errorResponse(res, 401, 'Invalid credentials');
    }

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = generateRefreshToken({
      userId: user.id,
    });

    log.info('User logged in successfully', { userId: user.id, email: user.email });

    return successResponse(res, 200, {
      user: user.toJSON(),
      accessToken,
      refreshToken,
    }, 'Login successful');
  })
);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post(
  '/refresh',
  [
    body('refreshToken').notEmpty().withMessage('Refresh token is required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(res, 400, 'Validation failed', errors.array());
    }

    const { refreshToken } = req.body;

    try {
      // Verify refresh token
      const decoded = verifyRefreshToken(refreshToken);

      // Find user
      const user = await User.findByPk(decoded.userId);
      if (!user) {
        return errorResponse(res, 401, 'User not found');
      }

      // Generate new access token
      const accessToken = generateAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      log.info('Access token refreshed', { userId: user.id });

      return successResponse(res, 200, {
        accessToken,
      }, 'Token refreshed successfully');
    } catch (error) {
      return errorResponse(res, 401, 'Invalid or expired refresh token');
    }
  })
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user
 * @access  Private (requires authentication)
 */
router.get(
  '/me',
  authenticateToken, // Apply authentication middleware
  asyncHandler(async (req, res) => {
    // req.user is guaranteed to exist after authenticateToken middleware
    const user = await User.findByPk(req.user.userId);
    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    return successResponse(res, 200, {
      user: user.toJSON(),
    });
  })
);

export default router;
