import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  findLiveSelfClaimCampaign: vi.fn(),
  payoutOf: vi.fn(),
}));

vi.mock('../src/modules/gift-campaigns/gift-campaigns.repo.js', () => ({
  findLiveSelfClaimCampaign: state.findLiveSelfClaimCampaign,
}));

vi.mock('../src/modules/features/features.service.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, payoutOf: state.payoutOf };
});

const { resolveActiveClaimableCampaign } = await import('../src/modules/users/users.service.js');

beforeEach(() => {
  state.findLiveSelfClaimCampaign.mockReset().mockResolvedValue(undefined);
  state.payoutOf.mockReset();
});

// independence_day_2026 (config/campaigns.ts): istDate '2026-08-15', no maxBalancePaise ceiling.
const STATIC_LIVE_DAY = new Date('2026-08-15T12:00:00Z');
const DIFFERENT_DAY = new Date('2026-08-16T12:00:00Z');

describe('resolveActiveClaimableCampaign — static campaigns', () => {
  it('returns the campaign live on that IST day, when unclaimed and eligible', async () => {
    state.payoutOf.mockResolvedValue(50000);
    const user = makeUserRow({
      walletBalancePaise: 10000,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    const result = await resolveActiveClaimableCampaign(user, [], STATIC_LIVE_DAY);

    expect(result).toMatchObject({ key: 'independence_day_2026', amountPaise: 50000 });
  });

  it('returns null once already claimed', async () => {
    const user = makeUserRow({
      walletBalancePaise: 10000,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    const result = await resolveActiveClaimableCampaign(
      user,
      ['independence_day_2026'],
      STATIC_LIVE_DAY,
    );

    expect(result).toBeNull();
    expect(state.payoutOf).not.toHaveBeenCalled();
  });

  it('returns null for a user who signed up on the campaign day', async () => {
    const user = makeUserRow({ walletBalancePaise: 10000, createdAt: STATIC_LIVE_DAY });

    const result = await resolveActiveClaimableCampaign(user, [], STATIC_LIVE_DAY);

    expect(result).toBeNull();
  });

  it('returns null on a day no static campaign is live', async () => {
    const user = makeUserRow({
      walletBalancePaise: 10000,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    const result = await resolveActiveClaimableCampaign(user, [], DIFFERENT_DAY);

    expect(result).toBeNull();
  });

  it('returns null when the feature-registry payout has been zeroed out (kill switch)', async () => {
    state.payoutOf.mockResolvedValue(0);
    const user = makeUserRow({
      walletBalancePaise: 10000,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    const result = await resolveActiveClaimableCampaign(user, [], STATIC_LIVE_DAY);

    expect(result).toBeNull();
  });
});

describe('resolveActiveClaimableCampaign — DB campaigns', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const dbCampaign = {
    key: 'diwali_2026_abc123',
    title: 'Diwali 2026',
    amountPaise: 5000,
    audienceMaxBalancePaise: 25000,
    sentAt: new Date('2026-11-08T09:00:00Z'),
    validUntil: new Date('2026-11-13T09:00:00Z'),
  };

  it('returns the live DB campaign when unclaimed and eligible', async () => {
    state.findLiveSelfClaimCampaign.mockResolvedValue(dbCampaign);
    const user = makeUserRow({
      walletBalancePaise: 10000,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    const result = await resolveActiveClaimableCampaign(user, [], now);

    expect(result).toMatchObject({
      key: 'diwali_2026_abc123',
      title: 'Diwali 2026',
      amountPaise: 5000,
    });
  });

  it('returns null when the wallet balance is at or above the audience ceiling', async () => {
    state.findLiveSelfClaimCampaign.mockResolvedValue(dbCampaign);
    const user = makeUserRow({
      walletBalancePaise: 25000,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    const result = await resolveActiveClaimableCampaign(user, [], now);

    expect(result).toBeNull();
  });

  it('returns null for a user who signed up the day the campaign was sent', async () => {
    state.findLiveSelfClaimCampaign.mockResolvedValue(dbCampaign);
    const user = makeUserRow({ walletBalancePaise: 10000, createdAt: dbCampaign.sentAt });

    const result = await resolveActiveClaimableCampaign(user, [], now);

    expect(result).toBeNull();
  });

  it('returns null when no campaign is currently live', async () => {
    state.findLiveSelfClaimCampaign.mockResolvedValue(undefined);
    const user = makeUserRow({
      walletBalancePaise: 10000,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });

    const result = await resolveActiveClaimableCampaign(user, [], now);

    expect(result).toBeNull();
  });
});
