import { beforeEach, describe, expect, it, vi } from 'vitest';

const held = vi.hoisted(
  (): {
    audience: Array<{ userId: string; locale: string | null }>;
    sent: Set<string>;
    tokens: Array<{ userId: string }>;
    allowed: Set<string>;
  } => ({ audience: [], sent: new Set(), tokens: [], allowed: new Set() }),
);
const state = vi.hoisted(() => ({ notifyUser: vi.fn() }));

vi.mock('../src/modules/gift-campaigns/gift-campaigns.repo.js', () => ({
  resolveAudience: () => Promise.resolve(held.audience),
}));
vi.mock('../src/modules/pass/pass.repo.js', () => ({
  listUserIdsNotified: () => Promise.resolve(held.sent),
}));
vi.mock('../src/modules/device-tokens/device-tokens.repo.js', () => ({
  getAllActiveTokens: () => Promise.resolve(held.tokens),
}));
vi.mock('../src/lib/notifications/notify-user.js', () => ({ notifyUser: state.notifyUser }));
vi.mock('../src/lib/notifications/notification-prefs.js', async (orig) => ({
  ...(await orig<typeof import('../src/lib/notifications/notification-prefs.js')>()),
  pushAllowedUserIds: () => Promise.resolve(held.allowed),
}));

import {
  VARSHIK_LAUNCH_PUSH_COPY,
  VARSHIK_LAUNCH_PUSH_LINK,
  VARSHIK_LAUNCH_PUSH_TEST_TYPE,
  VARSHIK_LAUNCH_PUSH_TYPE,
  previewVarshikLaunch,
  sendVarshikLaunch,
  sendVarshikLaunchTest,
  varshikLaunchCopy,
} from '../src/modules/admin/varshik-launch-push.service.js';
import { categoryOf } from '../src/lib/notifications/notification-prefs.js';

const APP_LANGUAGES = ['en', 'hi', 'bn', 'mr', 'te', 'ta', 'gu', 'kn', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ru'];

beforeEach(() => {
  held.audience = [
    { userId: 'u1', locale: 'en' },
    { userId: 'u2', locale: 'bn-IN' },
    { userId: 'u3', locale: null },
  ];
  held.sent = new Set();
  held.tokens = [{ userId: 'u1' }, { userId: 'u2' }];
  held.allowed = new Set(['u1']);
  state.notifyUser.mockReset().mockResolvedValue(undefined);
});

describe('the Varshik launch push copy', () => {
  it('has the owner\'s English text and all 15 app languages', () => {
    expect(VARSHIK_LAUNCH_PUSH_COPY.en).toEqual({
      title: 'Varshik Rashifal 2027 is live',
      body: 'Your year ahead, month by month, read from your own birth chart. Open Reports to see it.',
    });
    expect(Object.keys(VARSHIK_LAUNCH_PUSH_COPY).sort()).toEqual([...APP_LANGUAGES].sort());
  });

  it('keeps the report name, and has no dashes, AI or technology names', () => {
    for (const [lang, c] of Object.entries(VARSHIK_LAUNCH_PUSH_COPY)) {
      expect(c.title, lang).toContain('Varshik Rashifal 2027');
      expect(`${c.title} ${c.body}`, lang).not.toMatch(/[–—]|\bAI\b|gemini|gpt|openai|claude/i);
    }
  });

  it('writes each Indian language in its own script only', () => {
    const scripts: Record<string, RegExp> = {
      hi: /[ऀ-ॿ]/, mr: /[ऀ-ॿ]/, bn: /[ঀ-৿]/, gu: /[઀-૿]/,
      ta: /[஀-௿]/, te: /[ఀ-౿]/, kn: /[ಀ-೿]/,
    };
    const all = Object.values(scripts);
    for (const [lang, re] of Object.entries(scripts)) {
      const text = VARSHIK_LAUNCH_PUSH_COPY[lang]!.body.replace(/[।॥]/g, '');
      expect(re.test(text), lang).toBe(true);
      const foreign = all.filter((o) => o.source !== re.source);
      expect(
        foreign.some((o) => o.test(text)),
        lang,
      ).toBe(false);
    }
  });

  it('picks the language from the locale, English when unknown', () => {
    expect(varshikLaunchCopy('hi-IN')).toBe(VARSHIK_LAUNCH_PUSH_COPY.hi);
    expect(varshikLaunchCopy('kn')).toBe(VARSHIK_LAUNCH_PUSH_COPY.kn);
    expect(varshikLaunchCopy('xx')).toBe(VARSHIK_LAUNCH_PUSH_COPY.en);
    expect(varshikLaunchCopy(null)).toBe(VARSHIK_LAUNCH_PUSH_COPY.en);
  });

  it('is filed under Offers so that switching Offers off is respected', () => {
    expect(categoryOf(VARSHIK_LAUNCH_PUSH_TYPE)).toBe('marketing');
    expect(categoryOf(VARSHIK_LAUNCH_PUSH_TEST_TYPE)).toBe('marketing');
  });
});

describe('the Varshik launch push send', () => {
  it('previews who would get it, by language, without sending', async () => {
    held.sent = new Set(['u3']);
    const p = await previewVarshikLaunch();
    expect(p).toMatchObject({ eligibleCount: 2, pushableCount: 1, alreadySentCount: 1, byLanguage: { en: 1, bn: 1 } });
    expect(state.notifyUser).not.toHaveBeenCalled();
  });

  it('sends each user their language, once', async () => {
    const r = await sendVarshikLaunch();
    expect(r).toEqual({ attempted: 3, failed: 0 });
    expect(state.notifyUser).toHaveBeenCalledWith('u2', {
      ...VARSHIK_LAUNCH_PUSH_COPY.bn,
      type: VARSHIK_LAUNCH_PUSH_TYPE,
      link: VARSHIK_LAUNCH_PUSH_LINK,
    });
    state.notifyUser.mockClear();
    held.sent = new Set(['u1', 'u3']);
    expect(await sendVarshikLaunch()).toEqual({ attempted: 1, failed: 0 });
    expect(state.notifyUser.mock.calls[0]![0]).toBe('u2');
  });

  it('a try-out reaches only that user and does not count as their launch notification', async () => {
    await sendVarshikLaunchTest({ id: 'admin', locale: 'hi' });
    expect(state.notifyUser).toHaveBeenCalledTimes(1);
    expect(state.notifyUser).toHaveBeenCalledWith('admin', {
      ...VARSHIK_LAUNCH_PUSH_COPY.hi,
      type: VARSHIK_LAUNCH_PUSH_TEST_TYPE,
      link: VARSHIK_LAUNCH_PUSH_LINK,
    });
  });
});
