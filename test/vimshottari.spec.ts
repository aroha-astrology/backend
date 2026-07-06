import { describe, expect, it } from 'vitest';
import { buildSubPeriods } from '../src/lib/astro-engine/dashas/vimshottari.js';

describe('buildSubPeriods forceFullDepth', () => {
  it('without forceFullDepth, only computes sub-periods for the active branch', () => {
    const start = new Date('1990-01-01T00:00:00Z');
    const now = new Date('1990-01-01T00:00:00Z'); // forces first period active, rest inactive
    const periods = buildSubPeriods('Sun', start, 6, 1, now, 2);
    const inactive = periods.find((p) => !p.isActive);
    expect(inactive).toBeDefined();
    expect(inactive!.subPeriods).toEqual([]);
  });

  it('with forceFullDepth=true, computes sub-periods regardless of isActive', () => {
    const start = new Date('1990-01-01T00:00:00Z');
    const now = new Date('1990-01-01T00:00:00Z');
    const periods = buildSubPeriods('Sun', start, 6, 1, now, 2, true);
    const inactive = periods.find((p) => !p.isActive);
    expect(inactive).toBeDefined();
    expect(inactive!.subPeriods.length).toBe(9);
    expect(inactive!.subPeriods[0]!.level).toBe('pratyantardasha');
  });
});
