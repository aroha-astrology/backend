import { describe, expect, it } from 'vitest';
import {
  bundleDuePaise,
  freeHouseNumbers,
  mahadashaHouse,
} from '../src/modules/kundli/house-offer.js';

// House 1 and the house the running Mahadasha lord sits in are free. With no birth time the house
// is counted from the Moon, because the Ascendant is not reliable then.

type Ctx = Parameters<typeof mahadashaHouse>[0];

const chart = (mahadashaPlanet: string | null): Ctx => ({
  moonSignIndex: 3, // Moon in Cancer
  dasha: {
    mahadasha: mahadashaPlanet
      ? ({ planet: mahadashaPlanet, startDate: '2020-01-01', endDate: '2030-01-01' } as never)
      : null,
    antardasha: null,
    pratyantardasha: null,
  },
  natal: [
    // Saturn: 7th from the Ascendant; in Capricorn (sign 9) it is the 7th from the Moon in Cancer too.
    { planet: 'Saturn', signIndex: 9, house: 7, nakshatraIndex: 21 },
    // Venus: 10th from the Ascendant; in Aries (sign 0) it is the 10th from the Moon in Cancer too.
    { planet: 'Venus', signIndex: 0, house: 10, nakshatraIndex: 1 },
    // Jupiter: 4th from the Ascendant, but in Scorpio (sign 7) it is the 5th from the Moon.
    { planet: 'Jupiter', signIndex: 7, house: 4, nakshatraIndex: 17 },
  ] as never,
});

describe('mahadashaHouse', () => {
  it('is the Ascendant-counted house of the Mahadasha lord when the birth time is known', () => {
    expect(mahadashaHouse(chart('Jupiter'), 'exact')).toBe(4);
    expect(mahadashaHouse(chart('Jupiter'), 'approximate')).toBe(4);
  });

  it('counts from the Moon when the birth time is unknown', () => {
    expect(mahadashaHouse(chart('Jupiter'), 'unknown')).toBe(5);
  });

  it('is null with no running Mahadasha or a lord that is not in the chart', () => {
    expect(mahadashaHouse(chart(null), 'exact')).toBeNull();
    expect(mahadashaHouse(chart('Mercury'), 'exact')).toBeNull();
  });
});

describe('freeHouseNumbers', () => {
  it('is house 1 plus the Mahadasha house, in order', () => {
    expect(freeHouseNumbers(chart('Saturn'), 'exact')).toEqual([1, 7]);
    expect(freeHouseNumbers(chart('Jupiter'), 'exact')).toEqual([1, 4]);
  });

  it('is just house 1 when the Mahadasha lord sits in house 1, or there is no Mahadasha', () => {
    const inFirst = chart('Venus');
    (inFirst.natal as unknown as Array<{ planet: string; house: number }>)[1]!.house = 1;
    expect(freeHouseNumbers(inFirst, 'exact')).toEqual([1]);
    expect(freeHouseNumbers(chart(null), 'exact')).toEqual([1]);
  });
});

describe('bundleDuePaise', () => {
  it('is the bundle price while many houses are still locked', () => {
    expect(bundleDuePaise(10, 2500, 14900)).toBe(14900);
  });

  it('never costs more than buying what is left one by one', () => {
    expect(bundleDuePaise(2, 2500, 14900)).toBe(5000);
    expect(bundleDuePaise(5, 2500, 14900)).toBe(12500);
  });

  it('is 0 when nothing is left to unlock', () => {
    expect(bundleDuePaise(0, 2500, 14900)).toBe(0);
  });
});
