import { describe, expect, it } from 'vitest';
import { shouldBroadcast } from '../src/modules/cron/broadcast.service.js';

/** Noon IST on the given IST calendar date — safely inside the day regardless of server TZ. */
function istNoon(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0) - 5.5 * 3600 * 1000);
}

describe('shouldBroadcast', () => {
  it('daily always fires', () => {
    expect(shouldBroadcast('daily', istNoon(2026, 7, 21))).toBe(true);
    expect(shouldBroadcast('daily', istNoon(2029, 1, 1))).toBe(true);
  });

  it('on an ordinary Tuesday, only daily fires', () => {
    const now = istNoon(2026, 7, 21); // confirmed Tuesday IST
    expect(shouldBroadcast('weekly', now)).toBe(false);
    expect(shouldBroadcast('monthly', now)).toBe(false);
    expect(shouldBroadcast('yearly', now)).toBe(false);
  });

  it('on an ordinary Monday (not the 1st), weekly fires alone', () => {
    const now = istNoon(2026, 7, 20); // confirmed Monday IST, not 1st of month
    expect(shouldBroadcast('weekly', now)).toBe(true);
    expect(shouldBroadcast('monthly', now)).toBe(false);
    expect(shouldBroadcast('yearly', now)).toBe(false);
  });

  it('on a non-Monday 1st of month, monthly fires alone', () => {
    const now = istNoon(2026, 2, 1); // confirmed Sunday IST, 1st of Feb
    expect(shouldBroadcast('weekly', now)).toBe(false);
    expect(shouldBroadcast('monthly', now)).toBe(true);
    expect(shouldBroadcast('yearly', now)).toBe(false);
  });

  it('on Jan 1st that also happens to be a Monday, only yearly fires (not weekly, not monthly)', () => {
    // 2029-01-01 is confirmed Monday IST — the all-tiers-collide fixture.
    const now = istNoon(2029, 1, 1);
    expect(shouldBroadcast('weekly', now)).toBe(false);
    expect(shouldBroadcast('monthly', now)).toBe(false);
    expect(shouldBroadcast('yearly', now)).toBe(true);
  });

  it('on an ordinary Jan 1st (not a Monday), yearly fires and monthly does not', () => {
    // 2026-01-01: verified separately as a Thursday — any non-Monday Jan 1 works here.
    const now = istNoon(2026, 1, 1);
    expect(shouldBroadcast('yearly', now)).toBe(true);
    expect(shouldBroadcast('monthly', now)).toBe(false);
    expect(shouldBroadcast('weekly', now)).toBe(false);
  });

  it('resolves the IST calendar day near UTC day boundaries, not the server-local day', () => {
    // 2026-07-20T19:00:00Z = 2026-07-21T00:30 IST (already Tuesday in IST).
    const justAfterIstMidnight = new Date('2026-07-20T19:00:00Z');
    expect(shouldBroadcast('weekly', justAfterIstMidnight)).toBe(false); // Tuesday, not Monday
  });
});
