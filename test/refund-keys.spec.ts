import { beforeEach, describe, expect, it, vi } from 'vitest';

// money.refundKeys (v7 Sprint 1 gap): one refund per charge for chat, Vastu and yantra (reports
// are covered in reports-service.spec.ts). Off, every wallet call is exactly the old one.

const s = vi.hoisted(() => ({
  on: false,
  deduct: vi.fn(),
  add: vi.fn(),
}));

vi.mock('../src/modules/features/features.service.js', () => ({
  isFeatureOn: async (_u: string, key: string) => s.on && key === 'money.refundKeys',
  priceOf: async (_u: string, _k: string, fallback: number) => fallback,
  resolveFeaturesForUser: async () => ({
    'digital.yantra': { enabled: true, pricePaise: 4900 },
  }),
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  deductWalletBalance: s.deduct,
  addWalletBalance: s.add,
  refundKeyFor: (key: string) => `refund:${key}`,
}));

vi.mock('../src/modules/pass/pass.repo.js', () => ({
  addQuestionCredits: vi.fn(),
  consumeGroupQuestion: async () => false,
  consumePassQuestion: async () => false,
  consumeQuestionCredit: async () => false,
  findActivePass: async () => null,
  refundGroupQuestion: vi.fn(),
  refundPassQuestion: vi.fn(),
}));
vi.mock('../src/modules/pass/pass-play.service.js', () => ({ refreshLapsedPlayPass: async () => false }));
vi.mock('../src/modules/user-groups/user-groups.repo.js', () => ({ listGroupIdsForUser: async () => [] }));
vi.mock('../src/modules/pass/chat-gifts.repo.js', () => ({
  consumeChatGift: async () => false,
  refundChatGift: vi.fn(),
}));
vi.mock('../src/modules/memory/memory.repo.js', () => ({
  consumeBabaFreeReply: async () => false,
  refundBabaFreeReply: vi.fn(),
}));

const vastu = vi.hoisted(() => ({
  insertPendingPlan: vi.fn(),
  markProcessing: vi.fn(),
  markDone: vi.fn(),
  markError: vi.fn(),
  findStaleProcessingPlans: vi.fn(),
  generateVastuAnalysis: vi.fn(),
}));
vi.mock('../src/modules/vastu/vastu.repo.js', () => ({
  insertPendingPlan: vastu.insertPendingPlan,
  findPlanForUser: vi.fn(),
  findHomeForUser: vi.fn(),
  countRecentPlansForUser: async () => 0,
  markProcessing: vastu.markProcessing,
  markDone: vastu.markDone,
  markError: vastu.markError,
  saveFollowUpIfAbsent: vi.fn(),
  listPlansForUser: vi.fn(),
  deletePlanForUser: vi.fn(),
  saveVastuTranslation: vi.fn(),
  findStaleProcessingPlans: vastu.findStaleProcessingPlans,
}));
vi.mock('../src/modules/kundli/kundli.repo.js', () => ({ findKundliByUserId: async () => undefined }));
vi.mock('../src/lib/llm/vastu.js', () => ({
  generateVastuAnalysis: vastu.generateVastuAnalysis,
  generateVastuAnswer: vi.fn(),
  translateVastuContent: vi.fn(),
}));

const { keyed, newChargeKey, refundOf } = await import('../src/modules/billing/refund-keys.js');
const { chargeQuestion, refundQuestion } = await import('../src/modules/pass/question-billing.js');
const { requestVastuAnalysis, reapStaleVastuPlans, vastuChargeKey } = await import(
  '../src/modules/vastu/vastu.service.js'
);

beforeEach(() => {
  s.on = false;
  s.deduct.mockReset().mockResolvedValue(true);
  s.add.mockReset().mockResolvedValue(true);
  vastu.insertPendingPlan.mockReset().mockImplementation(async (row: { id: string }) => ({ ...row }));
  vastu.markProcessing.mockReset().mockResolvedValue(undefined);
  vastu.markDone.mockReset().mockResolvedValue(undefined);
  vastu.markError.mockReset().mockResolvedValue(undefined);
  vastu.findStaleProcessingPlans.mockReset().mockResolvedValue([]);
  vastu.generateVastuAnalysis.mockReset();
});

describe('refund-keys helpers', () => {
  it('no key means no extra argument at all', () => {
    expect(keyed(undefined)).toEqual([]);
    expect(refundOf(null)).toEqual([]);
  });

  it('a key becomes the write option, a refund gets the refund: prefix', () => {
    expect(keyed('chat_message:1')).toEqual([{ idempotencyKey: 'chat_message:1' }]);
    expect(refundOf('chat_message:1')).toEqual([{ idempotencyKey: 'refund:chat_message:1' }]);
  });

  it('newChargeKey is undefined while the switch is off and unique while it is on', async () => {
    expect(await newChargeKey('u1', 'chat_message')).toBeUndefined();
    s.on = true;
    const a = await newChargeKey('u1', 'chat_message');
    const b = await newChargeKey('u1', 'chat_message');
    expect(a).toMatch(/^chat_message:[0-9a-f-]{36}$/);
    expect(a).not.toBe(b);
  });
});

describe('chat question billing with a charge key', () => {
  it('off: the wallet debit and refund are the old three-argument calls', async () => {
    expect(await chargeQuestion('u1', 2000)).toBe('wallet');
    await refundQuestion('u1', 'wallet', 2000);
    expect(s.deduct).toHaveBeenCalledWith('u1', 2000, 'chat_message');
    expect(s.add).toHaveBeenCalledWith('u1', 2000, 'refund:chat_message');
  });

  it('on: the debit carries the key and the refund its refund key', async () => {
    expect(await chargeQuestion('u1', 2000, 'chat_message:k1')).toBe('wallet');
    await refundQuestion('u1', 'wallet', 2000, 'chat_message:k1');
    expect(s.deduct).toHaveBeenCalledWith('u1', 2000, 'chat_message', {
      idempotencyKey: 'chat_message:k1',
    });
    expect(s.add).toHaveBeenCalledWith('u1', 2000, 'refund:chat_message', {
      idempotencyKey: 'refund:chat_message:k1',
    });
  });
});

const body = {
  roomLayout: { NE: ['puja'] },
  language: 'en',
} as never;

describe('Vastu report refunds with money.refundKeys on', () => {
  it('the charge and the background failure refund share the plan id key', async () => {
    s.on = true;
    vastu.generateVastuAnalysis.mockRejectedValue(new Error('model down'));

    const { planId } = await requestVastuAnalysis('u1', null, body);

    expect(vastu.insertPendingPlan).toHaveBeenCalledWith(expect.objectContaining({ id: planId }));
    expect(s.deduct).toHaveBeenCalledWith('u1', expect.any(Number), 'vastu_report', {
      idempotencyKey: vastuChargeKey(planId),
    });
    await vi.waitFor(() => expect(s.add).toHaveBeenCalled());
    expect(s.add).toHaveBeenCalledWith('u1', expect.any(Number), 'refund:vastu_report', {
      idempotencyKey: `refund:vastu_report:${planId}`,
    });
  });

  it('the stale reaper refunds under the same key, so it can never pay a second time', async () => {
    s.on = true;
    vastu.findStaleProcessingPlans.mockResolvedValue([
      { id: 'plan-9', userId: 'u1', pricePaidPaise: 9900 },
    ]);
    await reapStaleVastuPlans();
    expect(s.add).toHaveBeenCalledWith('u1', 9900, 'refund:vastu_report', {
      idempotencyKey: 'refund:vastu_report:plan-9',
    });
  });

  it('off: the reaper refund is the old unkeyed call', async () => {
    vastu.findStaleProcessingPlans.mockResolvedValue([
      { id: 'plan-9', userId: 'u1', pricePaidPaise: 9900 },
    ]);
    await reapStaleVastuPlans();
    expect(s.add).toHaveBeenCalledWith('u1', 9900, 'refund:vastu_report');
  });
});
