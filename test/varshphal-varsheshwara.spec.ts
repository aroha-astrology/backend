import { describe, it, expect } from 'vitest';
import { selectVarsheshwara } from '../src/lib/astro-engine/varshphal/varsheshwara.js';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';

describe('selectVarsheshwara (using a real cast chart as the Varsha Kundali fixture)', () => {
  it('selects a Varsheshwara from a real classical planet name', async () => {
    const varshaChart = await calculateChart(2026, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
    const result = selectVarsheshwara(0, 3, varshaChart, true);

    const CLASSICAL_PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
    expect(CLASSICAL_PLANETS).toContain(result.varsheshwara);
  });

  it('always returns exactly the 5 Panchadhikari candidates, each with a strength and aspect flag', async () => {
    const varshaChart = await calculateChart(2026, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
    const result = selectVarsheshwara(0, 3, varshaChart, true);

    expect(result.candidates).toHaveLength(5);
    const roles = result.candidates.map((c) => c.role);
    expect(roles).toEqual([
      'Janma Lagnesha',
      'Munthesh',
      'Varsha Lagnesha',
      'Dina-Ratri Pati',
      'Tri-Rashi Pati',
    ]);
    for (const c of result.candidates) {
      expect(typeof c.strength).toBe('number');
      expect(typeof c.aspectsVarshaAscendant).toBe('boolean');
    }
  });

  it('day return and night return can select a different Dina-Ratri Pati candidate', async () => {
    const varshaChart = await calculateChart(2026, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
    const dayResult = selectVarsheshwara(0, 3, varshaChart, true);
    const nightResult = selectVarsheshwara(0, 3, varshaChart, false);

    const dayDinaRatri = dayResult.candidates.find((c) => c.role === 'Dina-Ratri Pati')!;
    const nightDinaRatri = nightResult.candidates.find((c) => c.role === 'Dina-Ratri Pati')!;
    // Not guaranteed to differ for every chart (Sun and Moon could share a
    // sign lord by coincidence), but for THIS real chart they should not.
    expect(dayDinaRatri.planet === nightDinaRatri.planet).toBe(
      // Compute independently: are Sun and Moon in same-lord signs for this chart?
      varshaChart.planets.find((p) => p.planet === 'Sun')!.signIndex ===
        varshaChart.planets.find((p) => p.planet === 'Moon')!.signIndex,
    );
  });

  it('the Munthesh candidate is always the lord of the Muntha sign, independent of the other candidates', async () => {
    const varshaChart = await calculateChart(2026, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
    const munthaSignIndex = 7;
    const result = selectVarsheshwara(0, munthaSignIndex, varshaChart, true);
    const munthesh = result.candidates.find((c) => c.role === 'Munthesh')!;
    // Scorpio (signIndex 7) is ruled by Mars.
    expect(munthesh.planet).toBe('Mars');
  });
});
