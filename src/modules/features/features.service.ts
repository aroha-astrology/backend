import { FEATURE_REGISTRY } from '../../config/features.js';
import { logger } from '../../lib/logger.js';
import { findAllFeatureOverrides } from './features.repo.js';

export interface ResolvedFeature {
  enabled: boolean;
  pricePaise: number | null;
}

/** This is on the hot path of GET /v1/me — 30s is enough to spare the DB a
 * query per request while still making an admin toggle feel near-live. */
const CACHE_TTL_MS = 30_000;

interface FeatureCache {
  value: Record<string, ResolvedFeature>;
  expiresAt: number;
}

let cache: FeatureCache | null = null;

function registryDefaults(): Record<string, ResolvedFeature> {
  const out: Record<string, ResolvedFeature> = {};
  for (const feature of FEATURE_REGISTRY) {
    out[feature.key] = {
      enabled: feature.defaultEnabled,
      pricePaise: feature.defaultPricePaise ?? null,
    };
  }
  return out;
}

/**
 * Resolves the effective (enabled, price) for every feature in the registry,
 * merging in any admin-set `feature_flags` DB override (DB row wins). Cached
 * in-process for `CACHE_TTL_MS` since this is read on every `/v1/me` call.
 *
 * Must never throw — a DB error here would take down auth/session responses
 * for every user, so any failure falls back to the registry defaults and is
 * logged instead. A failure is deliberately NOT cached, so the very next call
 * retries rather than pinning every user to defaults for the rest of the TTL.
 */
export async function resolveFeatures(): Promise<Record<string, ResolvedFeature>> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.value;
  }

  const merged = registryDefaults();
  try {
    const overrides = await findAllFeatureOverrides();
    for (const row of overrides) {
      merged[row.key] = { enabled: row.enabled, pricePaise: row.pricePaise };
    }
    cache = { value: merged, expiresAt: Date.now() + CACHE_TTL_MS };
    return merged;
  } catch (err) {
    logger.error({ err }, 'resolveFeatures: DB lookup failed, falling back to registry defaults');
    return merged;
  }
}

/** Invalidates the in-process cache so the next resolveFeatures() call re-reads the DB.
 * Called by the (future, not-yet-built) admin PUT endpoint after writing an override. */
export function invalidateFeatureCache(): void {
  cache = null;
}
