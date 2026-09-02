import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/billing/billing.repo.js', () => ({
  findOrdersForUser: vi.fn(),
  findDebitsForUser: vi.fn(),
}));

import { findOrdersForUser, findDebitsForUser } from '../src/modules/billing/billing.repo.js';
import { parseReason, listTransactions } from '../src/modules/billing/billing.service.js';

describe('parseReason', () => {
  it('parses every charge reason shape', () => {
    expect(parseReason('chat_message')).toEqual({ kind: 'chat', isRefund: false });
    expect(parseReason('vastu_report')).toEqual({ kind: 'vastu_report', isRefund: false });
    expect(parseReason('profile_creation')).toEqual({ kind: 'profile_creation', isRefund: false });
    expect(parseReason('gemstone_unlock')).toEqual({ kind: 'gemstone_unlock', isRefund: false });
    expect(parseReason('gemstone_unlock:profile:abc')).toEqual({
      kind: 'gemstone_unlock',
      isRefund: false,
    });
    expect(parseReason('house_unlock:7')).toEqual({
      kind: 'house_unlock',
      houseNumber: 7,
      isRefund: false,
    });
    expect(parseReason('house_unlock:7:profile:abc')).toEqual({
      kind: 'house_unlock',
      houseNumber: 7,
      isRefund: false,
    });
  });

  it('strips a refund: prefix and sets isRefund', () => {
    expect(parseReason('refund:chat_message')).toEqual({ kind: 'chat', isRefund: true });
    expect(parseReason('refund:house_unlock:3')).toEqual({
      kind: 'house_unlock',
      houseNumber: 3,
      isRefund: true,
    });
  });

  it('no longer throws on an unrecognized reason — falls back to a safe unknown kind', () => {
    // Regression: GET /v1/billing/transactions used to 500 for any user who
    // ever received a Telegram /money admin grant/deduction, since those
    // reasons ('admin_grant'/'admin_deduction') weren't recognized here.
    expect(() => parseReason('something_else')).not.toThrow();
  });

  it('parses a referral bonus as a credit, never a refund', () => {
    expect(parseReason('referral_bonus')).toEqual({ kind: 'referral_bonus', isRefund: false });
  });

  it('parses admin_grant and admin_deduction as admin_adjustment', () => {
    expect(parseReason('admin_grant')).toEqual({ kind: 'admin_adjustment', isRefund: false });
    expect(parseReason('admin_deduction')).toEqual({ kind: 'admin_adjustment', isRefund: false });
  });

  it('parses a refunded admin adjustment consistently, even though it should not occur in practice', () => {
    expect(parseReason('refund:admin_grant')).toEqual({ kind: 'admin_adjustment', isRefund: true });
  });

  it('parses one-time report_unlock reasons', () => {
    expect(parseReason('report_unlock:marriage')).toEqual({
      kind: 'report_unlock',
      reportKey: 'marriage',
      isRefund: false,
    });
  });

  it('parses a monthly report_unlock reason with a YYYY-MM period', () => {
    expect(parseReason('report_unlock:health_monthly:2026-08')).toEqual({
      kind: 'report_unlock',
      reportKey: 'health_monthly',
      periodMonth: '2026-08',
      isRefund: false,
    });
  });

  it('parses a bundled report_unlock reason with a month count', () => {
    expect(parseReason('report_unlock:kundli_milan:bundle:3')).toEqual({
      kind: 'report_unlock',
      reportKey: 'kundli_milan',
      bundleMonths: 3,
      isRefund: false,
    });
  });

  it('strips refund: from a report_unlock reason and sets isRefund', () => {
    expect(parseReason('refund:report_unlock:marriage')).toEqual({
      kind: 'report_unlock',
      reportKey: 'marriage',
      isRefund: true,
    });
  });
});

const baseOrder = {
  id: 'order-1',
  userId: 'user-1',
  packId: 'topup_200',
  amountPaise: 20000,
  discountPaise: 0,
  finalAmountPaise: 20000,
  currency: 'INR',
  couponId: null,
  couponCode: null,
  status: 'paid' as const,
  gatewayProvider: 'mock',
  gatewayOrderId: null,
  gatewayPaymentId: null,
  reference: 'AR-DEADBEEF',
  createdAt: new Date('2026-07-10T00:00:00Z'),
  paidAt: new Date('2026-07-10T00:00:01Z'),
  verifiedAt: new Date('2026-07-10T00:00:01Z'),
};

const baseLedgerRow = {
  id: 'ledger-1',
  userId: 'user-1',
  delta: -2000,
  reason: 'chat_message',
  balanceAfter: 8000,
  createdAt: new Date('2026-07-12T00:00:00Z'),
  expiresAt: null,
  expiredAt: null,
};

describe('listTransactions', () => {
  it('merges orders and debits sorted by createdAt desc', async () => {
    vi.mocked(findOrdersForUser).mockResolvedValue([baseOrder]);
    vi.mocked(findDebitsForUser).mockResolvedValue([baseLedgerRow]);

    const result = await listTransactions('user-1');

    expect(result).toEqual([
      {
        id: 'ledger-1',
        kind: 'chat',
        createdAt: '2026-07-12T00:00:00.000Z',
        amountPaise: 2000,
        balanceAfterPaise: 8000,
        isRefund: false,
        isCredit: false,
      },
      {
        id: 'order-1',
        kind: 'recharge',
        createdAt: '2026-07-10T00:00:00.000Z',
        amountPaise: 20000,
        status: 'paid',
      },
    ]);
  });

  it('reads isCredit off the ledger delta sign, not the reason — and only surfaces a still-live expiry', async () => {
    // Regression: the wallet history UI used to guess credit-vs-debit from a hardcoded
    // whitelist of `kind`s, which missed admin grants and every campaign-bonus claim —
    // rendering them as a red debit with a blank label. isCredit must come from delta.
    vi.mocked(findOrdersForUser).mockResolvedValue([]);
    vi.mocked(findDebitsForUser).mockResolvedValue([
      {
        ...baseLedgerRow,
        id: 'credit-live',
        delta: 5100,
        reason: 'janmashtami_2026_abc12345',
        expiresAt: new Date(Date.now() + 86_400_000), // 1 day out — still live
      },
      {
        ...baseLedgerRow,
        id: 'credit-expired',
        delta: 5100,
        reason: 'independence_day_2026',
        expiresAt: new Date(Date.now() - 86_400_000), // already past — cron just hasn't swept it yet
      },
    ]);

    const result = await listTransactions('user-1');

    expect(result).toEqual([
      expect.objectContaining({ id: 'credit-expired', isCredit: true }),
      expect.objectContaining({ id: 'credit-live', isCredit: true, expiresAt: expect.any(String) }),
    ]);
    expect((result[0] as { expiresAt?: string }).expiresAt).toBeUndefined();
  });
});
