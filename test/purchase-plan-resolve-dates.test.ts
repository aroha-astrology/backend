import { describe, it, expect } from 'vitest';
import { resolveDates, addDays, todayIso } from '../src/modules/purchase-plan/purchase-plan.dates';

describe('resolveDates', () => {
  it('returns both dates unchanged when both are given', () => {
    expect(resolveDates('2026-08-01', '2026-08-10')).toEqual({
      resolvedBookingDate: '2026-08-01',
      resolvedDeliveryDate: '2026-08-10',
    });
  });

  it('adds 5 days for delivery when only booking is given', () => {
    expect(resolveDates('2026-08-01', undefined)).toEqual({
      resolvedBookingDate: '2026-08-01',
      resolvedDeliveryDate: '2026-08-06',
    });
  });

  it('subtracts 5 days for booking when only delivery is given, clamped to yesterday', () => {
    // Delivery far in the future: proposed booking (delivery - 5d) is later
    // than yesterday, so it must clamp to yesterday.
    const farFuture = addDays(todayIso(), 30);
    const result = resolveDates(undefined, farFuture);
    expect(result.resolvedBookingDate).toBe(addDays(todayIso(), -1));
    expect(result.resolvedDeliveryDate).toBe(farFuture);
  });

  it('throws when neither date is given', () => {
    expect(() => resolveDates(undefined, undefined)).toThrow();
  });
});
