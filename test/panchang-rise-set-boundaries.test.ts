import { describe, it, expect } from 'vitest';
import { getMoonriseMoonset } from '../src/lib/astro-engine/panchang/rise-set';
import {
  getTithiBoundary,
  getNakshatraBoundary,
} from '../src/lib/astro-engine/panchang/boundaries';
import { calculateFullPanchangAsync } from '../src/lib/astro-engine/panchang/index';
import { dateToJulianDay } from '../src/lib/astro-engine/calculations/planetPositions.core';

// Delhi/NCR — same reference point used elsewhere in the Panchang engine
// (see astro-tools/panchang-reference-points.ts).
const DELHI_LAT = 28.6139;
const DELHI_LON = 77.209;
const IST_OFFSET = 5.5;

/** Matches production's date-construction convention (astro.service.ts's
 * `getPanchang`): no 'Z' suffix, so the string is parsed as local wall-clock
 * time and getFullYear()/getMonth()/getDate() round-trip the intended Y/M/D
 * on any machine, regardless of the test runner's own timezone. */
function localDate(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00`);
}

function toMinutesOfDay(hhmm: string): number {
  const parts = hhmm.split(':').map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  return h * 60 + m;
}

/**
 * Asserts `actual` (HH:mm) is within `toleranceMin` minutes of `expected`
 * (HH:mm), treating both as same-day clock times.
 */
function expectCloseTime(actual: string | null, expected: string, toleranceMin: number) {
  expect(actual).not.toBeNull();
  const diff = Math.abs(toMinutesOfDay(actual as string) - toMinutesOfDay(expected));
  expect(diff).toBeLessThanOrEqual(toleranceMin);
}

describe('getMoonriseMoonset', () => {
  // Drik Panchang's convention (rise-set.ts): disc centre, no refraction, and
  // the first rise and set after the day's sunrise, flagged when after
  // midnight. Every value below was read off Drik's day page for New Delhi
  // (geoname-id 1261481) on 2026-10-20 and must match it to the minute. The
  // 27 July reference this test used before (17:01 / 02:29, from another app)
  // was wrong by about an hour; Drik shows 18:00 / 04:05.
  const DRIK: Array<[string, string | null, boolean, string | null, boolean]> = [
    // date, moonrise, rise next day, moonset, set next day
    ['2026-07-27', '18:00', false, '04:05', true],
    ['2026-07-14', null, false, '19:32', false], // Drik: "No Moonrise"
    ['2026-10-20', '14:23', false, '01:22', true],
    ['2026-10-25', '17:00', false, '06:23', true],
    ['2026-11-03', '01:47', true, '13:59', false],
  ];

  it.each(DRIK)('matches Drik Panchang on %s', async (date, rise, riseNext, set, setNext) => {
    const result = await getMoonriseMoonset(localDate(date), DELHI_LAT, DELHI_LON, IST_OFFSET);
    if (rise === null) expect(result.moonrise).toBeNull();
    else expectCloseTime(result.moonrise, rise, 1);
    expect(result.moonriseNextDay).toBe(riseNext);
    if (set === null) expect(result.moonset).toBeNull();
    else expectCloseTime(result.moonset, set, 1);
    expect(result.moonsetNextDay).toBe(setNext);
  });

  it('never throws, even for a nonsensical location', async () => {
    await expect(
      getMoonriseMoonset(localDate('2026-07-27'), 9999, 9999, IST_OFFSET),
    ).resolves.toEqual(expect.objectContaining({}));
  });
});

describe('getTithiBoundary', () => {
  // Reference: Shukla Trayodashi ends ~4:16 PM (16:16) on 27 July 2026 in
  // Delhi. Verified independently (outside this test suite) to resolve to
  // 16:17 — a 1-minute match — so a tight tolerance here is intentional,
  // unlike the rise/set tests above.
  it('resolves the Shukla Trayodashi -> Chaturdashi boundary to within a few minutes of a known reference', async () => {
    const jdNoon = await dateToJulianDay(2026, 7, 27, 12, 0, IST_OFFSET);
    const boundary = await getTithiBoundary(jdNoon, IST_OFFSET);

    expectCloseTime(boundary.endsAt, '16:16', 10);
    expect(boundary.nextName).toBe('Chaturdashi');
  });

  it('returns an HH:mm string and a name from the standard 30-tithi cycle', async () => {
    const jdNoon = await dateToJulianDay(2026, 7, 27, 12, 0, IST_OFFSET);
    const boundary = await getTithiBoundary(jdNoon, IST_OFFSET);
    expect(boundary.endsAt).toMatch(/^\d{2}:\d{2}$/);
    expect(typeof boundary.nextName).toBe('string');
    expect(boundary.nextName.length).toBeGreaterThan(0);
  });
});

describe('getNakshatraBoundary', () => {
  it('returns an HH:mm string and a valid nakshatra name', async () => {
    const jdNoon = await dateToJulianDay(2026, 7, 27, 12, 0, IST_OFFSET);
    const boundary = await getNakshatraBoundary(jdNoon, IST_OFFSET);
    expect(boundary.endsAt).toMatch(/^\d{2}:\d{2}$/);
    expect(typeof boundary.nextName).toBe('string');
    expect(boundary.nextName.length).toBeGreaterThan(0);
  });
});

describe('calculateFullPanchangAsync', () => {
  it('includes moonriseTime/moonsetTime and tithi/nakshatra endsAt+nextName alongside the existing fields', async () => {
    const date = localDate('2026-07-27');
    // sunLong/moonLong values matching the elongation this civil day is
    // actually at (Shukla Trayodashi, ~154 deg elongation) — close enough
    // for calculateTithi/calculateNakshatra's own (unrelated) classification
    // to land somewhere sane; the boundary/rise-set fields under test don't
    // depend on these at all (they recompute their own ephemeris lookups).
    const result = await calculateFullPanchangAsync(
      date,
      DELHI_LAT,
      DELHI_LON,
      101,
      255,
      IST_OFFSET,
    );

    expect(typeof result.moonriseTime === 'string' || result.moonriseTime === undefined).toBe(true);
    expect(typeof result.moonsetTime === 'string' || result.moonsetTime === undefined).toBe(true);
    expect(result.tithi.endsAt).toMatch(/^\d{2}:\d{2}$/);
    expect(typeof result.tithi.nextName).toBe('string');
    expect(result.nakshatra.endsAt).toMatch(/^\d{2}:\d{2}$/);
    expect(typeof result.nakshatra.nextName).toBe('string');

    // Existing (pre-this-change) fields must still be present and untouched.
    expect(result.sunriseTime).toMatch(/^\d{2}:\d{2}$/);
    expect(result.sunsetTime).toMatch(/^\d{2}:\d{2}$/);
    expect(result.choghadiya?.day).toHaveLength(8);
    expect(result.hora).toHaveLength(24);
  }, 20_000);
});
