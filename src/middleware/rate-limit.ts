import type { Context, MiddlewareHandler } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { getRedis } from '../config/redis.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { Errors } from '../lib/errors.js';
import { alertThrottled } from '../lib/notifications/alerts.js';

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
 * Identify the caller for bucketing purposes.
 *
 * Order matters. An authenticated user id is the most precise identity we
 * have, but the baseline limiter runs before any router's `requireUser`, so
 * for most requests we fall through to the network peer.
 *
 * `x-forwarded-for` is only consulted when TRUST_PROXY says something
 * upstream actually sets it. Read unconditionally it is worse than useless:
 * with no proxy deployed the header is pure client input, so an abuser gets
 * an unlimited supply of buckets while every honest client — none of which
 * sends the header — collapses into one shared counter.
 */
function identify(c: Context): string {
  const user = c.get('user') as { id?: string } | undefined;
  if (user?.id) return `u:${user.id}`;

  if (env.TRUST_PROXY) {
    // The header is a chain — "client, proxy1, proxy2" — and only the
    // left-most entry is the originating client.
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return `ip:${forwarded}`;
  }

  // The real TCP peer. getConnInfo reaches into the Node adapter's `incoming`
  // socket, which isn't present under every runtime/test harness, so treat a
  // failure as "unknown peer" rather than letting it 500 the request.
  try {
    const address = getConnInfo(c).remote.address;
    if (address) return `ip:${address}`;
  } catch {
    /* fall through */
  }

  return 'unknown';
}

/**
 * Redis-backed rate limiter keyed by authenticated userId (or the client's IP
 * as a fallback for unauthenticated routes). Redis-backed rather than an
 * in-memory `Map` so the limit is shared correctly across pm2 cluster
 * instances instead of being multiplied by the process count.
 *
 * @param options.windowMs - Fixed window duration in milliseconds
 * @param options.max      - Maximum requests allowed per window
 * @param options.name     - Stable identifier for this limiter. Every call
 *   site needs its own so independently configured limiters never share a
 *   counter for the same caller — but it MUST be stable across processes and
 *   restarts, or each pm2 worker silently gets its own private quota and the
 *   effective limit becomes `max × workerCount`.
 */
export function rateLimiter(options: {
  windowMs: number;
  max: number;
  name: string;
}): MiddlewareHandler {
  const { windowMs, max, name } = options;

  return async (c, next) => {
    const key = `ratelimit:${name}:${identify(c)}`;

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
      logger.warn({ key, count, max, path: c.req.path }, 'rateLimiter: request rejected');

      // Real users being turned away is worth waking someone up for: the
      // limiter is the one failure mode that produces no 500s at all, so
      // nothing else here would notice. Keyed by limiter name only, so a
      // burst across many routes is one alert carrying the true count.
      void alertThrottled(
        `ratelimit:${name}`,
        `Rate limit rejecting traffic (${name})`,
        `${c.req.method} ${c.req.path} — ${count} requests against a ${max}/` +
          `${Math.round(windowMs / 1000)}s limit. Retry-After ${retryAfter}s.`,
      );

      throw Errors.tooManyRequests(`Rate limit exceeded. Try again in ${retryAfter} seconds.`);
    }

    await next();
  };
}
