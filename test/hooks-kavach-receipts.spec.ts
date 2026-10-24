import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyLunarAssessment } from '../src/lib/astro-tools/tara-bala';
import { resetWorld, world } from './helpers/hooks-world';

vi.mock('../src/modules/hooks/hooks.repo', async () => (await import('./helpers/hooks-world')).hooksRepoMock);
vi.mock('../src/modules/users/users.repo', async () => (await import('./helpers/hooks-world')).usersRepoMock);
vi.mock('../src/modules/features/features.service', async () => (await import('./helpers/hooks-world')).featuresServiceMock);
vi.mock('../src/lib/entitlements', () => ({ passEntitlement: async () => (await import('./helpers/hooks-world')).world.pass }));
vi.mock('../src/lib/notifications/notify-user', () => ({ notifyUser: async () => {} }));
vi.mock('../src/modules/astro/astro.service', () => ({ isValidTimeZone: () => true }));

const circle = vi.hoisted(() => ({ people: [] as unknown[] }));
vi.mock('../src/modules/hooks/circle-people', () => ({ loadCirclePeople: async () => circle.people }));

vi.mock('../src/modules/hooks/sky-day', () => ({
  loadNatalPoints: async () => (globalThis as { __noChart?: boolean }).__noChart ? null : [{ planet: 'Sun', longitude: 348.25 }],
  moonLongitudes: async (_tz: string, date: string) =>
    Array.from({ length: 48 }, (_, i) => ({ atMin: i * 30, longitude: (100 + (13.2 / 1440) * i * 30 + (date.endsWith('-27') ? 13.2 : 0)) % 360 })),
}));

import { addBeads, getKavach } from '../src/modules/hooks/kavach.service';
import { getReceipts, markCard, peekTomorrow } from '../src/modules/hooks/receipts.service';

const user = {
  id: 'u1', locale: 'en', currentTimezone: 'Asia/Kolkata', skyMode: 'HOME',
  homeLocation: { name: 'New Delhi', lat: 28.61, lon: 77.21, tz: 'Asia/Kolkata' }, currentLocation: null,
} as never;

const at = (day: number, hhmmIst: string) => {
  const [h, m] = hhmmIst.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, day, h! - 5, m! - 30));
};

function combo(quality: string) {
  for (let nak = 0; nak < 27; nak++)
    for (let tNak = 0; tNak < 27; tNak++)
      for (let sign = 0; sign < 12; sign++)
        for (let tSign = 0; tSign < 12; tSign++)
          if (dailyLunarAssessment(nak, sign, tNak, tSign).overallQuality === quality) return { nak, sign, tNak, tSign };
  throw new Error(quality);
}
const person = (id: string, name: string, c: ReturnType<typeof combo>, category = 'family', chart = true) => ({
  memberId: id, name, relationship: 'mother', category, gender: 'female', pulse: 50,
  chart: chart ? { ctx: { moonNakshatraIndex: c.nak, moonSignIndex: c.sign, transits: [{ planet: 'Moon', nakshatraIndex: c.tNak, signIndex: c.tSign }] } } : null,
});

beforeEach(() => {
  resetWorld();
  circle.people = [];
  delete (globalThis as { __noChart?: boolean }).__noChart;
});

describe('Ghar Ka Kavach', () => {
  beforeEach(() => world.features.add('hooks.gharKavach'));

  it('refuses while off', async () => {
    world.features.clear();
    await expect(getKavach(user, {}, at(26, '06:00'))).rejects.toMatchObject({ status: 403 });
  });

  it('with nobody in the family circle the state is empty', async () => {
    circle.people = [person('f', 'Friend', combo('poor'), 'social')];
    const v = await getKavach(user, {}, at(26, '06:00'));
    expect(v.state).toBe('empty');
    expect(v.today).toBeNull();
    await expect(addBeads(user, { count: 1 }, at(26, '06:00'))).rejects.toMatchObject({ message: 'NO_FAMILY' });
  });

  it('picks the family member with the poorest day, keeps the pick all day, and ignores friends and unreadable charts', async () => {
    circle.people = [
      person('a', 'Asha', combo('good')),
      person('b', 'Bhanu', combo('poor')),
      person('f', 'Friend', combo('poor'), 'social'),
      person('n', 'Nochart', combo('poor'), 'family', false),
    ];
    const v = await getKavach(user, {}, at(26, '06:00'));
    expect(v.state).toBe('ready');
    expect(v.today).toMatchObject({ memberId: 'b', name: 'Bhanu', beads: 0, beadsTarget: 11 });
    expect(v.today!.mantra).toContain('Namah');
    circle.people = [person('a', 'Asha', combo('poor'))]; // the circle changes later the same day
    expect((await getKavach(user, {}, at(26, '18:00'))).today!.memberId).toBe('b');
  });

  it('11 beads finish the day once; the Kalash and the streak grow', async () => {
    circle.people = [person('b', 'Bhanu', combo('poor'))];
    let r = await addBeads(user, { count: 5 }, at(26, '06:00'));
    expect(r.today!.beads).toBe(5);
    expect(r.justFilled).toBe(false);
    r = await addBeads(user, { count: 11 }, at(26, '06:30'));
    expect(r.today!.beads).toBe(11);
    expect(r.justFilled).toBe(true);
    expect(r.state).toBe('done');
    expect(r.streak).toBe(1);
    expect(r.kalash).toBe(1);
    expect(r.blessing?.text).toContain('Bhanu');
    const again = await addBeads(user, { count: 3 }, at(26, '07:00'));
    expect(again.justFilled).toBe(false);
    expect(again.today!.beads).toBe(11);
  });

  it('rejects a bead count outside 1-11', async () => {
    circle.people = [person('b', 'Bhanu', combo('poor'))];
    await expect(addBeads(user, { count: 0 }, at(26, '06:00'))).rejects.toMatchObject({ status: 400 });
    await expect(addBeads(user, { count: 12 }, at(26, '06:00'))).rejects.toMatchObject({ status: 400 });
  });

  it('seven days in a row fill the Kalash and unlock the free weekly summary; a gap resets it', async () => {
    circle.people = [person('b', 'Bhanu', combo('poor'))];
    for (let d = 20; d <= 26; d++) {
      await addBeads(user, { count: 11 }, at(d, '06:00'));
    }
    const v = await getKavach(user, {}, at(26, '09:00'));
    expect(v.streak).toBe(7);
    expect(v.kalash).toBe(7);
    expect(v.summary?.unlocked).toBe(true);
    expect(v.summary?.days).toHaveLength(7);
    const gap = await getKavach(user, {}, at(28, '09:00')); // 27th missed
    expect(gap.streak).toBe(0);
    expect(gap.summary).toBeNull();
  });
});

describe('Cosmic Receipts', () => {
  beforeEach(() => world.features.add('hooks.cosmicReceipts'));

  it('refuses while off and says 422 without a chart', async () => {
    world.features.clear();
    await expect(getReceipts(user, {}, at(26, '10:00'))).rejects.toMatchObject({ status: 403 });
    world.features.add('hooks.cosmicReceipts');
    (globalThis as { __noChart?: boolean }).__noChart = true;
    await expect(getReceipts(user, {}, at(26, '10:00'))).rejects.toMatchObject({ status: 422 });
  });

  it('shows three cards with their status by the clock', async () => {
    const v = await getReceipts(user, {}, at(26, '10:00'));
    expect(v.cards.map((c) => c.part)).toEqual(['morning', 'afternoon', 'evening']);
    expect(v.cards.map((c) => c.status)).toEqual(['live', 'upcoming', 'upcoming']);
    expect((await getReceipts(user, {}, at(26, '22:00'))).cards.map((c) => c.status)).toEqual(['past', 'past', 'live']);
    expect(v.tomorrow.unlocked).toBe(false);
    expect(v.tomorrow.cards).toBeNull();
  });

  it('cards do not change after they were made', async () => {
    const a = await getReceipts(user, {}, at(26, '10:00'));
    const b = await getReceipts(user, {}, at(26, '21:00'));
    expect(b.cards.map((c) => c.headline)).toEqual(a.cards.map((c) => c.headline));
    expect([...world.progress.keys()].filter((k) => k.includes('cosmicReceipts')).length).toBe(1);
  });

  it('a card can be marked once it has begun, once only', async () => {
    await getReceipts(user, {}, at(26, '10:00'));
    const v = await markCard(user, { date: 'today', part: 'morning', verdict: 'nailed' }, at(26, '10:05'));
    expect(v.cards[0]!.verdict).toBe('nailed');
    expect(v.share).toEqual({ rated: 1, nailed: 1, partly: 0, missed: 0 });
    await expect(markCard(user, { date: 'today', part: 'morning', verdict: 'missed' }, at(26, '10:06'))).rejects.toMatchObject({ message: 'ALREADY_MARKED' });
    await expect(markCard(user, { date: 'today', part: 'evening', verdict: 'partly' }, at(26, '10:07'))).rejects.toMatchObject({ message: 'NOT_YET' });
  });

  it('an unmarked card from yesterday is asked about first thing next morning, and can still be marked', async () => {
    await getReceipts(user, {}, at(26, '10:00'));
    await markCard(user, { date: 'today', part: 'morning', verdict: 'partly' }, at(26, '10:05'));
    const next = await getReceipts(user, {}, at(27, '07:00'));
    expect(next.yesterdayCheck).toEqual({ date: '2026-10-26', parts: ['afternoon', 'evening'] });
    const done = await markCard(user, { date: 'yesterday', part: 'afternoon', verdict: 'missed' }, at(27, '07:05'));
    expect(done.yesterdayCheck?.parts).toEqual(['evening']);
  });

  it('refuses a verdict or part it does not know', async () => {
    await getReceipts(user, {}, at(26, '10:00'));
    await expect(markCard(user, { date: 'today', part: 'morning', verdict: 'great' as never }, at(26, '10:05'))).rejects.toMatchObject({ status: 400 });
    await expect(markCard(user, { date: 'today', part: 'noon' as never, verdict: 'nailed' }, at(26, '10:05'))).rejects.toMatchObject({ status: 400 });
  });

  it('peeking at tomorrow costs 15 coins once and shows tomorrow\'s cards', async () => {
    await getReceipts(user, {}, at(26, '10:00'));
    const p = await peekTomorrow(user, {}, at(26, '10:10'));
    expect(p.chargedPaise).toBe(1500);
    expect(p.tomorrow.unlocked).toBe(true);
    expect(p.tomorrow.cards).toHaveLength(3);
    expect((await peekTomorrow(user, {}, at(26, '10:20'))).chargedPaise).toBe(0);
    expect(world.wallet.filter((w) => w.delta < 0)).toHaveLength(1);
  });

  it('no coins, no peek', async () => {
    world.balancePaise = 0;
    await expect(peekTomorrow(user, {}, at(26, '10:10'))).rejects.toMatchObject({ message: 'INSUFFICIENT_CREDITS' });
    expect(world.unlocks.size).toBe(0);
  });
});
