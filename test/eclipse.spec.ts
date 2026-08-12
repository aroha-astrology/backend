import { describe, it, expect } from 'vitest';
import { nextEclipses } from '../src/lib/astro-engine/panchang/eclipse.js';

describe('nextEclipses', () => {
  it('returns a solar and lunar eclipse date, both in the future', async () => {
    const { solar, lunar } = await nextEclipses();
    const now = new Date();
    expect(solar.getTime()).toBeGreaterThan(now.getTime());
    expect(lunar.getTime()).toBeGreaterThan(now.getTime());
  });

  it('finds each eclipse within ~7 months — no real gap between eclipses of a kind is longer', async () => {
    // Solar eclipses occur roughly every ~6 months (with occasional slightly
    // longer gaps); lunar the same. 7 months is a generous ceiling that fails
    // loudly if the JD conversion or the direct-ccall signature regresses
    // back to the broken class-method behavior (which returns 0 -> epoch
    // 1970, i.e. "in the past", already caught by the test above — this one
    // additionally catches "returns some technically-future but wrong date").
    const { solar, lunar } = await nextEclipses();
    const now = new Date();
    const sevenMonthsMs = 7 * 31 * 24 * 60 * 60 * 1000;
    expect(solar.getTime() - now.getTime()).toBeLessThan(sevenMonthsMs);
    expect(lunar.getTime() - now.getTime()).toBeLessThan(sevenMonthsMs);
  });

  it('memoizes within the same call — same-day calls return the same cached promise', async () => {
    const first = nextEclipses();
    const second = nextEclipses();
    // Same promise instance, not just equal values — proves the module-level
    // cache is hit rather than recomputing on every call.
    expect(second).toBe(first);
    await first;
  });
});
