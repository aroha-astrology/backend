import { FEATURE_REGISTRY } from '../../config/features.js';
import { logger } from '../../lib/logger.js';
import { findAllFeatureOverrides } from './features.repo.js';
import {
  listGroupIdsForUser,
  listAllGroupFeatureOverrides,
  type AllGroupFeatureOverride,
} from '../user-groups/user-groups.repo.js';

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

/* -------------------------------------------------------------------------- */
/* Per-user (group-aware) resolution                                          */
/* -------------------------------------------------------------------------- */

interface GroupOverrideCache {
  value: AllGroupFeatureOverride[];
  expiresAt: number;
}

/**
 * Every group's feature overrides, across every group at once — a small,
 * admin-configured, rarely-changing dataset, so it's fine to cache globally
 * (not per-user) with the same TTL/fail-open shape as `resolveFeatures()`'s
 * own cache above. Kept as a SEPARATE cache (not merged into `cache`) since
 * the two have independent invalidation triggers (a global feature-flag write
 * vs. a group-override write).
 */
let groupOverrideCache: GroupOverrideCache | null = null;

async function cachedGroupOverrides(): Promise<AllGroupFeatureOverride[]> {
  const now = Date.now();
  if (groupOverrideCache && groupOverrideCache.expiresAt > now) {
    return groupOverrideCache.value;
  }
  const rows = await listAllGroupFeatureOverrides();
  groupOverrideCache = { value: rows, expiresAt: Date.now() + CACHE_TTL_MS };
  return rows;
}

/** Invalidates the group-override cache. Called by the admin PUT/DELETE group-feature endpoints after writing. */
export function invalidateGroupOverrideCache(): void {
  groupOverrideCache = null;
}

/**
 * Per-user feature resolution: registry defaults, overridden by the global
 * `feature_flags` table (via `resolveFeatures()`), further overridden by any
 * group the user belongs to — and if the user is in multiple groups with
 * conflicting overrides for the same key, DISABLED WINS (any group saying
 * "off" makes it off, regardless of other groups or the global flag saying
 * "on"). This is the function `/v1/me` and `requireFeature` must use —
 * `resolveFeatures()` (unchanged, still exported) stays for the admin
 * Features board, which shows the global baseline before any group narrows
 * it further.
 *
 * Price is NEVER touched by a group override — a group can only flip
 * enabled/disabled, never reprice — so `pricePaise` always comes straight
 * from the base (global) resolution.
 *
 * Must never throw — same fail-safe-to-base-result discipline as
 * `resolveFeatures()`: a group-lookup or group-override DB error degrades to
 * the global result rather than blanking the user's flags entirely.
 */
export async function resolveFeaturesForUser(
  userId: string,
): Promise<Record<string, ResolvedFeature>> {
  const base = await resolveFeatures();

  let groupIds: string[];
  let overrides: AllGroupFeatureOverride[];
  try {
    groupIds = await listGroupIdsForUser(userId);
    if (groupIds.length === 0) return base;
    overrides = await cachedGroupOverrides();
  } catch (err) {
    logger.error(
      { err, userId },
      'resolveFeaturesForUser: group lookup failed, falling back to base result',
    );
    return base;
  }

  const memberGroupIds = new Set(groupIds);
  const disabledKeys = new Set<string>();
  const enabledKeys = new Set<string>();
  for (const row of overrides) {
    if (!memberGroupIds.has(row.groupId)) continue;
    if (row.enabled) {
      enabledKeys.add(row.featureKey);
    } else {
      disabledKeys.add(row.featureKey);
    }
  }

  if (disabledKeys.size === 0 && enabledKeys.size === 0) return base;

  const merged: Record<string, ResolvedFeature> = {};
  for (const [key, value] of Object.entries(base)) {
    if (disabledKeys.has(key)) {
      // Disabled wins over any other group saying "on", and over the global flag.
      merged[key] = { enabled: false, pricePaise: value.pricePaise };
    } else if (enabledKeys.has(key)) {
      merged[key] = { enabled: true, pricePaise: value.pricePaise };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}
