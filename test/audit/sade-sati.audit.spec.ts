import { describe, it, expect } from 'vitest';
import { detectCurrentSadeSati } from '../../src/lib/astro-engine/doshas/sadeSati.js';

// =============================================================================
// Audit item DS6 (docs/engine-audit/C-critical-corrections.md)
// =============================================================================
// External dates (Lahiri sidereal, from published almanacs): Saturn entered
// Aquarius on 29 April 2022, stepped back into Capricorn on 12 July 2022,
// re-entered Aquarius on 17 January 2023 and entered Pisces on 29 March 2025.
// For a Moon in Pisces, Sade Sati therefore opened on 29 April 2022 (the
// six-month step back is a retrograde dip, not an exit) and on 1 January 2026
// Saturn is in the Moon's own sign: the peak phase. It closes when Saturn
// leaves Aries, in 2029-2030.
// The old estimate (912 days per sign from Saturn's degree) put the start
// about a year late.
// =============================================================================

describe("[DS6] Sade Sati dates come from Saturn's real sign changes", () => {
  it('Moon in Pisces on 1 Jan 2026: peak phase, opened 29 April 2022, closes in 2029-2030', async () => {
    const result = await detectCurrentSadeSati('Pisces', new Date(Date.UTC(2026, 0, 1)));
    expect(result.active).toBe(true);
    expect(result.phase).toBe('peak');

    const dayMs = 86_400_000;
    const expectedStart = Date.UTC(2022, 3, 29);
    expect(Math.abs(result.startDate!.getTime() - expectedStart)).toBeLessThanOrEqual(2 * dayMs);

    expect(result.endDate!.getTime()).toBeGreaterThan(Date.UTC(2029, 5, 1));
    expect(result.endDate!.getTime()).toBeLessThan(Date.UTC(2030, 11, 31));
    expect(result.description).not.toContain('Estimated');
  }, 120_000);

  it('a Moon sign Saturn is nowhere near stays inactive', async () => {
    const result = await detectCurrentSadeSati('Leo', new Date(Date.UTC(2026, 0, 1)));
    expect(result.active).toBe(false);
    expect(result.startDate).toBeNull();
  }, 60_000);
});
