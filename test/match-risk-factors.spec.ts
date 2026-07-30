import { describe, expect, it } from 'vitest';
import {
  computeMatchRiskFactors,
  MATCH_RISK_AREA_ORDER,
} from '../src/lib/astro-engine/matching/match-risks.js';
import { computeKundliMilanScores } from '../src/lib/astro-engine/reports/kundli-milan.js';

interface ChartOpts {
  moonNakshatraIndex?: number;
  moonSign?: string;
  /** house -> { lord, sign } */
  houses?: Partial<Record<number, { lord: string; sign?: string }>>;
  /** planet -> { sign?, house? } */
  planets?: Partial<Record<string, { sign?: string; house?: number }>>;
}

function makeChart(opts: ChartOpts = {}): Record<string, unknown> {
  const planets: Record<string, unknown>[] = [
    {
      planet: 'Moon',
      nakshatraIndex: opts.moonNakshatraIndex ?? 0,
      sign: opts.moonSign ?? 'Aries',
      signIndex: 0,
    },
  ];
  for (const [planet, pos] of Object.entries(opts.planets ?? {})) {
    if (!pos) continue;
    planets.push({ planet, sign: pos.sign ?? 'Aries', house: pos.house });
  }

  const houses: Record<string, unknown>[] = [];
  for (const [houseNum, def] of Object.entries(opts.houses ?? {})) {
    if (!def) continue;
    houses.push({ house: Number(houseNum), lord: def.lord, sign: def.sign ?? 'Aries' });
  }

  return { planets, houses, ascendant: { signIndex: 0 } };
}

/** Neutral baseline: no house lords/planet placements set, so every chart-facts lookup
 * defaults to "average" strength and no hard-flag planet ever occupies a watched house. */
const neutralChart = makeChart({});

function kundliMilanFor(chart1: Record<string, unknown>, chart2: Record<string, unknown>) {
  return computeKundliMilanScores({ chart: chart1, partnerChart: chart2 }, null);
}

describe('computeMatchRiskFactors — shape', () => {
  it('always returns exactly the 8 areas in MATCH_RISK_AREA_ORDER, regardless of chart data', () => {
    const factors = computeMatchRiskFactors(
      neutralChart,
      neutralChart,
      kundliMilanFor(neutralChart, neutralChart),
    );
    expect(factors.map((f) => f.key)).toEqual([...MATCH_RISK_AREA_ORDER]);
  });

  it('does not throw on null charts', () => {
    expect(() =>
      computeMatchRiskFactors(null, null, kundliMilanFor(neutralChart, neutralChart)),
    ).not.toThrow();
  });

  it('every factor carries at least one evidence string', () => {
    const factors = computeMatchRiskFactors(
      neutralChart,
      neutralChart,
      kundliMilanFor(neutralChart, neutralChart),
    );
    for (const f of factors) {
      expect(f.evidence.length).toBeGreaterThan(0);
    }
  });
});

describe('computeMatchRiskFactors — health (8th house)', () => {
  it('is at least "caution" when Mars occupies the 8th house for either person, even with average lord strength', () => {
    const chart1 = makeChart({ planets: { Mars: { house: 8 } } });
    const factors = computeMatchRiskFactors(
      chart1,
      neutralChart,
      kundliMilanFor(chart1, neutralChart),
    );
    const health = factors.find((f) => f.key === 'health')!;
    expect(['caution', 'serious']).toContain(health.severity);
  });

  it('is "serious" when malefics occupy the 8th house on BOTH charts', () => {
    const chart1 = makeChart({ planets: { Mars: { house: 8 } } });
    const chart2 = makeChart({ planets: { Saturn: { house: 8 } } });
    const factors = computeMatchRiskFactors(chart1, chart2, kundliMilanFor(chart1, chart2));
    const health = factors.find((f) => f.key === 'health')!;
    expect(health.severity).toBe('serious');
  });

  it('is "benefit" when the 8th lord is exalted on both charts and no malefic sits in the 8th house', () => {
    // 8th lord Jupiter exalted in Cancer on both sides; nothing occupies house 8.
    const chart1 = makeChart({
      houses: { 8: { lord: 'Jupiter', sign: 'Cancer' } },
      planets: { Jupiter: { sign: 'Cancer' } },
    });
    const chart2 = makeChart({
      houses: { 8: { lord: 'Jupiter', sign: 'Cancer' } },
      planets: { Jupiter: { sign: 'Cancer' } },
    });
    const factors = computeMatchRiskFactors(chart1, chart2, kundliMilanFor(chart1, chart2));
    const health = factors.find((f) => f.key === 'health')!;
    expect(health.severity).toBe('benefit');
  });
});

describe('computeMatchRiskFactors — harmony (Nadi/Bhakoot)', () => {
  it('is "caution" or worse when Nadi Dosha (0/8) is present, regardless of chart data otherwise', () => {
    // Same nakshatra index and sign on both sides classically triggers Nadi dosha (0/8) in
    // calculateAshtakoota — reusing the already-computed kundliMilan facts rather than
    // re-deriving Ashtakoota rules here.
    const chart1 = makeChart({ moonNakshatraIndex: 3, moonSign: 'Taurus' });
    const chart2 = makeChart({ moonNakshatraIndex: 3, moonSign: 'Taurus' });
    const kundliMilan = kundliMilanFor(chart1, chart2);
    const nadi = kundliMilan.gunaBreakdown.find((k) => k.name === 'Nadi');
    expect(nadi?.score).toBe(0); // sanity check on the fixture itself

    const factors = computeMatchRiskFactors(chart1, chart2, kundliMilan);
    const harmony = factors.find((f) => f.key === 'harmony')!;
    expect(['caution', 'serious']).toContain(harmony.severity);
  });
});

describe('computeMatchRiskFactors — wealth', () => {
  it('is "benefit" when the 2nd/11th lords and Jupiter are exalted or in their own sign on both charts', () => {
    const strongChart = makeChart({
      houses: { 2: { lord: 'Mercury', sign: 'Virgo' }, 11: { lord: 'Sun', sign: 'Leo' } },
      planets: { Mercury: { sign: 'Virgo' }, Sun: { sign: 'Leo' }, Jupiter: { sign: 'Cancer' } },
    });
    const factors = computeMatchRiskFactors(
      strongChart,
      strongChart,
      kundliMilanFor(strongChart, strongChart),
    );
    const wealth = factors.find((f) => f.key === 'wealth')!;
    expect(wealth.severity).toBe('benefit');
  });

  it('is not "benefit" when the 2nd/11th lords and Jupiter are all debilitated on both charts', () => {
    const weakChart = makeChart({
      houses: { 2: { lord: 'Jupiter', sign: 'Capricorn' }, 11: { lord: 'Venus', sign: 'Virgo' } },
      planets: { Jupiter: { sign: 'Capricorn' }, Venus: { sign: 'Virgo' } },
    });
    const factors = computeMatchRiskFactors(
      weakChart,
      weakChart,
      kundliMilanFor(weakChart, weakChart),
    );
    const wealth = factors.find((f) => f.key === 'wealth')!;
    expect(wealth.severity).not.toBe('benefit');
  });
});

describe('computeMatchRiskFactors — timing', () => {
  it('degrades to a neutral/caution read (never throws) when the chart lacks julianDay/Moon longitude for a dasha tree', () => {
    const factors = computeMatchRiskFactors(
      neutralChart,
      neutralChart,
      kundliMilanFor(neutralChart, neutralChart),
    );
    const timing = factors.find((f) => f.key === 'timing')!;
    expect(['neutral', 'caution']).toContain(timing.severity);
  });
});
