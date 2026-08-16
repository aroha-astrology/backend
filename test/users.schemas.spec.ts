import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateString } from '../src/modules/users/users.schemas.js';

describe('DateString', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts a real past date', () => {
    expect(DateString.safeParse('1990-05-15').success).toBe(true);
  });

  it('rejects a date clearly in the future', () => {
    expect(DateString.safeParse('2099-01-01').success).toBe(false);
  });

  it('rejects a fake calendar date', () => {
    expect(DateString.safeParse('2026-02-30').success).toBe(false);
  });

  it('accepts "today" submitted from IST before UTC midnight has caught up', () => {
    // 2026-08-16T00:02:26 IST == 2026-08-15T18:32:26Z — the exact bug: a
    // same-day IST birth date used to read as "in the future" because its
    // UTC-midnight timestamp (Aug 16 00:00Z) is later than this instant.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T18:32:26.113Z'));
    expect(DateString.safeParse('2026-08-16').success).toBe(true);
  });
});
