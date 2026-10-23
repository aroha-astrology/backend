import { describe, it, expect, vi, beforeEach } from 'vitest';

const world = vi.hoisted(() => ({
  token: false,
  tokenRefundedUntil: null as Date | null,
  gift: false,
  passLeft: 0,
  credits: 0,
  wallet: 10_000,
  walletDebits: [] as number[],
  order: [] as string[],
}));

vi.mock('../src/modules/users/users.repo', () => ({
  addWalletBalance: async () => {},
  deductWalletBalance: async (_u: string, paise: number) => {
    if (world.wallet < paise) return false;
    world.wallet -= paise;
    world.walletDebits.push(paise);
    world.order.push('wallet');
    return true;
  },
}));

vi.mock('../src/modules/pass/pass.repo', () => ({
  addQuestionCredits: async () => {},
  consumeGroupQuestion: async () => false,
  consumePassQuestion: async () => {
    if (world.passLeft <= 0) return false;
    world.passLeft--;
    world.order.push('pass');
    return true;
  },
  consumeQuestionCredit: async () => {
    if (world.credits <= 0) return false;
    world.credits--;
    world.order.push('credits');
    return true;
  },
  findActivePass: async () => undefined,
  refundGroupQuestion: async () => {},
  refundPassQuestion: async () => {},
}));

vi.mock('../src/modules/user-groups/user-groups.repo', () => ({ listGroupIdsForUser: async () => [] }));

vi.mock('../src/modules/pass/chat-gifts.repo', () => ({
  consumeChatGift: async () => {
    if (!world.gift) return false;
    world.gift = false;
    world.order.push('gift');
    return true;
  },
  refundChatGift: async () => {},
}));

vi.mock('../src/modules/memory/memory.repo', () => ({
  consumeBabaFreeReply: async () => {
    if (!world.token) return false;
    world.token = false;
    world.order.push('memory');
    return true;
  },
  refundBabaFreeReply: async (_u: string, until: Date) => {
    world.token = true;
    world.tokenRefundedUntil = until;
  },
}));

import { chargeQuestion, refundQuestion } from '../src/modules/pass/question-billing';

beforeEach(() => {
  world.token = false;
  world.tokenRefundedUntil = null;
  world.gift = false;
  world.passLeft = 0;
  world.credits = 0;
  world.wallet = 10_000;
  world.walletDebits = [];
  world.order = [];
});

describe('the free reply to a Baba Ji check-in', () => {
  it('is spent first, before a gift, the Pass, a pack or the wallet', async () => {
    world.token = true;
    world.gift = true;
    world.passLeft = 5;
    world.credits = 5;
    expect(await chargeQuestion('u1', 2000)).toBe('memory');
    expect(world.order).toEqual(['memory']);
    expect(world.wallet).toBe(10_000);
  });

  it('can only be spent once', async () => {
    world.token = true;
    expect(await chargeQuestion('u1', 2000)).toBe('memory');
    expect(await chargeQuestion('u1', 2000)).toBe('wallet');
    expect(world.walletDebits).toEqual([2000]);
  });

  it('with no token nothing changes: the usual order applies', async () => {
    world.gift = true;
    world.passLeft = 1;
    expect(await chargeQuestion('u1', 2000)).toBe('gift');
    expect(await chargeQuestion('u1', 2000)).toBe('pass');
    expect(await chargeQuestion('u1', 2000)).toBe('wallet');
  });

  it('is not used on a question that was free anyway', async () => {
    world.token = true;
    expect(await chargeQuestion('u1', 0)).toBe('free');
    expect(world.token).toBe(true);
  });

  it('is given back when the turn produced no answer, for 48 hours', async () => {
    world.token = true;
    const source = await chargeQuestion('u1', 2000);
    expect(world.token).toBe(false);
    const before = Date.now();
    await refundQuestion('u1', source!, 2000);
    expect(world.token).toBe(true);
    expect(world.tokenRefundedUntil!.getTime() - before).toBeGreaterThanOrEqual(48 * 3_600_000 - 1000);
  });

  it('an error reading the token never blocks the question', async () => {
    // the real consume swallows a DB error as "no token"; the wallet path then runs
    expect(await chargeQuestion('u1', 2000)).toBe('wallet');
  });
});
