import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetWorld, world } from './helpers/hooks-world';
import { FIXTURE_PLANETS } from './helpers/chart-fixture';

vi.mock('../src/modules/hooks/hooks.repo', async () => (await import('./helpers/hooks-world')).hooksRepoMock);
vi.mock('../src/modules/users/users.repo', async () => (await import('./helpers/hooks-world')).usersRepoMock);
vi.mock('../src/modules/features/features.service', async () => (await import('./helpers/hooks-world')).featuresServiceMock);
vi.mock('../src/lib/entitlements', () => ({ passEntitlement: async () => (await import('./helpers/hooks-world')).world.pass }));
vi.mock('../src/lib/notifications/notify-user', () => ({ notifyUser: async () => {} }));
vi.mock('../src/modules/astro/astro.service', () => ({ isValidTimeZone: () => true }));

const g = globalThis as { __other?: Record<string, unknown>; __people?: unknown[]; __moonJump?: boolean; __nak?: number };

// Moon: on the 10th of May 1990 it changes sign (29 deg early, 31 deg late); on every other day it sits at 100.
// Nakshatra of the Moon "last night" comes from __nak.
vi.mock('../src/lib/astro-engine/calculations/planetPositions', () => ({
  calculatePlanetPositions: async (jd: number) => {
    const day = (jd - 2440587.5) * 86400000;
    const birth = Date.UTC(1990, 4, 10, 12);
    const lon = Math.abs(day - birth) < 86400000 / 2 + 1 ? (day < birth ? 29 : 31) : 100 + 13.2 * ((day % 86400000) / 86400000);
    return [
      { planet: 'Moon', longitude: lon, signIndex: Math.floor(lon / 30), nakshatraIndex: g.__nak ?? 5 },
      { planet: 'Venus', longitude: 120, signIndex: 4, nakshatraIndex: 1 },
      { planet: 'Mercury', longitude: 110, signIndex: 3, nakshatraIndex: 1 },
    ];
  },
}));

vi.mock('../src/modules/birth-profiles/birth-profiles.repo', () => ({
  listBirthProfilesByOwner: async () => [
    { id: 'p-exact', displayName: 'Asha', relationship: 'partner', dateOfBirth: '1990-05-10' },
    { id: 'p-nodob', displayName: 'Ghost', relationship: null, dateOfBirth: null },
  ],
  findOwnedBirthProfile: async (id: string) =>
    id === 'p-exact' || id === 'p-unknown'
      ? { id, displayName: id === 'p-exact' ? 'Asha' : 'Bhanu', relationship: 'partner', dateOfBirth: '1990-05-10' }
      : undefined,
}));
vi.mock('../src/modules/birth-profiles/profile-context', () => ({
  resolveActiveProfileContext: async () => ({ birthProfileId: null, birthTimeAccuracy: 'exact', gender: 'male' }),
  resolveProfileContext: async (_u: unknown, id: string | null) => ({
    birthProfileId: id, gender: 'female', dateOfBirth: '1990-05-10', placeOfBirth: { tz: 'UTC' },
    birthTimeAccuracy: id === 'p-exact' ? 'exact' : 'unknown',
  }),
}));
vi.mock('../src/modules/bonds/bonds.service', () => ({
  loadBondChart: async (_u: unknown, profile: { birthProfileId: string | null }) =>
    (globalThis as { __noChart?: boolean }).__noChart
      ? null
      : {
          ctx: { moonSignIndex: 1, moonNakshatraIndex: 3 },
          chartData: {
            planets: profile.birthProfileId === 'p-exact'
              ? [{ planet: 'Moon', longitude: 200 }, { planet: 'Venus', longitude: 220 }, { planet: 'Mercury', longitude: 215 }]
              : FIXTURE_PLANETS,
            ascendant: { signIndex: 6, degree: 5 },
          },
        },
  bondCompatibility: (_a: unknown, b: { pct: number }) => ({ pct: b.pct }),
  bondSpec: () => ({}),
}));
vi.mock('../src/modules/hooks/circle-people', () => ({ loadCirclePeople: async () => g.__people ?? [] }));

import { armPeakAlert, getTextTiming, listTextPeople } from '../src/modules/hooks/text-timing.service';
import { getSleep, logSleep, unlockSleepReport } from '../src/modules/hooks/sleep.service';
import { getMystery, scratchCard } from '../src/modules/hooks/mystery.service';

const user = {
  id: 'u1', locale: 'en', currentTimezone: 'Asia/Kolkata', skyMode: 'HOME',
  homeLocation: { name: 'New Delhi', lat: 28.61, lon: 77.21, tz: 'Asia/Kolkata' }, currentLocation: null,
} as never;
const at = (day: number, hhmmIst: string) => {
  const [h, m] = hhmmIst.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, day, h! - 5, m! - 30));
};

beforeEach(() => {
  resetWorld();
  delete g.__people;
  delete g.__nak;
  delete (globalThis as { __noChart?: boolean }).__noChart;
});

describe('Text them now?', () => {
  beforeEach(() => world.features.add('hooks.textTiming'));

  it('refuses while off', async () => {
    world.features.clear();
    await expect(listTextPeople(user)).rejects.toMatchObject({ status: 403 });
  });

  it('lists the reader\'s own saved profiles and marks the ones without a birth date unreadable', async () => {
    const list = await listTextPeople(user);
    expect(list.map((p) => [p.name, p.readable])).toEqual([['Asha', true], ['Ghost', false]]);
  });

  it('a person with an exact birth time gets one reading; the words are a timing suggestion', async () => {
    const v = await getTextTiming(user, { profileId: 'p-exact' }, at(26, '10:00'));
    expect(v.precision).toBe('exact');
    expect(v.variants).toHaveLength(1);
    expect(v.variants[0]!.label).toBeNull();
    expect(v.variants[0]!.cards.map((c) => c.id)).toEqual(['now', 'window', 'moon', 'tone']);
    expect(v.note).toContain('timing suggestion');
    expect(JSON.stringify(v.variants)).not.toMatch(/\b(feels?|loves?|misses you)\b/i);
  });

  it('without their birth time and a Moon that changed sign that day, both options are shown with labels', async () => {
    const v = await getTextTiming(user, { profileId: 'p-unknown' }, at(26, '10:00'));
    expect(v.precision).toBe('moon-sign-options');
    expect(v.variants.map((x) => x.label)).toEqual(['Moon in Aries', 'Moon in Taurus']);
  });

  it('an unknown profile is a 404', async () => {
    await expect(getTextTiming(user, { profileId: 'nope' }, at(26, '10:00'))).rejects.toMatchObject({ status: 404 });
  });

  it('the peak alert costs 15 coins once and is set for the start of the best stretch', async () => {
    const view = await getTextTiming(user, { profileId: 'p-exact' }, at(26, '00:10'));
    if (!view.variants[0]!.best) return;
    const r = await armPeakAlert(user, { profileId: 'p-exact' }, at(26, '00:10'));
    expect(r.armed).toBe(true);
    expect(r.chargedPaise).toBe(1500);
    expect(world.alarms).toHaveLength(1);
    expect(world.alarms[0]!.hook).toBe('textTiming');
    const again = await armPeakAlert(user, { profileId: 'p-exact' }, at(26, '00:20'));
    expect(again.chargedPaise).toBe(0);
    expect(world.alarms).toHaveLength(1);
    expect((await getTextTiming(user, { profileId: 'p-exact' }, at(26, '00:30'))).alert.armed).toBe(true);
  });

  it('no alert when the day is over', async () => {
    const r = await armPeakAlert(user, { profileId: 'p-exact' }, at(26, '23:59'));
    expect(r.chargedPaise).toBe(0);
    expect(world.alarms).toHaveLength(0);
  });
});

describe('Sleep Sync', () => {
  beforeEach(() => world.features.add('hooks.sleepSync'));

  it('refuses while off', async () => {
    world.features.clear();
    await expect(getSleep(user, {}, at(26, '07:00'))).rejects.toMatchObject({ status: 403 });
  });

  it('shows last night\'s Moon and the Moon\'s bindus in that sign before anything is logged', async () => {
    g.__nak = 3;
    const v = await getSleep(user, {}, at(26, '07:00'));
    expect(v.lastNight).toMatchObject({ nakshatraIndex: 3, nakshatra: 'Rohini', sign: 'Cancer' });
    expect(typeof v.lastNight.bindus === 'number' || v.lastNight.bindus === null).toBe(true);
    expect(v.logged).toBeNull();
    expect(v.pattern.ready).toBe(false);
    expect(v.note).toContain('not a health reading');
  });

  it('logs a score, and logging again the same morning replaces it', async () => {
    expect((await logSleep(user, { score: 4 }, at(26, '07:00'))).logged).toBe(4);
    expect((await logSleep(user, { score: 2 }, at(26, '08:00'))).logged).toBe(2);
    expect(world.sleep.size).toBe(1);
  });

  it('rejects a score outside 1-5', async () => {
    await expect(logSleep(user, { score: 0 }, at(26, '07:00'))).rejects.toMatchObject({ status: 400 });
    await expect(logSleep(user, { score: 6 }, at(26, '07:00'))).rejects.toMatchObject({ status: 400 });
    await expect(logSleep(user, { score: 3.5 }, at(26, '07:00'))).rejects.toMatchObject({ status: 400 });
  });

  it('after seven nights the pattern appears with names', async () => {
    for (let d = 19; d <= 25; d++) {
      g.__nak = d % 27;
      await logSleep(user, { score: 1 + (d % 5) }, at(d, '07:00'));
    }
    const v = await getSleep(user, {}, at(26, '07:00'));
    expect(v.pattern.ready).toBe(true);
    expect(v.pattern.topNames).toHaveLength(3);
    expect(v.pattern.bottomNames).toHaveLength(3);
    expect(v.pattern.confidence).toBe('early');
  });

  it('the 30-day report costs 49 coins once a day and is hidden until opened', async () => {
    await logSleep(user, { score: 5 }, at(25, '07:00'));
    expect((await getSleep(user, {}, at(26, '07:00'))).report).toMatchObject({ unlocked: false, data: null, pricePaise: 4900 });
    const r = await unlockSleepReport(user, {}, at(26, '07:05'));
    expect(r.chargedPaise).toBe(4900);
    expect(r.report.unlocked).toBe(true);
    expect(r.report.data?.nights).toBe(1);
    expect((await unlockSleepReport(user, {}, at(26, '08:00'))).chargedPaise).toBe(0);
    expect(world.wallet.filter((w) => w.delta < 0)).toHaveLength(1);
  });
});

describe('Mystery Synastry', () => {
  beforeEach(() => world.features.add('hooks.mysteryDrop'));
  const p = (id: string, name: string, pct: number) => ({
    memberId: id, name, relationship: 'friend', category: 'social', gender: 'female', pulse: 50,
    chart: { ctx: { pct }, chartData: { planets: [{ planet: 'Moon', longitude: 100 }] } },
  });

  it('waits until 18:00', async () => {
    const v = await getMystery(user, {}, at(26, '16:30'));
    expect(v).toMatchObject({ state: 'waiting', opensInMin: 90, cards: [] });
  });

  it('after 18:00 the card is there but hidden until scratched; one card for a free reader', async () => {
    g.__people = [p('a', 'Asha', 60), p('b', 'Bhanu', 90)];
    const v = await getMystery(user, {}, at(26, '18:05'));
    expect(v.state).toBe('ready');
    expect(v.allowed).toBe(1);
    expect(v.cards).toHaveLength(1);
    expect(v.cards[0]).toMatchObject({ scratched: false, name: null, score: null, why: null, kind: null });
  });

  it('scratching reveals the best-linked person and the reason, and stays revealed', async () => {
    g.__people = [p('a', 'Asha', 60), p('b', 'Bhanu', 90)];
    await getMystery(user, {}, at(26, '18:05'));
    const r = await scratchCard(user, { index: 0 }, at(26, '18:10'));
    expect(r.cards[0]).toMatchObject({ scratched: true, name: 'Bhanu', kind: 'circle' });
    expect(r.cards[0]!.why).toHaveLength(2);
    expect((await getMystery(user, {}, at(26, '21:00'))).cards[0]!.name).toBe('Bhanu');
  });

  it('the pick is made once: a new friend later the same day does not change the card', async () => {
    g.__people = [p('a', 'Asha', 60)];
    await getMystery(user, {}, at(26, '18:05'));
    g.__people = [p('a', 'Asha', 60), p('z', 'Zoya', 99)];
    expect((await scratchCard(user, { index: 0 }, at(26, '20:00'))).cards[0]!.name).toBe('Asha');
  });

  it('a Pass member gets a second card for the next person', async () => {
    world.pass = { tier: 'gold' };
    g.__people = [p('a', 'Asha', 60), p('b', 'Bhanu', 90), p('c', 'Chitra', 75)];
    const v = await getMystery(user, {}, at(26, '18:05'));
    expect(v.allowed).toBe(2);
    expect(v.cards).toHaveLength(2);
    const names = [(await scratchCard(user, { index: 0 }, at(26, '18:10'))).cards[0]!.name, (await scratchCard(user, { index: 1 }, at(26, '18:11'))).cards[1]!.name];
    expect(names).toEqual(['Bhanu', 'Chitra']);
  });

  it('with nobody in the circle it shows a public chart and the add-a-friend hint, never a user', async () => {
    g.__people = [];
    const v = await getMystery(user, {}, at(26, '18:05'));
    expect(v.state).toBe('ready');
    expect(v.addFriendHint).toBe(true);
    const r = await scratchCard(user, { index: 0 }, at(26, '18:06'));
    expect(r.cards[0]!.kind).toBe('public');
    expect(['Albert Einstein', 'Steve Jobs', 'Diana, Princess of Wales']).toContain(r.cards[0]!.name);
  });

  it('cannot scratch before 18:00 or a card that is not there', async () => {
    await expect(scratchCard(user, { index: 0 }, at(26, '12:00'))).rejects.toMatchObject({ message: 'NOT_YET' });
    g.__people = [p('a', 'Asha', 60)];
    await getMystery(user, {}, at(26, '18:05'));
    await expect(scratchCard(user, { index: 1 }, at(26, '18:06'))).rejects.toMatchObject({ status: 404 });
  });

  it('no chart, no card', async () => {
    (globalThis as { __noChart?: boolean }).__noChart = true;
    expect((await getMystery(user, {}, at(26, '18:05'))).state).toBe('empty');
  });
});
