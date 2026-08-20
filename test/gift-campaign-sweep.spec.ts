import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  findDueScheduledCampaigns: vi.fn(),
  findDueExpiredGrants: vi.fn(),
  applyExpiryClawback: vi.fn().mockResolvedValue(undefined),
  markGrantExpired: vi.fn().mockResolvedValue(undefined),
  executeSend: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/modules/gift-campaigns/gift-campaigns.repo.js', () => ({
  findDueScheduledCampaigns: state.findDueScheduledCampaigns,
  findDueExpiredGrants: state.findDueExpiredGrants,
  applyExpiryClawback: state.applyExpiryClawback,
  markGrantExpired: state.markGrantExpired,
}));

vi.mock('../src/modules/gift-campaigns/gift-campaigns.service.js', () => ({
  executeSend: state.executeSend,
}));

const { sweepDueCampaigns, sweepExpiredGrants } =
  await import('../src/modules/cron/gift-campaign-sweep.service.js');

beforeEach(() => {
  for (const fn of Object.values(state)) fn.mockClear();
});

describe('sweepDueCampaigns', () => {
  it('sends every due campaign and reports the count', async () => {
    state.findDueScheduledCampaigns.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    const result = await sweepDueCampaigns(new Date('2026-11-08T09:00:00Z'));
    expect(state.executeSend).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sent: 2 });
  });
});

describe('sweepExpiredGrants', () => {
  it('claws back the lesser of the grant amount and current balance', async () => {
    state.findDueExpiredGrants.mockResolvedValue([
      { id: 'g1', userId: 'u1', delta: 5000, reason: 'diwali_2026_abc', currentBalancePaise: 2000 },
    ]);
    const result = await sweepExpiredGrants(new Date('2026-12-01T00:00:00Z'));
    expect(state.applyExpiryClawback).toHaveBeenCalledWith(
      'g1',
      'u1',
      2000,
      'diwali_2026_abc_expired',
    );
    expect(result).toEqual({ expired: 1 });
  });

  it('marks a grant expired without a wallet write when nothing is left to claw back', async () => {
    state.findDueExpiredGrants.mockResolvedValue([
      { id: 'g1', userId: 'u1', delta: 5000, reason: 'diwali_2026_abc', currentBalancePaise: 0 },
    ]);
    await sweepExpiredGrants(new Date('2026-12-01T00:00:00Z'));
    expect(state.applyExpiryClawback).not.toHaveBeenCalled();
    expect(state.markGrantExpired).toHaveBeenCalledWith('g1');
  });
});
