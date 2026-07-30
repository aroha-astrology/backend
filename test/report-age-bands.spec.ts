import { describe, expect, it } from 'vitest';
import {
  computeAgeYears,
  computeAgeBandTable,
  type AgeBand,
} from '../src/lib/astro-engine/reports/report-age-bands.js';
import type { RankedWindow } from '../src/lib/astro-engine/reports/report-timing.js';

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365.25;
const MS_PER_YEAR = DAYS_PER_YEAR * MS_PER_DAY;

/** Same 365.25-day-year approximation report-age-bands.ts's own private `addYears` uses. */
function addYears(date: Date, years: number): Date {
  return new Date(date.getTime() + years * MS_PER_YEAR);
}

function makeWindow(startDate: Date, level: RankedWindow['level']): RankedWindow {
  return {
    startDate: startDate.toISOString(),
    endDate: addYears(startDate, 1).toISOString(),
    score: level === 'HIGH' ? 3 : level === 'MEDIUM' ? 2 : 1,
    level,
    dashaLevel: 'antardasha',
    reasoning: [],
  };
}

describe('computeAgeYears', () => {
  it('returns the exact whole-year age on the birthday anniversary itself', () => {
    const birthDate = new Date('1990-01-10T00:00:00Z');
    const now = new Date('2026-01-10T00:00:00Z');
    expect(computeAgeYears(birthDate, now)).toBe(36);
  });

  it('does not count this year if the birthday has not occurred yet', () => {
    const birthDate = new Date('1990-06-15T00:00:00Z');
    const now = new Date('2026-06-14T00:00:00Z'); // one day before the birthday
    expect(computeAgeYears(birthDate, now)).toBe(35);
  });

  it('counts this year once the birthday has passed', () => {
    const birthDate = new Date('1990-06-15T00:00:00Z');
    const now = new Date('2026-06-16T00:00:00Z'); // one day after the birthday
    expect(computeAgeYears(birthDate, now)).toBe(36);
  });
});

describe('computeAgeBandTable', () => {
  const birthDate = new Date('1990-01-10T00:00:00Z');
  const now = new Date('2026-01-10T00:00:00Z'); // currentAge === 36 exactly

  it('produces exactly 4 bands with the documented 3/4/8/open-ended age split', () => {
    const bands = computeAgeBandTable(birthDate, now, []);
    expect(bands).toHaveLength(4);

    const expected: Array<Pick<AgeBand, 'startAge' | 'endAge'>> = [
      { startAge: 36, endAge: 39 },
      { startAge: 40, endAge: 43 },
      { startAge: 44, endAge: 51 },
      { startAge: 52, endAge: null },
    ];
    bands.forEach((band, i) => {
      expect(band.startAge).toBe(expected[i]!.startAge);
      expect(band.endAge).toBe(expected[i]!.endAge);
    });
  });

  it('formats labels as "Now – N", "N – N", and "N+" for the open-ended final band', () => {
    const bands = computeAgeBandTable(birthDate, now, []);
    expect(bands[0]!.label).toBe('Now – 39');
    expect(bands[1]!.label).toBe('40 – 43');
    expect(bands[2]!.label).toBe('44 – 51');
    expect(bands[3]!.label).toBe('52+');
  });

  it('marks every band NONE when there are no windows at all', () => {
    const bands = computeAgeBandTable(birthDate, now, []);
    for (const band of bands) {
      expect(band.confidence).toBe('NONE');
    }
  });

  it('assigns a window to the band whose calendar-date range contains its startDate', () => {
    // Age 37 (within the "Now – 39" band) => birthDate + 37 years.
    const windowInBand0 = makeWindow(addYears(birthDate, 37), 'HIGH');
    const bands = computeAgeBandTable(birthDate, now, [windowInBand0]);
    expect(bands[0]!.confidence).toBe('HIGH');
    expect(bands[1]!.confidence).toBe('NONE');
    expect(bands[2]!.confidence).toBe('NONE');
    expect(bands[3]!.confidence).toBe('NONE');
  });

  it('picks the HIGHEST level among multiple windows landing in the same band', () => {
    const low = makeWindow(addYears(birthDate, 36.2), 'LOW');
    const high = makeWindow(addYears(birthDate, 38.5), 'HIGH');
    const medium = makeWindow(addYears(birthDate, 39.0), 'MEDIUM');
    const bands = computeAgeBandTable(birthDate, now, [low, high, medium]);
    expect(bands[0]!.confidence).toBe('HIGH');
  });

  it('places a far-future window into the open-ended final band', () => {
    const farWindow = makeWindow(addYears(birthDate, 70), 'MEDIUM');
    const bands = computeAgeBandTable(birthDate, now, [farWindow]);
    expect(bands[3]!.confidence).toBe('MEDIUM');
    expect(bands[0]!.confidence).toBe('NONE');
  });

  it('does not credit a window whose startDate falls just outside the band boundary', () => {
    // Age 40.0 exactly is the START of band[1] ("40 – 43"), not band[0] ("Now – 39").
    const boundaryWindow = makeWindow(addYears(birthDate, 40), 'HIGH');
    const bands = computeAgeBandTable(birthDate, now, [boundaryWindow]);
    expect(bands[0]!.confidence).toBe('NONE');
    expect(bands[1]!.confidence).toBe('HIGH');
  });
});
