import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { config } from './config.js';
import { logger, log } from './utils/logger.js';
import { authenticateToken } from './utils/jwt.js';
import { connectDatabase, sequelize } from './database/connection.js';
import './models/index.js'; // Import models to register associations
import { seedAdmin } from './scripts/seedAdmin.js';
import { initializeSocketIO } from './services/socketService.js';
import { initializeStatusChecker } from './services/meetingStatusService.js';

// Import routes
import authRoutes from './api/auth.js';
import meetingRoutes from './api/meeting.js';
import transcriptionRoutes from './api/transcription.js';
import liveTranscriptionRoutes from './api/liveTranscription.js';
import taskRoutes from './api/tasks.js';
import analyticsRoutes from './api/analytics.js';
import notificationRoutes from './api/notifications.js';
import reportRoutes from './api/reports.js';

const app = express();

// Middleware - CORS: Allow all origins (remove restrictions)
app.use(cors({
  origin: '*', // Allow all origins
  credentials: false, // Set to false when using wildcard origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
// Increase payload size limit for audio chunks (50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(logger);

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
// Note: authenticateToken is applied within route files where needed
app.use('/api/meetings', meetingRoutes);
// Mount transcription routes under /api/meetings for new endpoints
app.use('/api/meetings', transcriptionRoutes);
// Legacy transcription routes
app.use('/api/transcription', transcriptionRoutes);
// Live transcription routes
app.use('/api/meetings', liveTranscriptionRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  log.error('Error:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    message,
    ...(config.nodeEnv === 'development' && { stack: err.stack }),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Connect to MySQL database and seed admin
connectDatabase()
  .then(async () => {
    // Seed super admin if it doesn't exist
    try {
      await seedAdmin();
    } catch (error) {
      log.error('Failed to seed admin', error);
      // Don't exit - continue server startup even if admin seeding fails
    }

    // Create HTTP server for Socket.IO
    const httpServer = createServer(app);
    
    // Initialize Socket.IO for real-time features
    initializeSocketIO(httpServer);
    
    // Initialize automatic meeting status checker (checks every minute)
    initializeStatusChecker(60000); // 60 seconds
    
    // Start server - listen on all interfaces (0.0.0.0) to accept connections from any IP
    httpServer.listen(config.port, '0.0.0.0', () => {
      log.info(`Server running on http://0.0.0.0:${config.port}`);
      log.info(`Server accessible at http://localhost:${config.port}`);
      log.info(`Environment: ${config.nodeEnv}`);
      log.info(`CORS: Enabled for all origins`);
      log.info(`WebSocket: Enabled for real-time updates`);
      log.info(`Meeting Status Checker: Enabled (checks every 60 seconds)`);
    });
  })
  .catch((error) => {
    log.error('Database connection error:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', async () => {
  log.info('SIGTERM signal received: closing HTTP server');
  await sequelize.close();
  log.info('MySQL connection closed');
  process.exit(0);
});

export default app;
