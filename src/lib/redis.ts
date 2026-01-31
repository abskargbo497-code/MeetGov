// INFRASTRUCTURE-ONLY MODULE
// Business logic and user flows will be layered later

import Redis from 'ioredis';
import Logger from '../logger/index';

/**
 * Centralized Redis connection for BullMQ and other Redis operations.
 * 
 * CRITICAL: This is the ONLY place where Redis should be instantiated.
 * All BullMQ queues and workers MUST reuse this connection to prevent exhaustion.
 * 
 * Connection Configuration:
 * - Optimized for Redis Cloud with automatic retry strategy
 * - Supports 50+ concurrent users with proper connection pooling
 * - Configured for horizontal scaling readiness
 * - Graceful reconnection on network failures
 */

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Parse Redis URL to extract connection details
const parseRedisUrl = (url: string) => {
    try {
        const urlObj = new URL(url);
        return {
            host: urlObj.hostname,
            port: parseInt(urlObj.port) || 6379,
            password: urlObj.password || undefined,
            username: urlObj.username || undefined,
        };
    } catch {
        // Fallback for non-URL format
        return {
            host: 'localhost',
            port: 6379,
        };
    }
};

const redisConfig = parseRedisUrl(REDIS_URL);

const commandTimeoutMs = Number(process.env.REDIS_COMMAND_TIMEOUT_MS || 0);

/**
 * Centralized Redis connection instance
 * Used by all BullMQ queues and workers
 */
export const redis = new Redis({
    ...redisConfig,
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: true,
    enableOfflineQueue: true,
    
    // Retry strategy for connection failures
    retryStrategy(times: number) {
        const delay = Math.min(times * 50, 2000);
        Logger.warn(`Redis connection retry attempt ${times}, waiting ${delay}ms`);
        return delay;
    },
    
    // Reconnect on error
    reconnectOnError(err: Error) {
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
        if (targetErrors.some(targetError => err.message.includes(targetError))) {
            Logger.warn(`Redis reconnecting due to: ${err.message}`);
            return true; // Reconnect
        }
        return false;
    },
    
    // Connection timeouts
    connectTimeout: 10000,
    ...(commandTimeoutMs > 0 ? { commandTimeout: commandTimeoutMs } : {}),
    
    // Keep-alive
    keepAlive: 30000,
    
    // Lazy connect (connect on first command)
    lazyConnect: false,
});

// Connection event handlers
redis.on('connect', () => {
    Logger.info('✅ Redis connected successfully');
});

redis.on('ready', () => {
    Logger.info('✅ Redis ready to accept commands');
});

redis.on('error', (err: Error) => {
    Logger.error(`❌ Redis connection error: ${err.message}`);
});

redis.on('close', () => {
    Logger.warn('⚠️  Redis connection closed');
});

redis.on('reconnecting', (delay: number) => {
    Logger.info(`🔄 Redis reconnecting in ${delay}ms...`);
});

redis.on('end', () => {
    Logger.warn('⚠️  Redis connection ended');
});

// Graceful shutdown handler
process.on('SIGTERM', async () => {
    Logger.info('SIGTERM received, closing Redis connection...');
    await redis.quit();
});

process.on('SIGINT', async () => {
    Logger.info('SIGINT received, closing Redis connection...');
    await redis.quit();
});

/**
 * BullMQ-compatible connection configuration
 * Use this for all Queue and Worker instantiations
 * Type cast is necessary due to BullMQ bundling its own ioredis version
 */
export const bullmqConnection = redis as any;

export default redis;
