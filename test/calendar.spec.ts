import { describe, expect, it } from 'vitest';
import type { Planet } from '@aroha-astrology/shared';
import {
  dashaEvents,
  festivalEvents,
  istDate,
  transitEvents,
} from '../src/modules/insights/calendar.service.js';
import { eclipsesBetween } from '../src/lib/astro-engine/panchang/eclipse.js';
import { calculateVimshottariDasha } from '../src/lib/astro-engine/dashas/vimshottari.js';
import type { ChartContext } from '../src/lib/intelligence/chart-context.js';
import type { TransitEvent } from '../src/lib/astro-tools/transit-events.js';

/** Ascendant Aries, Moon in Cancer (index 3); whole-sign lords from Aries. */
const LORDS: Planet[] = [
  'Mars',
  'Venus',
  'Mercury',
  'Moon',
  'Sun',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
  'Saturn',
  'Jupiter',
];
const ctx = {
  ascendantSignIndex: 0,
  moonSignIndex: 3,
  moonNakshatraIndex: 7,
  natal: [
    { planet: 'Saturn', signIndex: 9, house: 10, nakshatraIndex: 21 },
    { planet: 'Venus', signIndex: 6, house: 7, nakshatraIndex: 14 },
    { planet: 'Mars', signIndex: 7, house: 8, nakshatraIndex: 16 },
    { planet: 'Jupiter', signIndex: 8, house: 9, nakshatraIndex: 19 },
    { planet: 'Mercury', signIndex: 2, house: 3, nakshatraIndex: 6 },
    { planet: 'Sun', signIndex: 4, house: 5, nakshatraIndex: 10 },
    { planet: 'Moon', signIndex: 3, house: 4, nakshatraIndex: 7 },
    { planet: 'Rahu', signIndex: 11, house: 12, nakshatraIndex: 25 },
    { planet: 'Ketu', signIndex: 5, house: 6, nakshatraIndex: 12 },
  ],
  houseLords: Object.fromEntries(LORDS.map((p, i) => [i + 1, p])),
} as unknown as ChartContext;

function ingress(planet: string, from: string, to: string, at: string): TransitEvent {
  return {
    planet,
    eventType: 'ingress',
    fromSign: from,
    toSign: to,
    exactAt: new Date(at),
    forDate: at.slice(0, 10),
    weight: 0,
  };
}

describe('transitEvents', () => {
  it("places each sign change in the user's houses from the Moon and marks it by gochara", () => {
    const events = transitEvents(ctx, [
      // Jupiter into Scorpio: 5th from a Cancer Moon — classically favourable.
      ingress('Jupiter', 'Libra', 'Scorpio', '2026-10-10T08:00:00Z'),
      // Saturn into Aquarius: 8th from the Moon — a strain.
      ingress('Saturn', 'Capricorn', 'Aquarius', '2026-11-02T08:00:00Z'),
    ]);
    expect(events.map((e) => [e.params.planet, e.params.house, e.tone, e.area])).toEqual([
      ['Jupiter', 5, 1, 'education'],
      ['Saturn', 8, -1, 'health'],
    ]);
    expect(events[1]!.weight).toBeGreaterThan(events[0]!.weight); // Saturn outranks Jupiter
  });

  it("gives a sign change an end date when the same planet's next change is in range", () => {
    const [first] = transitEvents(ctx, [
      ingress('Mars', 'Leo', 'Virgo', '2026-10-01T00:00:00Z'),
      ingress('Mars', 'Virgo', 'Libra', '2026-11-15T00:00:00Z'),
    ]);
    expect(first!.endDate).toBe('2026-11-15');
    expect(first!.peakDate).toBeDefined();
  });

  it('weights a station below a sign change of the same planet', () => {
    const [station, change] = transitEvents(ctx, [
      {
        planet: 'Saturn',
        eventType: 'retrograde',
        fromSign: 'Pisces',
        toSign: null,
        exactAt: new Date('2026-07-01T00:00:00Z'),
        forDate: '2026-07-01',
        weight: 0,
      },
      ingress('Saturn', 'Pisces', 'Aries', '2027-06-01T00:00:00Z'),
    ]);
    expect(station!.kind).toBe('retrograde');
    expect(station!.weight).toBeLessThan(change!.weight);
  });
});

describe('dashaEvents', () => {
  const tree = calculateVimshottariDasha(123.4, new Date('1990-05-15T09:00:00Z'));
  const stored = JSON.parse(JSON.stringify(tree.mahadashas)) as Parameters<typeof dashaEvents>[1];

  it('lists antardasha changes that start in range, with end and peak dates', () => {
    const from = new Date('2028-01-01T00:00:00Z');
    const to = new Date('2033-01-01T00:00:00Z');
    const changes = dashaEvents(ctx, stored, from, to).filter((e) => e.kind === 'dashaChange');
    expect(changes.length).toBeGreaterThan(0);
    for (const e of changes) {
      expect(e.date >= istDate(from) && e.date < istDate(to)).toBe(true);
      expect(e.endDate! > e.date).toBe(true);
      expect(e.params.level).toBe('antardasha');
    }
  });

  it('only turns pratyantar periods into area windows when they lean one way', () => {
    const windows = dashaEvents(
      ctx,
      stored,
      new Date('2028-01-01T00:00:00Z'),
      new Date('2030-01-01T00:00:00Z'),
    ).filter((e) => e.kind === 'areaWindow');
    expect(windows.length).toBeGreaterThan(0);
    expect(windows.every((w) => w.tone !== 0 && w.area)).toBe(true);
  });
});

describe('festivalEvents', () => {
  it('reads the festival table for each day in range', () => {
    const events = festivalEvents(
      new Date('2028-08-14T18:30:00Z'),
      new Date('2028-08-24T18:30:00Z'),
    );
    expect(events.map((e) => e.params.name)).toEqual(['Independence Day', 'Ganesh Chaturthi']);
    expect(events[1]!.weight).toBeGreaterThan(events[0]!.weight); // major outweighs minor
  });
});

describe('eclipsesBetween', () => {
  it('finds the known August 2026 solar and lunar eclipses', async () => {
    const eclipses = await eclipsesBetween(
      new Date('2026-08-01T00:00:00Z'),
      new Date('2026-09-15T00:00:00Z'),
    );
    expect(eclipses.map((e) => [e.kind, e.at.toISOString().slice(0, 10)])).toEqual([
      ['solar', '2026-08-12'],
      ['lunar', '2026-08-28'],
    ]);
  }, 60_000);
});
