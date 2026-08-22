import { describe, it, expect, vi, afterEach } from 'vitest';

const fakeEnv = {
  LOG_LEVEL: 'silent',
  TELEGRAM_BOT_TOKEN: 'tok',
  TELEGRAM_ALERT_CHAT_ID: '123',
  TELEGRAM_DOWNVOTE_EXTRA_CHAT_IDS: [],
  TELEGRAM_SUPPORT_EXTRA_CHAT_IDS: [],
};
vi.mock('../src/config/env.js', () => ({ env: fakeEnv, isProduction: false, isTest: true }));
vi.mock('../src/lib/notifications/support-email.js', () => ({
  emailSupportTicket: vi.fn(),
  emailDeletionRequest: vi.fn(),
}));

const { notifyWalletTopUp } = await import('../src/lib/notifications/telegram.js');

/** Every char MarkdownV2 reserves; unescaped, any one of them 400s the message. */
const RESERVED = /[-.!()#+=|{}]/;

type SendBody = { text: string; parse_mode?: string };

const ok = { ok: true, status: 200 } as Response;
const badRequest = { ok: false, status: 400 } as Response;

/** The JSON payload of the nth fetch call. */
function sentBody(mock: ReturnType<typeof vi.fn>, call: number): SendBody {
  const init = mock.mock.calls[call]?.[1] as { body: string };
  return JSON.parse(init.body) as SendBody;
}

describe('notifyWalletTopUp', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('escapes every MarkdownV2-reserved char outside code spans', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(ok));
    vi.stubGlobal('fetch', fetchMock);

    await notifyWalletTopUp({
      userId: 'u-1',
      contact: '+919876543210',
      amountPaise: 49950,
      newBalancePaise: 120050,
    });

    // Drop code spans (Telegram doesn't parse markup inside them) and every
    // already-escaped pair; anything reserved still standing is a 400.
    const bare = sentBody(fetchMock, 0)
      .text.replace(/`[^`]*`/g, '')
      .replace(/\\./g, '');
    expect(bare).not.toMatch(RESERVED);
  });

  it('falls back to plain text when Telegram rejects the markdown', async () => {
    const fetchMock = vi
      .fn(() => Promise.resolve(ok))
      .mockImplementationOnce(() => Promise.resolve(badRequest));
    vi.stubGlobal('fetch', fetchMock);

    const sent = await notifyWalletTopUp({ userId: 'u-1', amountPaise: 100, newBalancePaise: 100 });

    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBody(fetchMock, 1).parse_mode).toBeUndefined();
  });
});
