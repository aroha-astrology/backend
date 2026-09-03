import { beforeEach, describe, expect, it, vi } from 'vitest';

// rateReport composes three already-tested primitives (findReportById,
// insertReportRating/stampRefund, addWalletBalance) — mocked here so this
// spec pins only the business rule: ownership/status gating, and refund
// exactly when rating < 3, for exactly the price paid on that report row.

const state = vi.hoisted(() => ({
  findReportById: vi.fn(),
  insertReportRating: vi.fn(),
  stampRefund: vi.fn(),
  addWalletBalance: vi.fn(),
}));

vi.mock('../src/modules/reports/reports.repo.js', () => ({
  findReportById: state.findReportById,
}));

vi.mock('../src/modules/reports/report-ratings.repo.js', () => ({
  insertReportRating: state.insertReportRating,
  stampRefund: state.stampRefund,
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  addWalletBalance: state.addWalletBalance,
}));

import { rateReport } from '../src/modules/reports/report-ratings.service.js';

const REPORT = {
  id: 'report-1',
  userId: 'user-1',
  reportKey: 'marriage',
  status: 'ready',
  pricePaidPaise: 14900,
  periodMonth: null,
};

beforeEach(() => {
  state.findReportById.mockReset();
  state.insertReportRating.mockReset();
  state.stampRefund.mockReset();
  state.addWalletBalance.mockReset();
  state.findReportById.mockResolvedValue(REPORT);
  state.insertReportRating.mockResolvedValue({ id: 'rating-1' });
});

describe('rateReport', () => {
  it('records a 5-star rating with no refund', async () => {
    const result = await rateReport({ userId: 'user-1', reportId: 'report-1', rating: 5 });
    expect(result).toEqual({ id: 'rating-1', refundedPaise: null });
    expect(state.addWalletBalance).not.toHaveBeenCalled();
    expect(state.stampRefund).not.toHaveBeenCalled();
  });

  it('refunds 100% of the price paid on a 2-star rating', async () => {
    const result = await rateReport({ userId: 'user-1', reportId: 'report-1', rating: 2 });
    expect(result).toEqual({ id: 'rating-1', refundedPaise: 14900 });
    expect(state.addWalletBalance).toHaveBeenCalledWith(
      'user-1',
      14900,
      'refund:report_unlock:marriage',
    );
    expect(state.stampRefund).toHaveBeenCalledWith('rating-1', 14900);
  });

  it('does not refund a 3-star rating (the boundary)', async () => {
    await rateReport({ userId: 'user-1', reportId: 'report-1', rating: 3 });
    expect(state.addWalletBalance).not.toHaveBeenCalled();
  });

  it('rejects rating a report owned by someone else, as a plain not-found', async () => {
    await expect(
      rateReport({ userId: 'someone-else', reportId: 'report-1', rating: 5 }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects a report id that does not exist', async () => {
    state.findReportById.mockResolvedValue(undefined);
    await expect(
      rateReport({ userId: 'user-1', reportId: 'nope', rating: 5 }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects rating a report that is not ready yet', async () => {
    state.findReportById.mockResolvedValue({ ...REPORT, status: 'generating' });
    await expect(
      rateReport({ userId: 'user-1', reportId: 'report-1', rating: 5 }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('turns a duplicate-rating unique violation into a 409', async () => {
    state.insertReportRating.mockRejectedValue(
      Object.assign(new Error('duplicate'), { code: '23505' }),
    );
    await expect(
      rateReport({ userId: 'user-1', reportId: 'report-1', rating: 5 }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
