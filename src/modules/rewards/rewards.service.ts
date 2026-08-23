import { istDateString } from '../../lib/astro-tools/transit-events.js';
import { addDays } from '../purchase-plan/purchase-plan.dates.js';
import { payoutOf } from '../features/features.service.js';
import { claimCampaignBonus } from '../users/users.repo.js';
import { recentDailyRewardReasons } from './rewards.repo.js';

const REASON_PREFIX = 'daily_reward:';
export const CYCLE_LEN = 7;
/** ₹1 added per day on top of the day-1 base — the only non-admin-tunable knob;
 * add a feature key for it if that ever needs to change without a deploy. */
const DAILY_STEP_PAISE = 100;
const EXPIRY_DAYS = 30;

const reasonForDate = (date: string): string => `${REASON_PREFIX}${date}`;
const dateFromReason = (reason: string): string => reason.slice(REASON_PREFIX.length);

export interface DailyRewardDay {
  day: number;
  amountPaise: number;
  isBonusDay: boolean;
  claimed: boolean;
}

export interface DailyRewardState {
  /** Which of the 7 ladder slots "today" occupies (1-7). */
  currentDay: number;
  claimedToday: boolean;
  /** Amount for `currentDay` — already granted if claimedToday, otherwise claimable now. */
  todayAmountPaise: number;
  /** Amount the day after `currentDay` pays — folds back to day 1 after day 7 — for "come back tomorrow" messaging. */
  nextDayAmountPaise: number;
  expiresInDays: number;
  /** The 7 slots of the cycle `currentDay` belongs to. */
  ladder: DailyRewardDay[];
}

/**
 * Length of the consecutive run of IST calendar dates in `claimedDates` ending
 * at `today` (if today was claimed) or at `today - 1` (if not) — 0 if neither
 * today nor yesterday was claimed, i.e. the streak is already broken.
 * `claimCampaignBonus`'s reason-based dedupe means every claim is exactly one
 * `daily_reward:<date>` ledger row, so this is a straight walk backward
 * through `claimedDates` rather than anything stored — see rewards.repo.ts.
 */
export function streakRun(claimedDates: string[], today: string): number {
  const set = new Set(claimedDates);
  let anchor = today;
  if (!set.has(anchor)) {
    anchor = addDays(today, -1);
    if (!set.has(anchor)) return 0;
  }
  let run = 0;
  let cursor = anchor;
  while (set.has(cursor)) {
    run++;
    cursor = addDays(cursor, -1);
  }
  return run;
}

/**
 * Folds an arbitrary-length streak run into a 1-7 ladder slot. `run % 7`
 * folds the cycle, so a run of exactly 7 (a completed week) wraps back to 1 —
 * this is the "after day 7, reset to day 1" rule, and it also covers a user
 * who never misses a day for months without a separate reset code path.
 */
export function positionInCycle(run: number, claimedToday: boolean): number {
  if (run === 0) return 1;
  return claimedToday ? ((run - 1) % CYCLE_LEN) + 1 : (run % CYCLE_LEN) + 1;
}

/** Pure ladder-amount formula: base + ₹1 per day after day 1, plus the streak bonus on day 7. */
export function amountForDay(day: number, basePaise: number, bonusPaise: number): number {
  const stepAmount = basePaise + (day - 1) * DAILY_STEP_PAISE;
  return day === CYCLE_LEN ? stepAmount + bonusPaise : stepAmount;
}

async function resolveAmounts(userId: string): Promise<{ basePaise: number; bonusPaise: number }> {
  const [basePaise, bonusPaise] = await Promise.all([
    payoutOf(userId, 'rewards.dailyBase', 500),
    payoutOf(userId, 'rewards.streakBonus', 2100),
  ]);
  return { basePaise, bonusPaise };
}

export async function getDailyRewardState(
  userId: string,
  now: Date = new Date(),
): Promise<DailyRewardState> {
  const { basePaise, bonusPaise } = await resolveAmounts(userId);
  const dates = (await recentDailyRewardReasons(userId)).map(dateFromReason);
  const dateSet = new Set(dates);
  const today = istDateString(now);
  const claimedToday = dateSet.has(today);
  const currentDay = positionInCycle(streakRun(dates, today), claimedToday);
  const cycleStart = addDays(today, -(currentDay - 1));

  const ladder: DailyRewardDay[] = Array.from({ length: CYCLE_LEN }, (_, i) => {
    const day = i + 1;
    return {
      day,
      amountPaise: amountForDay(day, basePaise, bonusPaise),
      isBonusDay: day === CYCLE_LEN,
      claimed: dateSet.has(addDays(cycleStart, i)),
    };
  });

  const nextDay = (currentDay % CYCLE_LEN) + 1;

  return {
    currentDay,
    claimedToday,
    todayAmountPaise: ladder[currentDay - 1]!.amountPaise,
    nextDayAmountPaise: amountForDay(nextDay, basePaise, bonusPaise),
    expiresInDays: EXPIRY_DAYS,
    ladder,
  };
}

/**
 * Claims today's ladder amount. Idempotent per IST day — `claimCampaignBonus`
 * refuses a second `wallet_transactions` insert for the same `reason` inside
 * a row-locked transaction, so a duplicate call (double-tap, race between
 * devices) returns `claimed: false` with the unchanged balance rather than
 * double-crediting.
 */
export async function claimDailyReward(
  userId: string,
  now: Date = new Date(),
): Promise<{ claimed: boolean; walletBalancePaise: number }> {
  const { basePaise, bonusPaise } = await resolveAmounts(userId);
  const dates = (await recentDailyRewardReasons(userId)).map(dateFromReason);
  const today = istDateString(now);
  const claimedToday = dates.includes(today);
  const currentDay = positionInCycle(streakRun(dates, today), claimedToday);
  const amountPaise = amountForDay(currentDay, basePaise, bonusPaise);
  const expiresAt = new Date(now.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  return claimCampaignBonus(userId, reasonForDate(today), amountPaise, expiresAt);
}
