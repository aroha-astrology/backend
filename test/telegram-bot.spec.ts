import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as TelegramLib from '../src/lib/notifications/telegram.js';

const state = vi.hoisted(() => ({
  countUsers: vi.fn(),
  listUsersPage: vi.fn(),
  sendMessage: vi.fn(),
  listActiveCoupons: vi.fn(),
  insertCoupon: vi.fn(),
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  countUsers: state.countUsers,
  listUsersPage: state.listUsersPage,
}));

vi.mock('../src/modules/billing/billing.repo.js', () => ({
  listActiveCoupons: state.listActiveCoupons,
  insertCoupon: state.insertCoupon,
}));

vi.mock('../src/lib/notifications/telegram.js', async (importOriginal) => {
  const actual = await importOriginal<typeof TelegramLib>();
  return {
    ...actual,
    sendMessage: state.sendMessage,
  };
});

vi.mock('../src/config/env.js', () => ({
  env: {
    TELEGRAM_WEBHOOK_SECRET: 'test-secret',
    TELEGRAM_ALERT_CHAT_ID: '12345',
    TELEGRAM_ADMIN_CHAT_IDS: ['67890'],
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

  it('accepts commands from an extra admin chat ID in TELEGRAM_ADMIN_CHAT_IDS', async () => {
    state.countUsers.mockResolvedValue(100);
    state.listUsersPage.mockResolvedValue([
      { id: 'u1', email: 'test@example.com', createdAt: new Date() },
    ]);

    const app = createApp();
    const res = await app.request('/internal/telegram/webhook', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      body: JSON.stringify({ message: { chat: { id: 67890 }, text: '/users' } }),
    });
    expect(res.status).toBe(200);
    expect(state.sendMessage).toHaveBeenCalledTimes(1);
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
    expect(reply).toContain('test@example');
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

  it('handles /coupons with active coupons', async () => {
    state.listActiveCoupons.mockResolvedValue([
      {
        id: 'c1',
        code: 'SUMMER20',
        discountType: 'percent',
        discountValue: 20,
        maxRedemptions: 100,
        redemptionCount: 3,
        expiresAt: new Date('2026-08-01T00:00:00Z'),
      },
    ]);

    const app = createApp();
    const res = await app.request('/internal/telegram/webhook', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      body: JSON.stringify({ message: { chat: { id: 12345 }, text: '/coupons' } }),
    });
    expect(res.status).toBe(200);
    expect(state.listActiveCoupons).toHaveBeenCalled();
    const reply = state.sendMessage.mock.calls[0][0];
    expect(reply).toContain('SUMMER20');
    expect(reply).toContain('20');
    expect(reply).toContain('3/100');
  });

  it('handles /coupons with no active coupons', async () => {
    state.listActiveCoupons.mockResolvedValue([]);

    const app = createApp();
    const res = await app.request('/internal/telegram/webhook', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      body: JSON.stringify({ message: { chat: { id: 12345 }, text: '/coupons' } }),
    });
    expect(res.status).toBe(200);
    const reply = state.sendMessage.mock.calls[0][0];
    expect(reply).toContain('No active coupons');
  });

  it('creates a coupon with /newcoupon code percent value', async () => {
    state.insertCoupon.mockResolvedValue({
      id: 'c2',
      code: 'SUMMER20',
      discountType: 'percent',
      discountValue: 20,
      maxRedemptions: null,
      redemptionCount: 0,
      expiresAt: null,
    });

    const app = createApp();
    const res = await app.request('/internal/telegram/webhook', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      body: JSON.stringify({
        message: { chat: { id: 12345 }, text: '/newcoupon summer20 percent 20' },
      }),
    });
    expect(res.status).toBe(200);
    expect(state.insertCoupon).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'SUMMER20',
        discountType: 'percent',
        discountValue: 20,
        maxRedemptions: null,
        expiresAt: null,
      }),
    );
    const reply = state.sendMessage.mock.calls[0][0];
    expect(reply).toContain('SUMMER20');
  });

  it('creates a coupon with /newcoupon code percent value maxRedemptions expiresInDays', async () => {
    state.insertCoupon.mockResolvedValue({
      id: 'c3',
      code: 'LIMITED10',
      discountType: 'percent',
      discountValue: 10,
      maxRedemptions: 100,
      redemptionCount: 0,
      expiresAt: new Date(),
    });

    const app = createApp();
    const res = await app.request('/internal/telegram/webhook', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      body: JSON.stringify({
        message: { chat: { id: 12345 }, text: '/newcoupon LIMITED10 percent 10 100 30' },
      }),
    });
    expect(res.status).toBe(200);
    expect(state.insertCoupon).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'LIMITED10',
        discountValue: 10,
        maxRedemptions: 100,
      }),
    );
    const call = state.insertCoupon.mock.calls[0][0];
    expect(call.expiresAt).toBeInstanceOf(Date);
  });

  it('rejects /newcoupon with missing args without calling insertCoupon', async () => {
    const app = createApp();
    const res = await app.request('/internal/telegram/webhook', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      body: JSON.stringify({
        message: { chat: { id: 12345 }, text: '/newcoupon SUMMER20 percent' },
      }),
    });
    expect(res.status).toBe(200);
    expect(state.insertCoupon).not.toHaveBeenCalled();
    const reply = state.sendMessage.mock.calls[0][0];
    expect(reply).toContain('newcoupon');
  });

  it('rejects /newcoupon with an out-of-range discount value', async () => {
    const app = createApp();
    const res = await app.request('/internal/telegram/webhook', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      body: JSON.stringify({
        message: { chat: { id: 12345 }, text: '/newcoupon SUMMER20 percent 150' },
      }),
    });
    expect(res.status).toBe(200);
    expect(state.insertCoupon).not.toHaveBeenCalled();
    const reply = state.sendMessage.mock.calls[0][0];
    expect(reply).toContain('1');
    expect(reply).toContain('100');
  });

  it('replies with a friendly message when the coupon code already exists', async () => {
    state.insertCoupon.mockRejectedValue({ code: '23505' });

    const app = createApp();
    const res = await app.request('/internal/telegram/webhook', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'test-secret' },
      body: JSON.stringify({
        message: { chat: { id: 12345 }, text: '/newcoupon SUMMER20 percent 20' },
      }),
    });
    expect(res.status).toBe(200);
    const reply = state.sendMessage.mock.calls[0][0];
    expect(reply).toContain('SUMMER20');
    expect(reply.toLowerCase()).toContain('already exists');
  });
});
