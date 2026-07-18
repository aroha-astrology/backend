import type { UserRow } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
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
 *   deleted, or simply doesn't belong to this user — falls back to the
 *   primary profile rather than throwing, since a dangling/stale pointer
 *   shouldn't break every request; a warning is logged when this happens.
 *
 * Most callers want {@link resolveActiveProfileContext} instead, which reads
 * `activeProfileId` off `user` itself.
 */
export async function resolveProfileContext(
  user: UserRow,
  activeProfileId: string | null,
): Promise<ProfileContext> {
  if (activeProfileId === null) {
    return primaryProfileContext(user);
  }

  const profile = await findOwnedBirthProfile(activeProfileId, user.id);
  if (!profile) {
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
