import type { UserRow } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
import { Errors } from '../../lib/errors.js';
import { findOwnedBirthProfile } from './birth-profiles.repo.js';

/**
 * The resolved "who are we reading/writing chart data for right now" bundle —
 * either the primary/self profile (the `users` row itself) or one of the
 * user's additional `birth_profiles`. Every feature service (kundli,
 * horoscope, house-insight, gemstone, chat, vastu) should read birth data
 * through this instead of reaching into `users`/`birth_profiles` columns
 * directly, so primary vs. additional profiles behave identically.
 *
 * `birth_profiles` has no `birthDetailsEditedAt`/`canEditBirthDetails` —
 * those are primary-only concepts (the one-time self birth-detail edit) and
 * intentionally have no equivalent here.
 *
 * Internal service-to-service bundle only — NOT a route-response DTO (unlike
 * this repo's `toBirthProfileDto` convention, e.g. dates here are `Date`
 * objects, not `.toISOString()`'d strings). Don't return this directly from
 * a route handler.
 */
export interface ProfileContext {
  /** null = primary profile (the users row itself). */
  birthProfileId: string | null;
  displayName: UserRow['displayName'];
  gender: UserRow['gender'];
  dateOfBirth: UserRow['dateOfBirth'];
  timeOfBirth: UserRow['timeOfBirth'];
  placeOfBirth: UserRow['placeOfBirth'];
  birthTimeAccuracy: UserRow['birthTimeAccuracy'];
  birthTimeSource: UserRow['birthTimeSource'];
  birthLocationAccuracy: UserRow['birthLocationAccuracy'];
  /** Normalized to `[]` (never null) — callers do array membership checks. */
  unlockedHouses: number[];
  gemstoneUnlockedAt: Date | null;
  gemstoneWeightKg: number | null;
}

function primaryProfileContext(user: UserRow): ProfileContext {
  return {
    birthProfileId: null,
    displayName: user.displayName,
    gender: user.gender,
    dateOfBirth: user.dateOfBirth,
    timeOfBirth: user.timeOfBirth,
    placeOfBirth: user.placeOfBirth,
    birthTimeAccuracy: user.birthTimeAccuracy,
    birthTimeSource: user.birthTimeSource,
    birthLocationAccuracy: user.birthLocationAccuracy,
    unlockedHouses: user.unlockedHouses ?? [],
    gemstoneUnlockedAt: user.gemstoneUnlockedAt,
    gemstoneWeightKg: user.gemstoneWeightKg,
  };
}

/**
 * Resolves the birth data / display identity / unlock-state that should be
 * used right now for `user`, for the profile identified by `activeProfileId`.
 *
 * - `activeProfileId === null` → the primary profile, built directly from
 *   `user`'s own columns. No DB call.
 * - `activeProfileId` set → looks up that `birth_profiles` row (owner-scoped,
 *   excludes soft-deleted, via `findOwnedBirthProfile`). If it's missing —
 *   deleted, or simply doesn't belong to this user — the default (lenient)
 *   behavior falls back to the primary profile rather than throwing, since
 *   this is normally the user's own dangling/stale `activeProfileId`
 *   pointer, and a stale pointer shouldn't break every request; a warning is
 *   logged when this happens.
 *
 * Pass `{ strict: true }` when `activeProfileId` is a value from the CURRENT
 * request (a client-supplied `body.birthProfileId`/`query.birthProfileId`),
 * as opposed to `user.activeProfileId` or an id re-threaded from a row this
 * server already resolved earlier. In strict mode a non-owned/deleted id
 * throws 404 instead of silently substituting the primary profile — a client
 * passing another user's id should see an error, not their own data back
 * with no explanation. Audited at introduction: only `purchaseReport` and
 * `previewReport` (reports.service.ts) pass a fresh per-request id here;
 * every other caller re-threads an already-resolved or DB-internal id and
 * correctly keeps the lenient default.
 *
 * Most callers want {@link resolveActiveProfileContext} instead, which reads
 * `activeProfileId` off `user` itself (always lenient — never client-supplied
 * per-request).
 */
export async function resolveProfileContext(
  user: UserRow,
  activeProfileId: string | null,
  options?: { strict?: boolean },
): Promise<ProfileContext> {
  if (activeProfileId === null) {
    return primaryProfileContext(user);
  }

  const profile = await findOwnedBirthProfile(activeProfileId, user.id);
  if (!profile) {
    if (options?.strict) {
      throw Errors.notFound('Profile not found');
    }
    logger.warn(
      { userId: user.id, activeProfileId },
      'resolveProfileContext: active profile not found (deleted or not owned) — falling back to primary profile',
    );
    return primaryProfileContext(user);
  }

  return {
    birthProfileId: profile.id,
    displayName: profile.displayName,
    gender: profile.gender,
    dateOfBirth: profile.dateOfBirth,
    timeOfBirth: profile.timeOfBirth,
    placeOfBirth: profile.placeOfBirth,
    birthTimeAccuracy: profile.birthTimeAccuracy,
    birthTimeSource: profile.birthTimeSource,
    birthLocationAccuracy: profile.birthLocationAccuracy,
    unlockedHouses: profile.unlockedHouses ?? [],
    gemstoneUnlockedAt: profile.gemstoneUnlockedAt,
    gemstoneWeightKg: profile.gemstoneWeightKg,
  };
}

/**
 * Convenience wrapper for the common case: resolve whatever profile is
 * currently active for this user (`user.activeProfileId`). Use the
 * two-argument {@link resolveProfileContext} directly when the profile to
 * resolve isn't necessarily the active one (e.g. comparing against a specific
 * other profile for matchmaking/chat).
 */
export async function resolveActiveProfileContext(user: UserRow): Promise<ProfileContext> {
  return resolveProfileContext(user, user.activeProfileId);
}
