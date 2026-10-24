import { beforeEach, describe, expect, it, vi } from 'vitest';

// A paying member whose Play renewal notice hasn't arrived yet (or who is in a silent grace
// period) must not be shut out: every Pass check asks Google before saying no.

const held = vi.hoisted((): { active: unknown } => ({ active: null }));
const state = vi.hoisted(() => ({
  refreshLapsedPlayPass: vi.fn(),
  consumePassQuestion: vi.fn(),
  consumeQuestionCredit: vi.fn(),
  deductWalletBalance: vi.fn(),
}));

vi.mock('../src/modules/pass/pass.repo.js', () => ({
  findActivePass: () => Promise.resolve(held.active),
  consumePassQuestion: state.consumePassQuestion,
  consumeQuestionCredit: state.consumeQuestionCredit,
  consumeGroupQuestion: vi.fn(),
  refundPassQuestion: vi.fn(),
  refundGroupQuestion: vi.fn(),
  addQuestionCredits: vi.fn(),
}));
vi.mock('../src/modules/pass/pass-play.service.js', () => ({
  refreshLapsedPlayPass: state.refreshLapsedPlayPass,
}));
vi.mock('../src/modules/user-groups/user-groups.repo.js', () => ({
  listGroupIdsForUser: () => Promise.resolve([]),
}));
vi.mock('../src/modules/pass/chat-gifts.repo.js', () => ({
  consumeChatGift: () => Promise.resolve(false),
  refundChatGift: vi.fn(),
}));
vi.mock('../src/modules/users/users.repo.js', () => ({
  deductWalletBalance: state.deductWalletBalance,
  addWalletBalance: vi.fn(),
}));

import { requirePass } from '../src/lib/entitlements.js';
import { chargeQuestion } from '../src/modules/pass/question-billing.js';

const renewedRow = {
  id: 'sub-1',
  source: 'google_play',
  priceVariant: 'B',
  status: 'active',
  periodEnd: new Date(Date.now() + 30 * 86_400_000),
};

beforeEach(() => {
  held.active = null;
  for (const fn of [
    state.refreshLapsedPlayPass,
    state.consumePassQuestion,
    state.consumeQuestionCredit,
    state.deductWalletBalance,
  ])
    fn.mockReset();
  state.refreshLapsedPlayPass.mockResolvedValue(false);
  state.consumePassQuestion.mockResolvedValue(false);
  state.consumeQuestionCredit.mockResolvedValue(false);
  state.deductWalletBalance.mockResolvedValue(true);
});

describe('a Pass at the end of its period is checked with Google before access is refused', () => {
  it('a Gold feature opens once Google confirms the renewal', async () => {
    state.refreshLapsedPlayPass.mockImplementation(() => {
      held.active = renewedRow;
      return Promise.resolve(true);
    });
    await expect(requirePass('user-1', 'decisions')).resolves.toBeUndefined();
    expect(state.refreshLapsedPlayPass).toHaveBeenCalledWith('user-1');
  });

  it('still refuses when Google has nothing live', async () => {
    await expect(requirePass('user-1', 'decisions')).rejects.toThrow('PASS_REQUIRED');
  });

  it('a live Pass is used straight away, without asking Google', async () => {
    held.active = renewedRow;
    await requirePass('user-1', 'decisions');
    expect(state.refreshLapsedPlayPass).not.toHaveBeenCalled();
  });

  it('a chat question comes from the renewed Pass, not the wallet', async () => {
    state.refreshLapsedPlayPass.mockResolvedValue(true);
    state.consumePassQuestion.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await chargeQuestion('user-1', 1000)).toBe('pass');
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
  });

  it('without a renewal the question falls through to credits and the wallet as before', async () => {
    expect(await chargeQuestion('user-1', 1000)).toBe('wallet');
    expect(state.consumePassQuestion).toHaveBeenCalledTimes(1);
  });
});
