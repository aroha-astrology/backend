import { describe, it, expect } from 'vitest';
import { BirthInputSchema } from '../src/modules/astro/astro.schemas.js';
import { birthTimeCaveat } from '../src/modules/astro/astro.service.js';
import { resolvePrimaryHand } from '../src/modules/palm/palm.service.js';
import {
  calculateAshtakoota,
  calculateAshtakootaForPair,
} from '../src/lib/astro-engine/matching/ashtakoota.js';
import {
  calculateDashakoota,
  calculateDashakootaForPair,
} from '../src/lib/astro-engine/matching/dashakoota.js';
import { computeD7Progeny } from '../src/lib/astro-engine/reports/progeny-d7.js';
import { buildProfileFacts } from '../src/lib/chat-grounding.js';
import { userZone, zoneLabel } from '../src/lib/user-time-zone.js';

// =============================================================================
// Places the system used to fill in a fact it did not have (2026-10-20 audit).
// Each test names what used to be assumed.
// =============================================================================

const place = { date: '1990-05-15', latitude: 28.6139, longitude: 77.209 };

describe('birth input', () => {
  it('a left-out time is unknown, not exact (it used to be 12:00 marked exact)', () => {
    const b = BirthInputSchema.parse(place);
    expect(b.time).toBe('12:00');
    expect(b.timeAccuracy).toBe('unknown');
  });

  it('a given time is exact unless the caller says otherwise', () => {
    expect(BirthInputSchema.parse({ ...place, time: '14:30' }).timeAccuracy).toBe('exact');
    expect(
      BirthInputSchema.parse({ ...place, time: '14:30', timeAccuracy: 'approximate' }).timeAccuracy,
    ).toBe('approximate');
  });

  it('says which parts of a noon chart cannot be trusted', () => {
    expect(birthTimeCaveat('unknown')).toContain('12:00 noon');
    expect(birthTimeCaveat('unknown')).toContain('ascendant');
  });
});

describe('palm: the main hand', () => {
  it('follows the classical rule for men and women', () => {
    expect(resolvePrimaryHand('male')).toBe('right');
    expect(resolvePrimaryHand('female')).toBe('left');
  });

  it('asks instead of reading the right hand when the gender is not male or female', () => {
    expect(() => resolvePrimaryHand('other')).toThrow('HAND_REQUIRED');
    expect(() => resolvePrimaryHand(null)).toThrow('HAND_REQUIRED');
    expect(resolvePrimaryHand(null, 'left')).toBe('left');
  });
});

describe('Guna Milan order', () => {
  const her = { nakshatraIndex: 3, sign: 'Taurus' as const };
  const him = { nakshatraIndex: 20, sign: 'Capricorn' as const };
  const manFirst = calculateAshtakoota(20, 3, 'Capricorn', 'Taurus').totalScore;
  const herFirst = calculateAshtakoota(3, 20, 'Taurus', 'Capricorn').totalScore;

  it('puts the man first whichever side he is on', () => {
    expect(calculateAshtakootaForPair(her, him, 'female', 'male').totalScore).toBe(manFirst);
    expect(calculateAshtakootaForPair(him, her, 'male', 'female').totalScore).toBe(manFirst);
  });

  it('uses the lower total when nobody is known to be the boy (it used to be the asker)', () => {
    const r = calculateAshtakootaForPair(her, him, null, 'male');
    expect(r.totalScore).toBe(Math.min(manFirst, herFirst));
    expect(r.orderKnown).toBe(false);
  });

  it('applies the same rule to Dashakoota', () => {
    const lower = Math.min(
      calculateDashakoota(20, 3, 'Capricorn', 'Taurus').totalScore,
      calculateDashakoota(3, 20, 'Taurus', 'Capricorn').totalScore,
    );
    expect(calculateDashakootaForPair(her, him, null, null).totalScore).toBe(lower);
  });
});

describe('progeny: the gender-based child method', () => {
  const d7 = {
    lagna: 'Aries',
    planets: { Sun: 'Leo', Moon: 'Cancer', Jupiter: 'Sagittarius', Venus: 'Libra' },
  } as never;

  it('is not applied without a gender (it used to read the male 5th house)', () => {
    const r = computeD7Progeny(d7, null, null)!;
    expect(r.genderKnown).toBe(false);
    expect(r.agreement).toBe(false);
    expect(r.methodA).toBe(r.methodB);
  });

  it('reads the 9th for a woman and the 5th for a man', () => {
    expect(computeD7Progeny(d7, null, 'female')!.methodA.startHouse).toBe(9);
    expect(computeD7Progeny(d7, null, 'male')!.methodA.startHouse).toBe(5);
  });
});

describe("chat: the account owner's facts", () => {
  const owner = { relationshipStatus: 'married', interestAreas: ['career'], incomeBracket: 'b2' };

  it('are given for the owner', () => {
    const facts = buildProfileFacts({ gender: 'male' }, owner);
    expect(facts.some((f) => f.includes('married'))).toBe(true);
  });

  it('are left out for a saved family profile', () => {
    const facts = buildProfileFacts({ birthProfileId: 'mother', gender: 'female' }, owner);
    expect(facts).toEqual(["User's gender: female"]);
  });
});

describe("the user's clock", () => {
  it('is IST only when no zone is known', () => {
    expect(userZone(null)).toBe('Asia/Kolkata');
    expect(userZone('Not/AZone')).toBe('Asia/Kolkata');
    expect(userZone('America/New_York')).toBe('America/New_York');
  });

  it('labels India IST and other zones by their short name', () => {
    expect(zoneLabel('Asia/Kolkata')).toBe('IST');
    expect(zoneLabel('Europe/London', new Date('2026-12-01T12:00:00Z'))).toBe('GMT');
  });
});
