import { describe, expect, it } from 'vitest';
import { NAKSHATRAS } from '@aroha-astrology/shared';
import { scoreDay, type DaySky } from '../src/lib/astro-tools/decision-engine.js';
import { DECISION_SPECS } from '../src/lib/astro-tools/muhurta-rules.js';

// Audit Sprint 5, M9: Decisions always counted Saturn in the 12th, 1st and 2nd from the Moon
// (Sade Sati) against a major new start, but Saturn in the 8th (Ashtama Shani) only when the
// 8th belonged to the area asked about. Chat calls Ashtama "the harder of the two", so a big
// career start could be rated fine during it.

const pushya = NAKSHATRAS.indexOf('Pushya');

/** Saturn in Pisces (index 11). The day's Moon is placed 2nd from the natal Moon, a neutral Chandra Bala. */
function dayFor(natalMoonSignIndex: number): DaySky {
  return {
    date: '2026-10-01',
    weekday: 4,
    tithi: 5,
    nakshatraIndex: pushya,
    moonSignIndex: (natalMoonSignIndex + 1) % 12,
    planets: [
      { planet: 'Sun', longitude: 165, signIndex: 5, sign: 'Virgo', isRetrograde: false },
      { planet: 'Moon', longitude: 100, signIndex: 3, sign: 'Cancer', isRetrograde: false },
      { planet: 'Mercury', longitude: 180, signIndex: 6, sign: 'Libra', isRetrograde: false },
      { planet: 'Jupiter', longitude: 100, signIndex: 3, sign: 'Cancer', isRetrograde: false },
      { planet: 'Venus', longitude: 200, signIndex: 6, sign: 'Libra', isRetrograde: false },
      { planet: 'Saturn', longitude: 335, signIndex: 11, sign: 'Pisces', isRetrograde: false },
    ],
  };
}

/** Career change: its area houses are 10, 6, 11, so neither the 8th nor the 4th is the area's own. */
function careerScore(natalMoonSignIndex: number) {
  return scoreDay(dayFor(natalMoonSignIndex), DECISION_SPECS.careerChange, 'decision', {
    moonSignIndex: natalMoonSignIndex,
    moonNakshatraIndex: pushya,
    ascendantSignIndex: 0, // Saturn is the 12th from this Lagna: not a career house
  });
}

const saturnFactor = (s: ReturnType<typeof careerScore>) =>
  s.why.find((f) => f.kind === 'transit' && f.planet === 'Saturn');

describe('M9: Ashtama Shani counts against a new start like Sade Sati does', () => {
  // Leo Moon (index 4): Saturn in Pisces is the 8th from the Moon. Cancer Moon (index 3): the 9th.
  it('Saturn 8th from the Moon lowers the score by the Saturn weight and says why', () => {
    const ashtama = careerScore(4);
    const ninth = careerScore(3);
    expect(saturnFactor(ninth)).toBeUndefined(); // 9th from the Moon: nothing to say
    expect(saturnFactor(ashtama)?.effect).toBe(-1);
    expect(saturnFactor(ashtama)?.house).toBe(8);
    expect(ninth.score - ashtama.score).toBe(5); // WEIGHTS.decision.saturn
  });

  it('still counts Sade Sati: Saturn in the 12th from the Moon', () => {
    // Aries Moon (index 0): Saturn in Pisces is the 12th.
    expect(saturnFactor(careerScore(0))?.effect).toBe(-1);
  });

  it('keeps Kantaka Shani (Saturn 4th from the Moon) out of an unrelated decision (owner, 2026-11-05)', () => {
    // Sagittarius Moon (index 8): Saturn in Pisces is the 4th. Career houses are 10, 6, 11.
    expect(saturnFactor(careerScore(8))).toBeUndefined();
  });

  it('leaves a Saturn that is neither Sade Sati nor Ashtama alone', () => {
    // Taurus Moon (index 1): Saturn is the 11th (favourable). Virgo Moon (5): the 7th, which is
    // not Sade Sati, not Ashtama and not a career house.
    expect(saturnFactor(careerScore(1))?.effect).toBe(1);
    expect(saturnFactor(careerScore(5))).toBeUndefined();
  });
});
