import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DevicePushTokenRow } from '../src/db/schema.js';

// ─── mocks ──────────────────────────────────────────────────────────────────
vi.mock('../src/modules/device-tokens/device-tokens.repo.js', () => ({
  findActiveTokensForUser: vi.fn(),
}));
vi.mock('../src/lib/notifications/fcm.js', () => ({
  sendPushBatch: vi.fn(),
}));
vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { findActiveTokensForUser } from '../src/modules/device-tokens/device-tokens.repo.js';
import { sendPushBatch } from '../src/lib/notifications/fcm.js';
import { notifyPurchasePlanReady } from '../src/modules/purchase-plan/purchase-plan.service.js';

const mockTokens = [{ token: 'tok-abc' }, { token: 'tok-def' }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findActiveTokensForUser).mockResolvedValue(mockTokens as unknown as DevicePushTokenRow[]);
  vi.mocked(sendPushBatch).mockResolvedValue({ success: 2, failure: 0 });
});

describe('notifyPurchasePlanReady', () => {
  it('sends a push to all active tokens for the user', async () => {
    await notifyPurchasePlanReady('user-123', 'vehicle');

    expect(findActiveTokensForUser).toHaveBeenCalledWith('user-123');
    expect(sendPushBatch).toHaveBeenCalledWith(
      ['tok-abc', 'tok-def'],
      expect.any(String),
      expect.any(String),
      { type: 'purchase_plan_ready', navigate: '/panchang' },
    );
  });

  it('sends nothing when the user has no active tokens', async () => {
    vi.mocked(findActiveTokensForUser).mockResolvedValue([]);
    await notifyPurchasePlanReady('user-123', 'home');
    expect(sendPushBatch).not.toHaveBeenCalled();
  });

  it('does not throw when sendPushBatch rejects', async () => {
    vi.mocked(sendPushBatch).mockRejectedValue(new Error('FCM down'));
    await expect(notifyPurchasePlanReady('user-123', 'commercial')).resolves.toBeUndefined();
  });

  it('does not throw when findActiveTokensForUser rejects', async () => {
    vi.mocked(findActiveTokensForUser).mockRejectedValue(new Error('DB down'));
    await expect(notifyPurchasePlanReady('user-123', 'other')).resolves.toBeUndefined();
  });
});
