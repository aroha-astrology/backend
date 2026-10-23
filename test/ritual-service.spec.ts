import { describe, it, expect, vi, beforeEach } from 'vitest';

// The ritual over several days, with the ledger, the repo and the wallet replaced by an in-memory
// world. What is checked is the wiring: one streak shared with the daily reward, a shield covering
// one missed day, and the key and shield perks landing on the right days.

const world = vi.hoisted(() => ({
  claimedDates: [] as string[], // daily reward dates, as the ledger would hold them
  shieldedDates: [] as string[],
  shields: 0,
  keys: 0,
  completions: new Map<string, Record<string, unknown>>(),
  wallet: [] as Array<{ amount: number; reason: string; key?: string }>,
  claimCalls: 0,
  failInsert: false,
}));

vi.mock('../src/modules/ritual/ritual.repo', () => ({
  findCompletion: async (_u: string, d: string) => world.completions.get(d),
  insertCompletion: async (v: Record<string, unknown>) => {
    if (world.failInsert) return undefined;
    world.completions.set(v.localDate as string, v);
    return v;
  },
  getState: async () => ({ shields: world.shields, cosmicKeys: world.keys, shieldedDates: world.shieldedDates }),
  spendShield: async (_u: string, date: string) => {
    if (world.shields <= 0 || world.shieldedDates.includes(date)) return false;
    world.shields--;
    world.shieldedDates.push(date);
    return true;
  },
  addPerks: async (_u: string, p: { shield?: boolean; key?: boolean }) => {
    if (p.shield) world.shields = Math.min(2, world.shields + 1);
    if (p.key) world.keys++;
    return {};
  },
}));

vi.mock('../src/modules/rewards/rewards.service', async (importActual) => {
  const actual = await importActual<typeof import('../src/modules/rewards/rewards.service')>();
  return {
    ...actual,
    claimedDatesThroughGap: async () => [...new Set([...world.claimedDates, ...world.shieldedDates])].sort().reverse(),
    claimDailyReward: async (_u: string, now: Date) => {
      world.claimCalls++;
      const date = now.toISOString().slice(0, 10); // UTC midnight clock in this test
      if (world.claimedDates.includes(date)) return { claimed: false, walletBalancePaise: 0 };
      world.claimedDates.push(date);
      return { claimed: true, walletBalancePaise: 500 };
    },
  };
});

vi.mock('../src/modules/users/users.repo', () => ({
  addWalletBalance: async (_u: string, amount: number, reason: string, opts?: { idempotencyKey?: string }) => {
    world.wallet.push({ amount, reason, key: opts?.idempotencyKey });
    return true;
  },
}));

vi.mock('../src/modules/features/features.service', () => ({
  payoutOf: async (_u: string, key: string, fallback: number) => (key === 'ritual.keyCoins' ? 1000 : fallback),
}));

vi.mock('../src/modules/kundli/kundli.repo', () => ({
  findKundliByUserId: async () => ({ status: 'ready', chartData: { ascendant: { signIndex: 4 } } }),
}));

vi.mock('../src/lib/astro-engine/calculations/planetPositions', () => ({
  calculatePlanetPositions: async () => [{ planet: 'Moon', longitude: 40 }],
}));

vi.mock('../src/lib/user-time-zone', async (importActual) => {
  const actual = await importActual<typeof import('../src/lib/user-time-zone')>();
  return { ...actual, userZone: () => 'UTC' };
});

import { completeRitual, getRitualToday } from '../src/modules/ritual/ritual.service';
import { padaIndexOf } from '../src/modules/ritual/ritual-rules';

const user = {
  id: 'u1',
  currentTimezone: 'UTC',
  birthTimeAccuracy: 'exact',
  walletBalancePaise: 0,
} as never;

const at = (date: string) => new Date(`${date}T08:00:00Z`);

beforeEach(() => {
  world.claimedDates = [];
  world.shieldedDates = [];
  world.shields = 0;
  world.keys = 0;
  world.completions = new Map();
  world.wallet = [];
  world.claimCalls = 0;
  world.failInsert = false;
});

describe('completing the ritual', () => {
  it('is the daily check-in: it claims the reward once and starts the streak at 1', async () => {
    const r = await completeRitual(user, { practice: 'jap', mood: 4 }, at('2026-10-20'));
    expect(world.claimCalls).toBe(1);
    expect(r.alreadyDone).toBe(false);
    expect(r.completed).toBe(true);
    expect(r.streak.run).toBe(1);
    expect(r.rewardPaise).toBe(500);
    expect(r.earned).toEqual({ key: false, shield: false, shieldCoveredDate: null });
    expect(world.completions.get('2026-10-20')).toMatchObject({ practice: 'jap', mood: 4, streakDay: 1 });
  });

  it('the card follows the Moon and, with an exact birth time, the Ascendant', async () => {
    const r = await getRitualToday(user, at('2026-10-20'));
    expect(r.basis).toBe('moonAndLagna');
    expect(r.cardIndex).toBe((padaIndexOf(40) + 9 * 4) % 108);
  });

  it('without an exact birth time the Ascendant is left out', async () => {
    const r = await getRitualToday({ ...(user as object), birthTimeAccuracy: 'approximate' } as never, at('2026-10-20'));
    expect(r.basis).toBe('moon');
    expect(r.cardIndex).toBe(padaIndexOf(40));
  });

  it('a second tap the same day changes nothing', async () => {
    await completeRitual(user, { practice: 'jap' }, at('2026-10-20'));
    const again = await completeRitual(user, { practice: 'breath' }, at('2026-10-20'));
    expect(again.alreadyDone).toBe(true);
    expect(world.claimCalls).toBe(1);
    expect(world.completions.get('2026-10-20')).toMatchObject({ practice: 'jap' });
  });

  it('a second device that finishes a moment ahead wins, and this one reports the day as done', async () => {
    world.failInsert = true;
    const r = await completeRitual(user, { practice: 'jap' }, at('2026-10-20'));
    expect(r.alreadyDone).toBe(true);
    expect(r.rewardPaise).toBe(0);
    expect(world.keys).toBe(0);
  });

  it('hands out a Cosmic Key and its coins on the 3rd day, once, keyed by the day', async () => {
    for (const d of ['2026-10-20', '2026-10-21']) await completeRitual(user, { practice: 'jap' }, at(d));
    expect(world.keys).toBe(0);
    const third = await completeRitual(user, { practice: 'jap' }, at('2026-10-22'));
    expect(third.streak.run).toBe(3);
    expect(third.earned.key).toBe(true);
    expect(world.keys).toBe(1);
    expect(world.wallet).toEqual([{ amount: 1000, reason: 'ritual_cosmic_key', key: 'ritual_key:2026-10-22' }]);
    await completeRitual(user, { practice: 'jap' }, at('2026-10-22'));
    expect(world.wallet).toHaveLength(1);
  });

  it('earns a shield on the 7th day', async () => {
    for (let i = 0; i < 7; i++) {
      await completeRitual(user, { practice: 'jap' }, at(`2026-10-${String(14 + i).padStart(2, '0')}`));
    }
    expect(world.shields).toBe(1);
  });

  it('a shield covers one missed day so the streak carries on', async () => {
    world.claimedDates = ['2026-10-18', '2026-10-19']; // 10-20 missed
    world.shields = 1;
    const r = await completeRitual(user, { practice: 'jap' }, at('2026-10-21'));
    expect(r.earned.shieldCoveredDate).toBe('2026-10-20');
    expect(world.shields).toBe(0);
    expect(r.streak.run).toBe(4); // 18, 19, shielded 20, and today
  });

  it('without a shield the same gap starts the streak again', async () => {
    world.claimedDates = ['2026-10-18', '2026-10-19'];
    const r = await completeRitual(user, { practice: 'jap' }, at('2026-10-21'));
    expect(r.earned.shieldCoveredDate).toBeNull();
    expect(r.streak.run).toBe(1);
  });

  it('two missed days are not covered even with shields in hand', async () => {
    world.claimedDates = ['2026-10-18'];
    world.shields = 2;
    const r = await completeRitual(user, { practice: 'jap' }, at('2026-10-21'));
    expect(r.earned.shieldCoveredDate).toBeNull();
    expect(world.shields).toBe(2);
    expect(r.streak.run).toBe(1);
  });
});

describe('the streak view', () => {
  it('counts the ritual still to do today towards the next Cosmic Key', async () => {
    world.claimedDates = ['2026-10-19', '2026-10-20'];
    const before = await getRitualToday(user, at('2026-10-21'));
    expect(before.completed).toBe(false);
    expect(before.streak.run).toBe(2);
    expect(before.streak.nextKeyInDays).toBe(1); // today's ritual is day 3
    const done = await completeRitual(user, { practice: 'jap' }, at('2026-10-21'));
    expect(done.streak.nextKeyInDays).toBe(3);
  });
});
