import { describe, expect, it } from 'vitest';
import {
  computeDecadeArc,
  computeLifeSoFarArc,
} from '../src/lib/astro-engine/reports/report-decade-arc.js';
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

describe('computeLifeSoFarArc — the already-lived chapters', () => {
  const BIRTH = new Date('2000-01-01T00:00:00Z');

  it('covers birth..now only, and clips the running Mahadasha at now rather than its real end', () => {
    const chart = makeChart();
    const now = new Date('2026-01-01T00:00:00Z');
    const bands = computeLifeSoFarArc(chart, BIRTH, [], now);

    expect(bands.length).toBeGreaterThan(0);
    for (const b of bands) {
      expect(new Date(b.startDate).getTime()).toBeGreaterThanOrEqual(BIRTH.getTime());
      // The whole point: nothing in this arc may extend past today.
      expect(new Date(b.endDate).getTime()).toBeLessThanOrEqual(now.getTime());
    }
    // The last band is the one still running, so it ends exactly at `now`.
    expect(new Date(bands[bands.length - 1]!.endDate).getTime()).toBe(now.getTime());
  });

  it('labels each chapter with the age range and the ruling Mahadasha lord', () => {
    const bands = computeLifeSoFarArc(makeChart(), BIRTH, [], new Date('2026-01-01T00:00:00Z'));
    expect(bands[0]!.label).toMatch(/^Age \d+–\d+ · [A-Z][a-z]+$/);
    // Ages are measured from birth, so the first lived chapter starts at 0.
    expect(bands[0]!.label).toMatch(/^Age 0–/);
  });

  it("scores a chapter by its lord's bare natal strength when keyHouses is empty", () => {
    const chart = makeChart();
    const now = new Date('2026-01-01T00:00:00Z');
    const analyses = analyzePlanetStrengths(chart);
    const bands = computeLifeSoFarArc(chart, BIRTH, [], now);

    for (const b of bands) {
      const lord = b.label.split(' · ')[1]!;
      expect(b.score).toBe(computeMonthlyReportScore(lord, [], chart, analyses));
      expect(b.tone).toBe(toneFromMonthScore(b.score));
    }
  });

  it('returns [] rather than inventing a lived past when the birth date is missing or unusable', () => {
    const chart = makeChart();
    const now = new Date('2026-01-01T00:00:00Z');
    expect(computeLifeSoFarArc(chart, null, [], now)).toEqual([]);
    expect(computeLifeSoFarArc(chart, new Date('not a date'), [], now)).toEqual([]);
    // Birth in the future -> nothing has been lived yet.
    expect(computeLifeSoFarArc(chart, new Date('2030-01-01T00:00:00Z'), [], now)).toEqual([]);
  });

  it('returns [] for a chart with no derivable dasha tree', () => {
    expect(computeLifeSoFarArc(null, BIRTH, [], new Date('2026-01-01T00:00:00Z'))).toEqual([]);
  });

  it('drops the sub-year sliver a truncated birth Mahadasha can leave', () => {
    // Moon near the END of Bharani (13°20'–26°40') leaves only a few months of the Venus
    // Mahadasha unspent at birth — the sliver this filter exists for. The base fixture puts
    // the Moon near Bharani's START instead, which leaves a nearly-full 20-year Venus period.
    const chart = {
      ...makeChart(),
      planets: [
        { planet: 'Moon', sign: 'Gemini', longitude: 26.3 },
        { planet: 'Mars', sign: 'Cancer' },
        { planet: 'Rahu', sign: 'Taurus' },
      ],
    };
    const bands = computeLifeSoFarArc(chart, BIRTH, [], new Date('2026-01-01T00:00:00Z'));
    expect(bands.length).toBeGreaterThan(0);
    expect(bands[0]!.label).not.toMatch(/Venus/);
  });

  it('keeps the still-running chapter even when it is shorter than the sliver threshold', () => {
    // The running chapter is short because it has not FINISHED, not because it was nearly
    // over at birth — and it is the one the reader is currently living through.
    const chart = makeChart();
    const bands = computeLifeSoFarArc(chart, BIRTH, [], new Date('2000-07-01T00:00:00Z'));
    expect(bands).toHaveLength(1);
    expect(new Date(bands[0]!.endDate).getTime()).toBe(new Date('2000-07-01T00:00:00Z').getTime());
  });
});
