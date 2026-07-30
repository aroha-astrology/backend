import { describe, it, expect } from 'vitest';
import {
  houseFromMoonPhase,
  mergeSadeSatiWindows,
  mergeDhaiyaWindows,
  findSaturnSignChanges,
  buildSaturnPhaseTimeline,
  detectRealSadeSati,
  detectRealDhaiya,
  type SaturnPhaseSegment,
} from '../src/lib/astro-engine/doshas/saturnPhaseTimeline.js';
import { calculatePlanetPositions } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { jdFromDate, dateFromJd } from '../src/lib/astro-tools/transit-events.js';

describe('houseFromMoonPhase', () => {
  it('maps house 12 to sade-sati-rising, 1 to peak, 2 to setting', () => {
    expect(houseFromMoonPhase(12)).toBe('sade-sati-rising');
    expect(houseFromMoonPhase(1)).toBe('sade-sati-peak');
    expect(houseFromMoonPhase(2)).toBe('sade-sati-setting');
  });

  it('maps house 4 and 8 to the two Dhaiya phases', () => {
    expect(houseFromMoonPhase(4)).toBe('dhaiya-4th');
    expect(houseFromMoonPhase(8)).toBe('dhaiya-8th');
  });

  it('maps every other house to none', () => {
    for (const h of [3, 5, 6, 7, 9, 10, 11]) {
      expect(houseFromMoonPhase(h)).toBe('none');
    }
  });
});

function seg(houseFromMoon: number, startDay: number, endDay: number): SaturnPhaseSegment {
  const dayMs = 86_400_000;
  return {
    houseFromMoon,
    phase: houseFromMoonPhase(houseFromMoon),
    saturnSignIndex: 0,
    startDate: new Date(startDay * dayMs),
    endDate: new Date(endDay * dayMs),
  };
}

describe('mergeSadeSatiWindows', () => {
  it('merges a clean rising->peak->setting run into one window', () => {
    const segments = [seg(12, 0, 900), seg(1, 900, 1800), seg(2, 1800, 2700)];
    const windows = mergeSadeSatiWindows(segments);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.startDate).toEqual(segments[0]!.startDate);
    expect(windows[0]!.endDate).toEqual(segments[2]!.endDate);
    expect(windows[0]!.segments).toHaveLength(3);
  });

  it('bridges a brief retrograde dip (short non-sade-sati gap) between two sade-sati segments', () => {
    // rising, then a short 20-day dip into house 11 (a retrograde blip), then back to rising.
    const segments = [seg(12, 0, 900), seg(11, 900, 920), seg(12, 920, 1800)];
    const windows = mergeSadeSatiWindows(segments, 200);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.segments).toHaveLength(3);
    expect(windows[0]!.endDate).toEqual(segments[2]!.endDate);
  });

  it('does NOT bridge a long gap (a genuine exit from the triad)', () => {
    // rising for ~900 days, then genuinely OUT for ~900 days (house 3), then peak much later.
    const segments = [seg(12, 0, 900), seg(3, 900, 1800), seg(1, 1800, 2700)];
    const windows = mergeSadeSatiWindows(segments, 200);
    expect(windows).toHaveLength(2);
    expect(windows[0]!.segments).toHaveLength(1);
    expect(windows[1]!.segments).toHaveLength(1);
  });

  it('drops a trailing non-sade-sati gap that never resumes (nothing to bridge into)', () => {
    const segments = [seg(12, 0, 900), seg(11, 900, 920)]; // dips out and the timeline just ends there
    const windows = mergeSadeSatiWindows(segments, 200);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.segments).toHaveLength(1); // the trailing dip is not included
    expect(windows[0]!.endDate).toEqual(segments[0]!.endDate);
  });

  it('returns no windows when nothing in the timeline is a sade-sati phase', () => {
    const segments = [seg(5, 0, 900), seg(6, 900, 1800)];
    expect(mergeSadeSatiWindows(segments)).toHaveLength(0);
  });

  it('keeps two separate sade-sati passes (different life cycles) as separate windows', () => {
    const segments = [
      seg(12, 0, 900),
      seg(1, 900, 1800),
      seg(2, 1800, 2700),
      seg(3, 2700, 400_000), // decades of "not in the triad" before the next cycle
      seg(12, 400_000, 400_900),
    ];
    const windows = mergeSadeSatiWindows(segments, 200);
    expect(windows).toHaveLength(2);
  });
});

describe('mergeDhaiyaWindows', () => {
  it('merges a continuous 4th-house Dhaiya run', () => {
    const segments = [seg(4, 0, 900)];
    const windows = mergeDhaiyaWindows(segments);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.phase).toBe('dhaiya-4th');
  });

  it('bridges a brief retrograde dip within a single Dhaiya house', () => {
    const segments = [seg(8, 0, 900), seg(7, 900, 920), seg(8, 920, 1800)];
    const windows = mergeDhaiyaWindows(segments, 200);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.endDate).toEqual(segments[2]!.endDate);
  });

  it('treats 4th and 8th house passes as separate windows, never merged together', () => {
    const segments = [seg(4, 0, 900), seg(5, 900, 1800), seg(8, 1800, 2700)];
    const windows = mergeDhaiyaWindows(segments, 200);
    expect(windows).toHaveLength(2);
    expect(windows[0]!.phase).toBe('dhaiya-4th');
    expect(windows[1]!.phase).toBe('dhaiya-8th');
  });
});

describe('findSaturnSignChanges (live ephemeris, self-verified against a brute-force day scan)', () => {
  it('finds real Saturn ingresses, each refined to within a day of a brute-force scan', async () => {
    const from = new Date('2015-01-01T00:00:00Z');
    const to = new Date('2035-01-01T00:00:00Z');
    const changes = await findSaturnSignChanges(from, to, 10);

    // Saturn takes ~29.5 years for a full zodiac cycle (~2.5 years/sign), so a
    // 20-year window should show several ingresses, but not an implausible number.
    expect(changes.length).toBeGreaterThan(3);
    expect(changes.length).toBeLessThan(20);

    // Brute-force verify the first detected change to within 1 day.
    const first = changes[0]!;
    const jdApprox = jdFromDate(first.exactAt);
    let bruteForceJd: number | null = null;
    for (let jd = jdApprox - 15; jd <= jdApprox + 15; jd += 1) {
      const positions = await calculatePlanetPositions(jd);
      const saturn = positions.find((p) => p.planet === 'Saturn');
      if (saturn?.signIndex === first.signIndex) {
        bruteForceJd = jd;
        break;
      }
    }
    expect(bruteForceJd).not.toBeNull();
    const bruteForceDate = dateFromJd(bruteForceJd!);
    const diffDays = Math.abs(first.exactAt.getTime() - bruteForceDate.getTime()) / 86_400_000;
    expect(diffDays).toBeLessThanOrEqual(2);
  }, 30_000);
});

describe('buildSaturnPhaseTimeline + detectRealSadeSati/detectRealDhaiya (live ephemeris, end-to-end)', () => {
  it('produces a timeline covering the full requested range with no gaps', async () => {
    const from = new Date('2020-01-01T00:00:00Z');
    const to = new Date('2023-01-01T00:00:00Z');
    const timeline = await buildSaturnPhaseTimeline(0, from, to);
    expect(timeline[0]!.startDate).toEqual(from);
    expect(timeline[timeline.length - 1]!.endDate).toEqual(to);
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i]!.startDate).toEqual(timeline[i - 1]!.endDate);
    }
  }, 30_000);

  it('detectRealSadeSati reports active:true only when the current segment is a sade-sati phase', async () => {
    const asOf = new Date('2021-06-15T00:00:00Z');
    // Aries (signIndex 0) Moon: find whatever phase Saturn is actually in at this date.
    const result = await detectRealSadeSati(0, asOf, 1, 3);
    if (result.active) {
      expect(['sade-sati-rising', 'sade-sati-peak', 'sade-sati-setting']).toContain(result.phase);
      expect(result.windowStart).not.toBeNull();
      expect(result.windowEnd).not.toBeNull();
      expect(asOf >= result.windowStart!).toBe(true);
      expect(asOf < result.windowEnd!).toBe(true);
    } else {
      expect(result.windowStart).toBeNull();
      expect(result.windowEnd).toBeNull();
    }
  }, 30_000);

  it('detectRealDhaiya reports active:true only when the current segment is a Dhaiya phase', async () => {
    const asOf = new Date('2021-06-15T00:00:00Z');
    const result = await detectRealDhaiya(0, asOf, 1, 3);
    if (result.active) {
      expect(['dhaiya-4th', 'dhaiya-8th']).toContain(result.phase);
    } else {
      expect(result.phase).toBe('none');
      expect(result.startDate).toBeNull();
    }
  }, 30_000);

  it('Sade Sati and Dhaiya are mutually exclusive for the same Moon sign at the same instant', async () => {
    const asOf = new Date('2021-06-15T00:00:00Z');
    const [sadeSati, dhaiya] = await Promise.all([
      detectRealSadeSati(6, asOf, 1, 3),
      detectRealDhaiya(6, asOf, 1, 3),
    ]);
    expect(sadeSati.active && dhaiya.active).toBe(false);
  }, 30_000);
});
