import { afterEach, describe, expect, it, vi } from 'vitest';

// The free-tier daily quota boundary is midnight America/Los_Angeles, and the
// gap between that and IST SHIFTS by an hour twice a year with US daylight
// saving. These tests pin both sides of that shift, since a hardcoded "+12:30"
// would pass in August and be an hour wrong in January.
import { msUntilNextPacificMidnight, pacificBudgetDay } from '../src/lib/llm/quota-window.js';

const HOUR_MS = 60 * 60 * 1000;

afterEach(() => {
  vi.useRealTimers();
});

describe('msUntilNextPacificMidnight', () => {
  it('measures the remaining Pacific day during US daylight saving (UTC-7)', () => {
    // 2026-08-03T12:00:00Z is 05:00 PDT — 19 hours left in the Pacific day.
    const now = Date.parse('2026-08-03T12:00:00Z');
    expect(msUntilNextPacificMidnight(now)).toBe(19 * HOUR_MS);
  });

  it('measures the remaining Pacific day outside daylight saving (UTC-8)', () => {
    // Same UTC wall clock in January is 04:00 PST — 20 hours left, not 19.
    const now = Date.parse('2026-01-15T12:00:00Z');
    expect(msUntilNextPacificMidnight(now)).toBe(20 * HOUR_MS);
  });

  it('returns a small remainder just before the reset, not a full day', () => {
    // 2026-08-03T06:59:00Z is 23:59 PDT — one minute to quota reset.
    const now = Date.parse('2026-08-03T06:59:00Z');
    expect(msUntilNextPacificMidnight(now)).toBe(60_000);
  });

  it('is always a positive value inside one day, whatever the moment', () => {
    const base = Date.parse('2026-03-08T00:00:00Z'); // US DST spring-forward day
    for (let h = 0; h < 48; h++) {
      const ms = msUntilNextPacificMidnight(base + h * HOUR_MS);
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(24 * HOUR_MS);
    }
  });

  it('defaults to the current time when called with no argument', () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-08-03T12:00:00Z'));
    expect(msUntilNextPacificMidnight()).toBe(19 * HOUR_MS);
  });
});

describe('pacificBudgetDay', () => {
  it('formats as a sortable YYYY-MM-DD', () => {
    expect(pacificBudgetDay(Date.parse('2026-08-03T12:00:00Z'))).toBe('2026-08-03');
  });

  it('charges a request to the Pacific day, not the UTC day', () => {
    // 05:00 UTC on the 3rd is still 22:00 on the 2nd in Pacific — the request
    // belongs to the 2nd's quota budget, which is the whole point of scoping
    // the counter this way rather than by UTC or IST midnight.
    expect(pacificBudgetDay(Date.parse('2026-08-03T05:00:00Z'))).toBe('2026-08-02');
  });

  it('rolls over exactly at Pacific midnight', () => {
    expect(pacificBudgetDay(Date.parse('2026-08-03T06:59:59Z'))).toBe('2026-08-02');
    expect(pacificBudgetDay(Date.parse('2026-08-03T07:00:01Z'))).toBe('2026-08-03');
  });
});
