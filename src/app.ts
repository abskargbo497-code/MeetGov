// INFRASTRUCTURE-ONLY MODULE
// Business logic and user flows will be layered later

import express from 'express';
import type { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import requestLogger from './middlewares/request-logger';
import { errorHandler } from './middlewares/error';
import Logger from './logger/index';
import guestRoutes from './routes/guest.routes';
import meetingRoutes from './routes/meeting.routes';
import attendanceRoutes from './routes/attendance.routes';
import recordingRoutes from './routes/recording.routes';
import artifactRoutes from './routes/artifact.routes';
import transcriptionRoutes from './routes/transcription.routes';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth';
import userRoutes from './routes/user.routes';
import enterpriseRoutes from './routes/enterprise.routes';
import personalMeetingRoutes from './routes/personal-meeting.routes';
import aiRoutes from './routes/ai.routes';
import participantRoutes from './routes/participant.routes';
import webhookRoutes from './routes/webhook.routes';
import taskRoutes, { meetingTaskRouter } from './routes/task.routes';

const app: Application = express();

const allowedOrigins = new Set([
    process.env.APP_BASE_URL ?? 'http://localhost:3000',
]);

// Core Middleware
app.use(helmet());

// CORS configuration
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.has(origin)) {
            return callback(null, true);
        }

        return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-workflow-id'],
    credentials: true,
}));

// BetterAuth handler - MUST be before express.json()
app.all('/api/auth/*splat', toNodeHandler(auth));

// Basic middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Health Check endpoint for infrastructure validation
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
        status: 'UP',
        timestamp: new Date().toISOString(),
        message: 'Infrastructure initialized.'
    });
});

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/enterprise', enterpriseRoutes);
app.use('/api/personal/meetings', personalMeetingRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/participant', participantRoutes);
app.use('/api/v1/guest', guestRoutes);
app.use('/api/v1/meetings', meetingRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/recordings', recordingRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1', artifactRoutes);
app.use('/api/v1', transcriptionRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/meetings/:meetingId/tasks', meetingTaskRouter);

// Error Handling
app.use(errorHandler);

export default app;
