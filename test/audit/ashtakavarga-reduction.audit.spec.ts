import { describe, it, expect } from 'vitest';
import type { ChartData, Planet } from '@aroha-astrology/shared';
import {
  trikonaShodhana,
  ekadhipatyaShodhana,
  shodhyaPinda,
  RASHI_GUNAKAR,
  GRAHA_GUNAKAR,
} from '../../src/lib/astro-engine/calculations/ashtakavarga-shodhana.js';

// =============================================================================
// Ashtakavarga reductions and Pindas, BPHS chapters 67-69 (register BPHS-67/68/69)
// =============================================================================
// Expectations come from the chapters' rules and their worked examples
// (R. Santhanam's translation), not from the code.
// =============================================================================

const planetsAt = (placement: Partial<Record<Planet, number>>): ChartData =>
  ({
    planets: Object.entries(placement).map(([planet, signIndex]) => ({
      planet,
      signIndex,
      longitude: signIndex * 30 + 10,
    })),
    ascendant: { signIndex: 0, degree: 0 },
  }) as unknown as ChartData;

describe('[BPHS 67.4-5] Trikona Shodhana', () => {
  // The trines are Aries-Leo-Sagittarius (0,4,8), Taurus-Virgo-Capricorn (1,5,9),
  // Gemini-Libra-Aquarius (2,6,10), Cancer-Scorpio-Pisces (3,7,11).
  const trine = (v: [number, number, number]) =>
    trikonaShodhana([v[0], 0, 0, 0, v[1], 0, 0, 0, v[2], 0, 0, 0]);

  it('subtracts the smallest from all three: [3, 7, 3] becomes [0, 4, 0]', () => {
    const r = trikonaShodhana([3, 3, 0, 0, 7, 3, 0, 0, 3, 3, 0, 0]);
    // Earth trine (1,5,9) = [3, 3, 3]: all equal, so all zero. Fire trine (0,4,8) = [3, 7, 3] -> [0, 4, 0].
    expect([r[0], r[4], r[8]]).toEqual([0, 4, 0]);
    expect([r[1], r[5], r[9]]).toEqual([0, 0, 0]);
  });

  it('all three equal: everything goes to zero', () => {
    expect(trine([4, 4, 4])).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('"ekasmin bhavane śūnyaṃ tat trikoṇaṃ na śodhayet": a trine with a zero in it is left as it is', () => {
    // Fire trine [5, 4, 0]. The engine used to zero all three.
    const r = trikonaShodhana([5, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0]);
    expect([r[0], r[4], r[8]]).toEqual([5, 4, 0]);
  });

  it('each trine is reduced on its own', () => {
    // Fire [2, 3, 5] -> [0, 1, 3]; Water (3,7,11) [6, 2, 9] -> [4, 0, 7].
    const r = trikonaShodhana([2, 0, 0, 6, 3, 0, 0, 2, 5, 0, 0, 9]);
    expect([r[0], r[4], r[8]]).toEqual([0, 1, 3]);
    expect([r[3], r[7], r[11]]).toEqual([4, 0, 7]);
  });
});

describe('[BPHS 68.2-6] Ekadhipatya Shodhana, the chapter’s own examples', () => {
  // Signs: Mars 0/7, Venus 1/6, Mercury 2/5, Jupiter 8/11, Saturn 9/10.
  const reduce = (values: Record<number, number>, occupied: number[]) => {
    const bindus = new Array<number>(12).fill(0);
    for (const [i, v] of Object.entries(values)) bindus[Number(i)] = v;
    const chart = planetsAt(Object.fromEntries(occupied.map((s, i) => [`P${i}`, s])));
    return ekadhipatyaShodhana(bindus, chart);
  };

  it('a planet in Aries (1), none in Scorpio (3): Scorpio keeps 3 - 1 = 2 and Aries stays 1', () => {
    const r = reduce({ 0: 1, 7: 3 }, [0]);
    expect([r[0], r[7]]).toEqual([1, 2]);
  });

  it('a planet in Capricorn, none in Aquarius, both 2: Aquarius goes to zero, Capricorn stays', () => {
    const r = reduce({ 9: 2, 10: 2 }, [9]);
    expect([r[9], r[10]]).toEqual([2, 0]);
  });

  it('the occupied sign has more than the empty one: the empty one goes to zero', () => {
    const r = reduce({ 1: 2, 6: 1 }, [1]); // Taurus occupied 2, Libra empty 1
    expect([r[1], r[6]]).toEqual([2, 0]);
  });

  it('neither sign occupied and equal (Gemini 4, Virgo 4): both go to zero', () => {
    const r = reduce({ 2: 4, 5: 4 }, []);
    expect([r[2], r[5]]).toEqual([0, 0]);
  });

  it('neither sign occupied, Sagittarius 1 and Pisces 2: the difference is taken off both, 0 and 1', () => {
    const r = reduce({ 8: 1, 11: 2 }, []);
    expect([r[8], r[11]]).toEqual([0, 1]);
  });

  it('both signs hold a planet: nothing is done', () => {
    const r = reduce({ 9: 5, 10: 3 }, [9, 10]);
    expect([r[9], r[10]]).toEqual([5, 3]);
  });

  it('a sign with no bindus left in the pair: nothing is done', () => {
    const r = reduce({ 0: 0, 7: 5 }, []);
    expect([r[0], r[7]]).toEqual([0, 5]);
  });

  it('Cancer and Leo are never touched', () => {
    const r = reduce({ 3: 4, 4: 6 }, []);
    expect([r[3], r[4]]).toEqual([4, 6]);
  });
});

describe('[BPHS 69] Pinda Sadhana, the chapter’s worked example', () => {
  // The Sun's table after both reductions, Aries to Pisces:
  //   Taurus 1, Gemini 1, Cancer 4, Leo 1, Scorpio 4, Sagittarius 1, Capricorn 3, the rest 0.
  // Rasi Pinda  = 1x10 + 1x8 + 4x4 + 1x10 + 4x8 + 1x9 + 3x5 = 100
  // Planets: Saturn in Capricorn, Mars in Taurus, the Moon in Gemini, the Sun in Scorpio,
  // Mercury, Jupiter and Venus in Aquarius (0 left there). Rahu and Ketu are not counted.
  // Graha Pinda = 3x5 (Saturn) + 1x8 (Mars) + 1x5 (Moon) + 4x5 (Sun) + 0 = 48
  // Yoga Pinda  = 148
  const reduced = [0, 1, 1, 4, 1, 0, 0, 4, 1, 3, 0, 0];
  const chart = planetsAt({
    Saturn: 9,
    Mars: 1,
    Moon: 2,
    Sun: 7,
    Mercury: 10,
    Jupiter: 10,
    Venus: 10,
    Rahu: 3,
    Ketu: 9,
  });

  it('Rasi Pinda 100, Graha Pinda 48, Yoga Pinda 148', () => {
    expect(shodhyaPinda(reduced, chart)).toEqual({
      rasiPinda: 100,
      grahaPinda: 48,
      shodhyaPinda: 148,
    });
  });

  it('the multipliers are the chapter’s: signs 7, 10, 8, 4, 10, 5, 7, 8, 9, 5, 11, 12; planets 5, 5, 8, 5, 10, 7, 5', () => {
    expect([...RASHI_GUNAKAR]).toEqual([7, 10, 8, 4, 10, 5, 7, 8, 9, 5, 11, 12]);
    expect(GRAHA_GUNAKAR).toEqual({
      Sun: 5,
      Moon: 5,
      Mars: 8,
      Mercury: 5,
      Jupiter: 10,
      Venus: 7,
      Saturn: 5,
    });
  });

  it('a planet in a sign left with no bindus adds nothing to the Graha Pinda', () => {
    const only = shodhyaPinda([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], planetsAt({ Sun: 3 }));
    expect(only.grahaPinda).toBe(0);
  });
});
