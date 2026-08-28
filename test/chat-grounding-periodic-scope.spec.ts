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
 * Falsifying test for the "97% of the horoscope prompt never changes" defect.
 * Same real-chart fixture as verify-chat-fix.spec.ts, which measured 'full'
 * scope (chat/voice/reports — unaffected by this change) at 107 facts /
 * 23,675 chars. This asserts 'periodic' scope (the horoscope pipeline) is
 * materially smaller while still keeping the two facts that actually make a
 * daily reading date-specific: the Moon-transit line and the deterministic
 * synthesis score.
 */
describe('buildGroundingFacts: periodic scope trims the life-fixed sections', () => {
  it('periodic scope is materially smaller than full scope and keeps the day-varying facts', async () => {
    const chart = await calculateChart(1985, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
    const moon = chart.planets.find((p) => p.planet === 'Moon')!;
    const saturn = chart.planets.find((p) => p.planet === 'Saturn')!;
    const birthDate = new Date(Date.UTC(1985, 2, 11, 23, 2));
    const vimshottari = calculateVimshottariDasha(moon.longitude, birthDate);
    const yogas = { yogas: detectAllYogas(chart) };
    const doshas = analyzeAllDoshas(chart, saturn.longitude);
    const ashtakavarga = calculateAshtakavarga(chart);

    const src: GroundingSource = {
      chart: chart as unknown as Record<string, unknown>,
      dasha: { vimshottari },
      yogas,
      doshas: doshas as unknown as Record<string, unknown>,
      ashtakavarga: ashtakavarga as unknown as Record<string, unknown>,
    };

    const now = new Date();
    const fullFacts = await buildGroundingFacts(src, undefined, now, null, undefined, 'full');
    const periodicFacts = await buildGroundingFacts(
      src,
      undefined,
      now,
      null,
      undefined,
      'periodic',
    );

    const fullChars = fullFacts.map((f) => `- ${f}`).join('\n').length;
    const periodicChars = periodicFacts.map((f) => `- ${f}`).join('\n').length;
    console.log('=== full: facts/chars ===', fullFacts.length, fullChars);
    console.log('=== periodic: facts/chars ===', periodicFacts.length, periodicChars);

    // At least a third smaller — the 24 divisional charts alone are the
    // single biggest section in the full fact set.
    expect(periodicFacts.length).toBeLessThan(fullFacts.length);
    expect(periodicChars).toBeLessThan(fullChars * 0.7);

    // The two facts that actually make "today" different from "yesterday"
    // must survive the trim.
    expect(periodicFacts.some((f) => f.startsWith('Moon is'))).toBe(true);

    // The four life-fixed, no-output-block sections must be gone.
    expect(periodicFacts.some((f) => f.startsWith('D7 ('))).toBe(false); // divisional charts
    expect(periodicFacts.some((f) => f.startsWith('Chandra Kundali'))).toBe(false);
    expect(periodicFacts.some((f) => f.startsWith('Arudha Lagna'))).toBe(false);
    expect(
      periodicFacts.some((f) => f.includes('Bhinnashtakavarga bindus in its own natal house')),
    ).toBe(false);

    // The domain sweep is narrowed to the horoscope's 5 sub-categories, not
    // all ~15 DOMAIN_CONFIG domains.
    expect(periodicFacts.some((f) => f.startsWith('Career Window Confidence'))).toBe(true);
    expect(periodicFacts.some((f) => f.startsWith('Siblings Window Confidence'))).toBe(false);
    expect(periodicFacts.some((f) => f.startsWith('Legal/Dispute Window Confidence'))).toBe(false);

    // 'full' scope (chat/voice/reports) must be completely unaffected.
    expect(fullFacts.some((f) => f.startsWith('D7 ('))).toBe(true);
    expect(fullFacts.some((f) => f.startsWith('Siblings Window Confidence'))).toBe(true);
  });
});
