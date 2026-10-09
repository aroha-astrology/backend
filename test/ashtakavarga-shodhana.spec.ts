import { describe, it, expect } from 'vitest';
import {
  trikonaShodhana,
  ekadhipatyaShodhana,
  reduceBindus,
  shodhyaPinda,
  evaluateSavBand,
  hasBinduMandate,
  RASHI_GUNAKAR,
  GRAHA_GUNAKAR,
} from '../src/lib/astro-engine/calculations/ashtakavarga-shodhana.js';
import type { ChartData } from '@aroha-astrology/shared';

describe('trikonaShodhana', () => {
  it('subtracts the group minimum from all three trine members when none are zero', () => {
    // Fire [0,4,8]=[5,4,0] has a zero -> left as it is (BPHS 67.4).
    // Earth [1,5,9]=[3,7,3] min=3 -> [0,4,0].
    // Air [2,6,10]=[6,1,5] min=1 -> [5,0,4].
    // Water [3,7,11]=[2,8,2] min=2 -> [0,6,0].
    const bindus = [5, 3, 6, 2, 4, 7, 1, 8, 0, 3, 5, 2];
    const result = trikonaShodhana(bindus);
    expect(result).toEqual([5, 0, 5, 0, 4, 4, 0, 6, 0, 0, 4, 0]);
  });

  it('leaves a trine group alone when any single member is already 0 (BPHS 67.4)', () => {
    const bindus = [0, 5, 5, 5, 3, 5, 5, 5, 2, 5, 5, 5];
    const result = trikonaShodhana(bindus);
    // Fire [0,4,8] = [0,3,2] -> contains a 0 -> unchanged.
    expect(result[0]).toBe(0);
    expect(result[4]).toBe(3);
    expect(result[8]).toBe(2);
  });

  it('does not mutate the input array', () => {
    const bindus = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const copy = [...bindus];
    trikonaShodhana(bindus);
    expect(bindus).toEqual(copy);
  });
});

function chartWithPlanetsAt(signIndices: number[]): ChartData {
  return {
    planets: signIndices.map((signIndex, i) => ({
      planet: `P${i}` as never,
      signIndex,
      longitude: signIndex * 30,
    })),
    ascendant: { signIndex: 0, degree: 0 },
  } as unknown as ChartData;
}

describe('ekadhipatyaShodhana', () => {
  it('zeroes the vacant sign when exactly one sign is occupied and the occupied count is >= the vacant count', () => {
    // Mars pair (0,7): planet at sign 0 only. reduced[0]=3 >= reduced[7]=2 -> zero index 7.
    const reduced = [3, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0];
    const chart = chartWithPlanetsAt([0]);
    const result = ekadhipatyaShodhana(reduced, chart);
    expect(result[0]).toBe(3);
    expect(result[7]).toBe(0);
  });

  it('takes the occupied sign’s count off the vacant one when the occupied sign has FEWER bindus (BPHS 68.4)', () => {
    // Venus pair (1,6): planet at sign 1 only. reduced[1]=2 (occupied) < reduced[6]=9 (vacant): 9 - 2 = 7.
    const reduced = [0, 2, 0, 0, 0, 0, 9, 0, 0, 0, 0, 0];
    const chart = chartWithPlanetsAt([1]);
    const result = ekadhipatyaShodhana(reduced, chart);
    expect(result[1]).toBe(2);
    expect(result[6]).toBe(7);
  });

  it('takes the smaller count off both signs when neither sign of the pair is occupied (BPHS 68.2, 68.5)', () => {
    // Jupiter pair (8,11): neither occupied. 4 and 7: the 4 comes off both -> 0 and 3.
    const reduced = [0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 7];
    const chart = chartWithPlanetsAt([]); // no planets at all
    const result = ekadhipatyaShodhana(reduced, chart);
    expect(result[8]).toBe(0);
    expect(result[11]).toBe(3);
  });

  it('zeroes both signs of a both-vacant exact tie (BPHS 68.5)', () => {
    // Mercury pair (2,5): neither occupied, tied at 6.
    const reduced = [0, 0, 6, 0, 0, 6, 0, 0, 0, 0, 0, 0];
    const chart = chartWithPlanetsAt([]);
    const result = ekadhipatyaShodhana(reduced, chart);
    expect(result[2]).toBe(0);
    expect(result[5]).toBe(0);
  });

  it('leaves both signs untouched when both are occupied', () => {
    // Saturn pair (9,10): planets in both signs.
    const reduced = [0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 3, 0];
    const chart = chartWithPlanetsAt([9, 10]);
    const result = ekadhipatyaShodhana(reduced, chart);
    expect(result[9]).toBe(5);
    expect(result[10]).toBe(3);
  });

  it('runs all 5 dual-lordship pairs independently in one pass (composite scenario)', () => {
    const reduced = [3, 2, 6, 0, 0, 6, 9, 2, 4, 5, 3, 7];
    // Mars(0,7): occ@0, 3>=2 -> zero 7.
    // Venus(1,6): occ@1, 2<9 -> the vacant one loses 2: 7.
    // Mercury(2,5): neither occ, tie 6=6 -> both zero.
    // Jupiter(8,11): neither occ, 4 and 7 -> 0 and 3.
    // Saturn(9,10): both occ -> unchanged.
    const chart = chartWithPlanetsAt([0, 1, 9, 10]);
    const result = ekadhipatyaShodhana(reduced, chart);
    expect(result).toEqual([3, 2, 0, 0, 0, 0, 7, 0, 0, 5, 3, 3]);
  });
});

describe('reduceBindus (Trikona then Ekadhipatya, composed)', () => {
  it('runs Ekadhipatya on the already trine-reduced values, not the raw ones', () => {
    const bindus = [5, 3, 6, 2, 4, 7, 1, 8, 0, 3, 5, 2];
    // After Trikona: [5,0,5,0,4,4,0,6,0,0,4,0] (from the trikonaShodhana test above).
    // Mercury pair (2,5): reduced values are 5 and 4, neither occupied -> the 4 comes off both: 1 and 0.
    const chart = chartWithPlanetsAt([]);
    const result = reduceBindus(bindus, chart);
    expect(result[2]).toBe(1);
    expect(result[5]).toBe(0);
  });
});

describe('shodhyaPinda', () => {
  it('sums reduced-bindus x Rashi Gunakar for rasiPinda, and, for grahaPinda, the count of the sign each planet stands in x its Graha Gunakar (BPHS 69)', () => {
    const reduced = new Array(12).fill(0);
    reduced[0] = 2; // Aries, Rashi Gunakar 7
    reduced[11] = 3; // Pisces, Rashi Gunakar 12
    const chart = {
      planets: [
        { planet: 'Jupiter', signIndex: 11 }, // 3 x 10
        { planet: 'Sun', signIndex: 0 }, // 2 x 5
        { planet: 'Rahu', signIndex: 0 }, // not counted
      ],
    } as unknown as ChartData;
    const result = shodhyaPinda(reduced, chart);
    expect(result.rasiPinda).toBe(2 * RASHI_GUNAKAR[0]! + 3 * RASHI_GUNAKAR[11]!);
    expect(result.grahaPinda).toBe(3 * GRAHA_GUNAKAR.Jupiter + 2 * GRAHA_GUNAKAR.Sun);
    expect(result.shodhyaPinda).toBe(result.rasiPinda + result.grahaPinda);
  });

  it('every planet has a positive Graha Gunakar', () => {
    for (const planet of Object.keys(GRAHA_GUNAKAR) as (keyof typeof GRAHA_GUNAKAR)[]) {
      expect(GRAHA_GUNAKAR[planet]).toBeGreaterThan(0);
    }
  });

  it('all 12 signs have a positive Rashi Gunakar', () => {
    expect(RASHI_GUNAKAR).toHaveLength(12);
    for (const g of RASHI_GUNAKAR) expect(g).toBeGreaterThan(0);
  });
});

describe('evaluateSavBand', () => {
  it('classifies >=30 as a power center', () => {
    expect(evaluateSavBand(30)).toBe('power-center');
    expect(evaluateSavBand(35)).toBe('power-center');
  });

  it('classifies <=25 as karmic-struggle', () => {
    expect(evaluateSavBand(25)).toBe('karmic-struggle');
    expect(evaluateSavBand(10)).toBe('karmic-struggle');
  });

  it('classifies exactly 28 as the cosmic baseline', () => {
    expect(evaluateSavBand(28)).toBe('baseline');
  });

  it('classifies the remaining range as moderate', () => {
    expect(evaluateSavBand(27)).toBe('moderate');
    expect(evaluateSavBand(29)).toBe('moderate');
  });
});

describe('hasBinduMandate', () => {
  it('requires >=4 bindus for a favorable transit mandate', () => {
    expect(hasBinduMandate(4)).toBe(true);
    expect(hasBinduMandate(8)).toBe(true);
    expect(hasBinduMandate(3)).toBe(false);
    expect(hasBinduMandate(0)).toBe(false);
  });
});
