// C2: on seeded synthetic births, all three annual dashas (Mudda, Mudda Yogini, Patyayini) tile each
// Varsha year exactly and meet at the solar return, so no day of 2026 -> 2027 is dropped or doubled.
import { describe, it, expect } from 'vitest';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { computeCalendarYearVarshphal, zoneOffsetMs } from '../src/lib/astro-engine/varshphal/calendar-year.js';
import { computeLifeSahams } from '../src/lib/astro-engine/varshphal/sahams-life.js';
import { harshaBala, BALA_PLANETS } from '../src/lib/astro-engine/varshphal/annual-balas.js';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

describe('annual dashas on 24 seeded births, calendar year 2027', () => {
  const r = rng(20261109);
  const births = Array.from({ length: 24 }, () => ({
    y: 1950 + Math.floor(r() * 61), mo: 1 + Math.floor(r() * 12), d: 1 + Math.floor(r() * 28),
    h: Math.floor(r() * 24), mi: Math.floor(r() * 60),
    lat: +(8 + r() * 27).toFixed(2), lng: +(68 + r() * 29).toFixed(2),
  }));
  it.each(births.map((b, i) => [i, b] as const))('birth %i', async (_i, b) => {
    const tz = 'Asia/Kolkata';
    const wall = Date.UTC(b.y, b.mo - 1, b.d, b.h, b.mi);
    const utc = wall - zoneOffsetMs(wall, tz);
    const natal = await calculateChart(b.y, b.mo, b.d, b.h, b.mi, (wall - utc) / 3_600_000, b.lat, b.lng, 'lahiri', 'W');
    const moon = natal.planets.find((p) => p.planet === 'Moon')!;
    const cy = await computeCalendarYearVarshphal(
      {
        natalSunLongitude: natal.planets.find((p) => p.planet === 'Sun')!.longitude,
        natalAscSignIndex: natal.ascendant.signIndex,
        birthDate: new Date(utc),
        birthNakshatraIndex: Math.floor(moon.longitude / (360 / 27)),
        latitude: b.lat, longitude: b.lng, timezone: tz,
      },
      2027,
    );
    expect(cy.varshaYears.length).toBeGreaterThanOrEqual(1);
    for (const v of cy.varshaYears) {
      for (const list of [v.mudda, v.muddaYogini, v.patyayini] as Array<Array<{ startMs: number; endMs: number }>>) {
        expect(list[0]!.startMs).toBe(v.startMs);
        expect(list[list.length - 1]!.endMs).toBe(v.endMs);
        for (let i = 1; i < list.length; i++) expect(list[i]!.startMs).toBe(list[i - 1]!.endMs);
      }
      const isDay = true;
      for (const s of computeLifeSahams(v.varshphal.solarReturn.chart, isDay)) {
        expect(Number.isFinite(s.longitude)).toBe(true);
        expect(/mrityu|death/i.test(s.name)).toBe(false);
      }
      const h = harshaBala(v.varshphal.solarReturn.chart, isDay);
      for (const p of BALA_PLANETS) expect([0, 5, 10, 15, 20]).toContain(h[p].total);
    }
    // the seam between two Varsha years in the window
    for (let i = 1; i < cy.varshaYears.length; i++) {
      const a = cy.varshaYears[i - 1]!, c = cy.varshaYears[i]!;
      expect(a.muddaYogini[a.muddaYogini.length - 1]!.endMs).toBe(c.muddaYogini[0]!.startMs);
      expect(a.patyayini[a.patyayini.length - 1]!.endMs).toBe(c.patyayini[0]!.startMs);
    }
  }, 60_000);
});
