import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetWorld, world } from './helpers/hooks-world';

vi.mock('../src/modules/hooks/hooks.repo', async () => (await import('./helpers/hooks-world')).hooksRepoMock);
vi.mock('../src/modules/users/users.repo', async () => (await import('./helpers/hooks-world')).usersRepoMock);
vi.mock('../src/modules/features/features.service', async () => (await import('./helpers/hooks-world')).featuresServiceMock);
vi.mock('../src/lib/entitlements', () => ({
  passEntitlement: async () => (await import('./helpers/hooks-world')).world.pass,
}));
vi.mock('../src/lib/notifications/notify-user', () => ({ notifyUser: async () => {} }));
vi.mock('../src/modules/astro/astro.service', () => ({ isValidTimeZone: () => true }));
vi.mock('../src/modules/birth-profiles/profile-context', () => ({
  resolveActiveProfileContext: async () => ({ birthProfileId: null, birthTimeAccuracy: (globalThis as { __acc?: string }).__acc ?? 'exact' }),
}));
vi.mock('../src/modules/bonds/bonds.service', async () => {
  const { FIXTURE_PLANETS } = await import('./helpers/chart-fixture');
  return {
    loadBondChart: async () =>
      (globalThis as { __noChart?: boolean }).__noChart
        ? null
        : {
            ctx: {
              dasha: {
                mahadasha: { planet: 'Venus', startDate: '2021-03-01T00:00:00.000Z', endDate: '2041-03-01T00:00:00.000Z' },
                antardasha: { planet: 'Mercury', startDate: '2026-02-01T00:00:00.000Z', endDate: '2028-12-01T00:00:00.000Z' },
              },
            },
            chartData: { planets: FIXTURE_PLANETS, ascendant: { signIndex: 6, degree: 5 }, houses: [] },
          },
  };
});
const rituals = new Set<string>();
vi.mock('../src/modules/ritual/ritual.repo', () => ({ findCompletion: async (_u: string, d: string) => (rituals.has(d) ? { localDate: d } : undefined) }));

import { getRahasya, unlockScroll } from '../src/modules/hooks/rahasya.service';

const user = {
  id: 'u1', locale: 'en', currentTimezone: 'Asia/Kolkata', skyMode: 'HOME',
  homeLocation: { name: 'New Delhi', lat: 28.61, lon: 77.21, tz: 'Asia/Kolkata' }, currentLocation: null,
} as never;

// IST: 10:00 on the 26th, and 20:30 the same day
const MORNING = (d: number) => new Date(`2026-10-${String(d).padStart(2, '0')}T04:30:00Z`);
const EVENING = (d: number) => new Date(`2026-10-${String(d).padStart(2, '0')}T15:00:00Z`);

beforeEach(() => {
  resetWorld();
  rituals.clear();
  delete (globalThis as { __noChart?: boolean }).__noChart;
  delete (globalThis as { __acc?: string }).__acc;
  world.features.add('hooks.kundliRahasya');
});

describe('Kundli Rahasya', () => {
  it('refuses while the switch is off', async () => {
    world.features.clear();
    await expect(getRahasya(user, {}, MORNING(26))).rejects.toMatchObject({ status: 403 });
  });

  it('opens scroll 1 on day one and keeps the other 16 locked', async () => {
    const v = await getRahasya(user, { n: 1 }, MORNING(26));
    expect(v.openCount).toBe(1);
    expect(v.slots[0]).toMatchObject({ n: 1, status: 'open', via: 'first' });
    expect(v.slots[1]).toMatchObject({ n: 2, status: 'locked', title: 'Scroll 2' });
    expect(v.scroll?.id).toBe('lagna');
    expect(v.next).toMatchObject({ n: 2, opensAtLocal: '20:00' });
  });

  it('a locked scroll is not sent', async () => {
    expect((await getRahasya(user, { n: 5 }, MORNING(26))).scroll).toBeNull();
  });

  it('refuses a scroll number outside 1-17', async () => {
    await expect(getRahasya(user, { n: 0 }, MORNING(26))).rejects.toMatchObject({ status: 400 });
    await expect(getRahasya(user, { n: 18 }, MORNING(26))).rejects.toMatchObject({ status: 400 });
  });

  it('with the ritual on, the next scroll opens at 20:00 on a day the ritual was done, and not before', async () => {
    world.features.add('ritual.morning');
    await getRahasya(user, {}, MORNING(26));
    rituals.add('2026-10-26');
    expect((await getRahasya(user, {}, MORNING(26))).openCount).toBe(1); // before 20:00
    expect((await getRahasya(user, {}, EVENING(26))).openCount).toBe(2);
    expect((await getRahasya(user, {}, EVENING(26))).openCount).toBe(2); // asking twice does not open a third
  });

  it('a day without the ritual opens nothing', async () => {
    world.features.add('ritual.morning');
    await getRahasya(user, {}, MORNING(26));
    expect((await getRahasya(user, {}, MORNING(27))).openCount).toBe(1);
  });

  it('with the ritual off, visiting the page is what counts', async () => {
    await getRahasya(user, {}, MORNING(26)); // day 1 visit
    const next = await getRahasya(user, {}, MORNING(27)); // day 2: day 1 is over, so scroll 2 is open
    expect(next.openCount).toBe(2);
    expect(next.next?.needs).toBe('visit');
  });

  it('at most one scroll a day however often it is opened', async () => {
    for (let i = 0; i < 4; i++) await getRahasya(user, {}, EVENING(26));
    expect((await getRahasya(user, {}, EVENING(26))).openCount).toBeLessThanOrEqual(2);
  });

  it('stops at 17', async () => {
    let last = 0;
    for (let d = 1; d <= 25; d++) {
      const when = new Date(Date.UTC(2026, 9, d, 15, 0));
      last = (await getRahasya(user, {}, when)).openCount;
    }
    expect(last).toBe(17);
  });

  it('opening early costs 15 coins once and is the same scroll afterwards', async () => {
    const r = await unlockScroll(user, { n: 5 }, MORNING(26));
    expect(r.chargedPaise).toBe(1500);
    expect(r.slots[4]).toMatchObject({ status: 'open', via: 'paid' });
    expect(r.scroll?.n).toBe(5);
    expect(world.wallet.filter((w) => w.delta < 0)).toHaveLength(1);
    const again = await unlockScroll(user, { n: 5 }, EVENING(26));
    expect(again.chargedPaise).toBe(0);
    expect(world.wallet.filter((w) => w.delta < 0)).toHaveLength(1);
  });

  it('opening early does not shorten the daily schedule', async () => {
    await unlockScroll(user, { n: 9 }, MORNING(26));
    const v = await getRahasya(user, {}, MORNING(26));
    expect(v.openCount).toBe(2);
    expect(v.next?.n).toBe(2);
  });

  it('Gold and Platinum open any scroll free; Silver pays', async () => {
    world.pass = { tier: 'gold' };
    expect((await unlockScroll(user, { n: 3 }, MORNING(26))).chargedPaise).toBe(0);
    world.pass = { tier: 'silver' };
    expect((await unlockScroll(user, { n: 4 }, MORNING(26))).chargedPaise).toBe(1500);
    expect(world.wallet.filter((w) => w.delta < 0)).toHaveLength(1);
  });

  it('opening an already-open scroll is free', async () => {
    const r = await unlockScroll(user, { n: 1 }, MORNING(26));
    expect(r.chargedPaise).toBe(0);
    expect(world.wallet).toEqual([]);
  });

  it('not enough coins: nothing opens and nothing is charged', async () => {
    world.balancePaise = 0;
    await expect(unlockScroll(user, { n: 6 }, MORNING(26))).rejects.toMatchObject({ message: 'INSUFFICIENT_CREDITS' });
    expect((await getRahasya(user, {}, MORNING(26))).openCount).toBe(1);
  });

  it('the price follows the admin key', async () => {
    world.prices['hooks.rahasyaUnlock'] = 2500;
    expect((await getRahasya(user, {}, MORNING(26))).unlockPricePaise).toBe(2500);
    expect((await unlockScroll(user, { n: 6 }, MORNING(26))).chargedPaise).toBe(2500);
  });

  it('answers 422 when the chart cannot be read', async () => {
    (globalThis as { __noChart?: boolean }).__noChart = true;
    await expect(getRahasya(user, {}, MORNING(26))).rejects.toMatchObject({ status: 422 });
  });

  it('shows the Moon-chart badge when the birth time is not exact', async () => {
    (globalThis as { __acc?: string }).__acc = 'approximate';
    const v = await getRahasya(user, { n: 1 }, MORNING(26));
    expect(v.scroll?.badge).toBe('moon-chart');
  });
});
