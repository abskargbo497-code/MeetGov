// INFRASTRUCTURE-ONLY MODULE
// Business logic and user flows will be layered later

import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import app from './app';
import Logger from './logger/index';
import { setupWebSocketServer } from './websocket/ws-server';
import { createProcessingWorker } from './workers/processing.worker';
import { createArtifactWorker } from './workers/artifact.worker';
import { WebSocketServer } from 'ws';
import { handleMitlyConnection, closeAllMitlyConnections } from './websocket/mitly-handler';

const PORT = process.env.PORT || 3001;

const server = http.createServer(app);

// Timeout hardening
server.keepAliveTimeout = Number(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS || 65_000);
server.headersTimeout = Number(process.env.HTTP_HEADERS_TIMEOUT_MS || 70_000);
server.requestTimeout = Number(process.env.HTTP_REQUEST_TIMEOUT_MS || 120_000);

// Initialize WebSocket server for AI Assistant
const wss = setupWebSocketServer(server);

// Initialize MITLY WebSocket server
const mitlyWss = new WebSocketServer({ noServer: true });

// Handle upgrade requests for MITLY
server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
    
    if (pathname === '/ws/mitly') {
        Logger.info('[MITLY] Handling WebSocket upgrade');
        mitlyWss.handleUpgrade(request, socket, head, (ws) => {
            handleMitlyConnection(ws, request);
        });
    }
});

// Initialize processing worker for background jobs
const processingWorker = createProcessingWorker();

// Initialize artifact worker for AI artifact generation
const artifactWorker = createArtifactWorker();

server.listen(PORT, () => {
    Logger.info(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
    Logger.info('WebSocket server initialized at /api/v1/ws');
    Logger.info('MITLY WebSocket server initialized at /ws/mitly');
    Logger.info('Processing worker initialized for background transcription jobs');
    Logger.info('Artifact worker initialized for AI artifact generation');
    Logger.info('Infrastructure initialized. Ready to handle connections.');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    Logger.info('SIGTERM received. Shutting down gracefully...');
    closeAllMitlyConnections();
    await Promise.all([
        processingWorker.close(),
        artifactWorker.close()
    ]);
    server.close(() => {
        Logger.info('Server closed');
        process.exit(0);
    });
});

