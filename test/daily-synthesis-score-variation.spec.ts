import { describe, it, expect } from 'vitest';
import { calculateChart, calculateVimshottariDasha } from '../src/lib/astro-engine/index.js';
import { synthesizeDailyForecastFromKundli } from '../src/lib/astro-tools/daily-synthesis.js';

/**
 * Falsifying test for the "horoscope score is frozen for months" defect: the
 * Antardasha-narrowed score band was exactly 1.0 wide (see narrowByAntardasha's
 * `* 0.5` quartering of an already-2.0-wide Mahadasha band), and a value
 * confined to a 1.0-wide interval can round to at most 2 distinct integers no
 * matter how much the underlying (genuinely daily-varying — Moon's nakshatra
 * changes ~daily) gochara fraction moves. The result: the same score, day
 * after day, for as long as the Mahadasha/Antardasha pairing holds — months to
 * years — even though the transits behind it are actually changing.
 *
 * Real chart, real dasha, 30 real consecutive days — not a synthetic band —
 * so this proves the fix moves the *actual* pipeline, not just the isolated
 * band-math helpers (those stay covered separately in
 * daily-synthesis-dasha-band-hierarchy.spec.ts).
 */
describe('daily synthesis score varies across a real 30-day window', () => {
  it('produces at least 3 distinct scores over 30 consecutive days for a real chart', async () => {
    // Same fixture as verify-chat-fix.spec.ts (Aarav: 1985-03-12, 04:32 IST, Mumbai).
    const chart = await calculateChart(1985, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
    const moon = chart.planets.find((p) => p.planet === 'Moon')!;
    const birthDate = new Date(Date.UTC(1985, 2, 11, 23, 2)); // 04:32 IST -> UTC
    const vimshottari = calculateVimshottariDasha(moon.longitude, birthDate);
    const dashaData = { vimshottari };
    const chartData = chart as unknown as Record<string, unknown>;

    const scores: number[] = [];
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const asOf = new Date(today.getTime() + i * 86_400_000).toISOString();
      const result = await synthesizeDailyForecastFromKundli(chartData, dashaData, asOf);
      expect(result).not.toBeNull();
      scores.push(result!.score);
    }

    const distinct = new Set(scores);
    console.log('=== 30-day score sequence ===', scores.join(','));
    console.log('=== distinct scores ===', [...distinct].sort().join(','));

    expect(distinct.size).toBeGreaterThanOrEqual(3);
  });
});
