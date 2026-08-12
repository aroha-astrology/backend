import { describe, it, expect } from 'vitest';
import { nextEclipses, localEclipses } from '../src/lib/astro-engine/panchang/eclipse.js';

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

describe('localEclipses', () => {
  // Delhi — arbitrary real-world coords, just needs to be somewhere on Earth.
  const lat = 28.6139;
  const lon = 77.209;

  it('returns a solar and lunar eclipse date, both in the future and no earlier than the global next eclipse', async () => {
    const global = await nextEclipses();
    const local = await localEclipses(lat, lon);
    const now = new Date();
    expect(local.solar.getTime()).toBeGreaterThan(now.getTime());
    expect(local.lunar.getTime()).toBeGreaterThan(now.getTime());
    // Visibility from one point on Earth is a subset of "visible somewhere" —
    // the local next eclipse can never resolve to a date before the global
    // next eclipse of the same kind.
    expect(local.solar.getTime()).toBeGreaterThanOrEqual(global.solar.getTime());
    expect(local.lunar.getTime()).toBeGreaterThanOrEqual(global.lunar.getTime());
  });

  it('memoizes within the same call for the same rounded location', async () => {
    const first = localEclipses(lat, lon);
    const second = localEclipses(lat, lon);
    expect(second).toBe(first);
    await first;
  });
});
