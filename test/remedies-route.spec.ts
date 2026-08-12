import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUserRow, makeProfileContext } from './helpers/mocks.js';
import type * as AstroService from '../src/modules/astro/astro.service.js';
import type { PlaceOfBirth } from '../src/db/schema.js';

// Coverage for the previously-missing GET /v1/remedies route (astro.routes.ts):
// - requires auth (401 without a token), matching every other user-scoped route.
// - resolves the currently active profile and, when it has complete birth data,
//   builds the birthData argument for getRemedies from it (planet-specific path).
// - degrades to `undefined` (general remedies) when the active profile is
//   missing any required birth-data piece, exactly matching getRemedies' own
//   existing degrade-gracefully contract.

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  resolveActiveProfileContext: vi.fn(),
  getRemedies: vi.fn(),
  findRemedyInsight: vi.fn(),
  remedyInsightForLanguage: vi.fn(),
  requestRemedyInsightGeneration: vi.fn(),
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

vi.mock('../src/modules/birth-profiles/profile-context.js', () => ({
  resolveActiveProfileContext: state.resolveActiveProfileContext,
}));

vi.mock('../src/modules/astro/astro.service.js', async () => {
  const actual = await vi.importActual<typeof AstroService>(
    '../src/modules/astro/astro.service.js',
  );
  return { ...actual, getRemedies: state.getRemedies };
});

// The plain-language layer is DB- and LLM-backed; this spec covers the route's
// birthData wiring, so it is stubbed out. Its own behaviour lives in
// remedy-insight.spec.ts.
vi.mock('../src/modules/astro/remedy-insight.service.js', () => ({
  findRemedyInsight: state.findRemedyInsight,
  remedyInsightForLanguage: state.remedyInsightForLanguage,
  requestRemedyInsightGeneration: state.requestRemedyInsightGeneration,
  isRemedyInsightStale: () => false,
}));

const { createApp } = await import('../src/app.js');

// getRemedies returns { remedies, debts } — the karmic debts (Rin) travel
// alongside the per-planet list so the page can render them as their own
// section. Debts are only ever present ones, so the general/chartless path
// carries an empty array.
const PLANET_SPECIFIC_RESULT = {
  remedies: [
    {
      planet: 'Saturn',
      title: 'Saturn in your 8th house',
      icon: 'shield',
      remedy: 'Donate black sesame.',
      remedies: ['Donate black sesame.'],
      totke: ['Float a coconut in a river on Saturdays'],
      natalHouse: 8,
    },
  ],
  debts: [
    {
      type: 'Pitra Rin',
      present: true,
      indicators: ['Sun afflicted'],
      remedies: ['Feed 100 cows'],
    },
  ],
};
const GENERAL_RESULT = {
  remedies: [
    {
      planet: 'General',
      title: 'General Wellbeing',
      icon: 'sparkles',
      remedy: 'Practice gratitude.',
    },
  ],
  debts: [],
};

async function callRemedies() {
  const app = createApp();
  return app.request('/v1/remedies', {
    method: 'GET',
    headers: { Authorization: 'Bearer good-token' },
  });
}

beforeEach(() => {
  state.verifyIdToken.mockReset().mockResolvedValue({ uid: 'firebase-uid-1' });
  state.findUserByFirebaseUid.mockReset();
  state.resolveActiveProfileContext.mockReset();
  state.getRemedies.mockReset();
  state.findRemedyInsight.mockReset().mockResolvedValue(undefined);
  state.remedyInsightForLanguage.mockReset();
  state.requestRemedyInsightGeneration.mockReset().mockResolvedValue('generated');
});

describe('GET /v1/remedies', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    const app = createApp();
    const res = await app.request('/v1/remedies', { method: 'GET' });
    expect(res.status).toBe(401);
    expect(state.resolveActiveProfileContext).not.toHaveBeenCalled();
  });

  it('returns 401 when the token is invalid', async () => {
    state.verifyIdToken.mockRejectedValueOnce(new Error('bad token'));
    const app = createApp();
    const res = await app.request('/v1/remedies', {
      method: 'GET',
      headers: { Authorization: 'Bearer bad-token' },
    });
    expect(res.status).toBe(401);
  });

  it('builds birthData from the active profile and returns planet-specific remedies when the profile has complete birth data', async () => {
    const user = makeUserRow({ id: 'user-1', activeProfileId: null });
    state.findUserByFirebaseUid.mockResolvedValue(user);
    state.resolveActiveProfileContext.mockResolvedValue(
      makeProfileContext({
        birthProfileId: null,
        dateOfBirth: '1990-05-15',
        timeOfBirth: '14:30',
        placeOfBirth: { name: 'Delhi, India', lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata' },
      }),
    );
    state.getRemedies.mockResolvedValue(PLANET_SPECIFIC_RESULT);

    const res = await callRemedies();

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      remedies: unknown[];
      debts: unknown[];
      simple: unknown;
      simpleStatus: string;
    };
    expect(body.remedies).toEqual(PLANET_SPECIFIC_RESULT.remedies);
    expect(body.debts).toEqual(PLANET_SPECIFIC_RESULT.debts);
    // No cached insight yet, so the page ships its deterministic half now and
    // kicks off generation in the background.
    expect(body.simple).toBeNull();
    expect(body.simpleStatus).toBe('generating');
    expect(state.requestRemedyInsightGeneration).toHaveBeenCalled();
    expect(state.getRemedies).toHaveBeenCalledWith({
      date: '1990-05-15',
      time: '14:30',
      latitude: 28.6139,
      longitude: 77.209,
      timezone: 'Asia/Kolkata',
    });
  });

  it('passes undefined (general-remedies fallback) when the active profile is missing birth data', async () => {
    const user = makeUserRow({ id: 'user-1', activeProfileId: null });
    state.findUserByFirebaseUid.mockResolvedValue(user);
    state.resolveActiveProfileContext.mockResolvedValue(
      makeProfileContext({
        birthProfileId: null,
        dateOfBirth: null,
        timeOfBirth: null,
        placeOfBirth: null,
      }),
    );
    state.getRemedies.mockResolvedValue(GENERAL_RESULT);

    const res = await callRemedies();

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      remedies: unknown[];
      debts: unknown[];
      simple: unknown;
      simpleStatus: string;
    };
    expect(body.remedies).toEqual(GENERAL_RESULT.remedies);
    expect(body.debts).toEqual(GENERAL_RESULT.debts);
    // Chartless general remedies have nothing to explain, so generation must
    // not be started — that would burn an LLM call per signed-out-ish profile.
    expect(body.simple).toBeNull();
    expect(body.simpleStatus).toBe('unavailable');
    expect(state.requestRemedyInsightGeneration).not.toHaveBeenCalled();
    expect(state.getRemedies).toHaveBeenCalledWith(undefined);
  });

  it('serves the cached plain-language layer when one is ready, without regenerating', async () => {
    const user = makeUserRow({ id: 'user-1', activeProfileId: null });
    state.findUserByFirebaseUid.mockResolvedValue(user);
    state.resolveActiveProfileContext.mockResolvedValue(
      makeProfileContext({
        birthProfileId: null,
        dateOfBirth: '1990-05-15',
        timeOfBirth: '14:30',
        placeOfBirth: { name: 'Delhi, India', lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata' },
      }),
    );
    state.getRemedies.mockResolvedValue(PLANET_SPECIFIC_RESULT);
    state.findRemedyInsight.mockResolvedValue({ status: 'ready' });
    const narrative = {
      intro: 'Small steady habits.',
      planets: { Saturn: 'Saturn sits deep.' },
      debts: {},
    };
    state.remedyInsightForLanguage.mockResolvedValue(narrative);

    const res = await callRemedies();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { simple: unknown; simpleStatus: string };
    expect(body.simple).toEqual(narrative);
    expect(body.simpleStatus).toBe('ready');
    expect(state.requestRemedyInsightGeneration).not.toHaveBeenCalled();
  });

  it('passes undefined when the active profile has a date/time but no place of birth', async () => {
    const user = makeUserRow({ id: 'user-1', activeProfileId: 'profile-a' });
    state.findUserByFirebaseUid.mockResolvedValue(user);
    state.resolveActiveProfileContext.mockResolvedValue(
      makeProfileContext({
        birthProfileId: 'profile-a',
        dateOfBirth: '1992-08-15',
        timeOfBirth: '09:00',
        placeOfBirth: null,
      }),
    );
    state.getRemedies.mockResolvedValue(GENERAL_RESULT);

    const res = await callRemedies();

    expect(res.status).toBe(200);
    expect(state.getRemedies).toHaveBeenCalledWith(undefined);
    expect(state.resolveActiveProfileContext).toHaveBeenCalledWith(user);
  });

  it('passes undefined when placeOfBirth is present but missing tz (partial/corrupted geocode data) — the boundary case that justifies checking lat/lon/tz separately rather than just placeOfBirth != null', async () => {
    const user = makeUserRow({ id: 'user-1', activeProfileId: 'profile-a' });
    state.findUserByFirebaseUid.mockResolvedValue(user);
    state.resolveActiveProfileContext.mockResolvedValue(
      makeProfileContext({
        birthProfileId: 'profile-a',
        dateOfBirth: '1992-08-15',
        timeOfBirth: '09:00',
        // Deliberately invalid-shaped fixture: lat/lon present, tz missing —
        // simulates corrupted/partial geocode data. PlaceOfBirth's lat/lon/tz
        // are non-optional, so the cast is needed to construct this on purpose.
        placeOfBirth: { name: 'Delhi, India', lat: 28.6139, lon: 77.209 } as PlaceOfBirth,
      }),
    );
    state.getRemedies.mockResolvedValue(GENERAL_RESULT);

    const res = await callRemedies();

    expect(res.status).toBe(200);
    expect(state.getRemedies).toHaveBeenCalledWith(undefined);
  });

  it('passes undefined when placeOfBirth has lat but is missing lon', async () => {
    const user = makeUserRow({ id: 'user-1', activeProfileId: 'profile-a' });
    state.findUserByFirebaseUid.mockResolvedValue(user);
    state.resolveActiveProfileContext.mockResolvedValue(
      makeProfileContext({
        birthProfileId: 'profile-a',
        dateOfBirth: '1992-08-15',
        timeOfBirth: '09:00',
        placeOfBirth: {
          name: 'Delhi, India',
          lat: 28.6139,
          tz: 'Asia/Kolkata',
        } as PlaceOfBirth,
      }),
    );
    state.getRemedies.mockResolvedValue(GENERAL_RESULT);

    const res = await callRemedies();

    expect(res.status).toBe(200);
    expect(state.getRemedies).toHaveBeenCalledWith(undefined);
  });
});
