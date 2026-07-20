import type { MiddlewareHandler } from 'hono';
import crypto from 'node:crypto';
import { getRedis } from '../config/redis.js';
import { logger } from '../lib/logger.js';
import { Errors } from '../lib/errors.js';

/**
 * Atomic increment-and-set-TTL-once, single round trip so concurrent requests
 * across processes (pm2 cluster mode) can't race between the INCR and the
 * PEXPIRE — same style as lib/cache/locks.ts's compare-and-delete script.
 */
const RATE_LIMIT_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
`;

// ioredis (default `enableOfflineQueue: true`) queues commands indefinitely
// while disconnected/reconnecting rather than rejecting fast — against an
// absent/unreachable Redis that turns "fail open" into "hang for however
// long ioredis's retry strategy takes," which defeats the point. Race every
// call against a short, fixed timeout so an outage degrades in bounded time.
const REDIS_CALL_TIMEOUT_MS = 250;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Redis call exceeded ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/**
 * Redis-backed rate limiter keyed by authenticated userId (or IP as a
 * fallback for unauthenticated routes). Replaces the old in-memory `Map`
 * implementation so the limit is shared correctly across pm2 cluster
 * instances instead of being multiplied by the process count.
 *
 * @param options.windowMs - Sliding window duration in milliseconds
 * @param options.max      - Maximum requests allowed per window
 */
export function rateLimiter(options: { windowMs: number; max: number }): MiddlewareHandler {
  const { windowMs, max } = options;
  // Each call site gets its own Redis key namespace so independently
  // configured limiters (e.g. a route-specific limit vs. the global
  // baseline) never share a counter for the same user.
  const namespace = crypto.randomUUID();

  return async (c, next) => {
    const user = c.get('user');
    const key = `ratelimit:${namespace}:${user?.id ?? c.req.header('x-forwarded-for') ?? 'anonymous'}`;

    let count: number;
    let ttlMs: number;
    try {
      const redis = getRedis();
      const result = await withTimeout(
        redis.eval(RATE_LIMIT_LUA, 1, key, windowMs) as Promise<[number, number]>,
        REDIS_CALL_TIMEOUT_MS,
      );
      [count, ttlMs] = result;
    } catch (err) {
      // Fail OPEN: unlike locks.ts's `isLocked` (which fails closed because it
      // guards a critical section), a rate limiter's job is purely
      // protective — a Redis outage should degrade to "no rate limiting",
      // not take down the whole API.
      logger.warn({ err }, 'rateLimiter: Redis error, allowing request through');
      await next();
      return;
    }

    const resetAt = Date.now() + ttlMs;
    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(Math.max(0, max - count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));

    if (count > max) {
      const retryAfter = Math.ceil(ttlMs / 1000);
      c.header('Retry-After', String(retryAfter));
      throw Errors.tooManyRequests(`Rate limit exceeded. Try again in ${retryAfter} seconds.`);
    }

    await next();
  };
}
