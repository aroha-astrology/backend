import { describe, it, expect } from 'vitest';
import { buildDashaReading } from '../src/lib/astro-tools/dasha-reading.js';

describe('buildDashaReading', () => {
  it('returns null when there is no dasha data yet', () => {
    expect(buildDashaReading(null)).toBeNull();
    expect(buildDashaReading({})).toBeNull();
  });

  it('builds a plain-language reading from currentMahadasha/currentAntardasha, never naming the planet in jargon-only form', () => {
    const dashaData = {
      vimshottari: {
        currentMahadasha: { planet: 'Jupiter', startDate: '2018-12-16', endDate: '2034-12-16' },
        currentAntardasha: { planet: 'Saturn', startDate: '2028-01-01', endDate: '2030-06-01' },
      },
    };
    const reading = buildDashaReading(dashaData);
    expect(reading).not.toBeNull();
    expect(reading!.mahadashaPlanet).toBe('Jupiter');
    expect(reading!.antardashaPlanet).toBe('Saturn');
    expect(reading!.activeUntil).toBe('2034-12-16');
    expect(reading!.hook.length).toBeGreaterThan(0);
    expect(reading!.meaning.length).toBeGreaterThan(0);
    // Never bare "Mahadasha"/"Antardasha" jargon in the plain-language fields.
    expect(reading!.hook).not.toMatch(/mahadasha|antardasha/i);
    expect(reading!.meaning).not.toMatch(/mahadasha|antardasha/i);
  });

  it('omits the antardasha nuance when antardasha equals mahadasha', () => {
    const dashaData = {
      vimshottari: {
        currentMahadasha: { planet: 'Venus', startDate: '2020-01-01', endDate: '2040-01-01' },
        currentAntardasha: { planet: 'Venus', startDate: '2020-01-01', endDate: '2023-01-01' },
      },
    };
    const reading = buildDashaReading(dashaData)!;
    expect(reading.hook).not.toContain('undertone');
  });

  it('returns null rather than fabricating a planet for an unrecognized value', () => {
    const dashaData = { vimshottari: { currentMahadasha: { planet: 'Pluto' } } };
    expect(buildDashaReading(dashaData)).toBeNull();
  });
});
