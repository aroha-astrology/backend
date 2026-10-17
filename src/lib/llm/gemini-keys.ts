// =============================================================================
// Gemini keys — what the key pool may use, from .env plus Admin -> Gemini Keys
// =============================================================================
// .env gives the starting set: GEMINI_API_KEYS (free, named free-1, free-2...),
// GEMINI_PAID_API_KEYS (paid, "subir1719") and GEMINI_PAID_API_KEY2 (paid,
// "subir2", tried first). The gemini_keys table layers the admin's changes on
// top: a row matching a .env key by fingerprint renames it, moves it between
// tiers, switches it off or changes its paid order; an 'admin' row is a key
// pasted on the admin page, whose secret is stored encrypted.
//
// Read on every key pick, so it is cached per process for CACHE_TTL_MS: an
// admin change is live at once on the worker that saved it and within that
// window on the other pm2 workers. A DB failure falls back to the .env keys
// alone, so a database hiccup can never leave the app without a key.

import { createHash } from 'node:crypto';
import { GEMINI_KEY_POOL, GEMINI_PAID_KEY_POOL, GEMINI_PAID_KEY2 } from '../../config/env.js';
import type { GeminiKeyRow } from '../../db/schema.js';
import { listGeminiKeyRows } from '../../modules/admin/gemini-keys.repo.js';
import { decryptField } from '../crypto/field-encryption.js';
import { logger } from '../logger.js';

export type KeyTier = 'free' | 'paid';

export interface GeminiKey {
  /** sha256 hex of the key. Identifies it in cooldowns and in the table. */
  fingerprint: string;
  name: string;
  tier: KeyTier;
  key: string;
  enabled: boolean;
  /** Order among paid keys, lowest first. */
  paidRank: number;
  source: 'env' | 'admin';
}

const CACHE_TTL_MS = 30_000;
/** A failed read is retried after this, not on every pick while the DB is down. */
const FAILURE_RETRY_MS = 5_000;

export function fingerprintOf(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/** The keys .env provides, with their default names, tiers and paid order. */
export function envGeminiKeys(): GeminiKey[] {
  const entry = (key: string, name: string, tier: KeyTier, paidRank: number): GeminiKey => ({
    fingerprint: fingerprintOf(key),
    name,
    tier,
    key,
    enabled: true,
    paidRank,
    source: 'env',
  });
  return [
    ...GEMINI_KEY_POOL.map((key, i) => entry(key, `free-${i + 1}`, 'free', 100)),
    // subir2 is ranked 0 so it is the first paid key until the admin says otherwise.
    ...(GEMINI_PAID_KEY2 ? [entry(GEMINI_PAID_KEY2, 'subir2', 'paid', 0)] : []),
    ...GEMINI_PAID_KEY_POOL.map((key, i) =>
      entry(key, i === 0 ? 'subir1719' : `subir1719-${i + 1}`, 'paid', 1 + i),
    ),
  ];
}

function asTier(value: string): KeyTier {
  return value === 'paid' ? 'paid' : 'free';
}

/** .env keys with their table rows applied, then the pasted keys, in table order. */
export function mergeGeminiKeys(envKeys: GeminiKey[], rows: GeminiKeyRow[]): GeminiKey[] {
  const byFingerprint = new Map(rows.map((row) => [row.fingerprint, row]));
  const merged = envKeys.map((key) => {
    const row = byFingerprint.get(key.fingerprint);
    if (!row) return key;
    return {
      ...key,
      name: row.name,
      tier: asTier(row.tier),
      enabled: row.enabled,
      paidRank: row.paidRank,
    };
  });
  const seen = new Set(envKeys.map((key) => key.fingerprint));
  for (const row of rows) {
    if (row.source !== 'admin' || seen.has(row.fingerprint)) continue;
    let secret: string | null = null;
    try {
      secret = decryptField(row.secret);
    } catch (err) {
      logger.error(
        { err, name: row.name },
        'gemini-keys: could not decrypt a stored key, skipping it',
      );
    }
    if (!secret) continue;
    seen.add(row.fingerprint);
    merged.push({
      fingerprint: row.fingerprint,
      name: row.name,
      tier: asTier(row.tier),
      key: secret,
      enabled: row.enabled,
      paidRank: row.paidRank,
      source: 'admin',
    });
  }
  return merged;
}

let cache: { keys: GeminiKey[]; expiresAt: number } | null = null;

/** Every key, switched-off ones included. Cached; never throws. */
export async function loadGeminiKeys(): Promise<GeminiKey[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.keys;
  try {
    const keys = mergeGeminiKeys(envGeminiKeys(), await listGeminiKeyRows());
    cache = { keys, expiresAt: Date.now() + CACHE_TTL_MS };
    return keys;
  } catch (err) {
    logger.error({ err }, 'gemini-keys: could not read gemini_keys, using the .env keys only');
    const keys = envGeminiKeys();
    cache = { keys, expiresAt: Date.now() + FAILURE_RETRY_MS };
    return keys;
  }
}

/** The last loaded list, without waiting on the DB (the .env keys before the first load). */
export function cachedGeminiKeys(): GeminiKey[] {
  return cache?.keys ?? envGeminiKeys();
}

/** Called after an admin change, so this worker uses it on the very next pick. */
export function invalidateGeminiKeys(): void {
  cache = null;
}
