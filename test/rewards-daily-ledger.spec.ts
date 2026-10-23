import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as RewardsRepo from '../src/modules/rewards/rewards.repo';

/**
 * The daily reward over weeks of real use: a user who claims every day, while the nightly
 * credit-expiry sweep writes `daily_reward:<date>_expired` rows for 30-day-old claims into the
 * same ledger. The repo is replaced by an in-memory ledger that applies the repo's own Postgres
 * pattern, newest first, with the same row limit — so this checks the streak the user is
 * actually paid, and that it matches what the popup shows before the tap.
 */

interface Row {
  reason: string;
  delta: number;
  createdAt: Date;
  expiresAt: Date | null;
  expired: boolean;
}

const ledger: Row[] = [];

vi.mock('../src/modules/rewards/rewards.repo', async (importActual) => {
  const actual = await importActual<typeof RewardsRepo>();
  const re = new RegExp(actual.DAILY_REWARD_CLAIM_PATTERN);
  return {
    ...actual,
    recentDailyRewardReasons: (_userId: string, limit: number) =>
      Promise.resolve(
        ledger
          .filter((r) => re.test(r.reason))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, limit)
          .map((r) => r.reason),
      ),
  };
});

let clock = new Date();

vi.mock('../src/modules/users/users.repo', () => ({
  claimCampaignBonus: (_u: string, reason: string, amountPaise: number, expiresAt?: Date) => {
    if (ledger.some((r) => r.reason === reason))
      return Promise.resolve({ claimed: false, walletBalancePaise: 0 });
    ledger.push({
      reason,
      delta: amountPaise,
      createdAt: clock,
      expiresAt: expiresAt ?? null,
      expired: false,
    });
    return Promise.resolve({ claimed: true, walletBalancePaise: 0 });
  },
}));

vi.mock('../src/modules/features/features.service', () => ({
  payoutOf: (_u: string, key: string, fallback: number) =>
    Promise.resolve(
      key === 'rewards.dailyBase'
        ? 500
        : key === 'rewards.dailyStep'
          ? 100
          : key === 'rewards.streakBonus'
            ? 2100
            : fallback,
    ),
}));

const { claimDailyReward, getDailyRewardState } =
  await import('../src/modules/rewards/rewards.service');

/** The sweep (gift-campaign-sweep.service.ts): an unspent expired lot gets a `_expired` row. */
function sweep(now: Date) {
  for (const r of [...ledger]) {
    if (r.expiresAt && r.expiresAt < now && !r.expired) {
      r.expired = true;
      ledger.push({
        reason: `${r.reason}_expired`,
        delta: -r.delta,
        createdAt: now,
        expiresAt: null,
        expired: false,
      });
    }
  }
}

const LADDER = [500, 600, 700, 800, 900, 1000, 1100 + 2100];

describe('daily reward over 60 days of daily claims with the expiry sweep running', () => {
  beforeEach(() => {
    ledger.length = 0;
  });

  it('pays the ladder 1..7 every week, and each payment matches what the popup showed', async () => {
    const start = Date.UTC(2026, 7, 1);
    const paid: number[] = [];
    const shown: number[] = [];
    for (let d = 0; d < 60; d++) {
      const day = start + d * 86_400_000;
      // 00:30 IST — the nightly sweep runs before the user opens the app.
      clock = new Date(day - 5 * 3_600_000);
      sweep(clock);
      // 09:00 IST — the user opens the app, sees the popup, taps claim.
      clock = new Date(day + 3.5 * 3_600_000);
      const state = await getDailyRewardState('u1', clock);
      expect(state.claimedToday).toBe(false);
      shown.push(state.todayAmountPaise);
      const before = ledger.length;
      const res = await claimDailyReward('u1', clock);
      expect(res.claimed).toBe(true);
      paid.push(ledger[before]!.delta);
    }
    expect(paid).toEqual(Array.from({ length: 60 }, (_, i) => LADDER[i % 7]));
    expect(paid).toEqual(shown);
  });
});

describe("daily reward on the reader's own day", () => {
  beforeEach(() => {
    ledger.length = 0;
  });

  it('gives a New York user a new day at New York midnight, not India midnight', async () => {
    // 20 Oct 2026 20:00 in New York = 21 Oct 05:30 IST.
    clock = new Date('2026-10-21T00:00:00Z');
    expect((await claimDailyReward('u1', clock, 'America/New_York')).claimed).toBe(true);
    // 21 Oct 08:00 in New York = 21 Oct 17:30 IST: the same India day, but a new New York day.
    clock = new Date('2026-10-21T12:00:00Z');
    const state = await getDailyRewardState('u1', clock, 'America/New_York');
    expect(state.claimedToday).toBe(false);
    expect(state.currentDay).toBe(2);
    expect((await claimDailyReward('u1', clock, 'America/New_York')).claimed).toBe(true);
    expect(ledger.map((r) => r.reason)).toEqual([
      'daily_reward:2026-10-20',
      'daily_reward:2026-10-21',
    ]);
  });

  it('still allows one claim a day: a second tap later the same New York day is refused', async () => {
    clock = new Date('2026-10-21T13:00:00Z'); // 09:00 New York
    await claimDailyReward('u1', clock, 'America/New_York');
    clock = new Date('2026-10-22T02:00:00Z'); // 22:00 New York, already the 22nd in India
    expect((await claimDailyReward('u1', clock, 'America/New_York')).claimed).toBe(false);
  });
});
