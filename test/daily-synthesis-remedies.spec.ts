import { describe, it, expect } from 'vitest';
import {
  synthesizeDailyForecast,
  buildDashaLordRemedy,
} from '../src/lib/astro-tools/daily-synthesis.js';
import { getLalKitabRemedies } from '../src/lib/astro-engine/index.js';
import { getMoonTransitRemedy } from '../src/lib/astro-engine/lalkitab/transitRemedies.js';

describe('synthesizeDailyForecast: remedies (Phase 4 wiring)', () => {
  it('always returns a remedies array, even when empty', async () => {
    const result = await synthesizeDailyForecast({
      natalPlanets: [],
      natalAscSignIdx: 0,
      natalMoonSignIdx: 0,
      natalMoonNakIdx: 0,
      asOf: '2026-08-01T12:00:00.000Z',
    });
    expect(Array.isArray(result.remedies)).toBe(true);
  });

  it('buildDashaLordRemedy attaches a Lal Kitab remedy when the lord is transit-debilitated, keyed to its natal house', () => {
    const remedy = buildDashaLordRemedy(
      'Mahadasha',
      {
        planet: 'Saturn',
        transitSign: 'Aries',
        dignity: 'debilitated',
        qualityScore: 0,
        description: 'Saturn is debilitated in Aries',
      },
      [{ planet: 'Saturn', house: 5 }],
    );

    expect(remedy).not.toBeNull();
    expect(remedy!.reason).toContain('Saturn');
    expect(remedy!.reason).toContain('house 5');

    const expected = getLalKitabRemedies('Saturn', 5);
    expect(remedy!.remedies).toEqual(expected.remedies.slice(0, 2));
  });

  it('buildDashaLordRemedy returns null when the lord is well-placed (not debilitated)', () => {
    const remedy = buildDashaLordRemedy(
      'Mahadasha',
      {
        planet: 'Saturn',
        transitSign: 'Capricorn',
        dignity: 'own',
        qualityScore: 4,
        description: 'Saturn is in its own sign',
      },
      [{ planet: 'Saturn', house: 3 }],
    );
    expect(remedy).toBeNull();
  });

  it('buildDashaLordRemedy returns null (rather than throwing) when the natal planet has no house assigned', () => {
    const remedy = buildDashaLordRemedy(
      'Mahadasha',
      {
        planet: 'Saturn',
        transitSign: 'Aries',
        dignity: 'debilitated',
        qualityScore: 0,
        description: 'Saturn is debilitated in Aries',
      },
      [{ planet: 'Saturn' }], // no `house` field
    );
    expect(remedy).toBeNull();
  });

  it('buildDashaLordRemedy returns null when quality itself is undefined (no active Dasha lord known)', () => {
    expect(buildDashaLordRemedy('Antardasha', undefined, [])).toBeNull();
  });

  it('the Moon-transit remedy reason names the correct house-from-Moon', async () => {
    // Just verify the reason string, when a Moon-transit remedy IS attached,
    // is internally consistent with getMoonTransitRemedy's own coverage.
    const result = await synthesizeDailyForecast({
      natalPlanets: [{ planet: 'Moon', signIndex: 0, longitude: 5 }],
      natalAscSignIdx: 0,
      natalMoonSignIdx: 0,
      natalMoonNakIdx: 0,
      asOf: '2026-08-01T12:00:00.000Z',
    });
    const moonRemedy = result.remedies.find((r) => r.reason.includes('Moon transiting'));
    if (moonRemedy) {
      const houseMatch = /your (\d+)th house/.exec(moonRemedy.reason);
      expect(houseMatch).not.toBeNull();
      const house = Number(houseMatch![1]);
      const expected = getMoonTransitRemedy(house);
      expect(moonRemedy.remedies).toEqual(expected.remedies);
    }
  });
});
