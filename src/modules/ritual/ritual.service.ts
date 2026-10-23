// =============================================================================
// Morning Ritual (v7 spec, Sprint 3, switch `ritual.morning`, ships off)
// =============================================================================
// One short practice each morning: read the day's Prashna card, do 11 japs or 3 breaths, and say
// how you feel (1-5). Finishing it IS the daily check-in: it claims the day's reward through the
// same code as the Rewards screen, so there is one streak, not two. On top of that:
//   - a Cosmic Key every 3rd day of the streak (a small coin gift, `ritual.keyCoins`);
//   - a shield every 7th day, which covers exactly one missed day later (at most 2 held).
// "Today" is the reader's own local day (the saved zone, same clock as the daily reward).
// =============================================================================

import type { UserRow } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
import { dateInZone, noonInZone, userZone } from '../../lib/user-time-zone.js';
import { calculatePlanetPositions } from '../../lib/astro-engine/calculations/planetPositions.js';
import { jdFromDate } from '../../lib/astro-tools/transit-events.js';
import { payoutOf } from '../features/features.service.js';
import { findKundliByUserId } from '../kundli/kundli.repo.js';
import { claimDailyReward, claimedDatesThroughGap, streakRun } from '../rewards/rewards.service.js';
import { addWalletBalance } from '../users/users.repo.js';
import {
  daysUntilNext,
  earnedOnRun,
  KEY_EVERY,
  prashnaCardIndex,
  SHIELD_EVERY,
  shieldGap,
} from './ritual-rules.js';
import {
  addPerks,
  findCompletion,
  getState,
  insertCompletion,
  spendShield,
  type RitualCompletionRow,
} from './ritual.repo.js';

export type Practice = 'jap' | 'breath';

export interface RitualToday {
  localDate: string;
  timeZone: string;
  completed: boolean;
  /** The Prashna card (0-107); the app writes the text in the reader's language and look. */
  cardIndex: number;
  /** 'moonAndLagna' when the birth time is exact, else 'moon' (the Ascendant is never guessed). */
  basis: 'moonAndLagna' | 'moon';
  practice: Practice | null;
  mood: number | null;
  streak: {
    run: number;
    shields: number;
    cosmicKeys: number;
    /** Ritual days until the next Cosmic Key / shield, counting the one still to do today. */
    nextKeyInDays: number;
    nextShieldInDays: number;
  };
}

export interface RitualResult extends RitualToday {
  alreadyDone: boolean;
  earned: { key: boolean; shield: boolean; shieldCoveredDate: string | null };
  /** Paise the daily reward paid for this ritual (0 when it was already claimed elsewhere). */
  rewardPaise: number;
}

/** The ascendant sign for the reader's own chart, or null when the birth time is not exact. */
async function ascendantFor(user: UserRow): Promise<number | null> {
  if (user.birthTimeAccuracy !== 'exact') return null;
  const kundli = await findKundliByUserId(user.id, null);
  if (!kundli || kundli.status !== 'ready' || !kundli.chartData) return null;
  const sign = (kundli.chartData as { ascendant?: { signIndex?: number } }).ascendant?.signIndex;
  return typeof sign === 'number' ? sign : null;
}

/** The day's card: the Moon read at local noon of that local date. */
export async function cardFor(
  user: UserRow,
  localDate: string,
  timeZone: string,
): Promise<{ cardIndex: number; basis: RitualToday['basis'] }> {
  const sky = await calculatePlanetPositions(jdFromDate(noonInZone(localDate, timeZone)));
  const moon = sky.find((p) => p.planet === 'Moon');
  const lagna = await ascendantFor(user);
  return {
    cardIndex: prashnaCardIndex(moon?.longitude ?? 0, lagna),
    basis: lagna === null ? 'moon' : 'moonAndLagna',
  };
}

async function streakView(userId: string, today: string, completed: boolean) {
  const dates = await claimedDatesThroughGap(userId, today);
  const run = streakRun(dates, today);
  const state = await getState(userId);
  // The ritual still to do today would be day run + 1 of the streak.
  const day = completed ? run : run + 1;
  return {
    run,
    shields: state.shields,
    cosmicKeys: state.cosmicKeys,
    nextKeyInDays: completed ? daysUntilNext(day, KEY_EVERY) : daysUntilNext(day - 1, KEY_EVERY),
    nextShieldInDays: completed
      ? daysUntilNext(day, SHIELD_EVERY)
      : daysUntilNext(day - 1, SHIELD_EVERY),
  };
}

export async function getRitualToday(user: UserRow, now: Date = new Date()): Promise<RitualToday> {
  const timeZone = userZone(user.currentTimezone);
  const localDate = dateInZone(now, timeZone);
  const done = await findCompletion(user.id, localDate);
  const card = await cardFor(user, localDate, timeZone);
  return {
    localDate,
    timeZone,
    completed: Boolean(done),
    cardIndex: done?.cardIndex ?? card.cardIndex,
    basis: card.basis,
    practice: done?.practice ?? null,
    mood: done?.mood ?? null,
    streak: await streakView(user.id, localDate, Boolean(done)),
  };
}

export async function completeRitual(
  user: UserRow,
  input: { practice: Practice; mood?: number | null },
  now: Date = new Date(),
): Promise<RitualResult> {
  const timeZone = userZone(user.currentTimezone);
  const localDate = dateInZone(now, timeZone);

  const existing = await findCompletion(user.id, localDate);
  if (existing) {
    const today = await getRitualToday(user, now);
    return {
      ...today,
      alreadyDone: true,
      earned: { key: existing.keyGranted, shield: existing.shieldEarned, shieldCoveredDate: null },
      rewardPaise: 0,
    };
  }

  const { cardIndex } = await cardFor(user, localDate, timeZone);

  // One missed day is covered by a shield, if the reader has one, before today is counted.
  let shieldCoveredDate: string | null = null;
  const before = new Set(await claimedDatesThroughGap(user.id, localDate));
  const state = await getState(user.id);
  const gap = shieldGap(before, localDate, state.shields);
  if (gap && (await spendShield(user.id, gap))) shieldCoveredDate = gap;

  // The ritual is the daily check-in: same ledger row, same streak, same signup stage 2.
  const claim = await claimDailyReward(user.id, now, timeZone);
  const rewardPaise = claim.claimed ? Math.max(0, claim.walletBalancePaise - user.walletBalancePaise) : 0;

  const run = streakRun(await claimedDatesThroughGap(user.id, localDate), localDate);
  const earned = earnedOnRun(run);

  const row: RitualCompletionRow | undefined = await insertCompletion({
    userId: user.id,
    localDate,
    timeZone,
    cardIndex,
    practice: input.practice,
    mood: input.mood ?? null,
    streakDay: run,
    keyGranted: earned.key,
    shieldEarned: earned.shield,
  });
  if (!row) {
    // A second device finished the same day a moment ahead of this one.
    const today = await getRitualToday(user, now);
    return {
      ...today,
      alreadyDone: true,
      earned: { key: false, shield: false, shieldCoveredDate },
      rewardPaise: 0,
    };
  }

  if (earned.key || earned.shield) {
    try {
      await addPerks(user.id, { key: earned.key, shield: earned.shield });
      if (earned.key) {
        const coins = await payoutOf(user.id, 'ritual.keyCoins', 1000);
        if (coins > 0) {
          await addWalletBalance(user.id, coins, 'ritual_cosmic_key', {
            idempotencyKey: `ritual_key:${localDate}`,
          });
        }
      }
    } catch (err) {
      // The ritual itself is done and recorded; a failed extra must not undo it.
      logger.error({ err, userId: user.id, localDate }, 'ritual: key or shield grant failed');
    }
  }

  const today = await getRitualToday(user, now);
  return { ...today, alreadyDone: false, earned: { ...earned, shieldCoveredDate }, rewardPaise };
}
