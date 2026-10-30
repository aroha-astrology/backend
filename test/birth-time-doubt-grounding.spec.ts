import { describe, it, expect } from 'vitest';
import {
  calculateChart,
  calculateVimshottariDasha,
  detectAllYogas,
  calculateAshtakavarga,
} from '../src/lib/astro-engine/index.js';
import { analyzeAllDoshas } from '../src/lib/astro-engine/doshas/index.js';
import { buildGroundingFacts, type GroundingSource } from '../src/lib/chat-grounding.js';

/**
 * Sprint 3 / H3 + L5: an unknown-birth-time reader's grounding must (a) carry the Moon doubt and the
 * dasha margin, (b) leave out everything that hangs on the exact minute: the 24 divisional charts
 * (4,500 characters measured, which the model is told not to use), the pratyantardasha and day-level dasha
 * dates, and (c) leave an exact-time reader's grounding exactly as it was.
 */
async function sourceFor(birthTime?: GroundingSource['birthTime']): Promise<GroundingSource> {
  const chart = await calculateChart(1985, 3, 12, 9, 0, 5.5, 19.076, 72.8777);
  const moon = chart.planets.find((p) => p.planet === 'Moon')!;
  const saturn = chart.planets.find((p) => p.planet === 'Saturn')!;
  const birthDate = new Date(Date.UTC(1985, 2, 12, 3, 30));
  return {
    chart: chart as unknown as Record<string, unknown>,
    dasha: { vimshottari: calculateVimshottariDasha(moon.longitude, birthDate) },
    yogas: { yogas: detectAllYogas(chart) },
    doshas: analyzeAllDoshas(chart, saturn.longitude) as unknown as Record<string, unknown>,
    ashtakavarga: calculateAshtakavarga(chart) as unknown as Record<string, unknown>,
    ...(birthTime ? { birthTime } : {}),
  };
}

const NOW = new Date('2026-10-30T06:00:00Z');
const chars = (facts: string[]) => facts.map((f) => `- ${f}`).join('\n').length;

describe('buildGroundingFacts: unknown birth time', () => {
  it('adds the Moon doubt and the dasha margin', async () => {
    const facts = await buildGroundingFacts(
      await sourceFor({ accuracy: 'unknown', timeOfBirth: '09:00' }),
      undefined,
      NOW,
    );
    expect(facts.some((f) => f.startsWith('BIRTH TIME DOUBT (Moon)'))).toBe(true);
    expect(facts.some((f) => f.startsWith('DASHA MARGIN'))).toBe(true);
  });

  it('drops all 24 divisional-chart blocks (L5) and the Lagna-built Jaimini points', async () => {
    const facts = await buildGroundingFacts(
      await sourceFor({ accuracy: 'unknown', timeOfBirth: '09:00' }),
      undefined,
      NOW,
    );
    expect(facts.filter((f) => /^D\d+ \(/.test(f))).toEqual([]);
    expect(facts.some((f) => f.startsWith('Arudha Lagna'))).toBe(false);
  });

  it('leaves out the pratyantardasha and shows the dasha dates as years only', async () => {
    const facts = await buildGroundingFacts(
      await sourceFor({ accuracy: 'unknown', timeOfBirth: '09:00' }),
      undefined,
      NOW,
    );
    const active = facts.find((f) => f.startsWith('Active Major Planetary Period'))!;
    expect(active).toBeDefined();
    expect(active).not.toMatch(/sub-minor/);
    expect(active).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(active).toMatch(/about \d{4}/);
  });

  it('no ranked window or Yogini line carries a day-level date', async () => {
    const facts = await buildGroundingFacts(
      await sourceFor({ accuracy: 'unknown', timeOfBirth: '09:00' }),
      undefined,
      NOW,
    );
    const dated = facts.filter(
      (f) => /Window Confidence|Yogini/.test(f) && /\d{4}-\d{2}-\d{2}/.test(f),
    );
    expect(dated).toEqual([]);
  });

  it('is much smaller than the same chart read as exact (the 24 varga lines alone measure 4,512 characters, the doubt block adds about 600)', async () => {
    const exact = await buildGroundingFacts(await sourceFor(), undefined, NOW);
    const unknown = await buildGroundingFacts(
      await sourceFor({ accuracy: 'unknown', timeOfBirth: '09:00' }),
      undefined,
      NOW,
    );
    console.log('=== exact chars', chars(exact), '| unknown chars', chars(unknown));
    expect(chars(exact) - chars(unknown)).toBeGreaterThan(3500);
  });

  it('leaves an exact-time reader exactly as before: vargas, pratyantardasha and day-level dates stay', async () => {
    for (const birthTime of [undefined, { accuracy: 'exact', timeOfBirth: '09:00' }] as const) {
      const facts = await buildGroundingFacts(await sourceFor(birthTime), undefined, NOW);
      expect(facts.some((f) => /^D9 \(/.test(f))).toBe(true);
      expect(facts.some((f) => f.startsWith('BIRTH TIME DOUBT'))).toBe(false);
      expect(facts.some((f) => f.startsWith('DASHA MARGIN'))).toBe(false);
      const active = facts.find((f) => f.startsWith('Active Major Planetary Period'))!;
      expect(active).toMatch(/started \d{4}-\d{2}-\d{2}/);
    }
  });
});
