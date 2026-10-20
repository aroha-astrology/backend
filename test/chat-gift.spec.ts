import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Dussehra 2026 gift: 2 free chat questions to every existing user until
 * 21 Oct 11:59 PM IST. The SQL (grant once, spend, refund, expiry) was checked
 * against a real Postgres before release; these pin the wiring around it:
 * billing order, what the astrologer is told, and the announcement.
 */

const gift = vi.hoisted(() => ({
  consume: vi.fn<(userId: string) => Promise<boolean>>(),
  refund: vi.fn<(userId: string) => Promise<void>>(),
  holders: vi.fn<() => Promise<Array<{ userId: string; locale: string | null }>>>(),
  notified: vi.fn<() => Promise<Set<string>>>(),
  notify: vi.fn<(userId: string, n: Record<string, unknown>) => Promise<void>>(),
  pass: vi.fn<() => Promise<boolean>>(),
  wallet: vi.fn<() => Promise<boolean>>(),
  groups: vi.fn<() => Promise<string[]>>(),
}));

vi.mock('../src/modules/pass/chat-gifts.repo.js', () => ({
  consumeChatGift: gift.consume,
  refundChatGift: gift.refund,
  listChatGiftHolders: gift.holders,
}));
vi.mock('../src/modules/pass/pass.repo.js', () => ({
  addQuestionCredits: vi.fn(),
  consumeGroupQuestion: vi.fn().mockResolvedValue(true),
  consumePassQuestion: gift.pass,
  consumeQuestionCredit: vi.fn().mockResolvedValue(false),
  findActivePass: vi.fn().mockResolvedValue(null),
  refundGroupQuestion: vi.fn(),
  refundPassQuestion: vi.fn(),
  listUserIdsNotified: gift.notified,
}));
vi.mock('../src/modules/users/users.repo.js', () => ({
  addWalletBalance: vi.fn(),
  deductWalletBalance: gift.wallet,
}));
vi.mock('../src/modules/user-groups/user-groups.repo.js', () => ({
  listGroupIdsForUser: gift.groups,
}));
vi.mock('../src/lib/notifications/notify-user.js', () => ({ notifyUser: gift.notify }));

import { chargeQuestion, refundQuestion } from '../src/modules/pass/question-billing.js';
import { chatPricingFact } from '../src/lib/chat-pricing.js';
import {
  chatGiftLaunchCopy,
  sendChatGiftLaunch,
  CHAT_GIFT_LAUNCH_TYPE,
  CHAT_GIFT_LAUNCH_TEST_TYPE,
} from '../src/modules/pass/chat-gift-launch.service.js';
import { DUSSEHRA_2026_GIFT } from '../src/config/chat-gifts.js';
import { categoryOf } from '../src/lib/notifications/notification-prefs.js';

beforeEach(() => {
  vi.clearAllMocks();
  gift.groups.mockResolvedValue([]);
  gift.pass.mockResolvedValue(true);
  gift.wallet.mockResolvedValue(true);
});

describe('billing with a gift running', () => {
  it('spends the gift before the Pass, and falls back to the Pass once it is gone', async () => {
    gift.consume.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await chargeQuestion('u1', 2000)).toBe('gift');
    expect(gift.pass).not.toHaveBeenCalled();
    expect(await chargeQuestion('u1', 2000)).toBe('pass');
  });

  it('counts a test-group member down from the gift too', async () => {
    gift.groups.mockResolvedValue(['g1']);
    gift.consume.mockResolvedValueOnce(true);
    expect(await chargeQuestion('u1', 2000)).toBe('gift');
  });

  it('never spends the gift on a free follow-up tap', async () => {
    expect(await chargeQuestion('u1', 0)).toBe('free');
    expect(gift.consume).not.toHaveBeenCalled();
  });

  it('gives an unanswered gift question back to the gift', async () => {
    await refundQuestion('u1', 'gift', 2000);
    expect(gift.refund).toHaveBeenCalledWith('u1');
  });

  it('tells the astrologer the question is on the house, with the price after it', () => {
    expect(chatPricingFact(2000, 'gift')).toMatch(
      /free gift question.*after the gift questions.*₹20/,
    );
  });
});

describe('the Dussehra announcement', () => {
  it('ends on 21 Oct 11:59 PM IST, with 2 questions', () => {
    expect(DUSSEHRA_2026_GIFT.questions).toBe(2);
    expect(DUSSEHRA_2026_GIFT.validUntil.toISOString()).toBe('2026-10-21T18:29:59.000Z');
  });

  it('says 2 questions and 11:59 in every language, and never says AI', () => {
    for (const locale of ['en', 'hi', 'bn', 'mr', 'te', 'ta', 'gu']) {
      const { title, body } = chatGiftLaunchCopy(locale);
      expect(body, locale).toMatch(/2|২/);
      expect(body, locale).toMatch(/11:59|১১:৫৯/);
      expect(`${title} ${body}`, locale).not.toMatch(/\bAI\b|artificial|एआई/i);
    }
    expect(chatGiftLaunchCopy('fr')).toEqual(chatGiftLaunchCopy('en'));
  });

  it('is filed under Offers, so a user who turned Offers off gets the bell only', () => {
    expect(categoryOf(CHAT_GIFT_LAUNCH_TYPE)).toBe('marketing');
    expect(categoryOf(CHAT_GIFT_LAUNCH_TEST_TYPE)).toBe('marketing');
  });

  it('reaches every gift holder once, in their language, opening the chat', async () => {
    gift.holders.mockResolvedValue([
      { userId: 'a', locale: 'hi' },
      { userId: 'b', locale: null },
      { userId: 'c', locale: 'ta' },
    ]);
    gift.notified.mockResolvedValue(new Set(['c']));
    const result = await sendChatGiftLaunch();
    expect(result).toEqual({ attempted: 2, failed: 0, skipped: 1 });
    expect(gift.notify).toHaveBeenCalledTimes(2);
    expect(gift.notify).toHaveBeenCalledWith('a', {
      ...chatGiftLaunchCopy('hi'),
      type: CHAT_GIFT_LAUNCH_TYPE,
      link: '/ai-chat',
    });
    expect(gift.notify).toHaveBeenCalledWith(
      'b',
      expect.objectContaining(chatGiftLaunchCopy('en')),
    );
  });

  it('a try-out goes to one user under its own type, so the real send still reaches them', async () => {
    await sendChatGiftLaunch({ onlyUser: { id: 'owner', locale: 'en' } });
    expect(gift.notify).toHaveBeenCalledWith(
      'owner',
      expect.objectContaining({ type: CHAT_GIFT_LAUNCH_TEST_TYPE }),
    );
    expect(gift.holders).not.toHaveBeenCalled();
  });
});
