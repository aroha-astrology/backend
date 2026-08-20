import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as GiftCampaignsRepoModule from '../src/modules/gift-campaigns/gift-campaigns.repo.js';
import type { GiftCampaignRow } from '../src/db/schema.js';

const state = vi.hoisted(() => ({
  insertGiftCampaign: vi.fn(),
  resolveAudience: vi.fn(),
  cancelGiftCampaignIfPending: vi.fn(),
  getGiftCampaignById: vi.fn(),
  markGiftCampaignSent: vi.fn().mockResolvedValue(undefined),
  getAllActiveTokens: vi.fn(),
  claimCampaignBonus: vi.fn(),
  notifyUser: vi.fn().mockResolvedValue(undefined),
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/modules/gift-campaigns/gift-campaigns.repo.js', async (importOriginal) => {
  const actual = await importOriginal<typeof GiftCampaignsRepoModule>();
  return {
    ...actual,
    insertGiftCampaign: state.insertGiftCampaign,
    resolveAudience: state.resolveAudience,
    cancelGiftCampaignIfPending: state.cancelGiftCampaignIfPending,
    getGiftCampaignById: state.getGiftCampaignById,
    markGiftCampaignSent: state.markGiftCampaignSent,
  };
});

vi.mock('../src/modules/device-tokens/device-tokens.repo.js', () => ({
  getAllActiveTokens: state.getAllActiveTokens,
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  claimCampaignBonus: state.claimCampaignBonus,
}));

vi.mock('../src/lib/notifications/notify-user.js', () => ({
  notifyUser: state.notifyUser,
}));

vi.mock('../src/modules/admin/admin.repo.js', () => ({
  logAdminAction: state.logAdminAction,
}));

const { createCampaign, previewAudience, cancelCampaign, executeSend, sendCampaignNow } =
  await import('../src/modules/gift-campaigns/gift-campaigns.service.js');

const ADMIN_PHONE = '+919999111111';

beforeEach(() => {
  for (const fn of Object.values(state)) {
    if (typeof fn === 'function' && 'mockReset' in fn)
      (fn as { mockReset: () => void }).mockReset();
  }
  state.markGiftCampaignSent.mockResolvedValue(undefined);
  state.notifyUser.mockResolvedValue(undefined);
  state.logAdminAction.mockResolvedValue(undefined);
});

describe('createCampaign', () => {
  it('rejects a zero or negative amount', async () => {
    await expect(
      createCampaign(
        {
          title: 'Diwali',
          amountPaise: 0,
          audienceMaxBalancePaise: null,
          deliveryMode: 'auto_credit',
          claimWindowDays: null,
          creditExpiryDays: null,
          scheduledSendAt: null,
        },
        ADMIN_PHONE,
      ),
    ).rejects.toThrow(/greater than zero/);
    expect(state.insertGiftCampaign).not.toHaveBeenCalled();
  });

  it('rejects a self_claim campaign with no claim window', async () => {
    await expect(
      createCampaign(
        {
          title: 'Diwali',
          amountPaise: 5000,
          audienceMaxBalancePaise: null,
          deliveryMode: 'self_claim',
          claimWindowDays: null,
          creditExpiryDays: null,
          scheduledSendAt: null,
        },
        ADMIN_PHONE,
      ),
    ).rejects.toThrow(/claim window/);
  });

  it('defaults status to draft when no scheduledSendAt is given', async () => {
    state.insertGiftCampaign.mockResolvedValue({ id: 'c1', status: 'draft' });
    await createCampaign(
      {
        title: 'Diwali',
        amountPaise: 5000,
        audienceMaxBalancePaise: null,
        deliveryMode: 'auto_credit',
        claimWindowDays: null,
        creditExpiryDays: null,
        scheduledSendAt: null,
      },
      ADMIN_PHONE,
    );
    expect(state.insertGiftCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft' }),
    );
  });

  it('sets status to scheduled when scheduledSendAt is given', async () => {
    state.insertGiftCampaign.mockResolvedValue({ id: 'c1', status: 'scheduled' });
    const sendAt = new Date('2026-11-08T09:00:00Z');
    await createCampaign(
      {
        title: 'Diwali',
        amountPaise: 5000,
        audienceMaxBalancePaise: null,
        deliveryMode: 'auto_credit',
        claimWindowDays: null,
        creditExpiryDays: null,
        scheduledSendAt: sendAt,
      },
      ADMIN_PHONE,
    );
    expect(state.insertGiftCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'scheduled', scheduledSendAt: sendAt }),
    );
  });

  it('derives the key from the title and logs the admin action', async () => {
    state.insertGiftCampaign.mockImplementation((input: Record<string, unknown>) =>
      Promise.resolve({ id: 'c1', ...input }),
    );
    const row = await createCampaign(
      {
        title: 'Diwali 2026',
        amountPaise: 5000,
        audienceMaxBalancePaise: 25000,
        deliveryMode: 'auto_credit',
        claimWindowDays: null,
        creditExpiryDays: 14,
        scheduledSendAt: null,
      },
      ADMIN_PHONE,
    );
    expect(row.key).toMatch(/^diwali_2026_[a-f0-9]{8}$/);
    expect(state.logAdminAction).toHaveBeenCalled();
  });
});

describe('previewAudience', () => {
  it('counts eligible and pushable users and totals the cost', async () => {
    state.resolveAudience.mockResolvedValue([
      { userId: 'u1', walletBalancePaise: 1000, locale: 'en', createdAt: new Date() },
      { userId: 'u2', walletBalancePaise: 2000, locale: 'hi', createdAt: new Date() },
      { userId: 'u3', walletBalancePaise: 3000, locale: null, createdAt: new Date() },
    ]);
    state.getAllActiveTokens.mockResolvedValue([
      { userId: 'u1', token: 't1' },
      { userId: 'u3', token: 't3' },
    ]);

    const preview = await previewAudience(5000, 25000);
    expect(preview).toEqual({ eligibleCount: 3, pushableCount: 2, totalCostPaise: 15000 });
  });
});

describe('cancelCampaign', () => {
  it('throws a conflict if the campaign was already sent or canceled', async () => {
    state.cancelGiftCampaignIfPending.mockResolvedValue(false);
    await expect(cancelCampaign('c1', ADMIN_PHONE)).rejects.toThrow(/draft or scheduled/);
  });

  it('logs the admin action on success', async () => {
    state.cancelGiftCampaignIfPending.mockResolvedValue(true);
    await cancelCampaign('c1', ADMIN_PHONE);
    expect(state.logAdminAction).toHaveBeenCalledWith(
      ADMIN_PHONE,
      'DELETE /v1/admin/gift-campaigns/c1',
      {},
    );
  });
});

describe('executeSend', () => {
  const autoCreditCampaign = {
    id: 'c1',
    key: 'diwali_2026_abc123',
    title: 'Diwali 2026',
    amountPaise: 5000,
    audienceMaxBalancePaise: null,
    deliveryMode: 'auto_credit' as const,
    claimWindowDays: null,
    creditExpiryDays: 14,
  };

  it('credits every eligible user directly for auto_credit campaigns', async () => {
    state.resolveAudience.mockResolvedValue([
      { userId: 'u1', walletBalancePaise: 1000, locale: 'en', createdAt: new Date() },
      { userId: 'u2', walletBalancePaise: 2000, locale: 'hi', createdAt: new Date() },
    ]);
    state.claimCampaignBonus.mockResolvedValue({ claimed: true, walletBalancePaise: 6000 });

    await executeSend(autoCreditCampaign as unknown as GiftCampaignRow);

    expect(state.claimCampaignBonus).toHaveBeenCalledTimes(2);
    expect(state.claimCampaignBonus).toHaveBeenCalledWith(
      'u1',
      'diwali_2026_abc123',
      5000,
      expect.any(Date),
    );
    expect(state.notifyUser).toHaveBeenCalledTimes(2);
  });

  it('does not credit anyone for self_claim campaigns — only notifies', async () => {
    state.resolveAudience.mockResolvedValue([
      { userId: 'u1', walletBalancePaise: 1000, locale: 'en', createdAt: new Date() },
    ]);

    await executeSend({
      ...autoCreditCampaign,
      deliveryMode: 'self_claim',
      claimWindowDays: 5,
    } as unknown as GiftCampaignRow);

    expect(state.claimCampaignBonus).not.toHaveBeenCalled();
    expect(state.notifyUser).toHaveBeenCalledTimes(1);
  });

  it('marks the campaign sent with a validUntil derived from claimWindowDays for self_claim', async () => {
    state.resolveAudience.mockResolvedValue([]);
    await executeSend({
      ...autoCreditCampaign,
      deliveryMode: 'self_claim',
      claimWindowDays: 5,
    } as unknown as GiftCampaignRow);

    expect(state.markGiftCampaignSent).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ validUntil: expect.any(Date) }),
    );
  });

  it('marks auto_credit campaigns sent with a null validUntil (no claim window)', async () => {
    state.resolveAudience.mockResolvedValue([]);
    await executeSend(autoCreditCampaign as unknown as GiftCampaignRow);
    expect(state.markGiftCampaignSent).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ validUntil: null }),
    );
  });
});

describe('sendCampaignNow', () => {
  it('throws not-found for an unknown campaign', async () => {
    state.getGiftCampaignById.mockResolvedValue(undefined);
    await expect(sendCampaignNow('missing', ADMIN_PHONE)).rejects.toThrow();
  });

  it('throws a conflict if already sent or canceled', async () => {
    state.getGiftCampaignById.mockResolvedValue({ id: 'c1', status: 'sent' });
    await expect(sendCampaignNow('c1', ADMIN_PHONE)).rejects.toThrow(/already been sent/);
  });

  it('sends a draft campaign and logs the admin action', async () => {
    state.getGiftCampaignById
      .mockResolvedValueOnce({
        id: 'c1',
        status: 'draft',
        key: 'k',
        title: 'X',
        amountPaise: 100,
        audienceMaxBalancePaise: null,
        deliveryMode: 'auto_credit',
        claimWindowDays: null,
        creditExpiryDays: null,
      })
      .mockResolvedValueOnce({ id: 'c1', status: 'sent' });
    state.resolveAudience.mockResolvedValue([]);

    const result = await sendCampaignNow('c1', ADMIN_PHONE);
    expect(result).toEqual({ id: 'c1', status: 'sent' });
    expect(state.logAdminAction).toHaveBeenCalledWith(
      ADMIN_PHONE,
      'POST /v1/admin/gift-campaigns/c1/send',
      {},
    );
  });
});
