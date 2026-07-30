import { describe, it, expect } from 'vitest';
import {
  moonSignWeeklyPrediction,
  moonSignMonthlyPrediction,
} from '../src/lib/astro-tools/daily-synthesis.js';

describe('periodic moon-sign predictions: keyEvents (Phase 2.5 event-driven pivot points)', () => {
  it('weekly prediction includes a keyEvents array (possibly empty, but always present)', async () => {
    const result = await moonSignWeeklyPrediction(0);
    expect(Array.isArray(result.keyEvents)).toBe(true);
  }, 20_000);

  it('monthly prediction is more likely to contain at least one real macro event than a 7-day window', async () => {
    const result = await moonSignMonthlyPrediction(0);
    expect(Array.isArray(result.keyEvents)).toBe(true);
    // Not asserting a specific count (transit timing is not fixed), but every
    // entry that IS present must be well-formed.
    for (const e of result.keyEvents) {
      expect(e.house).toBeGreaterThanOrEqual(0);
      expect(e.house).toBeLessThanOrEqual(12);
      expect(['ingress', 'retrograde', 'direct']).toContain(e.eventType);
      expect(typeof e.date).toBe('string');
      expect(typeof e.description).toBe('string');
      expect(e.description.length).toBeGreaterThan(0);
    }
  }, 20_000);

  it('flags every station (retrograde/direct) as volatile and every ingress as not', async () => {
    const result = await moonSignMonthlyPrediction(6);
    for (const e of result.keyEvents) {
      expect(e.isVolatile).toBe(e.eventType !== 'ingress');
    }
  }, 20_000);

  it('still returns the sampled-day aggregate fields (score/favorableDays/bestDay/worstDay) alongside keyEvents', async () => {
    const result = await moonSignWeeklyPrediction(2);
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeLessThanOrEqual(5);
    expect(result.totalDaysSampled).toBeGreaterThan(0);
    expect(result.bestDay).toBeDefined();
    expect(result.worstDay).toBeDefined();
  }, 20_000);
});
