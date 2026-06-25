import type { MiddlewareHandler } from 'hono';
import { Errors } from '../lib/errors.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory rate limiter keyed by authenticated userId.
 * Intended as a stopgap until Redis-backed limiting is available.
 *
 * @param options.windowMs - Sliding window duration in milliseconds
 * @param options.max      - Maximum requests allowed per window
 */
export function rateLimiter(options: {
  windowMs: number;
  max: number;
}): MiddlewareHandler {
  const { windowMs, max } = options;
  const store = new Map<string, RateLimitEntry>();

  // Periodically prune expired entries to avoid unbounded growth
  const pruneInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) store.delete(key);
    }
  }, windowMs * 2);

  // Allow the timer to not keep the process alive
  if (pruneInterval.unref) pruneInterval.unref();

  return async (c, next) => {
    const user = c.get('user');
    const key = user?.id ?? c.req.header('x-forwarded-for') ?? 'anonymous';
    const now = Date.now();

    let entry = store.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 1, resetAt: now + windowMs };
      store.set(key, entry);
    } else {
      entry.count += 1;
    }

    // Set standard rate-limit headers
    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      throw Errors.badRequest(
        `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      );
    }

    await next();
  };
}
