import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  txValues: [] as unknown[],
}));

vi.mock('../src/config/db.js', () => {
  const makeTx = () => ({
    execute: vi.fn().mockResolvedValue([{ wallet_balance_paise: 5000 }]),
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([]) }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([{ walletBalancePaise: 10000 }]),
        }),
      }),
    }),
    insert: () => ({
      values: (v: unknown) => {
        state.txValues.push(v);
        return Promise.resolve();
      },
    }),
  });
  return {
    db: {
      transaction: (fn: (tx: unknown) => unknown) => fn(makeTx()),
    },
  };
});

const { claimCampaignBonus } = await import('../src/modules/users/users.repo.js');

beforeEach(() => {
  state.txValues.length = 0;
});

describe('claimCampaignBonus expiresAt', () => {
  it('stores null expiresAt when not given', async () => {
    await claimCampaignBonus('user-1', 'diwali_2026_abc123', 5000);
    expect(state.txValues[0]).toMatchObject({ expiresAt: null });
  });

  it('threads a given expiresAt through to the ledger insert', async () => {
    const expiresAt = new Date('2026-12-01T00:00:00Z');
    await claimCampaignBonus('user-1', 'diwali_2026_abc123', 5000, expiresAt);
    expect(state.txValues[0]).toMatchObject({ expiresAt });
  });
});
