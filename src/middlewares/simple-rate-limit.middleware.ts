import type { Request, Response, NextFunction } from 'express';

type KeyGenerator = (req: Request) => string;

export function createRateLimiter(params: {
    windowMs: number;
    max: number;
    keyGenerator?: KeyGenerator;
    statusCode?: number;
    message?: string;
}) {
    const windowMs = params.windowMs;
    const max = params.max;
    const statusCode = params.statusCode ?? 429;
    const message = params.message ?? 'Too many requests';

    const store = new Map<string, { count: number; resetAt: number }>();

    const keyGen: KeyGenerator =
        params.keyGenerator ?? ((req) => (req.ip ? String(req.ip) : 'unknown'));

    return (req: Request, res: Response, next: NextFunction) => {
        const key = keyGen(req);
        const now = Date.now();

        const existing = store.get(key);
        if (!existing || existing.resetAt <= now) {
            store.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }

        existing.count += 1;
        if (existing.count > max) {
            res.setHeader('Retry-After', String(Math.ceil((existing.resetAt - now) / 1000)));
            return res.status(statusCode).json({
                success: false,
                message,
                code: 'RATE_LIMITED',
            });
        }

        return next();
    };
}
