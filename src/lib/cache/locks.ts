import crypto from 'node:crypto';
import { getRedis } from '../../config/redis.js';
import { logger } from '../logger.js';

// ioredis is configured with `lazyConnect` and the default
// `enableOfflineQueue: true` (see config/redis.ts), so commands issued while
// disconnected are QUEUED rather than rejected — an unreachable Redis makes a
// call hang instead of failing fast. Every other Redis caller in this codebase
// races its calls against the same short fixed timeout for exactly this reason
// (middleware/rate-limit.ts, lib/llm/gemini-key-pool.ts); these locks sit on
// the chat request path, where an unbounded hang would be indistinguishable
// from the outage the fail-open behaviour exists to survive.
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
 * Outcome of an `acquire()` attempt.
 *
 * The two failure modes are deliberately NOT collapsed into a single falsy
 * value. "Someone else holds this lock" and "Redis is unreachable" demand
 * opposite responses from a caller guarding a user-facing request: the first
 * must reject, the second must let the request through. A single `null` return
 * (the shape this function used to have) makes that distinction impossible at
 * the call site, and the natural `if (!owner) reject` reading of it turns a
 * Redis blip into a total outage of whatever the lock guards. This codebase has
 * already had one live outage of exactly that shape — the `/v1` rate limiter
 * incident fixed in 8c6e412 — which is why `rateLimiter` fails open and why
 * this returns a discriminated result instead.
 *
 * `isLocked()` below still fails CLOSED, and correctly so: it guards critical
 * sections where double-execution is worse than unavailability. Locks used to
 * pace user requests want the opposite trade.
 */
export type AcquireResult =
  | { ok: true; owner: string }
  | { ok: false; reason: 'held' | 'unavailable' };

export async function acquire(prefix: string, id: string, ttlSeconds = 30): Promise<AcquireResult> {
  const owner = crypto.randomUUID();
  try {
    const redis = getRedis();
    const key = `lock:${prefix}:${id}`;
    const result = await withTimeout(
      redis.set(key, owner, 'EX', ttlSeconds, 'NX'),
      REDIS_CALL_TIMEOUT_MS,
    );
    return result === 'OK' ? { ok: true, owner } : { ok: false, reason: 'held' };
  } catch (err) {
    logger.warn({ err }, 'lock:acquire failed');
    return { ok: false, reason: 'unavailable' };
  }
}

// Atomic compare-and-delete: only the owner may release, evaluated in a single
// round-trip so the lock can't expire-and-be-reacquired between check and del.
const RELEASE_LUA =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export async function release(prefix: string, id: string, owner: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const key = `lock:${prefix}:${id}`;
    const deleted = await withTimeout(
      redis.eval(RELEASE_LUA, 1, key, owner) as Promise<number>,
      REDIS_CALL_TIMEOUT_MS,
    );
    return deleted === 1;
  } catch (err) {
    logger.warn({ err }, 'lock:release failed');
    return false;
  }
}

export async function isLocked(prefix: string, id: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const key = `lock:${prefix}:${id}`;
    return (await withTimeout(redis.exists(key), REDIS_CALL_TIMEOUT_MS)) === 1;
  } catch (err) {
    // Fail closed: during a Redis outage, treat the resource as locked so
    // callers don't proceed into the critical section unguarded.
    logger.warn({ err }, 'lock:isLocked failed — failing closed (locked)');
    return true;
  }
}
