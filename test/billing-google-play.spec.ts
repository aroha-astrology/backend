import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── mocks ──────────────────────────────────────────────────────────────────
vi.mock('../src/modules/billing/google-play-verifier.js', () => ({
  verifyGooglePlayPurchase: vi.fn(),
  consumeGooglePlayPurchase: vi.fn(),
  fetchGooglePlayPurchase: vi.fn(),
}));
vi.mock('../src/modules/billing/billing.repo.js', () => ({
  findLatestOrderForPack: vi.fn(),
  confirmOrderAndGrantCredits: vi.fn(),
}));
vi.mock('../src/modules/users/users.repo.js', () => ({
  findActiveUserById: vi.fn(),
}));

import {
  verifyGooglePlayPurchase,
  consumeGooglePlayPurchase,
  fetchGooglePlayPurchase,
} from '../src/modules/billing/google-play-verifier.js';
import {
  findLatestOrderForPack,
  confirmOrderAndGrantCredits,
} from '../src/modules/billing/billing.repo.js';
import { findActiveUserById } from '../src/modules/users/users.repo.js';
import {
  confirmGooglePlayPurchase,
  reconcileGooglePlayNotification,
} from '../src/modules/billing/billing.service.js';

const baseOrder = {
  id: 'order-1',
  userId: 'user-1',
  packId: 'starter',
  amountPaise: 4900,
  discountPaise: 0,
  finalAmountPaise: 4900,
  currency: 'INR',
  couponId: null,
  couponCode: null,
  status: 'pending' as const,
  gatewayProvider: 'mock',
  gatewayOrderId: null,
  gatewayPaymentId: null,
  reference: 'AR-DEADBEEF',
  createdAt: new Date('2026-07-16T00:00:00Z'),
  paidAt: null,
  verifiedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('confirmGooglePlayPurchase', () => {
  it('throws not found when there is no matching order', async () => {
    vi.mocked(findLatestOrderForPack).mockResolvedValue(undefined);

    await expect(
      confirmGooglePlayPurchase('user-1', { purchaseToken: 'tok', productId: 'starter' }),
    ).rejects.toThrow('No matching order found for this purchase');
  });

  it('verifies, grants credits, and consumes for a pending order', async () => {
    vi.mocked(findLatestOrderForPack).mockResolvedValue(baseOrder);
    vi.mocked(verifyGooglePlayPurchase).mockResolvedValue(true);
    vi.mocked(confirmOrderAndGrantCredits).mockResolvedValue({
      order: { ...baseOrder, status: 'paid', gatewayPaymentId: 'tok' },
      walletBalancePaise: 6000,
    });
    vi.mocked(consumeGooglePlayPurchase).mockResolvedValue(undefined);

    const result = await confirmGooglePlayPurchase('user-1', {
      purchaseToken: 'tok',
      productId: 'starter',
    });

    expect(verifyGooglePlayPurchase).toHaveBeenCalledWith({
      productId: 'starter',
      purchaseToken: 'tok',
    });
    expect(confirmOrderAndGrantCredits).toHaveBeenCalledWith('order-1', 'user-1', 'tok');
    expect(consumeGooglePlayPurchase).toHaveBeenCalledWith({
      productId: 'starter',
      purchaseToken: 'tok',
    });
    expect(result.walletBalancePaise).toBe(6000);
  });

  it('rejects when Google reports the purchase is not in a completed state', async () => {
    vi.mocked(findLatestOrderForPack).mockResolvedValue(baseOrder);
    vi.mocked(verifyGooglePlayPurchase).mockResolvedValue(false);

    await expect(
      confirmGooglePlayPurchase('user-1', { purchaseToken: 'tok', productId: 'starter' }),
    ).rejects.toThrow('Purchase is not in a completed state');
    expect(confirmOrderAndGrantCredits).not.toHaveBeenCalled();
  });

  it('replays idempotently when the order is already paid with the same token', async () => {
    vi.mocked(findLatestOrderForPack).mockResolvedValue({
      ...baseOrder,
      status: 'paid',
      gatewayPaymentId: 'tok',
    });
    vi.mocked(findActiveUserById).mockResolvedValue({ walletBalancePaise: 6000 } as never);
    vi.mocked(consumeGooglePlayPurchase).mockResolvedValue(undefined);

    const result = await confirmGooglePlayPurchase('user-1', {
      purchaseToken: 'tok',
      productId: 'starter',
    });

    expect(verifyGooglePlayPurchase).not.toHaveBeenCalled();
    expect(consumeGooglePlayPurchase).toHaveBeenCalledWith({
      productId: 'starter',
      purchaseToken: 'tok',
    });
    expect(result.walletBalancePaise).toBe(6000);
  });

  it('retries consume on idempotent replay even when the earlier consume attempt failed', async () => {
    vi.mocked(findLatestOrderForPack).mockResolvedValue({
      ...baseOrder,
      status: 'paid',
      gatewayPaymentId: 'tok',
    });
    vi.mocked(findActiveUserById).mockResolvedValue({ walletBalancePaise: 6000 } as never);
    vi.mocked(consumeGooglePlayPurchase).mockRejectedValue(new Error('still unconsumed'));

    await expect(
      confirmGooglePlayPurchase('user-1', { purchaseToken: 'tok', productId: 'starter' }),
    ).resolves.toMatchObject({ walletBalancePaise: 6000 });

    expect(consumeGooglePlayPurchase).toHaveBeenCalledWith({
      productId: 'starter',
      purchaseToken: 'tok',
    });
  });

  it('rejects when the order is already paid with a different token', async () => {
    vi.mocked(findLatestOrderForPack).mockResolvedValue({
      ...baseOrder,
      status: 'paid',
      gatewayPaymentId: 'some-other-token',
    });

    await expect(
      confirmGooglePlayPurchase('user-1', { purchaseToken: 'tok', productId: 'starter' }),
    ).rejects.toThrow('Order already confirmed with a different purchase');
  });

  it('rejects when the order is in a non-payable status other than pending/paid', async () => {
    vi.mocked(findLatestOrderForPack).mockResolvedValue({
      ...baseOrder,
      status: 'cancelled',
    });

    await expect(
      confirmGooglePlayPurchase('user-1', { purchaseToken: 'tok', productId: 'starter' }),
    ).rejects.toThrow('not payable');
    expect(verifyGooglePlayPurchase).not.toHaveBeenCalled();
    expect(confirmOrderAndGrantCredits).not.toHaveBeenCalled();
  });

  it('recovers when a concurrent call already confirmed the order (lost race)', async () => {
    vi.mocked(findLatestOrderForPack)
      .mockResolvedValueOnce(baseOrder)
      .mockResolvedValueOnce({ ...baseOrder, status: 'paid', gatewayPaymentId: 'tok' });
    vi.mocked(verifyGooglePlayPurchase).mockResolvedValue(true);
    vi.mocked(confirmOrderAndGrantCredits).mockResolvedValue(undefined);
    vi.mocked(findActiveUserById).mockResolvedValue({ walletBalancePaise: 6000 } as never);

    const result = await confirmGooglePlayPurchase('user-1', {
      purchaseToken: 'tok',
      productId: 'starter',
    });

    expect(findLatestOrderForPack).toHaveBeenCalledTimes(2);
    expect(result.walletBalancePaise).toBe(6000);
    expect(consumeGooglePlayPurchase).not.toHaveBeenCalled();
  });

  it('does not fail the request when consume fails after credits are granted', async () => {
    vi.mocked(findLatestOrderForPack).mockResolvedValue(baseOrder);
    vi.mocked(verifyGooglePlayPurchase).mockResolvedValue(true);
    vi.mocked(confirmOrderAndGrantCredits).mockResolvedValue({
      order: { ...baseOrder, status: 'paid', gatewayPaymentId: 'tok' },
      walletBalancePaise: 6000,
    });
    vi.mocked(consumeGooglePlayPurchase).mockRejectedValue(new Error('already consumed'));

    await expect(
      confirmGooglePlayPurchase('user-1', { purchaseToken: 'tok', productId: 'starter' }),
    ).resolves.toMatchObject({ walletBalancePaise: 6000 });
  });
});

describe('reconcileGooglePlayNotification', () => {
  const purchased = { notificationType: 1, purchaseToken: 'tok', sku: 'starter' };

  it('ignores notification types other than ONE_TIME_PRODUCT_PURCHASED', async () => {
    await reconcileGooglePlayNotification({ ...purchased, notificationType: 2 });

    expect(fetchGooglePlayPurchase).not.toHaveBeenCalled();
  });

  it('does nothing when Google reports the purchase as not yet completed', async () => {
    vi.mocked(fetchGooglePlayPurchase).mockResolvedValue({
      purchaseState: 2,
      obfuscatedExternalAccountId: 'user-1',
    });

    await reconcileGooglePlayNotification(purchased);

    expect(findLatestOrderForPack).not.toHaveBeenCalled();
  });

  it('does nothing when the purchase carries no account id (made before this fix existed)', async () => {
    vi.mocked(fetchGooglePlayPurchase).mockResolvedValue({
      purchaseState: 0,
      obfuscatedExternalAccountId: null,
    });

    await reconcileGooglePlayNotification(purchased);

    expect(findLatestOrderForPack).not.toHaveBeenCalled();
  });

  it('confirms the order for the account id Google echoes back', async () => {
    vi.mocked(fetchGooglePlayPurchase).mockResolvedValue({
      purchaseState: 0,
      obfuscatedExternalAccountId: 'user-1',
    });
    vi.mocked(findLatestOrderForPack).mockResolvedValue(baseOrder);
    vi.mocked(verifyGooglePlayPurchase).mockResolvedValue(true);
    vi.mocked(confirmOrderAndGrantCredits).mockResolvedValue({
      order: { ...baseOrder, status: 'paid', gatewayPaymentId: 'tok' },
      walletBalancePaise: 6000,
    });
    vi.mocked(consumeGooglePlayPurchase).mockResolvedValue(undefined);

    await reconcileGooglePlayNotification(purchased);

    expect(findLatestOrderForPack).toHaveBeenCalledWith('user-1', 'starter');
    expect(confirmOrderAndGrantCredits).toHaveBeenCalledWith('order-1', 'user-1', 'tok');
  });

  it('swallows errors instead of throwing, so the webhook can still ack', async () => {
    vi.mocked(fetchGooglePlayPurchase).mockRejectedValue(new Error('Google API down'));

    await expect(reconcileGooglePlayNotification(purchased)).resolves.toBeUndefined();
  });
});
