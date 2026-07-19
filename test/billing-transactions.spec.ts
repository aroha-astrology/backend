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

  it('throws on an unrecognized reason', () => {
    expect(() => parseReason('something_else')).toThrow('unrecognized wallet_transactions reason');
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
  createdAt: new Date('2026-07-10T00:00:00Z'),
  paidAt: new Date('2026-07-10T00:00:01Z'),
};

const baseLedgerRow = {
  id: 'ledger-1',
  userId: 'user-1',
  delta: -2000,
  reason: 'chat_message',
  balanceAfter: 8000,
  createdAt: new Date('2026-07-12T00:00:00Z'),
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
});
