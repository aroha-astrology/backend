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

describe('roadmap step 3 routes ship dark', () => {
  it('GET /v1/calendar → 403 unless the calendar or its Home card is on', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({ 'nav.calendar': off, 'home.nextWindow': off });
    const res = await createApp().request('/v1/calendar', {
      headers: { Authorization: 'Bearer good-token' },
    });
    expect(res.status).toBe(403);
  });
});

describe('roadmap step 4 routes ship dark', () => {
  it('GET /v1/timeline and POST /v1/timeline/unlock → 403 while nav.lifeTimeline is off', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({
      'nav.lifeTimeline': off,
      'paid.lifeTimelineFull': off,
    });
    const get = await createApp().request('/v1/timeline', {
      headers: { Authorization: 'Bearer good-token' },
    });
    expect(get.status).toBe(403);
    expect((await post('/v1/timeline/unlock')).status).toBe(403);
  });
});

describe('roadmap step 6 routes ship dark', () => {
  it('POST /v1/decisions, POST /v1/find-date and GET /v1/decisions → 403 while their flags are off', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({
      'nav.decisions': off,
      'panchang.findMyDate': off,
    });
    expect(
      (await post('/v1/decisions', { category: 'careerChange', from: '2026-10-01', days: 30 }))
        .status,
    ).toBe(403);
    expect(
      (
        await post('/v1/find-date', {
          category: 'vehicle',
          place: { name: 'Pune', lat: 18.52, lon: 73.85, tz: 'Asia/Kolkata' },
          from: '2026-10-01',
          days: 30,
        })
      ).status,
    ).toBe(403);
    const list = await createApp().request('/v1/decisions', {
      headers: { Authorization: 'Bearer good-token' },
    });
    expect(list.status).toBe(403);
  });
});

describe('roadmap step 7 routes ship dark', () => {
  it('GET /v1/bonds, GET /v1/bonds/{id} and POST /v1/bonds/{id}/unlock → 403 while their flags are off', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({
      'nav.bonds': off,
      'home.bondsCard': off,
      'paid.bondInsight': off,
    });
    const id = '11111111-1111-4111-8111-111111111111';
    for (const path of ['/v1/bonds', `/v1/bonds/${id}`]) {
      const res = await createApp().request(path, {
        headers: { Authorization: 'Bearer good-token' },
      });
      expect(res.status, path).toBe(403);
    }
    expect((await post(`/v1/bonds/${id}/unlock`)).status).toBe(403);
  });
});

describe('roadmap step 8 routes ship dark', () => {
  it('the journal routes → 403 while nav.journal and home.journalPrompt are off', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({
      'nav.journal': off,
      'home.journalPrompt': off,
    });
    for (const path of ['/v1/journal', '/v1/journal/insights', '/v1/journal/life-events']) {
      const res = await createApp().request(path, {
        headers: { Authorization: 'Bearer good-token' },
      });
      expect(res.status, path).toBe(403);
    }
    const put = await createApp().request('/v1/journal/2026-09-25', {
      method: 'PUT',
      headers: { Authorization: 'Bearer good-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ mood: 4 }),
    });
    expect(put.status).toBe(403);
  });
});

describe('roadmap step 9 routes ship dark', () => {
  it("GET /v1/practice/today and POST /v1/practice/complete → 403 while Today's Practice is off", async () => {
    state.resolveFeaturesForUser.mockResolvedValue({
      'nav.dailyPractice': off,
      'home.dailyPractice': off,
    });
    const get = await createApp().request('/v1/practice/today', {
      headers: { Authorization: 'Bearer good-token' },
    });
    expect(get.status).toBe(403);
    expect((await post('/v1/practice/complete', { itemId: 'weekday' })).status).toBe(403);
  });
});

describe('roadmap step 10 routes ship dark', () => {
  it('the Pass and Question Pack routes → 403 while their flags are off', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({
      'nav.arohaPass': off,
      'paid.arohaPassPlay': off,
      'paid.questionPackSmall': off,
      'paid.questionPackMedium': off,
      'paid.questionPackLarge': off,
    });
    const get = await createApp().request('/v1/pass', {
      headers: { Authorization: 'Bearer good-token' },
    });
    expect(get.status).toBe(403);
    expect((await post('/v1/pass/wallet', { autoRenew: false })).status).toBe(403);
    expect((await post('/v1/pass/auto-renew', { on: false })).status).toBe(403);
    expect(
      (await post('/v1/pass/google-play', { productId: 'aroha_pass_monthly', purchaseToken: 't' }))
        .status,
    ).toBe(403);
    expect((await post('/v1/question-packs/small/buy')).status).toBe(403);
  });
});

describe('roadmap step 11 routes ship dark', () => {
  it('GET /v1/yantra and POST /v1/yantra/{kind}/buy → 403 while nav.digitalYantra is off', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({ 'nav.digitalYantra': off });
    const get = await createApp().request('/v1/yantra', {
      headers: { Authorization: 'Bearer good-token' },
    });
    expect(get.status).toBe(403);
    expect((await post('/v1/yantra/yantra/buy')).status).toBe(403);
  });
});

describe('roadmap step 12 routes ship dark', () => {
  it('the relocation routes → 403 while nav.relocation is off', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({
      'nav.relocation': off,
      'paid.relocation': off,
    });
    const get = await createApp().request('/v1/relocation', {
      headers: { Authorization: 'Bearer good-token' },
    });
    expect(get.status).toBe(403);
    expect((await post('/v1/relocation/unlock')).status).toBe(403);
    expect(
      (await post('/v1/relocation/compare', { places: [{ name: 'London', lat: 51.5, lon: -0.1 }] }))
        .status,
    ).toBe(403);
  });
});
