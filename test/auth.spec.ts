import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeGoogleDecodedToken, makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  findUserByEmail: vi.fn(),
  insertUser: vi.fn(),
  updateUserById: vi.fn(),
  notifyNewSignup: vi.fn(),
  ensureReferralCode: vi.fn((user: unknown) => Promise.resolve(user)),
  touchUserLastActive: vi.fn().mockResolvedValue(undefined),
  checkNewUserBurst: vi.fn().mockResolvedValue(undefined),
  checkTotalUserMilestone: vi.fn().mockResolvedValue(undefined),
  resolveFeaturesForUser: vi.fn(),
  hasGivenFeedback: vi.fn(),
  getClaimedCampaignKeys: vi.fn(),
}));

vi.mock('../src/lib/notifications/telegram.js', () => ({
  notifyNewSignup: state.notifyNewSignup,
}));

vi.mock('../src/modules/admin-alerts/admin-alerts.service.js', () => ({
  checkNewUserBurst: state.checkNewUserBurst,
  checkTotalUserMilestone: state.checkTotalUserMilestone,
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
  findUserByPhoneE164: vi.fn(),
  findUserByEmail: state.findUserByEmail,
  findActiveUserByFirebaseUid: vi.fn(),
  findActiveUserById: vi.fn(),
  insertUser: state.insertUser,
  updateUserById: state.updateUserById,
  updateUserWithConsentLog: vi.fn(),
  softDeleteUserById: vi.fn(),
  // Identity pass-through — matches the real implementation's behavior when
  // the row already has a referralCode (every makeUserRow fixture has none
  // set explicitly, but establishSession doesn't care which branch runs).
  ensureReferralCode: state.ensureReferralCode,
  touchUserLastActive: state.touchUserLastActive,
  getClaimedCampaignKeys: state.getClaimedCampaignKeys,
}));

vi.mock('../src/modules/features/features.service.js', () => ({
  resolveFeaturesForUser: state.resolveFeaturesForUser,
}));

vi.mock('../src/modules/feedback/feedback.repo.js', () => ({
  hasGivenFeedback: state.hasGivenFeedback,
}));

const { createApp } = await import('../src/app.js');

describe('POST /v1/auth/session', () => {
  beforeEach(() => {
    state.verifyIdToken.mockReset();
    state.findUserByFirebaseUid.mockReset();
    state.findUserByEmail.mockReset();
    state.insertUser.mockReset();
    state.updateUserById.mockReset();
    state.notifyNewSignup.mockReset().mockResolvedValue(true);
    state.ensureReferralCode
      .mockReset()
      .mockImplementation((user: unknown) => Promise.resolve(user));
    state.touchUserLastActive.mockReset().mockResolvedValue(undefined);
    state.checkNewUserBurst.mockReset().mockResolvedValue(undefined);
    state.checkTotalUserMilestone.mockReset().mockResolvedValue(undefined);
    state.resolveFeaturesForUser.mockReset().mockResolvedValue({});
    state.hasGivenFeedback.mockReset().mockResolvedValue(false);
    state.getClaimedCampaignKeys.mockReset().mockResolvedValue([]);
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const app = createApp();
    const res = await app.request('/v1/auth/session', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('returns 401 when the token is invalid', async () => {
    state.verifyIdToken.mockRejectedValueOnce(new Error('bad token'));
    const app = createApp();
    const res = await app.request('/v1/auth/session', {
      method: 'POST',
      headers: { Authorization: 'Bearer bad-token' },
    });
    expect(res.status).toBe(401);
  });

  it('creates a new user (201) when no row exists for the firebase uid', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-new', '+911111111111'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(undefined);
    state.insertUser.mockResolvedValueOnce(
      makeUserRow({ id: 'id-new', firebaseUid: 'uid-new', phoneE164: '+911111111111' }),
    );

    const app = createApp();
    const res = await app.request('/v1/auth/session', {
      method: 'POST',
      headers: { Authorization: 'Bearer good-token' },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { user: { firebaseUid: string }; created: boolean };
    expect(body.created).toBe(true);
    expect(body.user.firebaseUid).toBe('uid-new');
    expect(state.insertUser).toHaveBeenCalledWith({
      firebaseUid: 'uid-new',
      phoneE164: '+911111111111',
      email: null,
    });
    // Notification fires without awaiting, but in vitest it'll synchronously trigger the mock call
    expect(state.notifyNewSignup).toHaveBeenCalledWith({
      id: 'id-new',
      email: null,
      phone: '+911111111111',
    });
  });

  it('returns the existing user (200) when one already exists', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-existing'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(
      makeUserRow({ id: 'id-existing', firebaseUid: 'uid-existing' }),
    );

    const app = createApp();
    const res = await app.request('/v1/auth/session', {
      method: 'POST',
      headers: { Authorization: 'Bearer good-token' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string }; created: boolean };
    expect(body.created).toBe(false);
    expect(body.user.id).toBe('id-existing');
    expect(state.insertUser).not.toHaveBeenCalled();
    expect(state.notifyNewSignup).not.toHaveBeenCalled();
  });

  it('resurrects a soft-deleted user on re-sign-in', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-deleted'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(
      makeUserRow({ id: 'id-deleted', firebaseUid: 'uid-deleted', deletedAt: new Date() }),
    );
    state.updateUserById.mockResolvedValueOnce(
      makeUserRow({ id: 'id-deleted', firebaseUid: 'uid-deleted', deletedAt: null }),
    );

    const app = createApp();
    const res = await app.request('/v1/auth/session', {
      method: 'POST',
      headers: { Authorization: 'Bearer good-token' },
    });
    expect(res.status).toBe(200);
    expect(state.updateUserById).toHaveBeenCalledWith('id-deleted', { deletedAt: null });
  });

  it('records lastActiveAt on every session exchange, not just via a later /v1/me call', async () => {
    // POST /v1/auth/session runs under requireFirebaseToken, not requireUser
    // — so it's the one authed route that does NOT get the requireUser
    // heartbeat bump for free. The nightly horoscope batch's dormant-user
    // filter (listRecentlyActiveUsersAfter) reads lastActiveAt, so app
    // launch must record it directly rather than relying on whatever the
    // client happens to fetch next.
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-existing'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(
      makeUserRow({ id: 'id-existing', firebaseUid: 'uid-existing' }),
    );

    const app = createApp();
    await app.request('/v1/auth/session', {
      method: 'POST',
      headers: { Authorization: 'Bearer good-token' },
    });

    expect(state.touchUserLastActive).toHaveBeenCalledWith('id-existing');
  });

  it('runs the burst and total-milestone checks when a new user is created', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-new2', '+911111111112'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(undefined);
    state.insertUser.mockResolvedValueOnce(
      makeUserRow({ id: 'id-new2', firebaseUid: 'uid-new2', phoneE164: '+911111111112' }),
    );

    const app = createApp();
    await app.request('/v1/auth/session', {
      method: 'POST',
      headers: { Authorization: 'Bearer good-token' },
    });

    expect(state.checkNewUserBurst).toHaveBeenCalledTimes(1);
    expect(state.checkTotalUserMilestone).toHaveBeenCalledTimes(1);
  });

  it('does not run the burst/total-milestone checks for an existing user', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-existing'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(
      makeUserRow({ id: 'id-existing', firebaseUid: 'uid-existing' }),
    );

    const app = createApp();
    await app.request('/v1/auth/session', {
      method: 'POST',
      headers: { Authorization: 'Bearer good-token' },
    });

    expect(state.checkNewUserBurst).not.toHaveBeenCalled();
    expect(state.checkTotalUserMilestone).not.toHaveBeenCalled();
  });

  describe('Google sign-in (email, no phone_number claim)', () => {
    it('creates a new user with email set and phoneE164 null', async () => {
      state.verifyIdToken.mockResolvedValueOnce(
        makeGoogleDecodedToken('uid-google-new', 'newuser@example.com'),
      );
      state.findUserByFirebaseUid.mockResolvedValueOnce(undefined);
      state.insertUser.mockResolvedValueOnce(
        makeUserRow({
          id: 'id-google-new',
          firebaseUid: 'uid-google-new',
          phoneE164: null,
          email: 'newuser@example.com',
        }),
      );

      const app = createApp();
      const res = await app.request('/v1/auth/session', {
        method: 'POST',
        headers: { Authorization: 'Bearer good-token' },
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        user: { firebaseUid: string; phoneE164: string | null; email: string | null };
        created: boolean;
      };
      expect(body.created).toBe(true);
      expect(body.user.phoneE164).toBeNull();
      expect(body.user.email).toBe('newuser@example.com');
      expect(state.insertUser).toHaveBeenCalledWith({
        firebaseUid: 'uid-google-new',
        phoneE164: null,
        email: 'newuser@example.com',
      });
    });

    it('lowercases the email before persisting', async () => {
      state.verifyIdToken.mockResolvedValueOnce(
        makeGoogleDecodedToken('uid-google-case', 'MixedCase@Example.com'),
      );
      state.findUserByFirebaseUid.mockResolvedValueOnce(undefined);
      state.insertUser.mockResolvedValueOnce(
        makeUserRow({ id: 'id-google-case', firebaseUid: 'uid-google-case' }),
      );

      const app = createApp();
      await app.request('/v1/auth/session', {
        method: 'POST',
        headers: { Authorization: 'Bearer good-token' },
      });

      expect(state.insertUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'mixedcase@example.com' }),
      );
    });

    // Firebase issues UIDs per project, so changing Firebase project makes
    // every returning Google user arrive under an unrecognised UID. Without
    // this reclaim they'd be dropped into a brand-new empty account and their
    // whole history (credits, charts, chats) would be stranded on the old row.
    it('reclaims the existing row by verified email when the UID is new (project switch)', async () => {
      state.verifyIdToken.mockResolvedValueOnce(
        makeGoogleDecodedToken('uid-new-project', 'returning@example.com'),
      );
      state.findUserByFirebaseUid.mockResolvedValueOnce(undefined);
      state.insertUser.mockRejectedValueOnce({ code: '23505' });
      state.findUserByEmail.mockResolvedValueOnce(
        makeUserRow({
          id: 'id-original',
          firebaseUid: 'uid-old-project',
          email: 'returning@example.com',
        }),
      );
      state.updateUserById.mockResolvedValueOnce(
        makeUserRow({
          id: 'id-original',
          firebaseUid: 'uid-new-project',
          email: 'returning@example.com',
        }),
      );

      const app = createApp();
      const res = await app.request('/v1/auth/session', {
        method: 'POST',
        headers: { Authorization: 'Bearer good-token' },
      });

      // 200 + created:false — the same account, not a new signup.
      expect(res.status).toBe(200);
      const body = (await res.json()) as { user: { id: string }; created: boolean };
      expect(body.created).toBe(false);
      expect(body.user.id).toBe('id-original');
      expect(state.updateUserById).toHaveBeenCalledWith('id-original', {
        firebaseUid: 'uid-new-project',
        deletedAt: null,
      });
      // Must NOT fall through to creating a second, email-less account.
      expect(state.insertUser).toHaveBeenCalledTimes(1);
      expect(state.notifyNewSignup).not.toHaveBeenCalled();
    });

    it('reclaims on Apple\'s string "true" email_verified, not just the boolean', async () => {
      state.verifyIdToken.mockResolvedValueOnce(
        makeGoogleDecodedToken('uid-apple', 'apple@example.com', 'true'),
      );
      state.findUserByFirebaseUid.mockResolvedValueOnce(undefined);
      state.insertUser.mockRejectedValueOnce({ code: '23505' });
      state.findUserByEmail.mockResolvedValueOnce(
        makeUserRow({ id: 'id-apple', firebaseUid: 'uid-apple-old', email: 'apple@example.com' }),
      );
      state.updateUserById.mockResolvedValueOnce(
        makeUserRow({ id: 'id-apple', firebaseUid: 'uid-apple', email: 'apple@example.com' }),
      );

      const app = createApp();
      const res = await app.request('/v1/auth/session', {
        method: 'POST',
        headers: { Authorization: 'Bearer good-token' },
      });

      expect(res.status).toBe(200);
      expect(state.findUserByEmail).toHaveBeenCalledWith('apple@example.com');
    });

    it('does NOT reclaim on an unverified email — creates an email-less account instead', async () => {
      state.verifyIdToken.mockResolvedValueOnce(
        makeGoogleDecodedToken('uid-unverified', 'taken@example.com', false),
      );
      state.findUserByFirebaseUid.mockResolvedValueOnce(undefined);
      state.insertUser
        .mockRejectedValueOnce({ code: '23505' })
        .mockResolvedValueOnce(
          makeUserRow({ id: 'id-unverified', firebaseUid: 'uid-unverified', email: null }),
        );

      const app = createApp();
      const res = await app.request('/v1/auth/session', {
        method: 'POST',
        headers: { Authorization: 'Bearer good-token' },
      });

      expect(res.status).toBe(201);
      // Never looked up the row — an unverified claim must not hand over an account.
      expect(state.findUserByEmail).not.toHaveBeenCalled();
      expect(state.updateUserById).not.toHaveBeenCalled();
      expect(state.insertUser).toHaveBeenNthCalledWith(2, {
        firebaseUid: 'uid-unverified',
        phoneE164: null,
        email: null,
      });
    });

    it('backfills email onto an existing row that was created before email was captured', async () => {
      state.verifyIdToken.mockResolvedValueOnce(
        makeGoogleDecodedToken('uid-google-existing', 'backfill@example.com'),
      );
      state.findUserByFirebaseUid.mockResolvedValueOnce(
        makeUserRow({ id: 'id-google-existing', firebaseUid: 'uid-google-existing', email: null }),
      );
      state.updateUserById.mockResolvedValueOnce(
        makeUserRow({
          id: 'id-google-existing',
          firebaseUid: 'uid-google-existing',
          email: 'backfill@example.com',
        }),
      );

      const app = createApp();
      const res = await app.request('/v1/auth/session', {
        method: 'POST',
        headers: { Authorization: 'Bearer good-token' },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { user: { email: string | null } };
      expect(body.user.email).toBe('backfill@example.com');
      expect(state.updateUserById).toHaveBeenCalledWith('id-google-existing', {
        email: 'backfill@example.com',
      });
    });

    it('does not touch an existing row that already has an email set', async () => {
      state.verifyIdToken.mockResolvedValueOnce(
        makeGoogleDecodedToken('uid-google-existing2', 'same@example.com'),
      );
      state.findUserByFirebaseUid.mockResolvedValueOnce(
        makeUserRow({
          id: 'id-google-existing2',
          firebaseUid: 'uid-google-existing2',
          email: 'same@example.com',
        }),
      );

      const app = createApp();
      const res = await app.request('/v1/auth/session', {
        method: 'POST',
        headers: { Authorization: 'Bearer good-token' },
      });

      expect(res.status).toBe(200);
      expect(state.updateUserById).not.toHaveBeenCalled();
    });
  });

  it('leaves ordinary phone sign-in untouched when the token happens to carry no email', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('uid-phone-only', '+911111119999'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(undefined);
    state.insertUser.mockResolvedValueOnce(
      makeUserRow({
        id: 'id-phone-only',
        firebaseUid: 'uid-phone-only',
        phoneE164: '+911111119999',
      }),
    );

    const app = createApp();
    const res = await app.request('/v1/auth/session', {
      method: 'POST',
      headers: { Authorization: 'Bearer good-token' },
    });

    expect(res.status).toBe(201);
    expect(state.insertUser).toHaveBeenCalledWith({
      firebaseUid: 'uid-phone-only',
      phoneE164: '+911111119999',
      email: null,
    });
  });
});
