import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

// Daily Stories counting: POST /v1/stories/events and GET /v1/admin/story-stats.
// Only the DB boundary (stories.repo.ts) is mocked; the service runs for real.
const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  touchUserLastActive: vi.fn(),
  resolveFeaturesForUser: vi.fn(),
  recordStoryEvent: vi.fn(),
  listStoryEventGroups: vi.fn(),
  countStoryUsersByKind: vi.fn(),
}));

const fakeEnv = vi.hoisted(() => ({
  ADMIN_PHONE_E164: ['+919999111111'],
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: [],
  TELEGRAM_ADMIN_CHAT_IDS: [],
  TELEGRAM_READONLY_CHAT_IDS: [],
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

vi.mock('../src/modules/users/users.repo.js', () => ({
  findUserByFirebaseUid: state.findUserByFirebaseUid,
  touchUserLastActive: state.touchUserLastActive,
}));

vi.mock('../src/modules/features/features.service.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, resolveFeaturesForUser: state.resolveFeaturesForUser };
});

vi.mock('../src/modules/stories/stories.repo.js', () => ({
  recordStoryEvent: state.recordStoryEvent,
  listStoryEventGroups: state.listStoryEventGroups,
  countStoryUsersByKind: state.countStoryUsersByKind,
}));

const { createApp } = await import('../src/app.js');
const { summariseStoryEvents } = await import('../src/modules/stories/stories.service.js');

const ADMIN_PHONE = '+919999111111';
const USER_PHONE = '+911111111111';
const ON = { enabled: true, pricePaise: null, originalPricePaise: null };

function signInAs(phone: string, storiesOn = true) {
  state.verifyIdToken.mockResolvedValue(makeDecodedToken('uid-1', phone));
  state.findUserByFirebaseUid.mockResolvedValue(
    makeUserRow({ id: 'user-1', firebaseUid: 'uid-1', phoneE164: phone }),
  );
  state.resolveFeaturesForUser.mockResolvedValue(storiesOn ? { 'home.dailyStories': ON } : {});
}

function post(body: unknown) {
  return createApp().request('/v1/stories/events', {
    method: 'POST',
    headers: { Authorization: 'Bearer good-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function stats(query = '') {
  return createApp().request(`/v1/admin/story-stats${query}`, {
    headers: { Authorization: 'Bearer good-token' },
  });
}

beforeEach(() => {
  for (const fn of Object.values(state)) fn.mockReset();
  state.touchUserLastActive.mockResolvedValue(undefined);
  state.recordStoryEvent.mockResolvedValue(undefined);
  state.listStoryEventGroups.mockResolvedValue([]);
  state.countStoryUsersByKind.mockResolvedValue([]);
});

describe('POST /v1/stories/events', () => {
  it('counts a story being opened, on the IST day, with no channel', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-06T20:00:00Z'), toFake: ['Date'] }); // 01:30 on the 7th in India
    try {
      signInAs(USER_PHONE);
      const res = await post({ kind: 'view', storyId: 'hora' });
      expect(res.status).toBe(200);
      expect(state.recordStoryEvent).toHaveBeenCalledWith({
        userId: 'user-1',
        eventDate: '2026-10-07',
        kind: 'view',
        storyId: 'hora',
        channel: '',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('counts a share with the place it went to', async () => {
    signInAs(USER_PHONE);
    const res = await post({ kind: 'share', storyId: 'gita', channel: 'whatsappStatus' });
    expect(res.status).toBe(200);
    expect(state.recordStoryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'share', storyId: 'gita', channel: 'whatsappStatus' }),
    );
  });

  it('drops a channel sent with a view, so one view stays one row', async () => {
    signInAs(USER_PHONE);
    await post({ kind: 'view', storyId: 'deity', channel: 'x' });
    expect(state.recordStoryEvent).toHaveBeenCalledWith(expect.objectContaining({ channel: '' }));
  });

  it('refuses a share with no channel, an unknown story and an unknown channel', async () => {
    signInAs(USER_PHONE);
    expect((await post({ kind: 'share', storyId: 'gita' })).status).toBe(400);
    expect((await post({ kind: 'view', storyId: 'tarot' })).status).toBe(400);
    expect((await post({ kind: 'share', storyId: 'gita', channel: 'fax' })).status).toBe(400);
    expect(state.recordStoryEvent).not.toHaveBeenCalled();
  });

  it('counts nothing for a user the feature is switched off for', async () => {
    signInAs(USER_PHONE, false);
    const res = await post({ kind: 'view', storyId: 'panchang' });
    expect(res.status).toBe(403);
    expect(state.recordStoryEvent).not.toHaveBeenCalled();
  });

  it('needs a signed-in user', async () => {
    const res = await createApp().request('/v1/stories/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'view', storyId: 'panchang' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/admin/story-stats', () => {
  it('is for admins only', async () => {
    signInAs(USER_PHONE);
    expect((await stats()).status).toBe(403);
    expect(state.listStoryEventGroups).not.toHaveBeenCalled();
  });

  it('adds up visitors, views and share taps by channel for the chosen range', async () => {
    signInAs(ADMIN_PHONE);
    state.listStoryEventGroups.mockResolvedValue([
      { kind: 'view', storyId: 'panchang', channel: '', users: 40, total: 55 },
      { kind: 'view', storyId: 'hora', channel: '', users: 31, total: 38 },
      { kind: 'share', storyId: 'hora', channel: 'whatsapp', users: 5, total: 7 },
      { kind: 'share', storyId: 'gita', channel: 'whatsapp', users: 2, total: 2 },
      { kind: 'share', storyId: 'gita', channel: 'instagramStory', users: 3, total: 4 },
    ]);
    state.countStoryUsersByKind.mockResolvedValue([
      { kind: 'view', users: 42 },
      { kind: 'share', users: 8 },
    ]);

    const res = await stats('?preset=custom&from=2026-10-01&to=2026-10-06');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      visitors: 42,
      views: 93,
      sharers: 8,
      shares: 13,
      shareChannels: { whatsapp: 9, instagramStory: 4 },
      stories: [
        { storyId: 'panchang', viewers: 40, shares: 0, shareChannels: {} },
        { storyId: 'hora', viewers: 31, shares: 7, shareChannels: { whatsapp: 7 } },
        { storyId: 'deity', viewers: 0, shares: 0, shareChannels: {} },
        {
          storyId: 'gita',
          viewers: 0,
          shares: 6,
          shareChannels: { whatsapp: 2, instagramStory: 4 },
        },
      ],
    });

    // The range is the dashboard's: IST midnights, end exclusive.
    const [range] = state.listStoryEventGroups.mock.calls[0]!;
    expect(range.from.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(range.to.toISOString()).toBe('2026-10-06T18:30:00.000Z');
  });

  it('is all zeros before anyone has opened a story', async () => {
    signInAs(ADMIN_PHONE);
    const body = (await (await stats()).json()) as {
      visitors: number;
      shares: number;
      stories: unknown[];
    };
    expect(body.visitors).toBe(0);
    expect(body.shares).toBe(0);
    expect(body.stories).toHaveLength(4);
  });
});

describe('summariseStoryEvents', () => {
  it('counts a person who opened three stories as one visitor', () => {
    const summary = summariseStoryEvents(
      [
        { kind: 'view', storyId: 'panchang', channel: '', users: 1, total: 1 },
        { kind: 'view', storyId: 'hora', channel: '', users: 1, total: 1 },
        { kind: 'view', storyId: 'deity', channel: '', users: 1, total: 1 },
      ],
      [{ kind: 'view', users: 1 }],
    );
    expect(summary.visitors).toBe(1);
    expect(summary.views).toBe(3);
  });

  it('keeps counting a story it does not know in the totals without inventing a row for it', () => {
    const summary = summariseStoryEvents(
      [{ kind: 'share', storyId: 'retired-story', channel: 'x', users: 1, total: 2 }],
      [{ kind: 'share', users: 1 }],
    );
    expect(summary.shares).toBe(2);
    expect(summary.shareChannels).toEqual({ x: 2 });
    expect(summary.stories.map((s) => s.storyId)).toEqual(['panchang', 'hora', 'deity', 'gita']);
  });
});
