import { describe, expect, it } from 'vitest';
import {
  findTransitEvents,
  selectPushableEvents,
  pushAtForDate,
  istDateString,
  jdFromDate,
  dateFromJd,
  PLANET_WEIGHT,
  type TransitEvent,
} from '../src/lib/astro-tools/transit-events.js';

/**
 * Detection runs the real ephemeris over a real window, so these are slow by
 * unit-test standards. That is the point: the value of this suite is that the
 * dates it produces match published Vedic panchang, which a mocked ephemeris
 * could never demonstrate.
 */
const SLOW = 240_000;

function makeEvent(
  planet: string,
  forDate: string,
  eventType: TransitEvent['eventType'] = 'ingress',
): TransitEvent {
  return {
    planet,
    eventType,
    fromSign: 'Aries',
    toSign: 'Taurus',
    exactAt: new Date(`${forDate}T06:00:00Z`),
    forDate,
    weight: PLANET_WEIGHT[planet] ?? 10,
  };
}

describe('julian day round-trip', () => {
  it('converts Date -> JD -> Date losslessly to the millisecond', () => {
    const d = new Date('2025-03-29T16:16:22.000Z');
    expect(dateFromJd(jdFromDate(d)).toISOString()).toBe(d.toISOString());
  });

  it('anchors the unix epoch at JD 2440587.5', () => {
    expect(jdFromDate(new Date('1970-01-01T00:00:00Z'))).toBe(2440587.5);
  });
});

describe('istDateString', () => {
  it('rolls to the next IST day for late-evening UTC', () => {
    // 20:00 UTC is 01:30 IST the following day.
    expect(istDateString(new Date('2025-04-02T20:00:00Z'))).toBe('2025-04-03');
  });

  it('keeps the same day for morning UTC', () => {
    expect(istDateString(new Date('2025-03-29T16:16:00Z'))).toBe('2025-03-29');
  });
});

describe('pushAtForDate', () => {
  it('is 19:00 IST two days before the event date', () => {
    const pushAt = pushAtForDate('2025-03-29');
    // 19:00 IST on 27 March = 13:30 UTC on 27 March.
    expect(pushAt.toISOString()).toBe('2025-03-27T13:30:00.000Z');
    expect(istDateString(pushAt)).toBe('2025-03-27');
  });

  it('crosses a month boundary correctly', () => {
    expect(pushAtForDate('2025-04-01').toISOString()).toBe('2025-03-30T13:30:00.000Z');
  });
});

describe('findTransitEvents — against published Vedic (Lahiri sidereal) dates', () => {
  it(
    'finds the 2025 slow-planet transits on their published dates',
    async () => {
      const events = await findTransitEvents(
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-12-31T00:00:00Z'),
      );

      const find = (planet: string, type: string, toSign?: string) =>
        events.find(
          (e) => e.planet === planet && e.eventType === type && (!toSign || e.toSign === toSign),
        );

      // Saturn enters Pisces — 29 March 2025.
      expect(find('Saturn', 'ingress', 'Pisces')?.forDate).toBe('2025-03-29');
      // Jupiter enters Gemini — 14 May 2025.
      expect(find('Jupiter', 'ingress', 'Gemini')?.forDate).toBe('2025-05-14');
      // Rahu enters Aquarius (nodal axis shift) — 18 May 2025.
      expect(find('Rahu', 'ingress', 'Aquarius')?.forDate).toBe('2025-05-18');
      // Makar Sankranti, Sun enters Capricorn — 14 January 2025.
      expect(find('Sun', 'ingress', 'Capricorn')?.forDate).toBe('2025-01-14');
    },
    SLOW,
  );

  it(
    'never reports the Moon, and never reports a node station',
    async () => {
      const events = await findTransitEvents(
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-04-01T00:00:00Z'),
      );

      // The Moon changes sign every ~2.25 days; including it would drown
      // every other planet, so it must be absent entirely.
      expect(events.filter((e) => e.planet === 'Moon')).toHaveLength(0);

      // Rahu/Ketu are permanently retrograde — a station for either would mean
      // the exclusion in STATION_PLANETS had silently stopped applying.
      const nodeStations = events.filter(
        (e) => (e.planet === 'Rahu' || e.planet === 'Ketu') && e.eventType !== 'ingress',
      );
      expect(nodeStations).toHaveLength(0);
    },
    SLOW,
  );

  it(
    'detects both directions of a retrograde cycle',
    async () => {
      // Mercury retrogrades ~15 March 2025 and turns direct ~7 April 2025.
      const events = await findTransitEvents(
        new Date('2025-03-01T00:00:00Z'),
        new Date('2025-04-20T00:00:00Z'),
      );
      const retro = events.find((e) => e.planet === 'Mercury' && e.eventType === 'retrograde');
      const direct = events.find((e) => e.planet === 'Mercury' && e.eventType === 'direct');

      expect(retro?.forDate).toBe('2025-03-15');
      expect(direct?.forDate).toBe('2025-04-07');
      // Stations happen *in* a sign, they do not enter one.
      expect(retro?.toSign).toBeNull();
    },
    SLOW,
  );

  it(
    'returns events in chronological order',
    async () => {
      const events = await findTransitEvents(
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-06-01T00:00:00Z'),
      );
      const times = events.map((e) => e.exactAt.getTime());
      expect(times).toEqual([...times].sort((a, b) => a - b));
    },
    SLOW,
  );
});

describe('selectPushableEvents', () => {
  it('keeps events that are comfortably apart', () => {
    const events = [
      makeEvent('Mercury', '2025-01-01'),
      makeEvent('Venus', '2025-01-10'),
      makeEvent('Mars', '2025-01-20'),
    ];
    const result = selectPushableEvents(events);
    expect(result.every((r) => r.selected)).toBe(true);
  });

  it('drops the lighter planet when two collide', () => {
    const events = [makeEvent('Mercury', '2025-01-01'), makeEvent('Saturn', '2025-01-02')];
    const result = selectPushableEvents(events);

    const mercury = result.find((r) => r.event.planet === 'Mercury')!;
    const saturn = result.find((r) => r.event.planet === 'Saturn')!;
    expect(saturn.selected).toBe(true);
    expect(mercury.selected).toBe(false);
    expect(mercury.skipReason).toContain('collision:Saturn');
  });

  it('lets a heavier planet win even when it comes second', () => {
    // Mercury is first chronologically but must not be able to block Jupiter.
    const events = [makeEvent('Mercury', '2025-01-01'), makeEvent('Jupiter', '2025-01-03')];
    const result = selectPushableEvents(events);
    expect(result.find((r) => r.event.planet === 'Jupiter')!.selected).toBe(true);
    expect(result.find((r) => r.event.planet === 'Mercury')!.selected).toBe(false);
  });

  it('collapses a cluster to exactly one push', () => {
    const events = [
      makeEvent('Mercury', '2025-02-10'),
      makeEvent('Venus', '2025-02-11'),
      makeEvent('Sun', '2025-02-12'),
      makeEvent('Saturn', '2025-02-12'),
    ];
    const result = selectPushableEvents(events);
    expect(result.filter((r) => r.selected)).toHaveLength(1);
    expect(result.find((r) => r.selected)!.event.planet).toBe('Saturn');
  });

  it('reports Rahu rather than Ketu for the simultaneous nodal shift', () => {
    // Both nodes always change sign at the same instant (Ketu = Rahu + 180),
    // so exactly one of them should ever be pushed, deterministically Rahu.
    const events = [makeEvent('Rahu', '2025-05-18'), makeEvent('Ketu', '2025-05-18')];
    const result = selectPushableEvents(events);
    expect(result.filter((r) => r.selected)).toHaveLength(1);
    expect(result.find((r) => r.selected)!.event.planet).toBe('Rahu');
  });

  it('preserves the caller’s chronological ordering in its output', () => {
    const events = [
      makeEvent('Saturn', '2025-03-01'),
      makeEvent('Mercury', '2025-03-02'),
      makeEvent('Venus', '2025-03-20'),
    ];
    const result = selectPushableEvents(events);
    expect(result.map((r) => r.event.planet)).toEqual(['Saturn', 'Mercury', 'Venus']);
  });

  it('honours a custom gap', () => {
    const events = [makeEvent('Mercury', '2025-01-01'), makeEvent('Venus', '2025-01-05')];
    // 4 days apart: fine at the default 3-day gap, a collision at 7.
    expect(selectPushableEvents(events).filter((r) => r.selected)).toHaveLength(2);
    expect(selectPushableEvents(events, 7).filter((r) => r.selected)).toHaveLength(1);
  });
});
