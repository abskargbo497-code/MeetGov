import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { logger, log } from './utils/logger.js';
import { authenticateToken } from './utils/jwt.js';
import { connectDatabase, sequelize } from './database/connection.js';
import './models/index.js'; // Import models to register associations

// Import routes
import authRoutes from './api/auth.js';
import meetingRoutes from './api/meeting.js';
import transcriptionRoutes from './api/transcription.js';
import taskRoutes from './api/tasks.js';
import analyticsRoutes from './api/analytics.js';

const app = express();

// Middleware - CORS: Allow all origins (remove restrictions)
app.use(cors({
  origin: '*', // Allow all origins
  credentials: false, // Set to false when using wildcard origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logger);

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/meetings', authenticateToken, meetingRoutes);
app.use('/api/transcription', authenticateToken, transcriptionRoutes);
app.use('/api/tasks', authenticateToken, taskRoutes);
app.use('/api/analytics', authenticateToken, analyticsRoutes);

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

// Connect to MySQL database
connectDatabase()
  .then(() => {
    // Start server - listen on all interfaces (0.0.0.0) to accept connections from any IP
    app.listen(config.port, '0.0.0.0', () => {
      log.info(`Server running on http://0.0.0.0:${config.port}`);
      log.info(`Server accessible at http://localhost:${config.port}`);
      log.info(`Environment: ${config.nodeEnv}`);
      log.info(`CORS: Enabled for all origins`);
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
