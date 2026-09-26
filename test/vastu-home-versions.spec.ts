import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VastuHomeRow, VastuHomeVersionRow } from '../src/db/schema.js';
import { makeUserRow } from './helpers/mocks.js';

// Vastu Studio: home version history. Service level with the repo mocked (ownership,
// the per-home cap, restore snapshotting "Before restore" first), plus the routes
// through the real app for the nav.vastu gate and uuid validation.

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  resolveFeaturesForUser: vi.fn(),
  findHomeForUser: vi.fn(),
  updateHomeForUser: vi.fn(),
  insertHomeVersion: vi.fn(),
  listHomeVersionsForUser: vi.fn(),
  listHomeVersionIdsForUser: vi.fn(),
  findHomeVersionForUser: vi.fn(),
  deleteHomeVersionsForUser: vi.fn(),
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
  deductWalletBalance: vi.fn(),
  addWalletBalance: vi.fn(),
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

vi.mock('../src/modules/kundli/kundli.repo.js', () => ({
  findKundliByUserId: vi.fn(),
}));

vi.mock('../src/modules/vastu/vastu.repo.js', () => ({
  insertPendingPlan: vi.fn(),
  findPlanForUser: vi.fn(),
  countRecentPlansForUser: vi.fn().mockResolvedValue(0),
  markProcessing: vi.fn(),
  markDone: vi.fn(),
  markError: vi.fn(),
  saveFollowUpIfAbsent: vi.fn(),
  listPlansForUser: vi.fn(),
  deletePlanForUser: vi.fn(),
  saveVastuTranslation: vi.fn(),
  findStaleProcessingPlans: vi.fn(),
  insertHome: vi.fn(),
  listHomesForUser: vi.fn(),
  countHomesForUser: vi.fn(),
  findHomeForUser: state.findHomeForUser,
  updateHomeForUser: state.updateHomeForUser,
  deleteHomeForUser: vi.fn(),
  insertHomeVersion: state.insertHomeVersion,
  listHomeVersionsForUser: state.listHomeVersionsForUser,
  listHomeVersionIdsForUser: state.listHomeVersionIdsForUser,
  findHomeVersionForUser: state.findHomeVersionForUser,
  deleteHomeVersionsForUser: state.deleteHomeVersionsForUser,
}));

vi.mock('../src/lib/llm/vastu.js', () => ({
  generateVastuAnalysis: vi.fn(),
  generateVastuAnswer: vi.fn(),
  translateVastuContent: vi.fn(),
}));

const svc = await import('../src/modules/vastu/vastu.service.js');
const { createApp } = await import('../src/app.js');

const now = new Date('2026-09-25T00:00:00Z');
const HOME_ID = '00000000-0000-4000-8000-000000000001';
const VERSION_ID = '00000000-0000-4000-8000-000000000002';
const currentLayout = { plot: [], rooms: [{ id: 'k' }], northOffsetDeg: 0 };
const oldLayout = { plot: [], rooms: [], northOffsetDeg: 15 };

function homeRow(overrides: Partial<VastuHomeRow> = {}): VastuHomeRow {
  return {
    id: HOME_ID,
    userId: 'user-1',
    birthProfileId: null,
    name: 'My Home',
    layout: currentLayout,
    overallScore: 90,
    ruleSetId: 'aroha-traditional-v1',
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function versionRow(overrides: Partial<VastuHomeVersionRow> = {}): VastuHomeVersionRow {
  return {
    id: VERSION_ID,
    homeId: HOME_ID,
    userId: 'user-1',
    layout: oldLayout,
    overallScore: 70,
    ruleSetId: 'aroha-traditional-v1',
    label: 'Before moving the kitchen',
    createdAt: now,
    ...overrides,
  };
}

const flag = (enabled: boolean) => ({
  enabled,
  pricePaise: null,
  originalPricePaise: null,
  model: null,
  enabledAt: null,
});

const auth = { Authorization: 'Bearer good-token', 'Content-Type': 'application/json' };

beforeEach(() => {
  for (const fn of Object.values(state)) fn.mockReset();
  state.verifyIdToken.mockResolvedValue({ uid: 'firebase-uid-1' });
  state.findUserByFirebaseUid.mockResolvedValue(makeUserRow({ id: 'user-1' }));
  state.resolveFeaturesForUser.mockResolvedValue({});
  state.findHomeForUser.mockResolvedValue(homeRow());
  state.insertHomeVersion.mockImplementation((row: Partial<VastuHomeVersionRow>) =>
    Promise.resolve(versionRow({ id: 'new-version', ...row })),
  );
  state.listHomeVersionIdsForUser.mockResolvedValue([]);
  state.deleteHomeVersionsForUser.mockResolvedValue(undefined);
});

describe('saving a version', () => {
  it("404s on someone else's home and stores nothing", async () => {
    state.findHomeForUser.mockResolvedValue(undefined);
    await expect(svc.createHomeVersion(HOME_ID, 'user-2', {})).rejects.toThrow(
      'Vastu home not found',
    );
    expect(state.findHomeForUser).toHaveBeenCalledWith(HOME_ID, 'user-2');
    expect(state.insertHomeVersion).not.toHaveBeenCalled();
  });

  it("snapshots the home's stored layout, score and rule set", async () => {
    const dto = await svc.createHomeVersion(HOME_ID, 'user-1', { label: 'First draft' });
    expect(state.insertHomeVersion).toHaveBeenCalledWith({
      homeId: HOME_ID,
      userId: 'user-1',
      layout: currentLayout,
      overallScore: 90,
      ruleSetId: 'aroha-traditional-v1',
      label: 'First draft',
    });
    expect(dto).toEqual({
      id: 'new-version',
      homeId: HOME_ID,
      label: 'First draft',
      overallScore: 90,
      ruleSetId: 'aroha-traditional-v1',
      createdAt: now.toISOString(),
      layout: currentLayout,
    });
  });

  it('prunes the oldest versions once past the per-home cap', async () => {
    const ids = Array.from({ length: svc.MAX_VERSIONS_PER_HOME + 1 }, (_, i) => `v${i}`);
    state.listHomeVersionIdsForUser.mockResolvedValue(ids); // newest first
    await svc.createHomeVersion(HOME_ID, 'user-1', {});
    expect(state.deleteHomeVersionsForUser).toHaveBeenCalledWith(
      [`v${svc.MAX_VERSIONS_PER_HOME}`],
      HOME_ID,
      'user-1',
    );
  });

  it('prunes nothing while at or under the cap', async () => {
    state.listHomeVersionIdsForUser.mockResolvedValue(
      Array.from({ length: svc.MAX_VERSIONS_PER_HOME }, (_, i) => `v${i}`),
    );
    await svc.createHomeVersion(HOME_ID, 'user-1', {});
    expect(state.deleteHomeVersionsForUser).toHaveBeenCalledWith([], HOME_ID, 'user-1');
  });
});

describe('listing and reading versions', () => {
  it('the list has no layout', async () => {
    const { layout: _layout, ...summary } = versionRow();
    state.listHomeVersionsForUser.mockResolvedValue([summary]);
    const versions = await svc.getHomeVersionsForUser(HOME_ID, 'user-1');
    expect(state.listHomeVersionsForUser).toHaveBeenCalledWith(
      HOME_ID,
      'user-1',
      svc.MAX_VERSIONS_PER_HOME,
    );
    expect(versions).toEqual([
      {
        id: VERSION_ID,
        homeId: HOME_ID,
        label: 'Before moving the kitchen',
        overallScore: 70,
        ruleSetId: 'aroha-traditional-v1',
        createdAt: now.toISOString(),
      },
    ]);
    expect(versions[0]).not.toHaveProperty('layout');
  });

  it("404s listing someone else's home", async () => {
    state.findHomeForUser.mockResolvedValue(undefined);
    await expect(svc.getHomeVersionsForUser(HOME_ID, 'user-2')).rejects.toThrow(
      'Vastu home not found',
    );
    expect(state.listHomeVersionsForUser).not.toHaveBeenCalled();
  });

  it('one version includes its layout; a foreign one 404s', async () => {
    state.findHomeVersionForUser.mockResolvedValue(versionRow());
    const dto = await svc.getHomeVersionForUser(HOME_ID, VERSION_ID, 'user-1');
    expect(dto.layout).toEqual(oldLayout);
    expect(state.findHomeVersionForUser).toHaveBeenCalledWith(VERSION_ID, HOME_ID, 'user-1');

    state.findHomeVersionForUser.mockResolvedValue(undefined);
    await expect(svc.getHomeVersionForUser(HOME_ID, VERSION_ID, 'user-2')).rejects.toThrow(
      'Vastu home version not found',
    );
  });
});

describe('restoring a version', () => {
  it('snapshots "Before restore" first, then puts the version on the home', async () => {
    state.findHomeVersionForUser.mockResolvedValue(versionRow());
    state.updateHomeForUser.mockResolvedValue(homeRow({ layout: oldLayout, overallScore: 70 }));

    const dto = await svc.restoreHomeVersion(HOME_ID, VERSION_ID, 'user-1');

    expect(state.insertHomeVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        homeId: HOME_ID,
        userId: 'user-1',
        layout: currentLayout,
        overallScore: 90,
        label: 'Before restore',
      }),
    );
    expect(state.updateHomeForUser).toHaveBeenCalledWith(HOME_ID, 'user-1', {
      layout: oldLayout,
      overallScore: 70,
    });
    const snapshotOrder = state.insertHomeVersion.mock.invocationCallOrder[0] ?? Infinity;
    const updateOrder = state.updateHomeForUser.mock.invocationCallOrder[0] ?? -Infinity;
    expect(snapshotOrder).toBeLessThan(updateOrder);
    expect(dto.layout).toEqual(oldLayout);
    expect(dto.overallScore).toBe(70);
  });

  it("404s on someone else's version without snapshotting or updating", async () => {
    state.findHomeVersionForUser.mockResolvedValue(undefined);
    await expect(svc.restoreHomeVersion(HOME_ID, VERSION_ID, 'user-1')).rejects.toThrow(
      'Vastu home version not found',
    );
    expect(state.insertHomeVersion).not.toHaveBeenCalled();
    expect(state.updateHomeForUser).not.toHaveBeenCalled();
  });

  it("404s on someone else's home", async () => {
    state.findHomeForUser.mockResolvedValue(undefined);
    await expect(svc.restoreHomeVersion(HOME_ID, VERSION_ID, 'user-2')).rejects.toThrow(
      'Vastu home not found',
    );
    expect(state.insertHomeVersion).not.toHaveBeenCalled();
    expect(state.updateHomeForUser).not.toHaveBeenCalled();
  });
});

describe('routes', () => {
  const routes: Array<[string, string, string?]> = [
    ['POST', `/v1/vastu/homes/${HOME_ID}/versions`, '{}'],
    ['GET', `/v1/vastu/homes/${HOME_ID}/versions`],
    ['GET', `/v1/vastu/homes/${HOME_ID}/versions/${VERSION_ID}`],
    ['POST', `/v1/vastu/homes/${HOME_ID}/versions/${VERSION_ID}/restore`],
  ];

  it.each(routes)('%s %s → 403 while nav.vastu is off', async (method, path, body) => {
    state.resolveFeaturesForUser.mockResolvedValue({ 'nav.vastu': flag(false) });
    const res = await createApp().request(path, { method, headers: auth, body });
    expect(res.status).toBe(403);
    expect(state.findHomeForUser).not.toHaveBeenCalled();
    expect(state.findHomeVersionForUser).not.toHaveBeenCalled();
  });

  it('POST versions → 201 with the version DTO', async () => {
    const res = await createApp().request(`/v1/vastu/homes/${HOME_ID}/versions`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ label: 'Draft' }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: 'new-version', label: 'Draft' });
  });

  it('GET versions → { versions } (not parsed as a plan id)', async () => {
    state.listHomeVersionsForUser.mockResolvedValue([]);
    const res = await createApp().request(`/v1/vastu/homes/${HOME_ID}/versions`, {
      headers: auth,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ versions: [] });
  });

  it('rejects a label over 60 characters', async () => {
    const res = await createApp().request(`/v1/vastu/homes/${HOME_ID}/versions`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ label: 'x'.repeat(61) }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(state.insertHomeVersion).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid version id', async () => {
    const res = await createApp().request(`/v1/vastu/homes/${HOME_ID}/versions/nope/restore`, {
      method: 'POST',
      headers: auth,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(state.findHomeVersionForUser).not.toHaveBeenCalled();
  });
});
