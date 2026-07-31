import { describe, expect, it } from 'vitest';
import { computeRemediesScores } from '../src/lib/astro-engine/reports/remedies.js';
import { buildKarmicProfile } from '../src/lib/astro-engine/lalkitab/karmicProfile.js';
import { getLalKitabRemedies } from '../src/lib/astro-engine/lalkitab/remedies.js';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import type { ReportScoreContext } from '../src/modules/reports/report-generator.types.js';
import type { ChartData, Planet } from '@aroha-astrology/shared';

function makeCtx(chart: ChartData | null): ReportScoreContext {
  return { chart: chart as unknown as Record<string, unknown> | null };
}

describe('computeRemediesScores — a real chart', () => {
  it('produces a planet remedy entry for every classical planet that has a natal house on the chart', async () => {
    const chart = await calculateChart(1985, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
    const scores = computeRemediesScores(makeCtx(chart), null);

    expect(scores.planetRemedies.length).toBeGreaterThan(0);
    for (const entry of scores.planetRemedies) {
      const expected = getLalKitabRemedies(entry.planet as Planet, entry.house);
      expect(entry.remedies).toEqual(expected.remedies);
      expect(entry.totke).toEqual(expected.totke);
    }
  });

  it('matches buildKarmicProfile exactly for debts/Pakka Ghar/blind planets (filtered the same way)', async () => {
    const chart = await calculateChart(1985, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
    const scores = computeRemediesScores(makeCtx(chart), null);
    const profile = buildKarmicProfile(chart);

    expect(scores.presentDebts).toEqual(profile.presentDebts);
    expect(scores.pakkaGharPlacements).toEqual(
      profile.pakkaGharPlacements.filter((p) => p.isInPakkaGhar),
    );
    expect(scores.blindPlanets).toEqual(
      profile.blindPlanets.filter((p) => p.isBlind || p.isHalfBlind),
    );
  });

  it('every present debt carries a remedy (never an empty remedy list on a present debt)', async () => {
    const chart = await calculateChart(1985, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
    const scores = computeRemediesScores(makeCtx(chart), null);
    for (const debt of scores.presentDebts) {
      expect(debt.present).toBe(true);
      expect(debt.remedies.length).toBeGreaterThan(0);
    }
  });

  it('only returns Pakka Ghar placements where the planet is actually in its permanent house', async () => {
    const chart = await calculateChart(1985, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
    const scores = computeRemediesScores(makeCtx(chart), null);
    expect(scores.pakkaGharPlacements.every((p) => p.isInPakkaGhar)).toBe(true);
  });

  it('only returns blind planets that are actually blind or half-blind', async () => {
    const chart = await calculateChart(1985, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
    const scores = computeRemediesScores(makeCtx(chart), null);
    expect(scores.blindPlanets.every((p) => p.isBlind || p.isHalfBlind)).toBe(true);
  });
});

describe('computeRemediesScores — defensive fallbacks (should never throw)', () => {
  it('returns empty arrays for a null chart, never throws', () => {
    expect(() => computeRemediesScores(makeCtx(null), null)).not.toThrow();
    const scores = computeRemediesScores(makeCtx(null), null);
    expect(scores.planetRemedies).toEqual([]);
    expect(scores.presentDebts).toEqual([]);
    expect(scores.pakkaGharPlacements).toEqual([]);
    expect(scores.blindPlanets).toEqual([]);
  });

  it('returns empty arrays for a chart missing planets/houses, never throws', () => {
    const scores = computeRemediesScores(makeCtx({} as ChartData), null);
    expect(scores.planetRemedies).toEqual([]);
    expect(scores.presentDebts).toEqual([]);
    expect(scores.pakkaGharPlacements).toEqual([]);
    expect(scores.blindPlanets).toEqual([]);
  });
});
