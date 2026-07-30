import { describe, it, expect } from 'vitest';
import {
  extractSynthesisInputs,
  synthesizeDailyForecastFromKundli,
  synthesizeDailyForecast,
} from '../src/lib/astro-tools/daily-synthesis.js';
import { calculateTithi } from '../src/lib/astro-engine/panchang/tithi.js';
import { dateToJulianDay, calculatePlanetPositions } from '../src/lib/astro-engine/index.js';

const CHART_WITH_MOON = {
  ascendant: { signIndex: 4 },
  planets: [
    { planet: 'Moon', signIndex: 3, nakshatraIndex: 14 },
    { planet: 'Sun', signIndex: 6 },
  ],
};

const DASHA = {
  vimshottari: {
    currentMahadasha: { planet: 'Saturn', startDate: '2020-01-01', endDate: '2039-01-01' },
    currentAntardasha: { lord: 'Mercury' },
  },
};

describe('daily-synthesis: extractSynthesisInputs (Phase 0 kundli wiring)', () => {
  it('returns null when the chart has no natal Moon', () => {
    expect(extractSynthesisInputs({ planets: [] }, null)).toBeNull();
    expect(extractSynthesisInputs(null, null)).toBeNull();
  });

  it('extracts ascendant/moon sign+nakshatra and dasha lords from raw kundli shapes', () => {
    const inputs = extractSynthesisInputs(CHART_WITH_MOON, DASHA);
    expect(inputs).not.toBeNull();
    expect(inputs!.natalAscSignIdx).toBe(4);
    expect(inputs!.natalMoonSignIdx).toBe(3);
    expect(inputs!.natalMoonNakIdx).toBe(14);
    expect(inputs!.currentMdPlanet).toBe('Saturn');
    // dasha lord field falls back from `.lord` when `.planet` is absent.
    expect(inputs!.currentAdPlanet).toBe('Mercury');
    expect(inputs!.natalPlanets).toHaveLength(2);
  });

  it('omits currentMdPlanet/currentAdPlanet when no dasha data is available', () => {
    const inputs = extractSynthesisInputs(CHART_WITH_MOON, null);
    expect(inputs).not.toBeNull();
    expect(inputs!.currentMdPlanet).toBeUndefined();
    expect(inputs!.currentAdPlanet).toBeUndefined();
  });
});

describe('daily-synthesis: synthesizeDailyForecastFromKundli (Phase 0 kundli wiring)', () => {
  it('returns null instead of throwing when the kundli has no natal Moon', async () => {
    const result = await synthesizeDailyForecastFromKundli(
      { planets: [] },
      null,
      '2026-08-01T12:00:00.000Z',
    );
    expect(result).toBeNull();
  });

  it('returns null for a null chart (kundli not ready)', async () => {
    const result = await synthesizeDailyForecastFromKundli(null, null);
    expect(result).toBeNull();
  });

  it('produces a valid 1-5 score for a real fixture, matching direct synthesizeDailyForecast', async () => {
    const asOf = '2026-08-01T12:00:00.000Z';
    const viaKundli = await synthesizeDailyForecastFromKundli(CHART_WITH_MOON, DASHA, asOf);
    expect(viaKundli).not.toBeNull();
    expect(viaKundli!.score).toBeGreaterThanOrEqual(1);
    expect(viaKundli!.score).toBeLessThanOrEqual(5);

    const direct = await synthesizeDailyForecast({
      natalPlanets: CHART_WITH_MOON.planets,
      natalAscSignIdx: 4,
      natalMoonSignIdx: 3,
      natalMoonNakIdx: 14,
      currentMdPlanet: 'Saturn',
      currentAdPlanet: 'Mercury',
      asOf,
    });
    // Same inputs, same date -> identical deterministic result.
    expect(viaKundli).toEqual(direct);
  });
});

describe('daily-synthesis: Panchaka now uses a real tithi, not a nakshatra-derived proxy', () => {
  it("panchaka's rawSum matches calculateTithi's real tithi number, not the old (nakshatra+1)%30+1 proxy", async () => {
    const asOf = '2026-08-01T12:00:00.000Z';
    const jd = await dateToJulianDay(2026, 8, 1, 12, 0, 0);
    const positions = (await calculatePlanetPositions(jd)) as unknown as Array<
      Record<string, unknown>
    >;
    const sun = positions.find((p) => p.planet === 'Sun')!;
    const moon = positions.find((p) => p.planet === 'Moon')!;
    const realTithi = calculateTithi(moon.longitude as number, sun.longitude as number);
    const transitMoonNakIdx =
      (moon.nakshatraIndex as number | undefined) ??
      Math.floor((moon.longitude as number) / (360 / 27));
    const oldProxyTithi = ((transitMoonNakIdx + 1) % 30) + 1;

    // Sanity: for this fixture date, the real tithi and the old buggy proxy
    // actually differ — otherwise this test couldn't distinguish the fix.
    expect(realTithi.number).not.toBe(oldProxyTithi);

    const natalAscSignIdx = 4;
    const vara = new Date(asOf).getUTCDay() + 1;
    const result = await synthesizeDailyForecast({
      natalPlanets: [],
      natalAscSignIdx,
      natalMoonSignIdx: 3,
      natalMoonNakIdx: 14,
      asOf,
    });
    const panchaka = result.panchaka as { rawSum: number };
    const expectedRawSum =
      realTithi.number + vara + (transitMoonNakIdx + 1) + (natalAscSignIdx + 1);
    expect(panchaka.rawSum).toBe(expectedRawSum);
  });
});
