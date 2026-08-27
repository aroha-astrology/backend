import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as FeaturesServiceModule from '../src/modules/features/features.service.js';

const state = vi.hoisted(() => ({
  getGiftCampaignByKey: vi.fn(),
  payoutOf: vi.fn(),
}));

vi.mock('../src/modules/gift-campaigns/gift-campaigns.repo.js', () => ({
  getGiftCampaignByKey: state.getGiftCampaignByKey,
}));

vi.mock('../src/modules/features/features.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof FeaturesServiceModule>();
  return { ...actual, payoutOf: state.payoutOf };
});

const { resolveClaimCampaign } =
  await import('../src/modules/gift-campaigns/gift-campaigns.service.js');

beforeEach(() => {
  state.getGiftCampaignByKey.mockReset();
  state.payoutOf.mockReset();
});

describe('resolveClaimCampaign — static campaigns (config/campaigns.ts)', () => {
  it('resolves independence_day_2026 unchanged, via payoutOf', async () => {
    state.payoutOf.mockResolvedValue(50000);
    const result = await resolveClaimCampaign('independence_day_2026', 'user-1');
    expect(result).toMatchObject({ key: 'independence_day_2026', amountPaise: 50000 });
    expect(state.getGiftCampaignByKey).not.toHaveBeenCalled();
  });

  it('returns undefined for a totally unknown key', async () => {
    state.getGiftCampaignByKey.mockResolvedValue(undefined);
    const result = await resolveClaimCampaign('nonexistent_key', 'user-1');
    expect(result).toBeUndefined();
  });
});

describe('resolveClaimCampaign — DB campaigns (gift_campaigns table)', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const baseDbCampaign = {
    key: 'diwali_2026_abc123',
    title: 'Diwali 2026',
    amountPaise: 5000,
    audienceMaxBalancePaise: 25000,
    deliveryMode: 'self_claim' as const,
    claimWindowDays: 5,
    creditExpiryDays: 14,
    status: 'sent' as const,
    sentAt: new Date('2026-11-08T09:00:00Z'),
    validFrom: new Date('2026-11-08T09:00:00Z'),
    validUntil: new Date('2026-11-13T09:00:00Z'),
  };

  it('is open when now is within validFrom/validUntil', async () => {
    state.getGiftCampaignByKey.mockResolvedValue(baseDbCampaign);
    const result = await resolveClaimCampaign('diwali_2026_abc123', 'user-1', now);
    expect(result).toMatchObject({
      key: 'diwali_2026_abc123',
      amountPaise: 5000,
      maxBalancePaise: 25000,
      isOpenNow: true,
    });
    expect(result?.expiresAt).toBeInstanceOf(Date);
  });

  it('is closed once now is past validUntil', async () => {
    state.getGiftCampaignByKey.mockResolvedValue(baseDbCampaign);
    const result = await resolveClaimCampaign(
      'diwali_2026_abc123',
      'user-1',
      new Date('2026-11-20T00:00:00Z'),
    );
    expect(result?.isOpenNow).toBe(false);
  });

  it('is closed (not undefined) for an auto_credit campaign (not claimable via this route)', async () => {
    state.getGiftCampaignByKey.mockResolvedValue({
      ...baseDbCampaign,
      deliveryMode: 'auto_credit',
    });
    const result = await resolveClaimCampaign('diwali_2026_abc123', 'user-1', now);
    expect(result?.isOpenNow).toBe(false);
  });

  it('is closed (not undefined) for a campaign that has not been sent yet', async () => {
    state.getGiftCampaignByKey.mockResolvedValue({ ...baseDbCampaign, status: 'scheduled' });
    const result = await resolveClaimCampaign('diwali_2026_abc123', 'user-1', now);
    expect(result?.isOpenNow).toBe(false);
  });

  it('is still undefined for a totally unknown key (a real 404)', async () => {
    state.getGiftCampaignByKey.mockResolvedValue(undefined);
    const result = await resolveClaimCampaign('diwali_2026_abc123', 'user-1', now);
    expect(result).toBeUndefined();
  });
});
