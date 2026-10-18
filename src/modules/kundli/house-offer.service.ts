import type { UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import {
  unlockAllHousesForOwnedProfile,
  unlockHouseForOwnedProfile,
} from '../birth-profiles/birth-profiles.repo.js';
import type { ProfileContext } from '../birth-profiles/profile-context.js';
import { isFeatureOn } from '../features/features.service.js';
import { unlockAllHousesForUser, unlockHouseForUser } from '../users/users.repo.js';
import { getHouseOffer, loadFreeHouses } from './house-offer.js';

/**
 * Unlocking houses while the v7 offer (`money.houseOffer`) is on: free houses cost nothing, any
 * other house costs `money.houseSingle`, and the bundle unlocks everything left. Every function
 * here is for the ACTIVE profile and resolves the price once, here, so what the app quoted and
 * what is charged cannot drift (same rule as users.service.ts `unlockHouse`).
 */

async function unlockOne(
  user: UserRow,
  profile: ProfileContext,
  house: number,
  pricePaise: number,
): Promise<boolean> {
  return profile.birthProfileId === null
    ? unlockHouseForUser(user.id, house, pricePaise)
    : unlockHouseForOwnedProfile(profile.birthProfileId, user.id, house, pricePaise);
}

/** Unlocks one house under the offer. Throws 409 when it is already unlocked or the balance is short. */
export async function unlockHouseWithOffer(
  user: UserRow,
  profile: ProfileContext,
  house: number,
): Promise<void> {
  if (profile.unlockedHouses.includes(house)) {
    throw Errors.conflict('Insufficient credits or house already unlocked');
  }
  const offer = await getHouseOffer(user, profile);
  const pricePaise = offer.freeHouses.includes(house) ? 0 : offer.singlePaise;
  if (!(await unlockOne(user, profile, house, pricePaise))) {
    throw Errors.conflict('Insufficient credits or house already unlocked');
  }
}

/** Unlocks every house still locked for the bundle price. Throws 403 while the offer is off. */
export async function unlockAllHouses(user: UserRow, profile: ProfileContext): Promise<void> {
  if (!(await isFeatureOn(user.id, 'money.houseOffer'))) throw Errors.forbidden('FEATURE_DISABLED');
  if (profile.unlockedHouses.length >= 12) {
    throw Errors.conflict('Every house is already unlocked');
  }
  const offer = await getHouseOffer(user, profile);
  const ok =
    profile.birthProfileId === null
      ? await unlockAllHousesForUser(user.id, offer.bundleDuePaise)
      : await unlockAllHousesForOwnedProfile(profile.birthProfileId, user.id, offer.bundleDuePaise);
  if (!ok) throw Errors.conflict('Insufficient credits or every house already unlocked');
}

/**
 * Makes the free houses (house 1 and the current Mahadasha house) count as unlocked, once. Called
 * when the app asks for the offer and when an insight is requested for a house that is free but not
 * yet marked, so a free house never shows a lock. Returns the houses it newly unlocked. Never
 * throws: a failure only means the free house stays locked until the next call.
 */
export async function ensureFreeHousesUnlocked(
  user: UserRow,
  profile: ProfileContext,
): Promise<number[]> {
  try {
    if (!(await isFeatureOn(user.id, 'money.houseOffer'))) return [];
    const free = (await loadFreeHouses(user, profile)) ?? [];
    const unlocked: number[] = [];
    for (const house of free) {
      if (profile.unlockedHouses.includes(house)) continue;
      if (await unlockOne(user, profile, house, 0)) unlocked.push(house);
    }
    return unlocked;
  } catch (err) {
    logger.error({ err, userId: user.id }, 'free house unlock failed (skipped)');
    return [];
  }
}
