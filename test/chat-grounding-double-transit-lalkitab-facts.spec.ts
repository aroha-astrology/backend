import { describe, it, expect } from 'vitest';
import {
  buildDoubleTransitFact,
  buildNatalDebilitationRemedyFact,
} from '../src/lib/chat-grounding.js';
import type { PlanetFact } from '../src/lib/chat-grounding.js';

describe('chat-grounding: buildDoubleTransitFact', () => {
  it('returns null when any sign index is missing', () => {
    expect(buildDoubleTransitFact(null, 5, 8, 'currently')).toBeNull();
    expect(buildDoubleTransitFact(0, undefined, 8, 'currently')).toBeNull();
    expect(buildDoubleTransitFact(0, 5, null, 'currently')).toBeNull();
  });

  it('returns null when Jupiter and Saturn jointly aspect nothing from the Moon sign', () => {
    // Jupiter in Aries (0) aspects signs {0,4,6,8} (5th/7th/9th aspect);
    // Saturn in Taurus (1) aspects signs {1,3,7,10} (3rd/7th/10th aspect) —
    // these two sets do not intersect, so nothing is jointly aspected.
    expect(buildDoubleTransitFact(5, 1, 0, 'currently')).toBeNull();
  });

  it('names the jointly-aspected house(s) and includes the transit label when a double-transit window is active', () => {
    // Saturn in Aries (0) aspects houses 3, 7, 10 from Moon-Aries (3rd/7th/10th aspect).
    // Jupiter in Sagittarius (8) aspects houses 3 (5th aspect), 7 (9th aspect), 12 (9th... )
    // Simplest reliable case: same sign for both -> they share every aspected house.
    const fact = buildDoubleTransitFact(0, 0, 0, 'as of 2026-08-01');
    expect(fact).not.toBeNull();
    expect(fact).toContain('Jupiter+Saturn aspect house(s)');
    expect(fact).toContain('as of 2026-08-01');
    expect(fact).toContain('double-transit window');
  });
});

describe('chat-grounding: buildNatalDebilitationRemedyFact', () => {
  function planet(overrides: Partial<PlanetFact>): PlanetFact {
    return {
      planet: 'Saturn',
      sign: 'Aries',
      signIndex: 0,
      house: 5,
      nakshatra: 'Ashwini',
      nakshatraPada: 1,
      nakshatraLord: 'Ketu',
      longitude: 5,
      ...overrides,
    };
  }

  it('returns null when no classical planet is natally debilitated', () => {
    // Saturn is debilitated in Aries (signIndex 0); placing it in its own
    // sign Capricorn (signIndex 9) means no planet here is debilitated.
    expect(
      buildNatalDebilitationRemedyFact([planet({ planet: 'Saturn', signIndex: 9 })]),
    ).toBeNull();
  });

  it('also covers Rahu/Ketu (all 9 Navagraha, not just Sun..Saturn)', () => {
    // Rahu is debilitated in Scorpio (signIndex 7); the Lal Kitab remedy
    // database has entries for Rahu/Ketu by natal house too.
    const fact = buildNatalDebilitationRemedyFact([
      planet({ planet: 'Rahu', signIndex: 7, house: 4 }),
    ]);
    expect(fact).not.toBeNull();
    expect(fact).toContain('Rahu');
  });

  it('names the debilitated planet and its natal house, with a remedy sentence', () => {
    // Saturn is debilitated in Aries (signIndex 0).
    const fact = buildNatalDebilitationRemedyFact([
      planet({ planet: 'Saturn', signIndex: 0, house: 5 }),
    ]);
    expect(fact).not.toBeNull();
    expect(fact).toContain('Lal Kitab remedy');
    expect(fact).toContain('Saturn');
    expect(fact).toContain('house 5');
  });

  it('returns only the FIRST debilitated planet (capped to one, per the char-budget comment)', () => {
    const facts = buildNatalDebilitationRemedyFact([
      planet({ planet: 'Saturn', signIndex: 0, house: 5 }), // debilitated in Aries
      planet({ planet: 'Mars', signIndex: 3, house: 2 }), // debilitated in Cancer
    ]);
    expect(facts).toContain('Saturn');
    expect(facts).not.toContain('Mars');
  });
});
