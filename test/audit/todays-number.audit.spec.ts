import { describe, it, expect } from 'vitest';
import { dailyNumerology } from '../../src/lib/astro-engine/numerology/chaldean.js';
import { getDailyLuckyElements } from '../../src/lib/astro-engine/lucky-elements.js';

// =============================================================================
// Audit item NM2 (docs/engine-audit/C-critical-corrections.md)
// =============================================================================
// The daily "lucky number" was the day of the month added down to one digit
// (2026-08-29 -> 2 + 9 = 11 -> 2). It is the same for every reader, so calling
// it a personal lucky number was wrong. The owner decided on 2026-10-09: call it
// "today's number" and say it is not personal.
// =============================================================================

describe("[NM2] the daily number is today's number, the same for everyone", () => {
  it('is named todaysNumber and is the day of the month reduced to one digit', () => {
    expect(dailyNumerology(new Date('2026-08-29T00:00:00Z'), 3).todaysNumber).toBe(2);
    expect(dailyNumerology(new Date('2026-08-01T00:00:00Z'), 3).todaysNumber).toBe(1);
    expect(dailyNumerology(new Date('2026-08-15T00:00:00Z'), 3).todaysNumber).toBe(6);
  });

  it('does not depend on who is asking: every birth number gets the same number', () => {
    const date = new Date('2026-10-09T00:00:00Z');
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((m) => dailyNumerology(date, m).todaysNumber);
    expect(new Set(numbers).size).toBe(1);
    expect(numbers[0]).toBe(9);
  });

  it('the daily elements helper returns it under the same name, for any date of birth', () => {
    const a = getDailyLuckyElements('1990-01-01', '2026-10-09');
    const b = getDailyLuckyElements('1985-07-23', '2026-10-09');
    expect(a.todaysNumber).toBe(9);
    expect(b.todaysNumber).toBe(9);
    expect(a).not.toHaveProperty('luckyNumber');
  });
});
