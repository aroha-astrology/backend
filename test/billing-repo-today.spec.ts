import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression coverage for the IST fix: sumPaidOrdersToday used to compute
// "today" via `new Date(); setHours(0,0,0,0)` — server-LOCAL midnight, off by
// 5:30 on a UTC box. It must now delegate to the same IST-anchored primitive
// the admin dashboard uses, so the Telegram /stats revenue line gets the fix
// for free with a single code path instead of two divergent ones.
const state = vi.hoisted(() => ({
  resolveDateRangePreset: vi.fn(),
  sumPaidOrdersBetween: vi.fn(),
}));

vi.mock('../src/modules/admin/admin.repo.js', () => ({
  resolveDateRangePreset: state.resolveDateRangePreset,
  sumPaidOrdersBetween: state.sumPaidOrdersBetween,
}));

const { sumPaidOrdersToday } = await import('../src/modules/billing/billing.repo.js');

beforeEach(() => {
  state.resolveDateRangePreset.mockReset();
  state.sumPaidOrdersBetween.mockReset();
});

describe('sumPaidOrdersToday', () => {
  it('delegates to sumPaidOrdersBetween(resolveDateRangePreset("today"))', async () => {
    const fakeRange = { from: new Date('2026-07-24T18:30:00Z'), to: new Date('2026-07-25T18:30:00Z') };
    state.resolveDateRangePreset.mockReturnValue(fakeRange);
    state.sumPaidOrdersBetween.mockResolvedValue({ totalPaise: 45000, count: 18 });

    const result = await sumPaidOrdersToday();

    expect(state.resolveDateRangePreset).toHaveBeenCalledWith('today');
    expect(state.sumPaidOrdersBetween).toHaveBeenCalledWith(fakeRange);
    expect(result).toEqual({ totalPaise: 45000, count: 18 });
  });
});
