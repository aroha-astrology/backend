import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  countUsers: vi.fn(),
  listUsersPage: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  countUsers: state.countUsers,
  listUsersPage: state.listUsersPage,
}));

vi.mock('../src/lib/notifications/telegram.js', () => ({
  sendMessage: state.sendMessage,
}));

vi.mock('../src/config/env.js', () => ({
  env: {
    TELEGRAM_WEBHOOK_SECRET: 'test-secret',
    TELEGRAM_ALERT_CHAT_ID: '12345',
    LOG_LEVEL: 'silent',
    CORS_ORIGINS: [],
  },
  isProduction: false,
  isTest: true,
}));

const { createApp } = await import('../src/app.js');

describe('POST /internal/telegram/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 on missing webhook secret', async () => {
    const app = createApp();
    const res = await app.request('/internal/telegram/webhook', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });

  it('returns 403 on bad webhook secret', async () => {
    const app = createApp();
    const res = await app.request('/internal/telegram/webhook', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'wrong' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });

  it('returns 200 on non-message updates (always-200)', async () => {
    const app = createApp();
    const res = await app.request('/internal/telegram/webhook', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      body: JSON.stringify({ my_update: 'foo' }),
    });
    expect(res.status).toBe(200);
    expect(state.sendMessage).not.toHaveBeenCalled();
  });

  it('silently drops messages not from the admin chat', async () => {
    const app = createApp();
    const res = await app.request('/internal/telegram/webhook', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      body: JSON.stringify({ message: { chat: { id: 9999 }, text: '/users' } }),
    });
    expect(res.status).toBe(200);
    expect(state.sendMessage).not.toHaveBeenCalled();
  });

  it('handles /users command with pagination', async () => {
    state.countUsers.mockResolvedValue(100);
    state.listUsersPage.mockResolvedValue([
      { id: 'u1', email: 'test@example.com', createdAt: new Date() },
    ]);

    const app = createApp();
    const res = await app.request('/internal/telegram/webhook', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      body: JSON.stringify({ message: { chat: { id: 12345 }, text: '/users' } }),
    });
    expect(res.status).toBe(200);
    expect(state.countUsers).toHaveBeenCalled();
    expect(state.listUsersPage).toHaveBeenCalledWith(20, 0);
    expect(state.sendMessage).toHaveBeenCalledTimes(1);
    const reply = state.sendMessage.mock.calls[0][0];
    expect(reply).toContain('test@example.com');
  });

  it('handles /users <offset> command', async () => {
    state.countUsers.mockResolvedValue(100);
    state.listUsersPage.mockResolvedValue([]);

    const app = createApp();
    const res = await app.request('/internal/telegram/webhook', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      body: JSON.stringify({ message: { chat: { id: 12345 }, text: '/users 20' } }),
    });
    expect(res.status).toBe(200);
    expect(state.listUsersPage).toHaveBeenCalledWith(20, 20);
  });
});
