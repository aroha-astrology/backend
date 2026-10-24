import { FEATURE_REGISTRY, offeredModel, type FeatureAudience } from '../../config/features.js';
import { logger } from '../../lib/logger.js';
import { findAllFeatureOverrides, findUserIsIndian, findUserSkin } from './features.repo.js';
import {
  listGroupIdsForUser,
  listAllGroupFeatureOverrides,
  type AllGroupFeatureOverride,
} from '../user-groups/user-groups.repo.js';

export interface ResolvedFeature {
  enabled: boolean;
  pricePaise: number | null;
  /** Optional "strikethrough" MRP for the discount treatment on the report
   * catalogue. Only ever comes from an admin-set `feature_flags` override —
   * the registry has no structural default for it, so a key with no override
   * row always resolves this to null (no discount to show). */
  originalPricePaise: number | null;
  /** Admin-selected model for an AI feature, already resolved: null whenever the caller should
   * use the global default model — either because the key declares no `modelOptions`, or
   * because its toggle is off (the kill switch). See `modelOf()`. */
  model: string | null;
  /** Which section the feature is for ('all', 'classic' or 'cosmic'). Already folded into `enabled` by
   * `resolveFeaturesForUser`; the global resolution reports it so the admin board can show it.
   * Optional so a hand-built row (tests, older callers) reads as 'all'. */
  audience?: FeatureAudience;
  /** When this key was last flipped false->true by an admin — see schema.ts's featureFlags.enabledAt
   * doc comment. Null for a key still on its registry default (never explicitly enabled). */
  enabledAt: Date | null;
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
      originalPricePaise: feature.defaultOriginalPricePaise ?? null,
      model: feature.defaultEnabled ? (feature.defaultModel ?? null) : null,
      audience: feature.defaultAudience ?? 'all',
      enabledAt: null,
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
      const def = FEATURE_REGISTRY.find((f) => f.key === row.key);
      // A leftover row for a key since removed from the registry (e.g. home.askAroha) is ignored.
      if (!def) continue;
      merged[row.key] = {
        enabled: row.enabled,
        pricePaise: row.pricePaise,
        originalPricePaise: row.originalPricePaise,
        // A disabled model key resolves to null = "use the global default model", so switching
        // the toggle off is a one-click revert that doesn't require remembering which model
        // was the default. See FeatureDef.modelOptions.
        model: row.enabled ? offeredModel(row.key, row.model ?? def.defaultModel ?? null) : null,
        audience: row.audience ?? def.defaultAudience ?? 'all',
        enabledAt: row.enabledAt,
      };
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

/**
 * The admin-set price for one feature, in paise — the single way any charge
 * site should learn what to debit.
 *
 * Every paid feature MUST resolve its amount through here rather than holding
 * its own constant. Four features previously did the latter and silently
 * ignored the admin panel for weeks: the UI reads `useFeature(key).pricePaise`
 * while the backend debited a hardcoded number, so users were shown one price
 * and charged another (house insight billed ₹50 against an admin price of ₹25).
 * `fallback` is only for the fail-open case where the key has no resolved
 * price at all — it is not a second source of truth.
 *
 * Resolve ONCE per request and reuse the same value for the charge and any
 * refund (see chatRoute in astro.routes.ts), so a mid-flight admin price
 * change can never make a refund mismatch what was actually taken.
 */
export async function priceOf(userId: string, key: string, fallback: number): Promise<number> {
  const features = await resolveFeaturesForUser(userId);
  return features[key]?.pricePaise ?? fallback;
}

/**
 * The admin-selected model for one AI feature — the single way any Gemini call site should
 * learn which model to use, exactly as `priceOf` is for money. Falls back to `fallback`
 * (normally `env.GEMINI_MODEL`) whenever no model is configured OR the key's toggle is off,
 * so an admin can always put a feature back on the default model with one click.
 *
 * Global (not per-user): a model is an operational/cost decision, not something a user group
 * should be able to change, so this reads `resolveFeatures()` rather than the group-aware
 * resolver — the same reason group overrides never touch price.
 */
export async function modelOf(key: string, fallback: string): Promise<string> {
  const features = await resolveFeatures();
  return features[key]?.model ?? fallback;
}

/**
 * Like `modelOf`, but honours a GROUP override on top of the global choice —
 * the per-user counterpart `resolveFeaturesForUser` is to `resolveFeatures`.
 * A group's model only applies while that group's row is enabled for this
 * key (same kill-switch semantics as the global row); a user in no group, or
 * in only groups with no override for this key, falls back to `modelOf`'s
 * global resolution. Callers with no natural per-user context (a detached
 * background job with no `userId` at all) should keep calling `modelOf`
 * directly rather than pass a null/placeholder id here.
 */
export async function modelForUser(userId: string, key: string, fallback: string): Promise<string> {
  const features = await resolveFeaturesForUser(userId);
  return features[key]?.model ?? fallback;
}

/**
 * Like `priceOf`, but honours the feature's enabled flag: a disabled key pays
 * nothing. Used for the referral/reward amounts, where switching the toggle off
 * in the admin panel should stop that side of the payout rather than merely
 * hide a button.
 */
export async function payoutOf(userId: string, key: string, fallback: number): Promise<number> {
  const features = await resolveFeaturesForUser(userId);
  const resolved = features[key];
  if (resolved && !resolved.enabled) return 0;
  return resolved?.pricePaise ?? fallback;
}

/**
 * Is a new (ship-dark) switch ON for this user? Fails CLOSED: an unknown key, or one with no
 * resolved row, counts as off — the opposite of `requireFeature`, because every v7 switch must
 * do nothing until the owner turns it on (for everyone, or for an admin user group to try it).
 */
export async function isFeatureOn(userId: string, key: string): Promise<boolean> {
  const features = await resolveFeaturesForUser(userId);
  return features[key]?.enabled === true;
}

/** `isFeatureOn` for callers with no user yet (account creation): the global switch only. */
export async function isFeatureOnGlobally(key: string): Promise<boolean> {
  const features = await resolveFeatures();
  return features[key]?.enabled === true;
}

/**
 * `payoutOf` for callers with no user yet — account creation, and the
 * signed-out sign-in screen. Same disabled-pays-nothing rule, but resolved
 * globally: a not-yet-created account belongs to no group.
 */
export async function globalPayoutOf(key: string, fallback: number): Promise<number> {
  const features = await resolveFeatures();
  const resolved = features[key];
  if (resolved && !resolved.enabled) return 0;
  return resolved?.pricePaise ?? fallback;
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
 * enabled/disabled, never reprice — so `pricePaise` and `originalPricePaise`
 * always come straight from the base (global) resolution.
 *
 * Must never throw — same fail-safe-to-base-result discipline as
 * `resolveFeatures()`: a group-lookup or group-override DB error degrades to
 * the global result rather than blanking the user's flags entirely.
 */
async function resolveWithGroups(
  userId: string,
): Promise<{ features: Record<string, ResolvedFeature>; groupEnabled: ReadonlySet<string> }> {
  const base = await resolveFeatures();

  let groupIds: string[];
  let overrides: AllGroupFeatureOverride[];
  try {
    groupIds = await listGroupIdsForUser(userId);
    if (groupIds.length === 0) return { features: base, groupEnabled: NO_KEYS };
    overrides = await cachedGroupOverrides();
  } catch (err) {
    logger.error(
      { err, userId },
      'resolveFeaturesForUser: group lookup failed, falling back to base result',
    );
    return { features: base, groupEnabled: NO_KEYS };
  }

  const memberGroupIds = new Set(groupIds);
  const disabledKeys = new Set<string>();
  const enabledKeys = new Set<string>();
  // A group's `model` only matters for a key it also enables (an override
  // that's off falls back to the global model like everything else about a
  // disabled key). If the user is in more than one group that both enable
  // the same key with DIFFERENT models set, last-row-wins — an edge case
  // rare enough (multi-group membership with conflicting model picks for the
  // same key) not to warrant its own precedence rule on top of the existing
  // disabled-beats-enabled one.
  const enabledModelByKey = new Map<string, string | null>();
  for (const row of overrides) {
    if (!memberGroupIds.has(row.groupId)) continue;
    if (row.enabled) {
      enabledKeys.add(row.featureKey);
      enabledModelByKey.set(row.featureKey, offeredModel(row.featureKey, row.model));
    } else {
      disabledKeys.add(row.featureKey);
    }
  }

  if (disabledKeys.size === 0 && enabledKeys.size === 0) return { features: base, groupEnabled: NO_KEYS };

  const merged: Record<string, ResolvedFeature> = {};
  for (const [key, value] of Object.entries(base)) {
    if (disabledKeys.has(key)) {
      // Disabled wins over any other group saying "on", and over the global flag.
      merged[key] = {
        enabled: false,
        pricePaise: value.pricePaise,
        originalPricePaise: value.originalPricePaise,
        model: value.model,
        audience: value.audience,
        enabledAt: value.enabledAt,
      };
    } else if (enabledKeys.has(key)) {
      merged[key] = {
        enabled: true,
        pricePaise: value.pricePaise,
        originalPricePaise: value.originalPricePaise,
        // A null group model means "this group has no override" (inherit
        // the global model), not "force null" — same convention `modelOf`
        // already uses for the global row.
        model: enabledModelByKey.get(key) ?? value.model,
        audience: value.audience,
        enabledAt: value.enabledAt,
      };
    } else {
      merged[key] = value;
    }
  }
  return { features: merged, groupEnabled: enabledKeys };
}

const NO_KEYS: ReadonlySet<string> = new Set();

/** How long a user's picked look is remembered in-process; same order as the feature cache. */
const EXPERIENCE_TTL_MS = 30_000;
const experienceCache = new Map<string, { audience: 'classic' | 'cosmic'; expiresAt: number }>();

/** The section a user is in: 'cosmic' once they pick the international look, else 'classic' (also while unpicked). */
async function experienceOf(userId: string): Promise<'classic' | 'cosmic'> {
  const hit = experienceCache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.audience;
  const skin = await findUserSkin(userId);
  const audience = skin === 'MODERN_COSMIC' ? 'cosmic' : 'classic';
  experienceCache.set(userId, { audience, expiresAt: Date.now() + EXPERIENCE_TTL_MS });
  return audience;
}

const EXPERIENCE_PICKER_KEY = 'experience.picker';
const indianCache = new Map<string, { indian: boolean; expiresAt: number }>();

/** Whether the account looks Indian and has not picked a look (see findUserIsIndian). Cached like the look. */
async function indianSignalOf(userId: string): Promise<boolean> {
  const hit = indianCache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.indian;
  const indian = await findUserIsIndian(userId);
  indianCache.set(userId, { indian, expiresAt: Date.now() + EXPERIENCE_TTL_MS });
  return indian;
}

/** Forget a user's remembered look, so a change of experience shows at once. */
export function invalidateExperienceCache(userId: string): void {
  experienceCache.delete(userId);
  indianCache.delete(userId);
}

/**
 * The feature map for one user: `resolveWithGroups` above, then the audience filter. A feature
 * whose audience is 'classic' or 'cosmic' is switched off for a user in the other section, even
 * if its toggle is on. Two things skip the filter: an audience of 'all' (the common case, which
 * costs nothing: no extra lookup happens until some enabled feature has a narrower audience),
 * and a feature switched on for one of the user's admin groups, so the owner can try an
 * international feature from a classic-look test account.
 *
 * Must never throw: if the user's look cannot be read, the filter is skipped and the result is
 * the group-resolved map, the same fail-safe discipline as the rest of this file.
 */
export async function resolveFeaturesForUser(
  userId: string,
): Promise<Record<string, ResolvedFeature>> {
  const resolved = await resolveWithGroups(userId);
  const { groupEnabled } = resolved;
  let features = resolved.features;

  // The "choose your look" picker is for readers who are not Indian by their account (Indian phone
  // sign-in or an Indian app language). They keep today's app and are never asked. A feature
  // switched on for one of the user's admin groups skips this, so the owner can try it anywhere.
  const picker = features[EXPERIENCE_PICKER_KEY];
  if (picker?.enabled && !groupEnabled.has(EXPERIENCE_PICKER_KEY)) {
    try {
      if (await indianSignalOf(userId)) features = { ...features, [EXPERIENCE_PICKER_KEY]: { ...picker, enabled: false } };
    } catch (err) {
      logger.error({ err, userId }, 'resolveFeaturesForUser: Indian-account lookup failed, picker left as is');
    }
  }

  const narrowed = Object.entries(features).filter(
    ([key, f]) => f.enabled && (f.audience ?? 'all') !== 'all' && !groupEnabled.has(key),
  );
  if (narrowed.length === 0) return features;

  let experience: 'classic' | 'cosmic';
  try {
    experience = await experienceOf(userId);
  } catch (err) {
    logger.error({ err, userId }, 'resolveFeaturesForUser: audience lookup failed, filter skipped');
    return features;
  }

  const out = { ...features };
  for (const [key, f] of narrowed) {
    if (f.audience !== experience) out[key] = { ...f, enabled: false, model: null };
  }
  return out;
}
