import { describe, it, expect } from 'vitest';
import { calculateRegionalMonths } from '../src/lib/astro-engine/panchang/regional';

// sunSiderealLong for a given rashi index (0=Mesha..11=Meena): mid-rashi degree.
const rashiLong = (index: number) => index * 30 + 5;

describe('calculateRegionalMonths — new region era-year boundaries', () => {
  it('increments Gujarat era year exactly once across the Kartik Pratipada boundary', () => {
    const before = calculateRegionalMonths({
      isoDate: '2025-10-21',
      gregorianYear: 2025,
      sunSiderealLong: rashiLong(6),
      paksha: 'shukla',
    });
    const after = calculateRegionalMonths({
      isoDate: '2025-10-22',
      gregorianYear: 2025,
      sunSiderealLong: rashiLong(6),
      paksha: 'shukla',
    });
    expect(before.gujarat.year).toBe(2081);
    expect(after.gujarat.year).toBe(2082);
  });

  it('increments Malayalam era year exactly once across Chingam 1', () => {
    const before = calculateRegionalMonths({
      isoDate: '2025-08-16',
      gregorianYear: 2025,
      sunSiderealLong: rashiLong(3),
      paksha: 'shukla',
    });
    const after = calculateRegionalMonths({
      isoDate: '2025-08-17',
      gregorianYear: 2025,
      sunSiderealLong: rashiLong(3),
      paksha: 'shukla',
    });
    expect(before.malayalam.year).toBe(1200);
    expect(after.malayalam.year).toBe(1201);
  });

  it('maps Simha rashi (index 4) to Chingam, month 0, for Malayalam', () => {
    const result = calculateRegionalMonths({
      isoDate: '2025-08-17',
      gregorianYear: 2025,
      sunSiderealLong: rashiLong(4),
      paksha: 'shukla',
    });
    expect(result.malayalam.monthName).toBe('Chingam');
    expect(result.malayalam.monthIndex).toBe(0);
  });

  it('gives Kannada the same era year and month name as Telugu (south)', () => {
    const result = calculateRegionalMonths({
      isoDate: '2026-05-01',
      gregorianYear: 2026,
      sunSiderealLong: rashiLong(1),
      paksha: 'shukla',
    });
    expect(result.kannada.year).toBe(result.south.year);
    expect(result.kannada.monthName).toBe(result.south.monthName);
  });
});

describe('calculateRegionalMonths — Nanakshahi (Punjab)', () => {
  it('is in Phagun (year N-1468) the day before Chet 1, and Chet (year N-1468+1) on Chet 1', () => {
    const before = calculateRegionalMonths({
      isoDate: '2026-03-13',
      gregorianYear: 2026,
      sunSiderealLong: rashiLong(11),
      paksha: 'shukla',
    });
    const after = calculateRegionalMonths({
      isoDate: '2026-03-14',
      gregorianYear: 2026,
      sunSiderealLong: rashiLong(11),
      paksha: 'shukla',
    });
    expect(before.punjab.monthName).toBe('Phagun');
    expect(before.punjab.year).toBe(2025 - 1468);
    expect(after.punjab.monthName).toBe('Chet');
    expect(after.punjab.monthIndex).toBe(0);
    expect(after.punjab.year).toBe(2026 - 1468);
  });

  it('walks into Vaisakh (month 1) exactly 31 days after Chet 1', () => {
    const result = calculateRegionalMonths({
      isoDate: '2026-04-14',
      gregorianYear: 2026,
      sunSiderealLong: rashiLong(0),
      paksha: 'shukla',
    });
    expect(result.punjab.monthName).toBe('Vaisakh');
    expect(result.punjab.monthIndex).toBe(1);
  });

  it('omits paksha and Adhik Maas fields — Nanakshahi has no lunar concept', () => {
    const result = calculateRegionalMonths({
      isoDate: '2026-03-14',
      gregorianYear: 2026,
      sunSiderealLong: rashiLong(11),
      paksha: 'shukla',
    });
    expect(result.punjab.paksha).toBeUndefined();
    expect(result.punjab.isAdhikMaas).toBeUndefined();
  });

  it('gives Nanakshahi an exact dayOfMonth — 1 on Chet 1, 1 again 31 days later at the Vaisakh boundary', () => {
    const chet1 = calculateRegionalMonths({
      isoDate: '2026-03-14',
      gregorianYear: 2026,
      sunSiderealLong: rashiLong(11),
      paksha: 'shukla',
    });
    const vaisakh1 = calculateRegionalMonths({
      isoDate: '2026-04-14',
      gregorianYear: 2026,
      sunSiderealLong: rashiLong(0),
      paksha: 'shukla',
    });
    expect(chet1.punjab.dayOfMonth).toBe(1);
    expect(vaisakh1.punjab.dayOfMonth).toBe(1);
  });
});

describe('calculateRegionalMonths — solar dayOfMonth (approximate)', () => {
  it('is 1 right at a rashi boundary (0° into the rashi) for every solar region', () => {
    const result = calculateRegionalMonths({
      isoDate: '2026-04-14',
      gregorianYear: 2026,
      sunSiderealLong: 0, // exactly at the Mesha boundary
      paksha: 'shukla',
    });
    expect(result.east.dayOfMonth).toBe(1);
    expect(result.odisha.dayOfMonth).toBe(1);
    expect(result.assam.dayOfMonth).toBe(1);
    expect(result.tamil.dayOfMonth).toBe(1);
    expect(result.malayalam.dayOfMonth).toBe(1);
  });

  it('increases with degrees into the rashi, independent of which region names the month', () => {
    const result = calculateRegionalMonths({
      isoDate: '2026-04-20',
      gregorianYear: 2026,
      sunSiderealLong: 5, // 5° into Mesha
      paksha: 'shukla',
    });
    expect(result.east.dayOfMonth).toBeGreaterThan(1);
    expect(result.east.dayOfMonth).toBe(result.tamil.dayOfMonth);
    expect(result.east.dayOfMonth).toBe(result.malayalam.dayOfMonth);
  });

  it('leaves dayOfMonth unset for lunisolar (purnimanta/amanta) regions', () => {
    const result = calculateRegionalMonths({
      isoDate: '2026-04-20',
      gregorianYear: 2026,
      sunSiderealLong: rashiLong(1),
      paksha: 'shukla',
    });
    expect(result.north.dayOfMonth).toBeUndefined();
    expect(result.west.dayOfMonth).toBeUndefined();
    expect(result.gujarat.dayOfMonth).toBeUndefined();
  });
});
