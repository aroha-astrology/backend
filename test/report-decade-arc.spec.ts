import { describe, expect, it } from 'vitest';
import { computeDecadeArc } from '../src/lib/astro-engine/reports/report-decade-arc.js';
import { getVimshottariDashaFromChart } from '../src/lib/astro-engine/reports/chart-facts.js';
import { analyzePlanetStrengths } from '../src/lib/astro-engine/gemstones.js';
import {
  computeMonthlyReportScore,
  toneFromMonthScore,
} from '../src/lib/astro-engine/reports/monthly-dasha-context.js';

const MS_PER_DAY = 86_400_000;
const UNIX_EPOCH_JD = 2440587.5;

/** Exact inverse of chart-facts.ts's julianDayToDate (same formula used in report-marriage-scores.spec.ts). */
function dateToJd(date: Date): number {
  return date.getTime() / MS_PER_DAY + UNIX_EPOCH_JD;
}

/**
 * Moon in Bharani nakshatra (lord Venus, per NAKSHATRA_LORDS) near its very start, so Venus is
 * the birth Mahadasha (mahadashas[0]) with a truncated "balance" duration — deliberately NOT
 * used as a test anchor below, since a truncated first period's exact end date depends on the
 * traversed-fraction epsilon. mahadashas[1..] (Sun, Moon, Mars, Rahu, ...) each get their FULL,
 * untruncated Vimshottari year allocation with exact, epsilon-free boundaries, which is what the
 * exact-boundary assertions below rely on.
 *
 * Mars set to Cancer (classically debilitated -> weak/30) and Rahu set to Taurus (classically
 * exalted -> strong/90) so the two-Mahadasha blend test below combines two clearly DIFFERENT
 * scores, not two coincidentally-equal ones.
 */
function makeChart(): Record<string, unknown> {
  return {
    ascendant: { signIndex: 0 },
    planets: [
      { planet: 'Moon', sign: 'Gemini', longitude: 13.34 },
      { planet: 'Mars', sign: 'Cancer' },
      { planet: 'Rahu', sign: 'Taurus' },
    ],
    houses: [],
    julianDay: dateToJd(new Date('2000-01-01T00:00:00Z')),
  };
}

describe('computeDecadeArc — shape and fallback', () => {
  it('returns `decades` bands (default 3) labeled "Years 1-10", "Years 11-20", "Years 21-30"', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const bands = computeDecadeArc(null, [], now);
    expect(bands).toHaveLength(3);
    expect(bands.map((b) => b.label)).toEqual(['Years 1-10', 'Years 11-20', 'Years 21-30']);
  });

  it("starts band 0 exactly at `now` and each subsequent band exactly at the previous one's end", () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const bands = computeDecadeArc(null, [], now, 2);
    expect(bands[0]!.startDate).toBe(now.toISOString());
    expect(bands[0]!.endDate).toBe(bands[1]!.startDate);
  });

  it('respects a custom `decades` count', () => {
    expect(computeDecadeArc(null, [], new Date(), 1)).toHaveLength(1);
    expect(computeDecadeArc(null, [], new Date(), 5)).toHaveLength(5);
  });

  it('never throws and falls back to the neutral no-data score (50, tone mixed) on a null chart', () => {
    expect(() => computeDecadeArc(null, [], new Date())).not.toThrow();
    const bands = computeDecadeArc(null, [], new Date());
    for (const band of bands) {
      expect(band.score).toBe(50);
      expect(band.tone).toBe('mixed');
    }
  });

  it('keeps score and tone consistent with toneFromMonthScore for every band', () => {
    const chart = makeChart();
    const bands = computeDecadeArc(chart, [], new Date('2026-01-01T00:00:00Z'));
    for (const band of bands) {
      expect(band.score).toBeGreaterThanOrEqual(0);
      expect(band.score).toBeLessThanOrEqual(100);
      expect(band.tone).toBe(toneFromMonthScore(band.score));
    }
  });
});

describe('computeDecadeArc — Mahadasha-lord scoring and time-weighted blending', () => {
  it("scores a decade band fully covered by ONE full-duration Mahadasha as that lord's own score (no blending)", () => {
    const chart = makeChart();
    const vimshottari = getVimshottariDashaFromChart(chart)!;
    const moon = vimshottari.mahadashas.find((m) => m.planet === 'Moon')!;
    const analyses = analyzePlanetStrengths(chart);
    const expectedScore = computeMonthlyReportScore('Moon', [], chart, analyses);

    // Moon's Mahadasha is exactly 10 full years (mahadashas[1+], not birth-truncated) -- anchoring
    // the arc at its own startDate makes decade band 0 exactly equal to Moon's own span.
    const bands = computeDecadeArc(chart, [], moon.startDate, 1);
    expect(bands[0]!.score).toBe(expectedScore);
    expect(bands[0]!.score).toBe(60); // Moon in Gemini: not debilitated/exalted/own -> 'average' -> 60
  });

  it("blends two consecutive Mahadashas in a later band, time-weighted by each one's year-coverage", () => {
    const chart = makeChart();
    const vimshottari = getVimshottariDashaFromChart(chart)!;
    const moon = vimshottari.mahadashas.find((m) => m.planet === 'Moon')!;

    // Anchoring at Moon's startDate: band index 1 = [+10y, +20y). Moon's Mahadasha ends at
    // exactly +10y (10-year duration), Mars's follows immediately (7 years: +10y..+17y), and
    // Rahu's follows Mars (18 years: +17y..+35y) -- so band 1 is EXACTLY Mars for 7 of its 10
    // years and Rahu for the remaining 3, an exact (epsilon-free) 7:3 weighted blend.
    const bands = computeDecadeArc(chart, [], moon.startDate, 2);

    // Mars debilitated in Cancer -> weak -> 30. Rahu exalted in Taurus -> strong -> 90.
    // round((30*7 + 90*3) / 10) = round(48) = 48.
    expect(bands[1]!.score).toBe(48);
    expect(bands[1]!.tone).toBe(toneFromMonthScore(48));
  });

  it('scores a further decade band fully covered by a single later Mahadasha correctly too', () => {
    const chart = makeChart();
    const vimshottari = getVimshottariDashaFromChart(chart)!;
    const moon = vimshottari.mahadashas.find((m) => m.planet === 'Moon')!;

    // Band index 2 = [+20y, +30y). Rahu's Mahadasha spans [+17y, +35y) relative to Moon's start,
    // which fully contains [+20y, +30y) -- another pure, single-lord band.
    const bands = computeDecadeArc(chart, [], moon.startDate, 3);
    expect(bands[2]!.score).toBe(90); // Rahu exalted in Taurus -> strong -> 90, no blending
  });
});
