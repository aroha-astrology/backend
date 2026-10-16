import { describe, it, expect } from 'vitest';
import { calculateFullPanchangAsync } from '../../src/lib/astro-engine/panchang/index.js';
import { buildHoraSchedule } from '../../src/lib/astro-engine/panchang/hora.js';

// =============================================================================
// Audit items PN1, PN2 (docs/engine-audit/C-critical-corrections.md)
// =============================================================================

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};

describe('[PN2] a hora is one twelfth of the real day or the real night', () => {
  // Worked example: sunrise 05:40, sunset 19:16 on a Monday.
  //   Day   = 13 h 36 min = 816 min -> each day hora 68 min.
  //   Night = 24 h - 816 = 624 min  -> each night hora 52 min.
  // Hora lords run Sun, Venus, Mercury, Moon, Saturn, Jupiter, Mars from the
  // weekday lord, so Monday starts with the Moon and the 13th hora (the first
  // of the night) is 12 steps on: Moon(3) + 12 = 15 -> 15 mod 7 = 1 -> Venus.
  const schedule = buildHoraSchedule('05:40', '19:16', 1);

  it('gives 24 horas: twelve of 68 minutes, then twelve of 52', () => {
    expect(schedule).toHaveLength(24);
    expect(schedule[0]!.startTime).toBe('05:40');
    expect(schedule[0]!.endTime).toBe('06:48');
    expect(schedule[11]!.endTime).toBe('19:16');
    expect(schedule[12]!.startTime).toBe('19:16');
    expect(schedule[12]!.endTime).toBe('20:08');
    expect(schedule[23]!.endTime).toBe('05:40');
  });

  it('starts with the weekday lord and keeps the order across sunset', () => {
    expect(schedule[0]!.planet).toBe('Moon');
    expect(schedule[1]!.planet).toBe('Saturn');
    expect(schedule[12]!.planet).toBe('Venus');
  });
});

describe('[PN1] the Panchang uses the real sunrise and sunset', () => {
  it('Delhi, 27 July 2026: sunrise near 05:39 and sunset near 19:15 IST, and Rahu Kaal cut from them', async () => {
    // Almanac values for Delhi in the last week of July: sunrise 05:39,
    // sunset 19:15 IST, to within a couple of minutes.
    const date = new Date(2026, 6, 27);
    const p = await calculateFullPanchangAsync(date, 28.6139, 77.209, 100, 250, 5.5);

    expect(Math.abs(minutes(p.sunriseTime) - (5 * 60 + 39))).toBeLessThanOrEqual(2);
    expect(Math.abs(minutes(p.sunsetTime) - (19 * 60 + 15))).toBeLessThanOrEqual(2);

    // Monday: Rahu Kaal is the 2nd of eight equal parts of the day.
    const day = minutes(p.sunsetTime) - minutes(p.sunriseTime);
    expect(
      Math.abs(minutes(p.rahuKaal.start) - (minutes(p.sunriseTime) + day / 8)),
    ).toBeLessThanOrEqual(1);

    // The hora list hangs off the same sunrise and turns at the same sunset.
    expect(p.hora![0]!.startTime).toBe(p.sunriseTime);
    expect(p.hora![12]!.startTime).toBe(p.sunsetTime);
  }, 60_000);
});
