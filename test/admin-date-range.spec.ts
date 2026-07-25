import { describe, expect, it } from 'vitest';
import { resolveDateRangePreset } from '../src/modules/admin/admin.repo.js';

// IST (Asia/Kolkata) is a fixed UTC+5:30 offset, no DST — every boundary
// below is computed by hand against that fixed offset so a regression back
// to server-local-time boundaries (the bug in billing.repo.ts's
// sumPaidOrdersToday, off by 5:30 on a UTC box) fails loudly here.

describe('resolveDateRangePreset', () => {
  describe('today', () => {
    it('anchors to IST midnight, not UTC midnight', () => {
      // "now" is 2026-07-25T10:00:00Z = 2026-07-25T15:30:00+05:30 — still
      // the same IST calendar day (2026-07-25).
      const now = new Date('2026-07-25T10:00:00Z');
      const { from, to } = resolveDateRangePreset('today', undefined, undefined, now);

      // IST midnight 2026-07-25 = UTC 2026-07-24T18:30:00Z.
      expect(from.toISOString()).toBe('2026-07-24T18:30:00.000Z');
      // IST midnight 2026-07-26 (exclusive upper bound) = UTC 2026-07-25T18:30:00Z.
      expect(to.toISOString()).toBe('2026-07-25T18:30:00.000Z');
    });

    it('excludes a timestamp that is "today" in UTC but "tomorrow" in IST', () => {
      // The exact boundary case from the task: 2026-07-25T18:31:00Z is
      // 2026-07-26T00:01:00+05:30 — IST "tomorrow", despite being UTC "today".
      const now = new Date('2026-07-25T10:00:00Z');
      const { to } = resolveDateRangePreset('today', undefined, undefined, now);
      const boundaryTimestamp = new Date('2026-07-25T18:31:00Z');

      expect(boundaryTimestamp.getTime()).toBeGreaterThanOrEqual(to.getTime());
    });

    it('includes a timestamp one minute before the IST-midnight cutoff', () => {
      const now = new Date('2026-07-25T10:00:00Z');
      const { to } = resolveDateRangePreset('today', undefined, undefined, now);
      const justBefore = new Date('2026-07-25T18:29:00Z');

      expect(justBefore.getTime()).toBeLessThan(to.getTime());
    });

    it('does not shift the boundary based on the server-local timezone of "now"', () => {
      // Two different UTC instants representing the same IST calendar day —
      // both must resolve to the identical [from, to) window.
      const early = resolveDateRangePreset(
        'today',
        undefined,
        undefined,
        new Date('2026-07-24T19:00:00Z'), // = 2026-07-25T00:30 IST
      );
      const late = resolveDateRangePreset(
        'today',
        undefined,
        undefined,
        new Date('2026-07-25T17:00:00Z'), // = 2026-07-25T22:30 IST
      );

      expect(early.from.toISOString()).toBe(late.from.toISOString());
      expect(early.to.toISOString()).toBe(late.to.toISOString());
    });
  });

  describe('yesterday', () => {
    it('is the IST day immediately before today', () => {
      const now = new Date('2026-07-25T10:00:00Z');
      const { from, to } = resolveDateRangePreset('yesterday', undefined, undefined, now);

      expect(from.toISOString()).toBe('2026-07-23T18:30:00.000Z');
      expect(to.toISOString()).toBe('2026-07-24T18:30:00.000Z');
    });
  });

  describe('last7d', () => {
    it('spans the 7 IST days ending today, inclusive', () => {
      const now = new Date('2026-07-25T10:00:00Z');
      const { from, to } = resolveDateRangePreset('last7d', undefined, undefined, now);

      // 6 days before today's IST midnight (2026-07-19) through tomorrow's.
      expect(from.toISOString()).toBe('2026-07-18T18:30:00.000Z');
      expect(to.toISOString()).toBe('2026-07-25T18:30:00.000Z');
    });
  });

  describe('last15d', () => {
    it('spans 15 IST days ending today', () => {
      const now = new Date('2026-07-25T10:00:00Z');
      const { from, to } = resolveDateRangePreset('last15d', undefined, undefined, now);

      expect(from.toISOString()).toBe('2026-07-10T18:30:00.000Z');
      expect(to.toISOString()).toBe('2026-07-25T18:30:00.000Z');
    });
  });

  describe('last30d', () => {
    it('spans 30 IST days ending today', () => {
      const now = new Date('2026-07-25T10:00:00Z');
      const { from, to } = resolveDateRangePreset('last30d', undefined, undefined, now);

      expect(from.toISOString()).toBe('2026-06-25T18:30:00.000Z');
      expect(to.toISOString()).toBe('2026-07-25T18:30:00.000Z');
    });
  });

  describe('last90d', () => {
    it('spans 90 IST days ending today', () => {
      const now = new Date('2026-07-25T10:00:00Z');
      const { from, to } = resolveDateRangePreset('last90d', undefined, undefined, now);

      // 89 days before 2026-07-25 is 2026-04-27.
      expect(from.toISOString()).toBe('2026-04-26T18:30:00.000Z');
      expect(to.toISOString()).toBe('2026-07-25T18:30:00.000Z');
    });
  });

  describe('this_month', () => {
    it('spans the 1st of the IST month through the 1st of next month', () => {
      const now = new Date('2026-07-25T10:00:00Z');
      const { from, to } = resolveDateRangePreset('this_month', undefined, undefined, now);

      expect(from.toISOString()).toBe('2026-06-30T18:30:00.000Z'); // 2026-07-01 IST
      expect(to.toISOString()).toBe('2026-07-31T18:30:00.000Z'); // 2026-08-01 IST
    });
  });

  describe('last_month', () => {
    it('spans the previous calendar month in IST', () => {
      const now = new Date('2026-07-25T10:00:00Z');
      const { from, to } = resolveDateRangePreset('last_month', undefined, undefined, now);

      expect(from.toISOString()).toBe('2026-05-31T18:30:00.000Z'); // 2026-06-01 IST
      expect(to.toISOString()).toBe('2026-06-30T18:30:00.000Z'); // 2026-07-01 IST
    });

    it('rolls back across a year boundary in January', () => {
      const now = new Date('2026-01-15T10:00:00Z');
      const { from, to } = resolveDateRangePreset('last_month', undefined, undefined, now);

      expect(from.toISOString()).toBe('2025-11-30T18:30:00.000Z'); // 2025-12-01 IST
      expect(to.toISOString()).toBe('2025-12-31T18:30:00.000Z'); // 2026-01-01 IST
    });
  });

  describe('this_quarter', () => {
    it('resolves Q3 (Jul-Sep) for a July "now"', () => {
      const now = new Date('2026-07-25T10:00:00Z');
      const { from, to } = resolveDateRangePreset('this_quarter', undefined, undefined, now);

      expect(from.toISOString()).toBe('2026-06-30T18:30:00.000Z'); // 2026-07-01 IST
      expect(to.toISOString()).toBe('2026-09-30T18:30:00.000Z'); // 2026-10-01 IST
    });
  });

  describe('this_year', () => {
    it('spans Jan 1 through Jan 1 next year, in IST', () => {
      const now = new Date('2026-07-25T10:00:00Z');
      const { from, to } = resolveDateRangePreset('this_year', undefined, undefined, now);

      expect(from.toISOString()).toBe('2025-12-31T18:30:00.000Z'); // 2026-01-01 IST
      expect(to.toISOString()).toBe('2026-12-31T18:30:00.000Z'); // 2027-01-01 IST
    });
  });

  describe('lifetime', () => {
    it('starts at the epoch and ends at the exclusive "today" boundary', () => {
      const now = new Date('2026-07-25T10:00:00Z');
      const { from, to } = resolveDateRangePreset('lifetime', undefined, undefined, now);

      expect(from.getTime()).toBe(0);
      expect(to.toISOString()).toBe('2026-07-25T18:30:00.000Z');
    });
  });

  describe('custom', () => {
    it('resolves an inclusive [from, to] IST calendar-day range', () => {
      const { from, to } = resolveDateRangePreset('custom', '2026-07-01', '2026-07-05');

      expect(from.toISOString()).toBe('2026-06-30T18:30:00.000Z'); // 2026-07-01 IST
      expect(to.toISOString()).toBe('2026-07-05T18:30:00.000Z'); // 2026-07-06 IST (exclusive)
    });

    it('throws when from/to are missing', () => {
      expect(() => resolveDateRangePreset('custom')).toThrow();
      expect(() => resolveDateRangePreset('custom', '2026-07-01')).toThrow();
    });

    it('throws on a malformed date string', () => {
      expect(() => resolveDateRangePreset('custom', '07-01-2026', '2026-07-05')).toThrow();
    });
  });

  describe('unknown preset', () => {
    it('throws', () => {
      expect(() => resolveDateRangePreset('not_a_real_preset')).toThrow();
    });
  });

  describe('default now', () => {
    it('uses the current time when now is not supplied', () => {
      const before = Date.now();
      const { to } = resolveDateRangePreset('today');
      const after = Date.now();

      // `to` (start of IST "tomorrow") must be within a small window of the
      // real current IST-tomorrow boundary — i.e. it actually read the real
      // clock rather than some fixed default.
      expect(to.getTime()).toBeGreaterThan(before - 24 * 60 * 60 * 1000);
      expect(to.getTime()).toBeLessThan(after + 24 * 60 * 60 * 1000);
    });
  });
});
