import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUserRow } from './helpers/mocks.js';

// Vastu Studio phase 0: the admin switches are enforced by the API itself
// (nav.vastu on every route, paid.vastu on the paid report), and /vastu/homes
// is routed to the homes handlers rather than parsed as a plan id.

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  resolveFeaturesForUser: vi.fn(),
  requestVastuAnalysis: vi.fn(),
  getHomesForUser: vi.fn(),
  createHome: vi.fn(),
  getPlanForUser: vi.fn(),
}));

vi.mock('firebase-admin/app', () => ({
  cert: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({ verifyIdToken: state.verifyIdToken })),
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  findUserByFirebaseUid: state.findUserByFirebaseUid,
  touchUserLastActive: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/modules/features/features.service.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, resolveFeaturesForUser: state.resolveFeaturesForUser };
});

vi.mock('../src/middleware/consent.js', () => ({
  requireConsent: async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../src/modules/birth-profiles/profile-context.js', () => ({
  resolveActiveProfileContext: vi.fn().mockResolvedValue({ birthProfileId: null }),
}));

vi.mock('../src/modules/vastu/vastu.service.js', () => ({
  requestVastuAnalysis: state.requestVastuAnalysis,
  askVastuQuestion: vi.fn(),
  getPlansForUser: vi.fn().mockResolvedValue([]),
  getPlanForUser: state.getPlanForUser,
  removePlanForUser: vi.fn(),
  createHome: state.createHome,
  getHomesForUser: state.getHomesForUser,
  getHomeForUser: vi.fn(),
  patchHomeForUser: vi.fn(),
  removeHomeForUser: vi.fn(),
  createHomeVersion: vi.fn(),
  getHomeVersionsForUser: vi.fn(),
  getHomeVersionForUser: vi.fn(),
  restoreHomeVersion: vi.fn(),
  reapStaleVastuPlans: vi.fn(),
}));

const { createApp } = await import('../src/app.js');

const flag = (enabled: boolean) => ({
  enabled,
  pricePaise: null,
  originalPricePaise: null,
  model: null,
  enabledAt: null,
});

const auth = { Authorization: 'Bearer good-token', 'Content-Type': 'application/json' };
const analyzeBody = { roomLayout: { kitchen: ['SE'] } };
const layout = {
  plot: [
    { x: 0, y: 0 },
    { x: 12, y: 0 },
    { x: 12, y: 12 },
  ],
  northOffsetDeg: 0,
  rooms: [],
};

beforeEach(() => {
  state.verifyIdToken.mockReset().mockResolvedValue({ uid: 'firebase-uid-1' });
  state.findUserByFirebaseUid.mockReset().mockResolvedValue(makeUserRow({ id: 'user-1' }));
  state.resolveFeaturesForUser.mockReset().mockResolvedValue({});
  state.requestVastuAnalysis.mockReset().mockResolvedValue({ planId: 'p1' });
  state.getHomesForUser.mockReset().mockResolvedValue([]);
  state.createHome.mockReset().mockResolvedValue({ id: 'h1' });
  state.getPlanForUser.mockReset();
});

describe('nav.vastu / paid.vastu enforcement', () => {
  it('POST /v1/vastu/analyze → 403 while nav.vastu is off, and nothing is charged', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({ 'nav.vastu': flag(false) });
    const res = await createApp().request('/v1/vastu/analyze', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify(analyzeBody),
    });
    expect(res.status).toBe(403);
    expect(state.requestVastuAnalysis).not.toHaveBeenCalled();
  });

  it('POST /v1/vastu/analyze → 403 while paid.vastu is off', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({
      'nav.vastu': flag(true),
      'paid.vastu': flag(false),
    });
    const res = await createApp().request('/v1/vastu/analyze', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify(analyzeBody),
    });
    expect(res.status).toBe(403);
    expect(state.requestVastuAnalysis).not.toHaveBeenCalled();
  });

  it('POST /v1/vastu/analyze → 200 when both switches are on', async () => {
    const res = await createApp().request('/v1/vastu/analyze', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify(analyzeBody),
    });
    expect(res.status).toBe(200);
    expect(state.requestVastuAnalysis).toHaveBeenCalledOnce();
  });

  it('GET /v1/vastu/homes → 403 while nav.vastu is off', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({ 'nav.vastu': flag(false) });
    const res = await createApp().request('/v1/vastu/homes', { headers: auth });
    expect(res.status).toBe(403);
  });
});

describe('homes routing', () => {
  it('GET /v1/vastu/homes lists homes (not treated as a plan id)', async () => {
    const res = await createApp().request('/v1/vastu/homes', { headers: auth });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ homes: [] });
    expect(state.getPlanForUser).not.toHaveBeenCalled();
  });

  it('POST /v1/vastu/homes → 201 with a valid layout', async () => {
    const res = await createApp().request('/v1/vastu/homes', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ name: 'My Home', layout }),
    });
    expect(res.status).toBe(201);
    expect(state.createHome).toHaveBeenCalledWith(
      'user-1',
      null,
      expect.objectContaining({ name: 'My Home' }),
    );
  });

  it('POST /v1/vastu/homes rejects a plot with fewer than 3 corners', async () => {
    const res = await createApp().request('/v1/vastu/homes', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        name: 'My Home',
        layout: { ...layout, plot: layout.plot.slice(0, 2) },
      }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(state.createHome).not.toHaveBeenCalled();
  });
});
