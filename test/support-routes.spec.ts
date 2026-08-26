import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

// Route-level coverage for /v1/support/* and /v1/admin/support/*, mounted
// via the full createApp() (same convention as test/admin-routes.spec.ts /
// test/auth.spec.ts). Only the DB boundary (support.repo.js) and outbound
// side effects (Telegram, admin audit log) are mocked — support.service.ts
// itself runs for real.

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  touchUserLastActive: vi.fn().mockResolvedValue(undefined),
  createSupportTicket: vi.fn(),
  listSupportTicketsByUser: vi.fn(),
  listSupportTicketsForAdmin: vi.fn(),
  countSupportTicketsForAdmin: vi.fn(),
  updateSupportTicket: vi.fn(),
  notifySupportTicket: vi.fn().mockResolvedValue(true),
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

const fakeEnv = vi.hoisted(() => ({
  ADMIN_PHONE_E164: ['+919999111111'],
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: [],
  TELEGRAM_ADMIN_CHAT_IDS: [],
  TELEGRAM_READONLY_CHAT_IDS: [],
  TRUST_PROXY: false,
}));

vi.mock('../src/config/env.js', () => ({ env: fakeEnv, isProduction: false, isTest: true }));

vi.mock('firebase-admin/app', () => ({
  cert: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({ verifyIdToken: state.verifyIdToken })),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

// The support ticket creation route sits behind a per-route rate limiter
// (createTicketRateLimit) — stub Redis so it always reports "under the
// limit" instead of failing open via the real 250ms timeout path.
vi.mock('../src/config/redis.js', () => ({
  getRedis: () => ({
    eval: () => Promise.resolve([1, 60_000] as [number, number]),
  }),
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  findUserByFirebaseUid: state.findUserByFirebaseUid,
  touchUserLastActive: state.touchUserLastActive,
}));

vi.mock('../src/modules/support/support.repo.js', () => ({
  createSupportTicket: state.createSupportTicket,
  listSupportTicketsByUser: state.listSupportTicketsByUser,
  listSupportTicketsForAdmin: state.listSupportTicketsForAdmin,
  countSupportTicketsForAdmin: state.countSupportTicketsForAdmin,
  updateSupportTicket: state.updateSupportTicket,
}));

vi.mock('../src/lib/notifications/telegram.js', () => ({
  notifySupportTicket: state.notifySupportTicket,
}));

vi.mock('../src/modules/admin/admin.repo.js', () => ({
  logAdminAction: state.logAdminAction,
}));

const { createApp } = await import('../src/app.js');

const ADMIN_PHONE = '+919999111111';
const NON_ADMIN_PHONE = '+911111111111';

function authHeader() {
  return { Authorization: 'Bearer good-token' };
}

function signInAs(phone: string, userId = 'user-1') {
  state.verifyIdToken.mockResolvedValue(makeDecodedToken('uid-1', phone));
  state.findUserByFirebaseUid.mockResolvedValue(
    makeUserRow({ id: userId, firebaseUid: 'uid-1', phoneE164: phone }),
  );
}

function makeTicketRow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-07-25T00:00:00Z');
  return {
    id: 'ticket-1',
    userId: 'user-1',
    category: 'billing',
    message: 'My wallet top-up succeeded on Razorpay but the balance never updated.',
    locale: 'hi',
    appVersion: '1.4.2',
    status: 'open',
    adminNote: null,
    createdAt: now,
    resolvedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  for (const fn of Object.values(state)) {
    if (typeof fn === 'function' && 'mockReset' in fn) (fn as any).mockReset();
  }
  state.touchUserLastActive.mockResolvedValue(undefined);
  state.notifySupportTicket.mockResolvedValue(true);
  state.logAdminAction.mockResolvedValue(undefined);
});

describe('POST /v1/support/tickets', () => {
  it('creates a ticket and returns 201 with the caller-facing shape (no userId, but WITH adminNote — it is the support reply shown to the user)', async () => {
    signInAs(NON_ADMIN_PHONE);
    state.createSupportTicket.mockResolvedValue(makeTicketRow());
    const app = createApp();

    const res = await app.request('/v1/support/tickets', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'billing', message: 'My top-up never landed.' }),
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(201);
    expect(state.createSupportTicket).toHaveBeenCalledWith({
      userId: 'user-1',
      category: 'billing',
      message: 'My top-up never landed.',
      locale: null,
      appVersion: null,
    });
    expect(body).toEqual({
      id: 'ticket-1',
      category: 'billing',
      message: 'My wallet top-up succeeded on Razorpay but the balance never updated.',
      locale: 'hi',
      appVersion: '1.4.2',
      status: 'open',
      adminNote: null,
      createdAt: '2026-07-25T00:00:00.000Z',
      resolvedAt: null,
    });
    expect(body.userId).toBeUndefined();
  });

  it('fires the Telegram notification without the response awaiting it (fire-and-forget)', async () => {
    signInAs(NON_ADMIN_PHONE, 'user-9');
    state.createSupportTicket.mockResolvedValue(makeTicketRow({ userId: 'user-9' }));
    // Never resolves — if the route awaited this, the request would hang and
    // the test would time out. It doesn't, so the response still comes back.
    state.notifySupportTicket.mockReturnValue(new Promise(() => {}));
    const app = createApp();

    const res = await app.request('/v1/support/tickets', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'billing', message: 'Help please.' }),
    });

    expect(res.status).toBe(201);
    expect(state.notifySupportTicket).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-9', category: 'billing', message: 'Help please.' }),
    );
  });

  it('a Telegram failure never fails the ticket-creation request', async () => {
    signInAs(NON_ADMIN_PHONE);
    state.createSupportTicket.mockResolvedValue(makeTicketRow());
    state.notifySupportTicket.mockRejectedValue(new Error('Telegram down'));
    const app = createApp();

    const res = await app.request('/v1/support/tickets', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'billing', message: 'Help please.' }),
    });

    expect(res.status).toBe(201);
  });

  it('falls back to the user row locale/appVersion when the body omits them', async () => {
    signInAs(NON_ADMIN_PHONE);
    state.findUserByFirebaseUid.mockResolvedValue(
      makeUserRow({ id: 'user-1', firebaseUid: 'uid-1', locale: 'bn', appVersion: '2.0.0' }),
    );
    state.createSupportTicket.mockResolvedValue(makeTicketRow());
    const app = createApp();

    await app.request('/v1/support/tickets', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'billing', message: 'Help please.' }),
    });

    expect(state.createSupportTicket).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'bn', appVersion: '2.0.0' }),
    );
  });

  it('rejects a missing message (schema validation)', async () => {
    signInAs(NON_ADMIN_PHONE);
    const app = createApp();

    const res = await app.request('/v1/support/tickets', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'billing' }),
    });

    // @hono/zod-openapi's default validation hook returns 400 for a failed
    // request-schema check (same runtime behavior as the wallet route's
    // "zero deltaPaise" case in admin-routes.spec.ts) — the route's own
    // OpenAPI doc lists 422 as the documented failure response, which is
    // aspirational/doc-only and doesn't reflect what actually gets returned
    // without a custom `defaultHook`, which this app doesn't configure.
    expect(res.status).toBe(400);
    expect(state.createSupportTicket).not.toHaveBeenCalled();
  });

  it('returns 401 with no Authorization header', async () => {
    const app = createApp();

    const res = await app.request('/v1/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'billing', message: 'Help please.' }),
    });

    expect(res.status).toBe(401);
  });
});

describe('POST /v1/public/support/tickets', () => {
  function makeAnonTicketRow(overrides: Record<string, unknown> = {}) {
    const now = new Date('2026-08-26T00:00:00Z');
    return {
      id: 'ticket-2',
      userId: null,
      contactName: 'Priya Sharma',
      contactEmail: 'priya@example.com',
      category: 'billing',
      message: 'I was double-charged for my Kundli report.',
      locale: null,
      appVersion: null,
      status: 'open',
      adminNote: null,
      createdAt: now,
      resolvedAt: null,
      ...overrides,
    };
  }

  it('creates an anonymous ticket without an Authorization header and returns 201', async () => {
    state.createSupportTicket.mockResolvedValue(makeAnonTicketRow());
    const app = createApp();

    const res = await app.request('/v1/public/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Priya Sharma',
        email: 'priya@example.com',
        category: 'billing',
        message: 'I was double-charged for my Kundli report.',
        website: '',
      }),
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(201);
    expect(state.createSupportTicket).toHaveBeenCalledWith({
      contactName: 'Priya Sharma',
      contactEmail: 'priya@example.com',
      category: 'billing',
      message: 'I was double-charged for my Kundli report.',
    });
    expect(body.id).toBe('ticket-2');
    expect(body.userId).toBeUndefined();
  });

  it('notifies with userId: null and contact set to the submitted email', async () => {
    state.createSupportTicket.mockResolvedValue(makeAnonTicketRow());
    const app = createApp();

    await app.request('/v1/public/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Priya Sharma',
        email: 'priya@example.com',
        category: 'billing',
        message: 'I was double-charged for my Kundli report.',
        website: '',
      }),
    });

    expect(state.notifySupportTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        contact: 'priya@example.com',
        category: 'billing',
      }),
    );
  });

  it('silently drops the submission when the honeypot field is filled, but still returns 201', async () => {
    const app = createApp();

    const res = await app.request('/v1/public/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bot',
        email: 'bot@example.com',
        category: 'other',
        message: 'buy cheap watches',
        website: 'http://spam.example',
      }),
    });

    expect(res.status).toBe(201);
    expect(state.createSupportTicket).not.toHaveBeenCalled();
    expect(state.notifySupportTicket).not.toHaveBeenCalled();
  });

  it('rejects a missing email (schema validation)', async () => {
    const app = createApp();

    const res = await app.request('/v1/public/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Priya', category: 'billing', message: 'help' }),
    });

    // Same runtime behavior as the authenticated route's own "missing
    // message" test above: @hono/zod-openapi's default hook returns 400.
    expect(res.status).toBe(400);
    expect(state.createSupportTicket).not.toHaveBeenCalled();
  });

  it('requires no Authorization header (still succeeds with none)', async () => {
    state.createSupportTicket.mockResolvedValue(makeAnonTicketRow());
    const app = createApp();

    const res = await app.request('/v1/public/support/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Priya Sharma',
        email: 'priya@example.com',
        category: 'billing',
        message: 'help',
        website: '',
      }),
    });

    expect(res.status).toBe(201);
  });
});

describe('GET /v1/support/tickets', () => {
  it("returns only the caller's own tickets", async () => {
    signInAs(NON_ADMIN_PHONE, 'user-42');
    state.listSupportTicketsByUser.mockResolvedValue([
      makeTicketRow({ id: 't1', userId: 'user-42' }),
      makeTicketRow({ id: 't2', userId: 'user-42', status: 'resolved' }),
    ]);
    const app = createApp();

    const res = await app.request('/v1/support/tickets', { headers: authHeader() });
    const body = (await res.json()) as { tickets: { id: string; userId?: string }[] };

    expect(res.status).toBe(200);
    expect(state.listSupportTicketsByUser).toHaveBeenCalledWith('user-42');
    expect(body.tickets).toHaveLength(2);
    expect(body.tickets.every((t) => t.userId === undefined)).toBe(true);
  });

  it('returns 401 with no Authorization header', async () => {
    const app = createApp();
    const res = await app.request('/v1/support/tickets');
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/admin/support/tickets', () => {
  it('returns 403 for an authenticated non-admin phone', async () => {
    signInAs(NON_ADMIN_PHONE);
    const app = createApp();

    const res = await app.request('/v1/admin/support/tickets', { headers: authHeader() });

    expect(res.status).toBe(403);
    expect(state.listSupportTicketsForAdmin).not.toHaveBeenCalled();
  });

  it('returns 401 with no Authorization header', async () => {
    const app = createApp();
    const res = await app.request('/v1/admin/support/tickets');
    expect(res.status).toBe(401);
  });

  it('filters by userId', async () => {
    signInAs(ADMIN_PHONE);
    state.listSupportTicketsForAdmin.mockResolvedValue([makeTicketRow({ userId: 'user-7' })]);
    state.countSupportTicketsForAdmin.mockResolvedValue(1);
    const app = createApp();

    const res = await app.request(
      '/v1/admin/support/tickets?userId=00000000-0000-0000-0000-000000000007',
      { headers: authHeader() },
    );
    const body = (await res.json()) as { tickets: unknown[]; total: number };

    expect(res.status).toBe(200);
    expect(state.listSupportTicketsForAdmin).toHaveBeenCalledWith(
      { userId: '00000000-0000-0000-0000-000000000007', status: undefined },
      20,
      0,
    );
    expect(state.countSupportTicketsForAdmin).toHaveBeenCalledWith({
      userId: '00000000-0000-0000-0000-000000000007',
      status: undefined,
    });
    expect(body.total).toBe(1);
  });

  it('filters by status', async () => {
    signInAs(ADMIN_PHONE);
    state.listSupportTicketsForAdmin.mockResolvedValue([]);
    state.countSupportTicketsForAdmin.mockResolvedValue(0);
    const app = createApp();

    await app.request('/v1/admin/support/tickets?status=resolved', { headers: authHeader() });

    expect(state.listSupportTicketsForAdmin).toHaveBeenCalledWith(
      { userId: undefined, status: 'resolved' },
      20,
      0,
    );
  });

  it('paginates via offset/limit and returns adminNote/userId (admin-only fields)', async () => {
    signInAs(ADMIN_PHONE);
    state.listSupportTicketsForAdmin.mockResolvedValue([
      makeTicketRow({ adminNote: 'internal note' }),
    ]);
    state.countSupportTicketsForAdmin.mockResolvedValue(1);
    const app = createApp();

    const res = await app.request('/v1/admin/support/tickets?limit=5&offset=10', {
      headers: authHeader(),
    });
    const body = (await res.json()) as {
      tickets: { userId: string; adminNote: string | null }[];
      offset: number;
      limit: number;
    };

    expect(state.listSupportTicketsForAdmin).toHaveBeenCalledWith(
      { userId: undefined, status: undefined },
      5,
      10,
    );
    expect(body.offset).toBe(10);
    expect(body.limit).toBe(5);
    expect(body.tickets[0]?.userId).toBe('user-1');
    expect(body.tickets[0]?.adminNote).toBe('internal note');
  });

  it('audit-logs the read', async () => {
    signInAs(ADMIN_PHONE);
    state.listSupportTicketsForAdmin.mockResolvedValue([]);
    state.countSupportTicketsForAdmin.mockResolvedValue(0);
    const app = createApp();

    await app.request('/v1/admin/support/tickets?status=open', { headers: authHeader() });

    expect(state.logAdminAction).toHaveBeenCalledWith(
      ADMIN_PHONE,
      expect.stringContaining('/v1/admin/support/tickets'),
      expect.anything(),
    );
  });
});

describe('PATCH /v1/admin/support/tickets/{id}', () => {
  const ticketId = '00000000-0000-0000-0000-0000000000aa';

  it('returns 403 for an authenticated non-admin phone', async () => {
    signInAs(NON_ADMIN_PHONE);
    const app = createApp();

    const res = await app.request(`/v1/admin/support/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    });

    expect(res.status).toBe(403);
    expect(state.updateSupportTicket).not.toHaveBeenCalled();
  });

  it('updates status and stamps resolvedAt for a terminal status', async () => {
    signInAs(ADMIN_PHONE);
    state.updateSupportTicket.mockResolvedValue(
      makeTicketRow({
        id: ticketId,
        status: 'resolved',
        resolvedAt: new Date('2026-07-25T01:00:00Z'),
      }),
    );
    const app = createApp();

    const res = await app.request(`/v1/admin/support/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    });
    const body = (await res.json()) as { status: string; resolvedAt: string | null };

    expect(res.status).toBe(200);
    expect(state.updateSupportTicket).toHaveBeenCalledWith(
      ticketId,
      expect.objectContaining({ status: 'resolved', resolvedAt: expect.any(Date) }),
    );
    expect(body.status).toBe('resolved');
    expect(body.resolvedAt).not.toBeNull();
  });

  it('clears resolvedAt when moving away from a terminal status', async () => {
    signInAs(ADMIN_PHONE);
    state.updateSupportTicket.mockResolvedValue(
      makeTicketRow({ id: ticketId, status: 'open', resolvedAt: null }),
    );
    const app = createApp();

    await app.request(`/v1/admin/support/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    });

    expect(state.updateSupportTicket).toHaveBeenCalledWith(
      ticketId,
      expect.objectContaining({ status: 'open', resolvedAt: null }),
    );
  });

  it('updates adminNote without touching status/resolvedAt', async () => {
    signInAs(ADMIN_PHONE);
    state.updateSupportTicket.mockResolvedValue(
      makeTicketRow({ id: ticketId, adminNote: 'Refunded via dashboard.' }),
    );
    const app = createApp();

    await app.request(`/v1/admin/support/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminNote: 'Refunded via dashboard.' }),
    });

    expect(state.updateSupportTicket).toHaveBeenCalledWith(ticketId, {
      adminNote: 'Refunded via dashboard.',
    });
  });

  it('logs the admin action via logAdminAction', async () => {
    signInAs(ADMIN_PHONE);
    state.updateSupportTicket.mockResolvedValue(makeTicketRow({ id: ticketId, status: 'closed' }));
    const app = createApp();

    await app.request(`/v1/admin/support/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'closed' }),
    });

    expect(state.logAdminAction).toHaveBeenCalledWith(
      ADMIN_PHONE,
      expect.stringContaining(`/v1/admin/support/tickets/${ticketId}`),
      expect.objectContaining({ status: 'closed' }),
    );
  });

  it('returns 404 when the ticket does not exist', async () => {
    signInAs(ADMIN_PHONE);
    state.updateSupportTicket.mockResolvedValue(undefined);
    const app = createApp();

    const res = await app.request(`/v1/admin/support/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    });

    expect(res.status).toBe(404);
    expect(state.logAdminAction).not.toHaveBeenCalled();
  });

  it('rejects a body with neither status nor adminNote (schema validation)', async () => {
    signInAs(ADMIN_PHONE);
    const app = createApp();

    const res = await app.request(`/v1/admin/support/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    // See the "rejects a missing message" test above re: 400 vs. the route's
    // documented-but-not-enforced 422.
    expect(res.status).toBe(400);
    expect(state.updateSupportTicket).not.toHaveBeenCalled();
  });

  it('rejects a malformed (non-uuid) id (schema validation)', async () => {
    signInAs(ADMIN_PHONE);
    const app = createApp();

    const res = await app.request('/v1/admin/support/tickets/not-a-uuid', {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    });

    expect(res.status).toBe(400);
  });
});
