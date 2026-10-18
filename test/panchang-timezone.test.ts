import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanchangCacheRow } from '../src/db/schema.js';

// =============================================================================
// Panchang at the place's own clock. Until 2026-10 getPanchang always used
// IST (+5:30), so a user in New York saw sunrise "16:4x" and every Rahu Kaal,
// Choghadiya and Hora shifted by 9.5 hours. The app now sends the device's
// IANA zone; IST stays the default, and Indian results must not change.
//
// Reference sunrises (NOAA solar calculator, upper limb + refraction):
// New York 20 Oct 2026 ~07:12 EDT, 15 Dec 2026 ~07:12 EST.
// Tromsø (69.65 N) has polar night on 15 Dec and midnight sun on 21 Jun.
// =============================================================================

const state = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  findCachedPanchang: vi.fn(),
  upsertCachedPanchang: vi.fn(),
}));

vi.mock('../src/modules/astro/panchang-cache.repo.js', () => ({
  findCachedPanchang: state.findCachedPanchang,
  upsertCachedPanchang: state.upsertCachedPanchang,
}));

const { getPanchang, civilDateIn, isValidTimeZone } = await import('../src/modules/astro/astro.service.js');
const { roundCoordToLocationKey } = await import('../src/lib/astro-tools/panchang-reference-points.js');

beforeEach(() => {
  state.store.clear();
  state.findCachedPanchang.mockReset().mockImplementation((forDate: string, refKey: string) => {
    const data = state.store.get(`${forDate}|${refKey}`);
    return Promise.resolve(data ? ({ data } as PanchangCacheRow) : undefined);
  });
  state.upsertCachedPanchang
    .mockReset()
    .mockImplementation((p: { forDate: string; refKey: string; data: unknown }) => {
      state.store.set(`${p.forDate}|${p.refKey}`, p.data);
      return Promise.resolve();
    });
});

const DELHI = { lat: 28.6139, lon: 77.209 };
const NEW_YORK = { lat: 40.7128, lon: -74.006 };
const TROMSO = { lat: 69.6492, lon: 18.9553 };

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};

describe('getPanchang on the place clock', () => {
  it('Delhi with tz=Asia/Kolkata is the same day, same key and same times as with no tz', async () => {
    const plain = await getPanchang(DELHI.lat, DELHI.lon, '2026-10-20');
    state.store.clear();
    const withTz = await getPanchang(DELHI.lat, DELHI.lon, '2026-10-20', { timeZone: 'Asia/Kolkata' });
    expect(withTz).toEqual(plain);
    expect(withTz.dayTimesMode).toBe('sunrise');
    // IST rows keep the plain reference key the cron warms.
    expect([...state.store.keys()]).toEqual(['2026-10-20|delhi']);
  }, 60_000);

  it('New York in October gets EDT clock times and its own cache key', async () => {
    const p = await getPanchang(NEW_YORK.lat, NEW_YORK.lon, '2026-10-20', { timeZone: 'America/New_York' });
    expect(Math.abs(minutes(p.sunriseTime) - (7 * 60 + 12))).toBeLessThanOrEqual(4);
    expect(minutes(p.sunsetTime)).toBeGreaterThan(17 * 60 + 50);
    expect(minutes(p.sunsetTime)).toBeLessThan(18 * 60 + 20);
    // Rahu Kaal sits inside the local day, not 9.5 h away.
    expect(minutes(p.rahuKaal.start)).toBeGreaterThanOrEqual(minutes(p.sunriseTime));
    expect(minutes(p.rahuKaal.end)).toBeLessThanOrEqual(minutes(p.sunsetTime));
    const key = `${roundCoordToLocationKey(NEW_YORK.lat, NEW_YORK.lon)}@-4`;
    expect(state.store.has(`2026-10-20|${key}`)).toBe(true);
  }, 60_000);

  it('New York in December follows the end of daylight saving (EST, -5)', async () => {
    const p = await getPanchang(NEW_YORK.lat, NEW_YORK.lon, '2026-12-15', { timeZone: 'America/New_York' });
    expect(Math.abs(minutes(p.sunriseTime) - (7 * 60 + 12))).toBeLessThanOrEqual(4);
    const key = `${roundCoordToLocationKey(NEW_YORK.lat, NEW_YORK.lon)}@-5`;
    expect(state.store.has(`2026-12-15|${key}`)).toBe(true);
  }, 60_000);

  it('the same New York coordinates on IST stay a separate cache row', async () => {
    await getPanchang(NEW_YORK.lat, NEW_YORK.lon, '2026-10-20', { timeZone: 'America/New_York' });
    const ist = await getPanchang(NEW_YORK.lat, NEW_YORK.lon, '2026-10-20');
    expect(minutes(ist.sunriseTime)).toBeGreaterThan(16 * 60); // the old IST reading
    expect(state.store.size).toBe(2);
  }, 60_000);
});

describe('high latitude: windows from solar noon ± 6 h', () => {
  it('Tromsø polar night (15 Dec): solarNoon mode, 12 h of windows around local noon', async () => {
    const p = await getPanchang(TROMSO.lat, TROMSO.lon, '2026-12-15', { timeZone: 'Europe/Oslo' });
    expect(p.dayTimesMode).toBe('solarNoon');
    // Solar noon in Tromsø (UTC+1) is about 11:50; Abhijit (8th of 15 muhurtas) sits around it.
    const abhijitMid = (minutes(p.abhijitMuhurta.start) + minutes(p.abhijitMuhurta.end)) / 2;
    expect(Math.abs(abhijitMid - (11 * 60 + 50))).toBeLessThanOrEqual(20);
    // Rahu Kaal is one eighth of 12 h.
    expect(minutes(p.rahuKaal.end) - minutes(p.rahuKaal.start)).toBe(90);
    expect(p.hora).toHaveLength(24);
  }, 60_000);

  it('Tromsø midnight sun (21 Jun): solarNoon mode as well', async () => {
    const p = await getPanchang(TROMSO.lat, TROMSO.lon, '2026-06-21', { timeZone: 'Europe/Oslo' });
    expect(p.dayTimesMode).toBe('solarNoon');
    expect(minutes(p.rahuKaal.end) - minutes(p.rahuKaal.start)).toBe(90);
  }, 60_000);

  it('Oslo (59.9 N) keeps real sunrise windows on its 6 h winter day and 19 h summer day', async () => {
    const winter = await getPanchang(59.9139, 10.7522, '2026-12-21', { timeZone: 'Europe/Oslo' });
    const summer = await getPanchang(59.9139, 10.7522, '2026-06-21', { timeZone: 'Europe/Oslo' });
    expect(winter.dayTimesMode).toBe('sunrise');
    expect(summer.dayTimesMode).toBe('sunrise');
  }, 60_000);
});

describe('time zone helpers', () => {
  it('civilDateIn gives the local date on either side of the date line', () => {
    const now = new Date('2026-10-20T20:00:00Z');
    expect(civilDateIn('Pacific/Kiritimati', now)).toBe('2026-10-21'); // UTC+14
    expect(civilDateIn('America/New_York', now)).toBe('2026-10-20');
    expect(civilDateIn('Asia/Kolkata', now)).toBe('2026-10-21'); // 01:30 IST
  });

  it('isValidTimeZone accepts real zones and refuses made-up ones', () => {
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});
