import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { log } from './logger.js';

/**
 * Generate access token
 */
export const generateAccessToken = (payload) => {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
};

/**
 * Generate refresh token
 */
export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, config.jwtRefreshSecret, {
    expiresIn: config.jwtRefreshExpiresIn,
  });
};

/**
 * Verify access token
 */
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (error) {
    throw new Error('Invalid or expired access token');
  }
};

/**
 * Verify refresh token
 */
export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, config.jwtRefreshSecret);
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
};

/**
 * Middleware to authenticate requests
 * Verifies JWT token from Authorization header
 * Attaches decoded user info to req.user
 * Returns 401 if token missing, 403 if token invalid/expired
 */
export const authenticateToken = (req, res, next) => {
  // Extract token from Authorization header
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: 'Access token required',
      error: 'Authorization header missing',
    });
  }

  // Check if Bearer token format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      success: false,
      message: 'Invalid authorization format',
      error: 'Authorization header must be in format: Bearer <token>',
    });
  }

  const token = parts[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required',
      error: 'Token missing from authorization header',
    });
  }

  try {
    // Verify and decode token
    const decoded = verifyAccessToken(token);
    
    // Attach user info to request object
    req.user = decoded;
    
    // Log successful authentication (optional, for debugging)
    // log.info('Token authenticated', { userId: decoded.userId, email: decoded.email });
    
    next();
  } catch (error) {
    // Log failed authentication attempt
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    const endpoint = `${req.method} ${req.originalUrl}`;
    
    log.warn('Authentication failed', {
      error: error.message,
      endpoint,
      ip: clientIP,
      userAgent,
    });
    
    // Differentiate between expired and invalid tokens
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({
        success: false,
        message: 'Token expired',
        error: 'Your access token has expired. Please refresh or login again',
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({
        success: false,
        message: 'Invalid token',
        error: 'The provided token is invalid or malformed',
      });
    }
    
    // Generic error
    return res.status(403).json({
      success: false,
      message: 'Authentication failed',
      error: error.message || 'Invalid or expired access token',
    });
  }
};

/**
 * Middleware to check user roles
 * Must be used after authenticateToken middleware
 */
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error: 'User not authenticated',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        error: `Access denied. Required role: ${roles.join(' or ')}`,
      });
    }

    next();
  };
};
