import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import Logger from '../logger/index';

function getRequestId(req: Request): string {
    const existing = req.headers['x-request-id'];
    if (typeof existing === 'string' && existing.trim()) return existing;
    return crypto.randomUUID();
}

export default function requestLogger(req: Request, res: Response, next: NextFunction) {
    const requestId = getRequestId(req);

    (req as any).requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const start = process.hrtime.bigint();

    res.on('finish', () => {
        const end = process.hrtime.bigint();
        const durationMs = Number(end - start) / 1_000_000;

        Logger.http('request', {
            requestId,
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
            durationMs: Number(durationMs.toFixed(2)),
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            contentLength: res.getHeader('content-length'),
        });
    });

    next();
}
