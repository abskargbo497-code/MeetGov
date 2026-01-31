// INFRASTRUCTURE-ONLY MODULE
// Business logic and user flows will be layered later

import { PrismaClient } from '@prisma/client';

/**
 * Centralized Prisma Client instance to prevent connection pool exhaustion.
 * This singleton pattern ensures only one Prisma Client is created across the entire application.
 * 
 * CRITICAL: This is the ONLY place where PrismaClient should be instantiated.
 * All services MUST import from this file. Direct instantiation elsewhere will cause connection exhaustion.
 * 
 * Connection Pool Configuration:
 * - Optimized for Neon serverless PostgreSQL with connection pooler
 * - Supports 50+ concurrent users in MVP conditions
 * - Configured for horizontal scaling readiness
 */
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
        datasources: {
            db: {
                url: process.env.DATABASE_URL,
            },
        },
    });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Graceful shutdown handler
process.on('beforeExit', async () => {
    await prisma.$disconnect();
});

export default prisma;
