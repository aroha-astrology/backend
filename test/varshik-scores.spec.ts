import { describe, it, expect } from 'vitest';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { buildVarshikContext } from '../src/lib/astro-engine/reports/varshik-context.js';
import {
  computeVarshikScores,
  decisionTable,
  savitzkyGolayWeights,
  smoothSeries,
  tierOf,
} from '../src/lib/astro-engine/reports/varshik-2027.js';
import { AREAS } from '../src/config/varshik-weights.js';
import { TEST_BIRTHS, inputsFor } from './fixtures/varshik/births.js';

describe('tiers and smoothing', () => {
  it('uses 75 / 60 / 45 on the rounded score', () => {
    expect(tierOf(75)).toBe('dark_green');
    expect(tierOf(74.6)).toBe('dark_green');
    expect(tierOf(74.4)).toBe('light_green');
    expect(tierOf(60)).toBe('light_green');
    expect(tierOf(59.4)).toBe('amber');
    expect(tierOf(45)).toBe('amber');
    expect(tierOf(44.4)).toBe('rust');
  });
  it('Savitzky-Golay weights sum to 1 and keep a straight line and a cubic unchanged', () => {
    const w = savitzkyGolayWeights(21, 3);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    const cubic = Array.from({ length: 60 }, (_, i) => 0.001 * i ** 3 - 0.05 * i);
    const out = smoothSeries(cubic, 21, 3);
    for (let i = 12; i < 48; i++) expect(out[i]).toBeCloseTo(cubic[i]!, 6);
  });
});

describe('scores on a real chart (b02: Varsha year straddles New Year)', () => {
  it('month grid equals the day-weighted mean of the smoothed wave, bounded, deterministic', async () => {
    const birth = TEST_BIRTHS.find((b) => b.id === 'b02')!;
    const inputs = await inputsFor(birth);
    const [y, mo, d] = birth.date.split('-').map(Number) as [number, number, number];
    const natal = await calculateChart(y, mo, d, 21, 40, 5.5, birth.latitude, birth.longitude, 'lahiri', 'W');
    const ctx = await buildVarshikContext({ inputs, natal, year: 2027 });
    expect(ctx.days).toHaveLength(365);

    const a = computeVarshikScores(ctx, {});
    const b = computeVarshikScores(ctx, {});
    expect(JSON.stringify(a.months)).toBe(JSON.stringify(b.months));

    const wave = a.series.overall;
    expect(wave).toHaveLength(365);
    wave.forEach((v) => expect(v >= 0 && v <= 100).toBe(true));
    for (let m = 0; m < 12; m++) {
      const days = wave.filter((_, i) => a.series.monthOfDay[i] === m);
      const mean = days.reduce((s, v) => s + v, 0) / days.length;
      expect(a.months[m]!.score).toBe(Math.round(mean));
      expect(a.months[m]!.tier).toBe(tierOf(a.months[m]!.score));
    }
    expect(a.timingMap.love).toHaveLength(12);
    expect(AREAS.every((ar) => a.timingMap[ar].length === 12)).toBe(true);
    expect(a.peakMonths).toHaveLength(3);
    expect(a.planetImpact).toHaveLength(9);
  });
});

describe('decision table follows the reader, never assumes', () => {
  const fake = {
    timingMap: Object.fromEntries(
      AREAS.map((a) => [a, Array.from({ length: 12 }, (_, m) => ({ score: 40 + m * 4, tier: 'amber' as const }))]),
    ),
  } as never;
  const keys = (ans: object) => decisionTable(fake, ans).map((r) => r.key);

  it('hides partner and child rows unless the reader said so', () => {
    expect(keys({})).not.toContain('marriage');
    expect(keys({})).not.toContain('family_planning');
    expect(keys({ relationship: 'married', children: 'none' })).not.toContain('commit_relationship');
    expect(keys({ relationship: 'single', children: 'none' })).not.toContain('family_planning');
    expect(keys({ relationship: 'single' })).toContain('marriage');
    expect(keys({ children: 'planning' })).toContain('family_planning');
  });
  it('hides work rows for a retired reader and puts the main decision first', () => {
    expect(keys({ occupation: 'retired' })).not.toContain('new_work');
    const rows = decisionTable(fake, { mainDecision: 'money' });
    expect(rows[0]!.key).toBe('money_move');
    expect(rows[0]!.isMain).toBe(true);
  });
});
