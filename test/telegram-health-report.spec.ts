import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/env.js', () => ({
  env: { LOG_LEVEL: 'silent', TELEGRAM_BOT_TOKEN: 'tok', TELEGRAM_ALERT_CHAT_ID: '1' },
  isProduction: false,
  isTest: true,
}));

const { sendHealthReport } = await import('../src/lib/notifications/telegram.js');

/**
 * Telegram answers 400 and drops the whole message if any MarkdownV2-reserved
 * character is unescaped — which is exactly how health reports went silently
 * missing. `*` is excluded: it's the intentional bold delimiter.
 */
const UNESCAPED_RESERVED = /(?<!\\)[_[\]()~`>#+\-=|{}.!]/;

describe('sendHealthReport', () => {
  it('escapes every MarkdownV2-reserved character in the payload', async () => {
    let text = '';
    vi.stubGlobal('fetch', (_url: string, init: { body: string }) => {
      text = JSON.parse(init.body).text;
      return Promise.resolve({ ok: true } as Response);
    });

    await sendHealthReport({
      db: { status: 'ok', latencyMs: 12 },
      redis: { status: 'fail', latencyMs: 3001, message: 'ECONNREFUSED (127.0.0.1:6379)' },
    });

    expect(text).not.toMatch(UNESCAPED_RESERVED);
  });
});
