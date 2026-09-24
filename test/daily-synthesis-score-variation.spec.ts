import { describe, it, expect } from 'vitest';
import { calculateChart, calculateVimshottariDasha } from '../src/lib/astro-engine/index.js';
import { synthesizeDailyForecastFromKundli } from '../src/lib/astro-tools/daily-synthesis.js';

/**
 * Falsifying test for the "horoscope score is frozen for months" defect. The
 * daily score is positioned inside a Mahadasha/Antardasha band by that day's
 * gochara fraction; twice now the band (or the fraction's real-world spread)
 * was too narrow for the day-to-day transit movement to change the rounded
 * score, so the home screen showed the same stars for weeks.
 *
 * The first version of this test ran one chart from `new Date()`, so it
 * passed or failed depending on the day it ran. This one pins real charts and
 * fixed 30-day windows (different dasha periods) so a regression shows up on
 * every run: every window must move, and on average the day must reach ~3
 * different scores a month.
 */
const CHARTS: Array<{
  name: string;
  birth: [number, number, number, number, number];
  lat: number;
  lon: number;
}> = [
  // Same fixture as verify-chat-fix.spec.ts (Aarav: 1985-03-12, 04:32 IST, Mumbai).
  { name: 'aarav-1985-mumbai', birth: [1985, 3, 12, 4, 32], lat: 19.076, lon: 72.8777 },
  { name: '1992-delhi', birth: [1992, 7, 21, 14, 10], lat: 28.6139, lon: 77.209 },
  { name: '1978-chennai', birth: [1978, 11, 2, 22, 45], lat: 13.0827, lon: 80.2707 },
  { name: '2000-kolkata', birth: [2000, 1, 15, 6, 5], lat: 22.5726, lon: 88.3639 },
  { name: '1995-pune', birth: [1995, 5, 5, 9, 20], lat: 18.5204, lon: 73.8567 },
  { name: '1988-jaipur', birth: [1988, 12, 25, 18, 0], lat: 26.9124, lon: 75.7873 },
];
const WINDOW_STARTS = ['2026-06-01', '2026-09-24', '2027-01-10', '2027-05-01'];
const IST = 5.5;

async function windowScores(chartDef: (typeof CHARTS)[number], start: string): Promise<number[]> {
  const [y, m, d, h, min] = chartDef.birth;
  const chart = await calculateChart(y, m, d, h, min, IST, chartDef.lat, chartDef.lon);
  const moon = chart.planets.find((p) => p.planet === 'Moon')!;
  const birthDate = new Date(Date.UTC(y, m - 1, d, h, min) - IST * 3_600_000);
  const dashaData = { vimshottari: calculateVimshottariDasha(moon.longitude, birthDate) };
  const chartData = chart as unknown as Record<string, unknown>;

  const scores: number[] = [];
  for (let i = 0; i < 30; i++) {
    const asOf = new Date(Date.parse(`${start}T06:00:00Z`) + i * 86_400_000).toISOString();
    const result = await synthesizeDailyForecastFromKundli(chartData, dashaData, asOf);
    expect(result).not.toBeNull();
    scores.push(result!.score);
  }
  return scores;
}

describe('daily synthesis score varies across real 30-day windows', () => {
  it('moves within every window and averages ~3 distinct scores a month', async () => {
    const distinctCounts: number[] = [];
    for (const chartDef of CHARTS) {
      for (const start of WINDOW_STARTS) {
        const scores = await windowScores(chartDef, start);
        const distinct = new Set(scores).size;
        distinctCounts.push(distinct);
        // A window that never moves is exactly the frozen-score defect.
        expect(
          distinct,
          `${chartDef.name} from ${start}: ${scores.join('')}`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
    const average = distinctCounts.reduce((a, b) => a + b, 0) / distinctCounts.length;
    expect(average).toBeGreaterThanOrEqual(3);
  }, 120_000);
});
