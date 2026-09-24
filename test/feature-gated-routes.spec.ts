import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUserRow } from './helpers/mocks.js';

// Routes whose only UI entry point is behind a default-off flag must refuse
// direct API calls too while that flag is off (2026-09-24). GET /v1/remedies
// has its own coverage in remedies-route.spec.ts.

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  resolveFeaturesForUser: vi.fn(),
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

const { createApp } = await import('../src/app.js');

const off = {
  enabled: false,
  pricePaise: null,
  originalPricePaise: null,
  model: null,
  enabledAt: null,
};

beforeEach(() => {
  state.verifyIdToken.mockReset().mockResolvedValue({ uid: 'firebase-uid-1' });
  state.findUserByFirebaseUid.mockReset().mockResolvedValue(makeUserRow({ id: 'user-1' }));
  state.resolveFeaturesForUser.mockReset();
});

async function post(path: string, body?: unknown) {
  return createApp().request(path, {
    method: 'POST',
    headers: { Authorization: 'Bearer good-token', 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('flag-gated routes refuse direct calls while their flag is off', () => {
  it('POST /v1/rectify → 403 while home.birthTimeRectify is off', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({ 'home.birthTimeRectify': off });
    const res = await post('/v1/rectify', {
      events: [
        { date: '2015-06-01', domain: 'job_started' },
        { date: '2018-02-10', domain: 'marriage' },
        { date: '2020-09-15', domain: 'childbirth' },
      ],
    });
    expect(res.status).toBe(403);
  });

  it('POST /v1/palm/readings/{id}/analyze → 403 while home.palmReading is off', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({ 'home.palmReading': off });
    const res = await post('/v1/palm/readings/00000000-0000-4000-8000-000000000001/analyze');
    expect(res.status).toBe(403);
  });
});

describe('roadmap step 1 routes ship dark', () => {
  it('GET /v1/why → 403 while home.whyAroha is off (its registry default)', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({ 'home.whyAroha': off });
    const res = await createApp().request('/v1/why?area=career', {
      headers: { Authorization: 'Bearer good-token' },
    });
    expect(res.status).toBe(403);
  });

  it('GET /v1/birth-time and POST /v1/birth-time/check → 403 while home.birthTimeConfidence is off', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({ 'home.birthTimeConfidence': off });
    const status = await createApp().request('/v1/birth-time', {
      headers: { Authorization: 'Bearer good-token' },
    });
    expect(status.status).toBe(403);
    const check = await post('/v1/birth-time/check', {
      events: [
        { date: '2015-06-01', domain: 'job_started' },
        { date: '2018-02-10', domain: 'marriage' },
        { date: '2020-09-15', domain: 'childbirth' },
      ],
    });
    expect(check.status).toBe(403);
  });
});

describe('roadmap step 2 routes ship dark', () => {
  it('GET /v1/astro-weather → 403 unless Astro Weather or Your Day is on', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({
      'home.astroWeather': off,
      'home.yourDay': off,
    });
    const res = await createApp().request('/v1/astro-weather', {
      headers: { Authorization: 'Bearer good-token' },
    });
    expect(res.status).toBe(403);
  });

  it('treats a key missing from the resolved map as off', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({});
    const res = await createApp().request('/v1/astro-weather', {
      headers: { Authorization: 'Bearer good-token' },
    });
    expect(res.status).toBe(403);
  });
});
