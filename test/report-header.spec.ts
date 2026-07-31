import { describe, expect, it } from 'vitest';
import { buildReportHeader } from '../src/lib/astro-engine/reports/report-header.js';
import type { LifeContext } from '../src/lib/astro-engine/reports/report-life-context.js';

const EMPTY_LIFE_CONTEXT: LifeContext = {
  currentMahadasha: 'Saturn',
  currentAntardasha: 'Moon',
  endsOn: '2027-05-16',
  domains: [],
};

describe('buildReportHeader', () => {
  it('reads Lagna sign off chart.ascendant and Moon sign/nakshatra off chart.planets', () => {
    const chart = {
      ascendant: { sign: 'Scorpio', signIndex: 7 },
      // Aquarius starts at 300° sidereal; Shatabhisha nakshatra spans 306°40'-320°.
      planets: [{ planet: 'Moon', sign: 'Aquarius', longitude: 310 }],
    };
    const header = buildReportHeader(chart, 'Subir', '1993-04-17', EMPTY_LIFE_CONTEXT);
    expect(header.lagnaSign).toBe('Scorpio');
    expect(header.moonSign).toBe('Aquarius');
    expect(header.moonNakshatra).toBe('Shatabhisha');
  });

  it('carries name/dob through as-is', () => {
    const header = buildReportHeader(null, 'Subir', '1993-04-17', EMPTY_LIFE_CONTEXT);
    expect(header.name).toBe('Subir');
    expect(header.dob).toBe('1993-04-17');
  });

  it('falls back to null name/dob rather than throwing when missing', () => {
    const header = buildReportHeader(null, null, null, EMPTY_LIFE_CONTEXT);
    expect(header.name).toBeNull();
    expect(header.dob).toBeNull();
  });

  it('never throws on a null chart — lagna/moon facts are simply undefined', () => {
    expect(() => buildReportHeader(null, 'X', '2000-01-01', EMPTY_LIFE_CONTEXT)).not.toThrow();
    const header = buildReportHeader(null, 'X', '2000-01-01', EMPTY_LIFE_CONTEXT);
    expect(header.lagnaSign).toBeUndefined();
    expect(header.moonSign).toBeUndefined();
    expect(header.moonNakshatra).toBeUndefined();
  });

  it('passes the current dasha facts through from the given lifeContext verbatim', () => {
    const header = buildReportHeader(null, 'X', '2000-01-01', EMPTY_LIFE_CONTEXT);
    expect(header.currentMahadasha).toBe('Saturn');
    expect(header.currentAntardasha).toBe('Moon');
    expect(header.dashaEndsOn).toBe('2027-05-16');
  });
});
