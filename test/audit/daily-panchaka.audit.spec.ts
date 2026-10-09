import { describe, it, expect } from 'vitest';
import {
  gocharaFraction,
  synthesizeDailyForecast,
} from '../../src/lib/astro-tools/daily-synthesis.js';
import { computePanchaka } from '../../src/lib/astro-tools/panchaka.js';
import { synthesisFacts } from '../../src/lib/chat-grounding.js';

// =============================================================================
// Audit item DSY2 (docs/engine-audit/C-critical-corrections.md)
// =============================================================================
// The Panchaka sum is tithi + weekday + nakshatra + the sign RISING at the
// moment being judged. The daily reading fed it the person's BIRTH Lagna.
//
// Worked example: 5th tithi, Sunday (1), 10th nakshatra.
//   Born with Aries rising (1):  5 + 1 + 10 + 1 = 17, 17 mod 9 = 8 -> "Roga"
//   Born with Taurus rising (2): 5 + 1 + 10 + 2 = 18, 18 mod 9 = 0 -> clear
// So the same day carried a disease warning for one person and none for the
// other, by birth sign alone, and lowered the first person's daily score.
// A whole day has no single rising sign, so the daily reading cannot carry a
// Panchaka at all; it belongs to a chosen moment.
// =============================================================================

describe('[DSY2] the daily reading carries no Panchaka', () => {
  it('the worked example: the birth Lagna alone flipped the old result', () => {
    expect(computePanchaka(5, 1, 10, 1).remainder).toBe(8);
    expect(computePanchaka(5, 1, 10, 1).isDangerous).toBe(true);
    expect(computePanchaka(5, 1, 10, 2).remainder).toBe(0);
    expect(computePanchaka(5, 1, 10, 2).isDangerous).toBe(false);
  });

  it('the place of the day inside its band depends only on Kakshya, the lunar day and Vedha', () => {
    expect(gocharaFraction.length).toBe(3);
  });

  it('the synthesis result reports no Panchaka', async () => {
    const result = await synthesizeDailyForecast({
      natalPlanets: [
        { planet: 'Moon', signIndex: 3, longitude: 100, house: 4 },
        { planet: 'Sun', signIndex: 0, longitude: 10, house: 1 },
      ],
      natalAscSignIdx: 0,
      natalMoonSignIdx: 3,
      natalMoonNakIdx: 7,
      asOf: '2026-07-27T06:00:00.000Z',
    });
    expect(result.panchaka).toBeNull();
    expect(result.scoreReasoning.join(' ')).not.toMatch(/Panchaka/);
  }, 60_000);

  it('the chat facts never state a Panchaka danger, whatever a stored reading holds', () => {
    const facts = synthesisFacts({
      date: '2026-07-27',
      score: 3,
      scoreBand: { floor: 2, ceiling: 4 },
      scoreReasoning: [],
      dashaTransit: {},
      vedha: { blockedCount: 0, details: [] },
      kakshya: undefined,
      lunar: undefined,
      doubleTransit: [],
      panchaka: {
        isDangerous: true,
        name: 'Mrityu Panchaka',
        danger: 'Risk of death or severe harm; avoid travel and risky ventures',
        safe: 'Spiritual practices',
      },
      savTransit: {},
      remedies: [],
    } as never);
    expect(facts.join(' ')).not.toMatch(/Panchaka|death/i);
  });
});
