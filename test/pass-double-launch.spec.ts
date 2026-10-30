import { beforeEach, describe, expect, it, vi } from 'vitest';

const held = vi.hoisted(
  (): {
    audience: Array<{ userId: string; locale: string | null }>;
    sent: Set<string>;
  } => ({ audience: [], sent: new Set() }),
);
const state = vi.hoisted(() => ({ notifyUser: vi.fn() }));

vi.mock('../src/modules/gift-campaigns/gift-campaigns.repo.js', () => ({
  resolveAudience: () => Promise.resolve(held.audience),
}));
vi.mock('../src/modules/pass/pass.repo.js', () => ({
  listUserIdsNotified: () => Promise.resolve(held.sent),
}));
vi.mock('../src/lib/notifications/notify-user.js', () => ({ notifyUser: state.notifyUser }));

import {
  PASS_DOUBLE_LINK,
  PASS_DOUBLE_TEST_TYPE,
  PASS_DOUBLE_TYPE,
  passDoubleCopy,
  sendPassDouble,
} from '../src/modules/pass/pass-double-launch.service.js';
import { categoryOf } from '../src/lib/notifications/notification-prefs.js';
import { PASS_TIERS, QUESTION_PACKS } from '../src/modules/pass/pass.config.js';

beforeEach(() => {
  held.audience = [
    { userId: 'u1', locale: 'en' },
    { userId: 'u2', locale: 'bn-IN' },
    { userId: 'u3', locale: null },
  ];
  held.sent = new Set();
  state.notifyUser.mockReset().mockResolvedValue(undefined);
});

describe('sendPassDouble', () => {
  it('sends every user the notification in their language, opening the Pass page', async () => {
    const result = await sendPassDouble();

    expect(result).toEqual({ attempted: 3, failed: 0, skipped: 0 });
    expect(state.notifyUser).toHaveBeenCalledWith('u2', {
      ...passDoubleCopy('bn'),
      type: PASS_DOUBLE_TYPE,
      link: PASS_DOUBLE_LINK,
    });
    expect(state.notifyUser).toHaveBeenCalledWith(
      'u3',
      expect.objectContaining({ title: passDoubleCopy('en').title }),
    );
    expect(PASS_DOUBLE_LINK).toBe('/pass');
  });

  it('never sends twice: a second send only reaches the users the first one missed', async () => {
    held.sent = new Set(['u1', 'u3']);

    const result = await sendPassDouble();

    expect(result).toEqual({ attempted: 1, failed: 0, skipped: 2 });
    expect(state.notifyUser).toHaveBeenCalledTimes(1);
    expect(state.notifyUser.mock.calls[0]![0]).toBe('u2');
  });

  it('a try-out goes to that one user and does not count as their launch notification', async () => {
    await sendPassDouble({ onlyUser: { id: 'admin', locale: 'hi' } });

    expect(state.notifyUser).toHaveBeenCalledTimes(1);
    expect(state.notifyUser).toHaveBeenCalledWith(
      'admin',
      expect.objectContaining({ type: PASS_DOUBLE_TEST_TYPE, ...passDoubleCopy('hi') }),
    );
  });

  it('is filed under Offers, so a user who turned Offers off gets no push', () => {
    expect(categoryOf(PASS_DOUBLE_TYPE)).toBe('marketing');
    expect(categoryOf(PASS_DOUBLE_TEST_TYPE)).toBe('marketing');
  });

  it('names the top discount and never mentions AI, in every language', () => {
    const top = Math.max(...PASS_TIERS.map((t) => t.reportDiscountPct));
    for (const lang of ['en', 'hi', 'bn', 'mr', 'te', 'ta', 'gu']) {
      const { title, body } = passDoubleCopy(lang);
      expect(`${title} ${body}`, lang).toMatch(new RegExp(`${top}|${String(top).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]!)}`));
      expect(`${title} ${body}`, lang).not.toMatch(/\bAI\b/i);
    }
  });
});

describe('the doubled amounts', () => {
  it('Passes give 30 / 60 / 120 questions, 20 / 30 / 40 voice minutes and 20 / 30 / 40 % off', () => {
    expect(
      PASS_TIERS.map((t) => [t.tier, t.questions, t.voiceFreeMinutes, t.reportDiscountPct]),
    ).toEqual([
      ['silver', 30, 20, 20],
      ['gold', 60, 30, 30],
      ['platinum', 120, 40, 40],
    ]);
  });

  it('Question Packs hold 10 / 24 / 60 questions', () => {
    expect(QUESTION_PACKS.map((p) => [p.pack, p.questions])).toEqual([
      ['small', 10],
      ['medium', 24],
      ['large', 60],
    ]);
  });
});
