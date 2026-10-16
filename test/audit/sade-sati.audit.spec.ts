import { describe, it, expect } from 'vitest';
import { detectCurrentSadeSati } from '../../src/lib/astro-engine/doshas/sadeSati.js';

// =============================================================================
// Audit item DS6 (docs/engine-audit/C-critical-corrections.md)
// =============================================================================
// External dates (Lahiri sidereal, from published almanacs): Saturn entered
// Aquarius on 29 April 2022, stepped back into Capricorn on 12 July 2022,
// re-entered Aquarius on 17 January 2023 and entered Pisces on 29 March 2025.
// For a Moon in Pisces, Sade Sati therefore opened on 29 April 2022 (the
// six-month step back is a retrograde dip, not an exit) and on 1 January 2026
// Saturn is in the Moon's own sign: the peak phase. It closes when Saturn
// leaves Aries, in 2029-2030.
// The old estimate (912 days per sign from Saturn's degree) put the start
// about a year late.
// =============================================================================

describe("[DS6] Sade Sati dates come from Saturn's real sign changes", () => {
  it('Moon in Pisces on 1 Jan 2026: peak phase, opened 29 April 2022, closes in 2029-2030', async () => {
    const result = await detectCurrentSadeSati('Pisces', new Date(Date.UTC(2026, 0, 1)));
    expect(result.active).toBe(true);
    expect(result.phase).toBe('peak');

    const dayMs = 86_400_000;
    const expectedStart = Date.UTC(2022, 3, 29);
    expect(Math.abs(result.startDate!.getTime() - expectedStart)).toBeLessThanOrEqual(2 * dayMs);

    expect(result.endDate!.getTime()).toBeGreaterThan(Date.UTC(2029, 5, 1));
    expect(result.endDate!.getTime()).toBeLessThan(Date.UTC(2030, 11, 31));
    expect(result.description).not.toContain('Estimated');
  }, 120_000);

  it('a Moon sign Saturn is nowhere near stays inactive', async () => {
    const result = await detectCurrentSadeSati('Leo', new Date(Date.UTC(2026, 0, 1)));
    expect(result.active).toBe(false);
    expect(result.startDate).toBeNull();
  }, 60_000);
});

describe('[DS6] the combined dosha read takes Sade Sati from the sky at that moment', () => {
  it('a chart whose birth Saturn sits on its Moon is not in Sade Sati when Saturn is elsewhere', async () => {
    // Moon and BIRTH Saturn both in Leo. On 1 January 2026 Saturn is in Pisces,
    // the 8th from Leo: no Sade Sati. Reading the birth Saturn as the transit
    // (as the swarm profiler did) reports the peak phase for life.
    const { analyzeAllDoshasAt } = await import('../../src/lib/astro-engine/doshas/index.js');
    const planet = (name: string, signIndex: number, house: number) => ({
      planet: name,
      sign: ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo'][signIndex] ?? 'Aries',
      signIndex,
      signDegree: 10,
      longitude: signIndex * 30 + 10,
      latitude: 0,
      speed: 1,
      isRetrograde: false,
      house,
    });
    const chart = {
      planets: [
        planet('Sun', 0, 1),
        planet('Moon', 4, 5),
        planet('Mars', 2, 3),
        planet('Mercury', 0, 1),
        planet('Jupiter', 1, 2),
        planet('Venus', 1, 2),
        planet('Saturn', 4, 5),
        planet('Rahu', 3, 4),
        { ...planet('Ketu', 3, 10), sign: 'Capricorn', signIndex: 9, longitude: 280 },
      ],
      houses: [],
      ascendant: { sign: 'Aries', signIndex: 0, degree: 10 },
      ayanamsa: 'lahiri',
      ayanamsaValue: 24,
      julianDay: 2451545,
    };
    const doshas = await analyzeAllDoshasAt(chart as never, new Date(Date.UTC(2026, 0, 1)));
    expect(doshas.sadeSati.active).toBe(false);
  }, 60_000);
});
