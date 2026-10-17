// =============================================================================
// Gemini API key pool — Redis-backed round-robin + per-key cooldown + paid reserve
// =============================================================================
// Google's free tier caps each Google Cloud PROJECT (not each API key — their
// docs are explicit about this) at 15 req/min, 250k tokens/min, 1500 req/day.
// Our free keys therefore each live in their own project; a key added to an
// existing project would contribute zero extra throughput. With multiple keys,
// gemini-client.ts round-robins across all of them (spreading load BEFORE any
// key ever hits its own cap) and fails over instantly to the next key on a 429
// instead of blocking on a fixed backoff.
//
// TWO TIERS. Free keys are spent first, in round-robin order. Paid keys are
// billed and held in reserve, only handed out once EVERY free key is cooling
// down, and then in the order set on Admin -> Gemini Keys (subir2 first by
// default). The free daily quota resets at midnight Pacific = 12:30 PM IST,
// which is the worst possible alignment with an Indian evening peak: without a
// reserve, draining the free pool at 10 PM leaves the app broken until
// lunchtime the next day. The reserve turns that outage into a bill instead.
// Paid keys are deliberately left out of the round-robin cursor — they are a
// fallback, not a share of normal load.
//
// Which keys exist comes from gemini-keys.ts (.env plus the admin page), so the
// list can change while the app runs. Cooldowns are therefore keyed by each
// key's fingerprint, not its position: adding, removing or switching off a key
// never moves a cooldown onto a different key.
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
import { logger } from '../logger.js';
import { cachedGeminiKeys, loadGeminiKeys, type GeminiKey, type KeyTier } from './gemini-keys.js';

export type { KeyTier } from './gemini-keys.js';

const REDIS_CALL_TIMEOUT_MS = 250;
const CURSOR_KEY = 'gemini:pool:cursor';

function cooldownKey(fingerprint: string): string {
  return `gemini:pool:cooldown:${fingerprint.slice(0, 16)}`;
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
const localCooldowns = new Map<string, number>(); // fingerprint -> cooldown-expiry epoch ms

function isLocallyCoolingDown(fingerprint: string): boolean {
  const expiresAt = localCooldowns.get(fingerprint);
  return expiresAt !== undefined && expiresAt > Date.now();
}

/**
 * The switched-on keys in pool order: every free key, then every paid key by
 * its paid rank (ties keep list order). Indices are flat and contiguous across
 * both tiers: 0..freeCount()-1 are free, the rest paid.
 */
function poolOrder(keys: GeminiKey[]): GeminiKey[] {
  const on = keys.filter((key) => key.enabled);
  const free = on.filter((key) => key.tier === 'free');
  const paid = on
    .map((key, position) => ({ key, position }))
    .filter(({ key }) => key.tier === 'paid')
    .sort((a, b) => a.key.paidRank - b.key.paidRank || a.position - b.position)
    .map(({ key }) => key);
  return [...free, ...paid];
}

// The order the last pick used. An index a caller got from pickKey() is read
// against this, so markRateLimited(index) cools the key that was handed out.
// It only changes when the key list itself changes (an admin edit). Filled on
// first use, not at import, so loading this module never reads the env.
let active: GeminiKey[] | null = null;

function currentKeys(): GeminiKey[] {
  active ??= poolOrder(cachedGeminiKeys());
  return active;
}

async function refreshActive(): Promise<GeminiKey[]> {
  active = poolOrder(await loadGeminiKeys());
  return active;
}

function freeCount(): number {
  return currentKeys().filter((key) => key.tier === 'free').length;
}

/** Switched-on keys, both tiers, as of the last pick. */
export function poolSize(): number {
  return currentKeys().length;
}

/** Which tier a flat pool index belongs to. Used for billing telemetry and alerting. */
export function tierAt(index: number): KeyTier {
  return currentKeys()[index]?.tier ?? 'free';
}

/** Admin-facing name of the paid key at a flat pool index, or null for a free key. */
export function paidKeyNameAt(index: number): string | null {
  const key = currentKeys()[index];
  return key?.tier === 'paid' ? key.name : null;
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

/** Whether a key (by fingerprint) is cooling down after a 429. Also read by Admin -> Gemini Keys. */
export async function isCoolingDown(fingerprint: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const value = await withTimeout(redis.get(cooldownKey(fingerprint)), REDIS_CALL_TIMEOUT_MS);
    return value !== null;
  } catch (err) {
    logger.warn(
      { err },
      'gemini-key-pool: Redis error checking cooldown, using local fallback state',
    );
    return isLocallyCoolingDown(fingerprint);
  }
}

/**
 * Scan the half-open index range [start, end) of `keys` for the first
 * non-excluded, non-cooling-down key.
 *
 * `rotate` decides whether the shared round-robin cursor is consulted. It is
 * true for the free tier (spread load evenly) and false for the paid reserve
 * (it is a fallback, tried in the admin's order). A single-key range likewise
 * skips the INCR — 0 % 1 is always 0, so the cursor cannot change the outcome.
 */
async function scanRange(
  keys: GeminiKey[],
  start: number,
  end: number,
  excluded: Set<number>,
  rotate: boolean,
): Promise<{ index: number; key: string; tier: KeyTier } | null> {
  const size = end - start;
  if (size <= 0) return null;

  const offset = rotate && size > 1 ? await nextCursorValue() : 0;

  for (let i = 0; i < size; i++) {
    const index = start + ((offset + i) % size);
    if (excluded.has(index)) continue;
    const entry = keys[index];
    if (entry === undefined) continue; // index < end, so unreachable in practice
    if (await isCoolingDown(entry.fingerprint)) continue;
    return { index, key: entry.key, tier: entry.tier };
  }
  return null;
}

/**
 * Return the next usable key, preferring the free tier. `exclude` is per-call
 * (typically "keys already tried this attempt"), not persistent — persistent
 * exclusion is what the Redis cooldown is for.
 *
 * Free keys are handed out round-robin. The paid reserve is only reached once
 * every free key is excluded or cooling down, so a normal day never touches it
 * and never bills anything. Paid keys are tried in their admin-set order.
 *
 * `preferPaid` inverts that order for one call: the caller has already burned
 * its free-tier attempts and this is the last try before the request fails the
 * user, so a bill beats an error. It only REORDERS — with no paid key
 * configured (or one that is cooling down) it falls through to the normal
 * free-first scan, so a deployment without a reserve behaves exactly as before
 * rather than failing a request the free pool could still have served.
 *
 * Returns `null` only when every index in BOTH tiers is excluded or cooling
 * down — i.e. the whole pool, reserve included, is currently exhausted.
 */
export async function pickKey(
  exclude?: Set<number>,
  preferPaid = false,
): Promise<{ index: number; key: string; tier: KeyTier } | null> {
  const keys = await refreshActive();
  const total = keys.length;
  if (total === 0) return null;

  const excluded = exclude ?? new Set<number>();
  const free = freeCount();

  if (preferPaid) {
    const reserve = await scanRange(keys, free, total, excluded, false);
    if (reserve) return reserve;
  }

  const fromFree = await scanRange(keys, 0, free, excluded, true);
  if (fromFree) return fromFree;

  return scanRange(keys, free, total, excluded, false);
}

/** Mark index as rate-limited for `cooldownMs`, excluding it from pickKey() until it clears. */
export async function markRateLimited(index: number, cooldownMs: number): Promise<void> {
  const fingerprint = currentKeys()[index]?.fingerprint;
  if (fingerprint === undefined) return;
  // Recorded locally first (and unconditionally) so that if Redis becomes
  // unreachable later in this same process, the fallback path still knows
  // about a cooldown this process itself just observed.
  localCooldowns.set(fingerprint, Date.now() + cooldownMs);
  try {
    const redis = getRedis();
    await withTimeout(
      redis.set(cooldownKey(fingerprint), '1', 'PX', cooldownMs),
      REDIS_CALL_TIMEOUT_MS,
    );
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
  const keys = currentKeys();
  if (keys.length === 0) return Date.now();

  let minRemainingMs: number | null = null;

  for (const { fingerprint } of keys) {
    let ttlMs: number;
    try {
      const redis = getRedis();
      ttlMs = await withTimeout(redis.pttl(cooldownKey(fingerprint)), REDIS_CALL_TIMEOUT_MS);
    } catch (err) {
      logger.warn(
        { err },
        'gemini-key-pool: Redis error reading cooldown TTL, using local fallback state',
      );
      const localExpiry = localCooldowns.get(fingerprint);
      ttlMs = localExpiry !== undefined ? Math.max(0, localExpiry - Date.now()) : -2;
    }

    // ioredis PTTL: -2 = key doesn't exist, -1 = exists with no TTL. Either
    // way this key isn't cooling down, so at least one key is free right now.
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
  active = null;
}
