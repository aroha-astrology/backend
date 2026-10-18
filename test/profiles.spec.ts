import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BirthProfileRow } from '../src/db/schema.js';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  deductWalletBalance: vi.fn(),
  addWalletBalance: vi.fn(),
  updateUserById: vi.fn(),
  listBirthProfilesByOwner: vi.fn(),
  findOwnedBirthProfile: vi.fn(),
  hardDeleteOwnedBirthProfile: vi.fn(),
  createBirthProfile: vi.fn(),
  requestKundliGeneration: vi.fn(),
  touchUserLastActive: vi.fn(),
  claimFreeProfileSlot: vi.fn(),
  releaseFreeProfileSlot: vi.fn(),
  isFeatureOn: vi.fn(),
  hasPass: vi.fn(),
  grantSignupStage: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

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
  deductWalletBalance: state.deductWalletBalance,
  addWalletBalance: state.addWalletBalance,
  updateUserById: state.updateUserById,
  touchUserLastActive: state.touchUserLastActive,
  claimFreeProfileSlot: state.claimFreeProfileSlot,
  releaseFreeProfileSlot: state.releaseFreeProfileSlot,
  refundKeyFor: (key: string) => `refund:${key}`,
}));

// The v7 switches are off unless a test turns one on; everything else in features.service is real.
vi.mock('../src/modules/features/features.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/modules/features/features.service.js')>()),
  isFeatureOn: state.isFeatureOn,
}));

vi.mock('../src/lib/entitlements.js', () => ({ hasPass: state.hasPass }));

vi.mock('../src/modules/rewards/signup-drip.js', () => ({
  grantSignupStage: state.grantSignupStage,
}));

vi.mock('../src/modules/birth-profiles/birth-profiles.repo.js', () => ({
  listBirthProfilesByOwner: state.listBirthProfilesByOwner,
  findOwnedBirthProfile: state.findOwnedBirthProfile,
  hardDeleteOwnedBirthProfile: state.hardDeleteOwnedBirthProfile,
}));

vi.mock('../src/modules/birth-profiles/birth-profiles.service.js', () => ({
  createBirthProfile: state.createBirthProfile,
}));

vi.mock('../src/modules/kundli/kundli.service.js', () => ({
  requestKundliGeneration: state.requestKundliGeneration,
}));

const { createApp } = await import('../src/app.js');

const AUTH = { Authorization: 'Bearer token', 'Content-Type': 'application/json' } as const;

function makeBirthProfileRow(overrides: Partial<BirthProfileRow> = {}): BirthProfileRow {
  const now = new Date('2026-01-02T00:00:00Z');
  return {
    id: 'profile-a',
    ownerUserId: 'id-1',
    relationship: 'partner',
    displayName: 'Bob',
    gender: 'male',
    dateOfBirth: '1990-05-10',
    timeOfBirth: '08:15:00',
    placeOfBirth: { name: 'Delhi', lat: 28.6, lon: 77.2, tz: 'Asia/Kolkata' },
    birthTimeAccuracy: 'exact',
    birthTimeSource: 'birth_certificate',
    birthLocationAccuracy: 'exact',
    gotra: null,
    addedWithConsent: true,
    notes: null,
    unlockedHouses: [],
    gemstoneUnlockedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

const CREATE_BODY = {
  displayName: 'Alice Partner',
  gender: 'female',
  dateOfBirth: '1992-03-04',
  timeOfBirth: '10:00:00',
  placeOfBirth: { name: 'Mumbai', lat: 19.076, lon: 72.8777, tz: 'Asia/Kolkata' },
};

beforeEach(() => {
  state.verifyIdToken.mockReset().mockResolvedValue(makeDecodedToken('uid-1'));
  state.findUserByFirebaseUid
    .mockReset()
    .mockResolvedValue(makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' }));
  state.deductWalletBalance.mockReset();
  state.addWalletBalance.mockReset().mockResolvedValue(undefined);
  state.updateUserById.mockReset().mockResolvedValue(undefined);
  state.listBirthProfilesByOwner.mockReset().mockResolvedValue([]);
  state.findOwnedBirthProfile.mockReset();
  state.hardDeleteOwnedBirthProfile.mockReset();
  state.createBirthProfile.mockReset();
  state.requestKundliGeneration.mockReset().mockResolvedValue(undefined);
  state.touchUserLastActive.mockReset().mockResolvedValue(undefined);
  state.claimFreeProfileSlot.mockReset().mockResolvedValue(false);
  state.releaseFreeProfileSlot.mockReset().mockResolvedValue(undefined);
  state.isFeatureOn.mockReset().mockResolvedValue(false);
  state.hasPass.mockReset().mockResolvedValue(false);
  state.grantSignupStage.mockReset().mockResolvedValue(0);
});

describe('GET /v1/profiles', () => {
  it('returns just the primary profile, active, when there are no additional profiles', async () => {
    const res = await createApp().request('/v1/profiles', { headers: AUTH });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any[];
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: 'primary', isPrimary: true, isActive: true });
  });

  it('bumps lastActiveAt on request when it has never been set', async () => {
    state.findUserByFirebaseUid.mockResolvedValue(
      makeUserRow({ id: 'id-1', firebaseUid: 'uid-1', lastActiveAt: null }),
    );
    await createApp().request('/v1/profiles', { headers: AUTH });
    expect(state.touchUserLastActive).toHaveBeenCalledWith('id-1');
  });

  it('does not bump lastActiveAt when it was updated recently (throttled)', async () => {
    state.findUserByFirebaseUid.mockResolvedValue(
      makeUserRow({ id: 'id-1', firebaseUid: 'uid-1', lastActiveAt: new Date() }),
    );
    await createApp().request('/v1/profiles', { headers: AUTH });
    expect(state.touchUserLastActive).not.toHaveBeenCalled();
  });

  it('prepends the primary profile and marks the correct entry active by activeProfileId', async () => {
    state.findUserByFirebaseUid.mockResolvedValue(
      makeUserRow({ id: 'id-1', firebaseUid: 'uid-1', activeProfileId: 'profile-a' }),
    );
    state.listBirthProfilesByOwner.mockResolvedValue([
      makeBirthProfileRow({ id: 'profile-a' }),
      makeBirthProfileRow({ id: 'profile-b', displayName: 'Carl' }),
    ]);

    const res = await createApp().request('/v1/profiles', { headers: AUTH });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any[];
    expect(body).toHaveLength(3);

    expect(body[0]).toMatchObject({ id: 'primary', isPrimary: true, isActive: false });
    expect(body[1]).toMatchObject({
      id: 'profile-a',
      isPrimary: false,
      isActive: true,
      displayName: 'Bob',
    });
    expect(body[2]).toMatchObject({
      id: 'profile-b',
      isPrimary: false,
      isActive: false,
      displayName: 'Carl',
    });
  });
});

describe('POST /v1/profiles', () => {
  it('charges PROFILE_CREATION_COST_PAISE, creates the profile, makes it active, and fires kundli generation', async () => {
    state.deductWalletBalance.mockResolvedValue(true);
    state.createBirthProfile.mockResolvedValue(makeBirthProfileRow({ id: 'new-profile' }));

    const res = await createApp().request('/v1/profiles', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify(CREATE_BODY),
    });

    expect(res.status).toBe(201);
    expect(state.deductWalletBalance).toHaveBeenCalledWith('id-1', 20000, 'profile_creation', {
      idempotencyKey: expect.stringMatching(/^profile_creation:/),
    });
    // Switch off: no free slot is taken and the signup stage 3 check still runs (a no-op for most users).
    expect(state.claimFreeProfileSlot).not.toHaveBeenCalled();
    expect(state.createBirthProfile).toHaveBeenCalledWith(
      'id-1',
      expect.objectContaining(CREATE_BODY),
    );
    expect(state.updateUserById).toHaveBeenCalledWith('id-1', { activeProfileId: 'new-profile' });
    expect(state.requestKundliGeneration).toHaveBeenCalledWith('id-1', 'new-profile');
    expect(state.addWalletBalance).not.toHaveBeenCalled();

    const body = (await res.json()) as any;
    expect(body).toMatchObject({ id: 'new-profile', isPrimary: false, isActive: true });
  });

  it('returns 409 INSUFFICIENT_CREDITS and never creates a profile when the charge fails', async () => {
    state.deductWalletBalance.mockResolvedValue(false);

    const res = await createApp().request('/v1/profiles', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify(CREATE_BODY),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe('INSUFFICIENT_CREDITS');
    expect(state.createBirthProfile).not.toHaveBeenCalled();
    expect(state.addWalletBalance).not.toHaveBeenCalled();
  });

  it('refunds the charge and rethrows when profile creation itself fails (no charge-without-profile)', async () => {
    state.deductWalletBalance.mockResolvedValue(true);
    state.createBirthProfile.mockRejectedValue(new Error('db exploded'));

    const res = await createApp().request('/v1/profiles', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify(CREATE_BODY),
    });

    expect(res.status).toBe(500);
    expect(state.addWalletBalance).toHaveBeenCalledWith('id-1', 20000, 'refund:profile_creation', {
      // The refund carries the key that matches this attempt's charge, so it can be paid only once.
      idempotencyKey: expect.stringMatching(/^refund:profile_creation:/),
    });
    const charge = state.deductWalletBalance.mock.calls[0]![3] as { idempotencyKey: string };
    const refund = state.addWalletBalance.mock.calls[0]![3] as { idempotencyKey: string };
    expect(refund.idempotencyKey).toBe(`refund:${charge.idempotencyKey}`);
    expect(state.updateUserById).not.toHaveBeenCalled();
    expect(state.requestKundliGeneration).not.toHaveBeenCalled();
  });

  it('does not fail the request when the fire-and-forget kundli generation rejects', async () => {
    state.deductWalletBalance.mockResolvedValue(true);
    state.createBirthProfile.mockResolvedValue(makeBirthProfileRow({ id: 'new-profile' }));
    state.requestKundliGeneration.mockRejectedValue(new Error('engine down'));

    const res = await createApp().request('/v1/profiles', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify(CREATE_BODY),
    });

    expect(res.status).toBe(201);
  });

  it('still returns 201 (isActive: false) when the profile is created but activation fails — credits stay charged, not refunded', async () => {
    state.deductWalletBalance.mockResolvedValue(true);
    state.createBirthProfile.mockResolvedValue(makeBirthProfileRow({ id: 'new-profile' }));
    state.updateUserById.mockRejectedValue(new Error('db exploded'));

    const res = await createApp().request('/v1/profiles', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify(CREATE_BODY),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body).toMatchObject({ id: 'new-profile', isPrimary: false, isActive: false });
    // The profile row is real — the charge is by design NOT refunded here.
    expect(state.addWalletBalance).not.toHaveBeenCalled();
    // Kundli generation still fires for the new (just not-yet-active) profile.
    expect(state.requestKundliGeneration).toHaveBeenCalledWith('id-1', 'new-profile');
  });
});

describe('POST /v1/profiles with money.freeProfiles on', () => {
  const post = () =>
    createApp().request('/v1/profiles', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify(CREATE_BODY),
    });

  beforeEach(() => {
    state.isFeatureOn.mockImplementation((_user: string, key: string) =>
      Promise.resolve(key === 'money.freeProfiles'),
    );
    state.deductWalletBalance.mockResolvedValue(true);
    state.createBirthProfile.mockResolvedValue(makeBirthProfileRow({ id: 'new-profile' }));
  });

  it('a free slot takes no money and no ledger row', async () => {
    state.claimFreeProfileSlot.mockResolvedValue(true);
    const res = await post();
    expect(res.status).toBe(201);
    expect(state.claimFreeProfileSlot).toHaveBeenCalledWith('id-1', 3);
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
    expect(state.grantSignupStage).toHaveBeenCalledWith('id-1', 3);
  });

  it('with the slots used up a Pass member still adds a profile free', async () => {
    state.claimFreeProfileSlot.mockResolvedValue(false);
    state.hasPass.mockResolvedValue(true);
    const res = await post();
    expect(res.status).toBe(201);
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
  });

  it('with the slots used up and no Pass the price is the money.profileExtra amount (99 coins)', async () => {
    state.claimFreeProfileSlot.mockResolvedValue(false);
    const res = await post();
    expect(res.status).toBe(201);
    expect(state.deductWalletBalance).toHaveBeenCalledWith('id-1', 9900, 'profile_creation', {
      idempotencyKey: expect.stringMatching(/^profile_creation:/),
    });
  });

  it('a profile that fails to be created gives the free slot back, and charges nothing to refund', async () => {
    state.claimFreeProfileSlot.mockResolvedValue(true);
    state.createBirthProfile.mockRejectedValue(new Error('db exploded'));
    const res = await post();
    expect(res.status).toBe(500);
    expect(state.releaseFreeProfileSlot).toHaveBeenCalledWith('id-1');
    expect(state.addWalletBalance).not.toHaveBeenCalled();
  });

  it('a paid profile that fails to be created is refunded and no slot is released', async () => {
    state.claimFreeProfileSlot.mockResolvedValue(false);
    state.createBirthProfile.mockRejectedValue(new Error('db exploded'));
    const res = await post();
    expect(res.status).toBe(500);
    expect(state.addWalletBalance).toHaveBeenCalledWith('id-1', 9900, 'refund:profile_creation', {
      idempotencyKey: expect.stringMatching(/^refund:profile_creation:/),
    });
    expect(state.releaseFreeProfileSlot).not.toHaveBeenCalled();
  });

  it('still answers 409 when the price cannot be paid', async () => {
    state.claimFreeProfileSlot.mockResolvedValue(false);
    state.deductWalletBalance.mockResolvedValue(false);
    const res = await post();
    expect(res.status).toBe(409);
    expect(state.createBirthProfile).not.toHaveBeenCalled();
  });
});

const PROFILE_UUID = '11111111-1111-1111-1111-111111111111';

describe('POST /v1/profiles/{id}/activate', () => {
  it('activates an owned additional profile', async () => {
    state.findOwnedBirthProfile.mockResolvedValue(makeBirthProfileRow({ id: PROFILE_UUID }));

    const res = await createApp().request(`/v1/profiles/${PROFILE_UUID}/activate`, {
      method: 'POST',
      headers: AUTH,
    });

    expect(res.status).toBe(200);
    expect(state.findOwnedBirthProfile).toHaveBeenCalledWith(PROFILE_UUID, 'id-1');
    expect(state.updateUserById).toHaveBeenCalledWith('id-1', { activeProfileId: PROFILE_UUID });
    const body = (await res.json()) as any;
    expect(body).toMatchObject({ id: PROFILE_UUID, isPrimary: false, isActive: true });
  });

  it('activates "primary" and clears activeProfileId back to null', async () => {
    state.findUserByFirebaseUid.mockResolvedValue(
      makeUserRow({ id: 'id-1', firebaseUid: 'uid-1', activeProfileId: PROFILE_UUID }),
    );

    const res = await createApp().request('/v1/profiles/primary/activate', {
      method: 'POST',
      headers: AUTH,
    });

    expect(res.status).toBe(200);
    expect(state.updateUserById).toHaveBeenCalledWith('id-1', { activeProfileId: null });
    expect(state.findOwnedBirthProfile).not.toHaveBeenCalled();
    const body = (await res.json()) as any;
    expect(body).toMatchObject({ id: 'primary', isPrimary: true, isActive: true });
  });

  it('400s for a malformed (non-uuid, non-"primary") id', async () => {
    state.findOwnedBirthProfile.mockResolvedValue(undefined);

    const res = await createApp().request('/v1/profiles/not-mine-or-missing/activate', {
      method: 'POST',
      headers: AUTH,
    });

    // Non-uuid path segment fails param validation before reaching the handler.
    expect(res.status).toBe(400);
    expect(state.updateUserById).not.toHaveBeenCalled();
  });

  it('404s for a well-formed uuid that is not owned / does not exist', async () => {
    state.findOwnedBirthProfile.mockResolvedValue(undefined);

    const res = await createApp().request(
      '/v1/profiles/11111111-1111-1111-1111-111111111111/activate',
      { method: 'POST', headers: AUTH },
    );

    expect(res.status).toBe(404);
    expect(state.updateUserById).not.toHaveBeenCalled();
  });
});

describe('DELETE /v1/profiles/{id}', () => {
  it('hard-deletes an owned profile and returns 204', async () => {
    state.hardDeleteOwnedBirthProfile.mockResolvedValue(makeBirthProfileRow({ id: 'profile-a' }));

    const res = await createApp().request('/v1/profiles/11111111-1111-1111-1111-111111111111', {
      method: 'DELETE',
      headers: AUTH,
    });

    expect(res.status).toBe(204);
    expect(state.hardDeleteOwnedBirthProfile).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      'id-1',
    );
  });

  it('404s when the profile is not found / not owned', async () => {
    state.hardDeleteOwnedBirthProfile.mockResolvedValue(undefined);

    const res = await createApp().request('/v1/profiles/22222222-2222-2222-2222-222222222222', {
      method: 'DELETE',
      headers: AUTH,
    });

    expect(res.status).toBe(404);
  });

  it('rejects a non-uuid id at the param-validation layer', async () => {
    const res = await createApp().request('/v1/profiles/primary', {
      method: 'DELETE',
      headers: AUTH,
    });

    expect(res.status).toBe(400);
    expect(state.hardDeleteOwnedBirthProfile).not.toHaveBeenCalled();
  });
});
