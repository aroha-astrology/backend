import { describe, expect, it } from 'vitest';
import { recurringUserWeeks } from '../src/modules/admin/admin.repo.js';

// Same IST-anchored convention as admin-date-range.spec.ts's coverage of
// resolveDateRangePreset — weeks run Monday-Sunday IST, and index 0 is
// "this week" through index 3 "last week+2" (oldest).

describe('recurringUserWeeks', () => {
  it('anchors each week to IST Monday midnight, for a Saturday "now"', () => {
    // 2026-07-25T10:00:00Z = 2026-07-25T15:30 IST, a Saturday. Its week's
    // Monday is 2026-07-20 IST = 2026-07-19T18:30:00Z.
    const now = new Date('2026-07-25T10:00:00Z');
    const weeks = recurringUserWeeks(now);

    expect(weeks).toHaveLength(4);
    expect(weeks[0]!.from.toISOString()).toBe('2026-07-19T18:30:00.000Z');
    expect(weeks[0]!.to.toISOString()).toBe('2026-07-26T18:30:00.000Z');
    expect(weeks[1]!.from.toISOString()).toBe('2026-07-12T18:30:00.000Z');
    expect(weeks[1]!.to.toISOString()).toBe('2026-07-19T18:30:00.000Z');
    expect(weeks[2]!.from.toISOString()).toBe('2026-07-05T18:30:00.000Z');
    expect(weeks[2]!.to.toISOString()).toBe('2026-07-12T18:30:00.000Z');
    expect(weeks[3]!.from.toISOString()).toBe('2026-06-28T18:30:00.000Z');
    expect(weeks[3]!.to.toISOString()).toBe('2026-07-05T18:30:00.000Z');
  });

  it('treats a Monday "now" as the start of its own week (no rollback needed)', () => {
    const now = new Date('2026-08-03T10:00:00Z'); // Monday in IST
    const weeks = recurringUserWeeks(now);

    expect(weeks[0]!.from.toISOString()).toBe('2026-08-02T18:30:00.000Z');
    expect(weeks[0]!.to.toISOString()).toBe('2026-08-09T18:30:00.000Z');
  });

  it('rolls back across a month boundary correctly', () => {
    const now = new Date('2026-08-03T10:00:00Z'); // Monday, week 3 (last week+2) is entirely in July
    const weeks = recurringUserWeeks(now);

    expect(weeks[3]!.from.toISOString()).toBe('2026-07-12T18:30:00.000Z');
    expect(weeks[3]!.to.toISOString()).toBe('2026-07-19T18:30:00.000Z');
  });

  it('produces four contiguous, non-overlapping, descending windows', () => {
    const weeks = recurringUserWeeks(new Date('2026-07-25T10:00:00Z'));
    for (let i = 0; i < 3; i++) {
      expect(weeks[i]!.from.toISOString()).toBe(weeks[i + 1]!.to.toISOString());
    }
  });

  it('uses the current time when now is not supplied', () => {
    const before = Date.now();
    const weeks = recurringUserWeeks();
    const after = Date.now();

    expect(weeks[0]!.to.getTime()).toBeGreaterThan(before - 8 * 24 * 60 * 60 * 1000);
    expect(weeks[0]!.to.getTime()).toBeLessThan(after + 8 * 24 * 60 * 60 * 1000);
  });
});
