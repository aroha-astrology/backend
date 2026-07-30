// =============================================================================
// Gemini API key pool — Redis-backed round-robin + per-key cooldown
// =============================================================================
// Google's free tier caps each Gemini API key at 15 req/min, 250k tokens/min,
// 500 req/day. With multiple keys, gemini-client.ts round-robins across all of
// them (spreading load BEFORE any key ever hits its own cap) and fails over
// instantly to the next key on a 429 instead of blocking on a fixed backoff.
//
// The app runs under pm2 in cluster mode (multiple Node processes), which is
// exactly why per-process-only in-memory state would NOT correctly coordinate
// key rotation across workers — every worker would independently think it's
// "key 0's turn" and pile onto the same key. Redis is required for the primary
// path so the cursor and cooldowns are shared across the whole cluster;
// in-memory state is only the degraded, single-process fallback used when
// Redis itself is unreachable. Same "Redis for cross-process correctness,
// bounded-timeout fail-open to an in-memory fallback" philosophy as
// middleware/rate-limit.ts — mirrored here rather than reinvented.
//
// Unlike rate-limit.ts's INCR+PEXPIRE, none of the operations here need a Lua
// script: the cursor is a bare, un-expiring INCR (no "set TTL only on the
// first increment" race to close), and the cooldown is a single atomic
// SET ... PX (no companion command to combine it with).

import { getRedis } from '../../config/redis.js';
import { GEMINI_KEY_POOL } from '../../config/env.js';
import { logger } from '../logger.js';

const REDIS_CALL_TIMEOUT_MS = 250;
const CURSOR_KEY = 'gemini:pool:cursor';

function cooldownKey(index: number): string {
  return `gemini:pool:cooldown:${index}`;
}

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

// Degraded, process-local fallback — only consulted when a Redis call itself
// times out or errors. Never coordinates across pm2 workers; that's Redis's
// job in the primary path above.
let localCursor = 0;
const localCooldowns = new Map<number, number>(); // index -> cooldown-expiry epoch ms

function isLocallyCoolingDown(index: number): boolean {
  const expiresAt = localCooldowns.get(index);
  return expiresAt !== undefined && expiresAt > Date.now();
}

export function poolSize(): number {
  return GEMINI_KEY_POOL.length;
}

async function nextCursorValue(): Promise<number> {
  try {
    const redis = getRedis();
    return await withTimeout(redis.incr(CURSOR_KEY), REDIS_CALL_TIMEOUT_MS);
  } catch (err) {
    logger.warn(
      { err },
      'gemini-key-pool: Redis error on cursor INCR, using local fallback cursor',
    );
    localCursor += 1;
    return localCursor;
  }
}

async function isCoolingDown(index: number): Promise<boolean> {
  try {
    const redis = getRedis();
    const value = await withTimeout(redis.get(cooldownKey(index)), REDIS_CALL_TIMEOUT_MS);
    return value !== null;
  } catch (err) {
    logger.warn(
      { err, index },
      'gemini-key-pool: Redis error checking cooldown, using local fallback state',
    );
    return isLocallyCoolingDown(index);
  }
}

/**
 * Advance the shared round-robin cursor and return the next non-excluded,
 * non-cooling-down key. `exclude` is per-call (typically "keys already tried
 * this attempt"), not persistent — persistent exclusion is what the Redis
 * cooldown is for.
 *
 * Returns `null` only when every index is either excluded or cooling down —
 * i.e. the whole pool is currently exhausted.
 */
export async function pickKey(
  exclude?: Set<number>,
): Promise<{ index: number; key: string } | null> {
  const size = poolSize();
  if (size === 0) return null;

  const excluded = exclude ?? new Set<number>();

  if (size === 1) {
    // Only one possible index — 0 % 1 is always 0, so the round-robin cursor
    // is irrelevant here. Skip the Redis INCR round trip entirely; still do
    // the real (Redis-backed) cooldown check, since that's what makes a
    // size-1 pool degrade to the pre-rotation "sleep and retry" behavior
    // exactly as it did before this pool existed.
    if (excluded.has(0)) return null;
    if (await isCoolingDown(0)) return null;
    const soleKey = GEMINI_KEY_POOL[0];
    return soleKey === undefined ? null : { index: 0, key: soleKey };
  }

  if (excluded.size >= size) return null;

  const cursor = await nextCursorValue();
  for (let i = 0; i < size; i++) {
    const index = (cursor + i) % size;
    if (excluded.has(index)) continue;
    if (await isCoolingDown(index)) continue;
    const key = GEMINI_KEY_POOL[index];
    if (key === undefined) continue; // index < size, so unreachable in practice
    return { index, key };
  }
  return null;
}

/** Mark index as rate-limited for `cooldownMs`, excluding it from pickKey() until it clears. */
export async function markRateLimited(index: number, cooldownMs: number): Promise<void> {
  // Recorded locally first (and unconditionally) so that if Redis becomes
  // unreachable later in this same process, the fallback path still knows
  // about a cooldown this process itself just observed.
  localCooldowns.set(index, Date.now() + cooldownMs);
  try {
    const redis = getRedis();
    await withTimeout(redis.set(cooldownKey(index), '1', 'PX', cooldownMs), REDIS_CALL_TIMEOUT_MS);
  } catch (err) {
    logger.warn(
      { err, index, cooldownMs },
      'gemini-key-pool: Redis error setting cooldown, relying on local fallback only',
    );
  }
}

/**
 * Epoch-ms estimate of when at least one key will next be available. Used to
 * size a "whole pool exhausted" sleep so it wakes as soon as real state says a
 * key is free, rather than sleeping a fixed schedule blind to that state.
 */
export async function earliestAvailableAt(): Promise<number> {
  const size = poolSize();
  if (size === 0) return Date.now();

  let minRemainingMs: number | null = null;

  for (let index = 0; index < size; index++) {
    let ttlMs: number;
    try {
      const redis = getRedis();
      ttlMs = await withTimeout(redis.pttl(cooldownKey(index)), REDIS_CALL_TIMEOUT_MS);
    } catch (err) {
      logger.warn(
        { err, index },
        'gemini-key-pool: Redis error reading cooldown TTL, using local fallback state',
      );
      const localExpiry = localCooldowns.get(index);
      ttlMs = localExpiry !== undefined ? Math.max(0, localExpiry - Date.now()) : -2;
    }

    // ioredis PTTL: -2 = key doesn't exist, -1 = exists with no TTL. Either
    // way this index isn't cooling down, so at least one key is free right now.
    if (ttlMs < 0) {
      return Date.now();
    }
    if (minRemainingMs === null || ttlMs < minRemainingMs) {
      minRemainingMs = ttlMs;
    }
  }

  return Date.now() + (minRemainingMs ?? 0);
}

/** Test seam — resets module-scoped local fallback state between specs. */
export function __resetForTests(): void {
  localCursor = 0;
  localCooldowns.clear();
}
