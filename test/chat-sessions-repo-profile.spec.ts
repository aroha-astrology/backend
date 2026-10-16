import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

// Multi-profile coverage for chat-sessions.repo.ts: every read/write must
// scope to (userId, birthProfileId) — `null` means the primary/self profile,
// a real id an additional saved profile (same isNull/eq profileFilter()
// shape as gemstone.repo.ts/user-facts.repo.ts). Also covers the security
// fix to updateChatSession, which previously had NO ownership filter at all
// (any caller who knew/guessed a session id could update ANY user's
// session) — it must now be scoped exactly like every sibling function.

const state = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: { select: state.select, insert: state.insert, update: state.update }, sqlClient };
});

// Identity pass-through — avoids requiring a real ENCRYPTION_KEY in this
// unit test (same reasoning as test/birth-profiles-repo.spec.ts).
vi.mock('../src/lib/crypto/field-encryption.js', () => ({
  encryptField: (v: string | null | undefined) => v ?? null,
  decryptField: (v: string | null | undefined) => v ?? null,
  encryptJson: (v: unknown) => (v == null ? null : JSON.stringify(v)),
  decryptJson: (v: string | null | undefined) => (v == null ? null : (JSON.parse(v) as unknown)),
}));

import { chatSessions } from '../src/db/schema.js';
import {
  getChatSessions,
  getChatSession,
  createChatSession,
  updateChatSession,
  setCallRecap,
} from '../src/modules/astro/chat-sessions.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeSelectChain {
  from: (table: unknown) => FakeSelectChain;
  leftJoin: (table: unknown, on: unknown) => FakeSelectChain;
  where: (cond: unknown) => FakeSelectChain;
  orderBy: (ord: unknown) => FakeSelectChain;
  limit: (n: number) => Promise<unknown[]>;
  then: Promise<unknown[]>['then'];
}

/** Supports both terminal shapes used in this repo: `.where().orderBy()` (getChatSessions) and `.where().limit()` (getChatSession). */
function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown; orderBy?: unknown; limit?: unknown } = {};
  const chain: FakeSelectChain = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    orderBy: vi.fn((ord: unknown) => {
      calls.orderBy = ord;
      return chain;
    }),
    limit: vi.fn((n: number) => {
      calls.limit = n;
      return Promise.resolve(result);
    }),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return { chain, calls };
}

interface FakeInsertChain {
  values: (v: unknown) => FakeInsertChain;
  returning: () => Promise<unknown[]>;
}

function makeInsertChain(returningResult: unknown[]) {
  const calls: { values?: unknown } = {};
  const chain: FakeInsertChain = {
    values: vi.fn((v: unknown) => {
      calls.values = v;
      return chain;
    }),
    returning: vi.fn(() => Promise.resolve(returningResult)),
  };
  return { chain, calls };
}

interface FakeUpdateChain {
  set: (patch: unknown) => FakeUpdateChain;
  where: (cond: unknown) => FakeUpdateChain;
  returning: () => Promise<unknown[]>;
}

function makeUpdateChain(returningResult: unknown[]) {
  const calls: { set?: unknown; where?: unknown } = {};
  const chain: FakeUpdateChain = {
    set: vi.fn((patch: unknown) => {
      calls.set = patch;
      return chain;
    }),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    returning: vi.fn(() => Promise.resolve(returningResult)),
  };
  return { chain, calls };
}

function makeSessionRow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-07-18T00:00:00Z');
  return {
    id: 'session-1',
    userId: 'user-1',
    birthProfileId: null,
    title: 'Chat title',
    history: JSON.stringify([{ role: 'user', content: 'hi' }]),
    summary: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  state.select.mockReset();
  state.insert.mockReset();
  state.update.mockReset();
});

describe('getChatSessions — profile-scoped list', () => {
  it('filters on birth_profile_id IS NULL for the primary profile', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await getChatSessions('user-1', null);

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("chat_sessions"."user_id" = $1 and "chat_sessions"."birth_profile_id" is null and "chat_sessions"."deleted_at" is null)',
    );
    expect(query.params).toEqual(['user-1']);
  });

  it('filters on birth_profile_id = <id> for an additional profile — never leaks a sibling profile’s sessions', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await getChatSessions('user-1', 'profile-a');

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("chat_sessions"."user_id" = $1 and "chat_sessions"."birth_profile_id" = $2 and "chat_sessions"."deleted_at" is null)',
    );
    expect(query.params).toEqual(['user-1', 'profile-a']);
  });
});

describe('getChatSession — ownership check now also verifies the active profile', () => {
  it('returns the session when both userId and birthProfileId (null) match', async () => {
    const { chain } = makeSelectChain([makeSessionRow({ userId: 'user-1', birthProfileId: null })]);
    state.select.mockReturnValue(chain);

    const session = await getChatSession('session-1', 'user-1', null);

    expect(session).not.toBeNull();
    expect(session?.id).toBe('session-1');
  });

  it('returns the session when both userId and birthProfileId (a saved profile) match', async () => {
    const { chain } = makeSelectChain([
      makeSessionRow({ userId: 'user-1', birthProfileId: 'profile-a' }),
    ]);
    state.select.mockReturnValue(chain);

    const session = await getChatSession('session-1', 'user-1', 'profile-a');

    expect(session).not.toBeNull();
  });

  it('returns null when userId matches but the session belongs to a DIFFERENT profile (was created under the primary profile, now querying while an additional profile is active)', async () => {
    const { chain } = makeSelectChain([makeSessionRow({ userId: 'user-1', birthProfileId: null })]);
    state.select.mockReturnValue(chain);

    const session = await getChatSession('session-1', 'user-1', 'profile-a');

    expect(session).toBeNull();
  });

  it('returns null when userId matches but the session belongs to a DIFFERENT saved profile (sibling profile mismatch)', async () => {
    const { chain } = makeSelectChain([
      makeSessionRow({ userId: 'user-1', birthProfileId: 'profile-a' }),
    ]);
    state.select.mockReturnValue(chain);

    const session = await getChatSession('session-1', 'user-1', 'profile-b');

    expect(session).toBeNull();
  });

  it('returns null when the session belongs to a different user entirely, regardless of profile', async () => {
    const { chain } = makeSelectChain([
      makeSessionRow({ userId: 'someone-else', birthProfileId: null }),
    ]);
    state.select.mockReturnValue(chain);

    const session = await getChatSession('session-1', 'user-1', null);

    expect(session).toBeNull();
  });
});

describe('createChatSession — tags the new row with the active profile', () => {
  it('writes birthProfileId: null for the primary profile', async () => {
    const { chain, calls } = makeInsertChain([makeSessionRow({ birthProfileId: null })]);
    state.insert.mockReturnValue(chain);

    await createChatSession('user-1', null, 'title', [{ role: 'user', content: 'hi' }]);

    expect(state.insert).toHaveBeenCalledWith(chatSessions);
    expect(calls.values).toMatchObject({ userId: 'user-1', birthProfileId: null, title: 'title' });
  });

  it('writes the additional profile’s id when one is active', async () => {
    const { chain, calls } = makeInsertChain([makeSessionRow({ birthProfileId: 'profile-a' })]);
    state.insert.mockReturnValue(chain);

    await createChatSession('user-1', 'profile-a', 'title', [{ role: 'user', content: 'hi' }]);

    expect(calls.values).toMatchObject({
      userId: 'user-1',
      birthProfileId: 'profile-a',
      title: 'title',
    });
  });
});

describe('voice calls in the chat history list', () => {
  const listRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'session-1',
    title: 'When will I get a job?',
    summary: null,
    createdAt: new Date('2026-10-12T10:12:05Z'),
    updatedAt: new Date('2026-10-12T10:12:05Z'),
    callRecap: null,
    voiceSessionId: null,
    callStartedAt: null,
    callEndedAt: null,
    callMinutes: null,
    ...overrides,
  });

  it('a text chat has no call details', async () => {
    const { chain } = makeSelectChain([listRow()]);
    state.select.mockReturnValue(chain);

    const [session] = await getChatSessions('user-1', null);

    expect(session).toEqual({
      id: 'session-1',
      title: 'When will I get a job?',
      summary: null,
      createdAt: new Date('2026-10-12T10:12:05Z'),
      updatedAt: new Date('2026-10-12T10:12:05Z'),
      call: null,
    });
  });

  it('a saved call says when it began, how long it ran and what it was about', async () => {
    const { chain } = makeSelectChain([
      listRow({
        callRecap: 'You asked about a job. March was named.',
        voiceSessionId: 'voice-1',
        callStartedAt: new Date('2026-10-12T10:00:00Z'),
        callEndedAt: new Date('2026-10-12T10:12:04Z'),
        callMinutes: 13,
      }),
    ]);
    state.select.mockReturnValue(chain);

    const [session] = await getChatSessions('user-1', null);

    expect(session?.call).toEqual({
      startedAt: new Date('2026-10-12T10:00:00Z'),
      durationSeconds: 724,
      recap: 'You asked about a job. March was named.',
    });
    // The columns the list was built from are not sent to the app.
    expect(session).not.toHaveProperty('voiceSessionId');
    expect(session).not.toHaveProperty('callMinutes');
  });

  it('a call that never reported its end falls back to the minutes it was given', async () => {
    const { chain } = makeSelectChain([
      listRow({
        voiceSessionId: 'voice-1',
        callStartedAt: new Date('2026-10-12T10:00:00Z'),
        callEndedAt: null,
        callMinutes: 4,
      }),
    ]);
    state.select.mockReturnValue(chain);

    const [session] = await getChatSessions('user-1', null);

    expect(session?.call).toEqual({
      startedAt: new Date('2026-10-12T10:00:00Z'),
      durationSeconds: 240,
      recap: null,
    });
  });

  it('createChatSession links the row to the call it is the transcript of', async () => {
    const { chain, calls } = makeInsertChain([makeSessionRow({ voiceSessionId: 'voice-1' })]);
    state.insert.mockReturnValue(chain);

    await createChatSession(
      'user-1',
      null,
      'title',
      [{ role: 'user', content: 'hi' }],
      undefined,
      'voice-1',
    );

    expect(calls.values).toMatchObject({ userId: 'user-1', voiceSessionId: 'voice-1' });
  });

  it('createChatSession leaves a text chat unlinked', async () => {
    const { chain, calls } = makeInsertChain([makeSessionRow()]);
    state.insert.mockReturnValue(chain);

    await createChatSession('user-1', null, 'title', [{ role: 'user', content: 'hi' }]);

    expect(calls.values).toMatchObject({ voiceSessionId: null });
  });

  it('setCallRecap writes only to the caller\'s own session and leaves its place in the list alone', async () => {
    const { chain, calls } = makeUpdateChain([]);
    state.update.mockReturnValue(chain);

    await setCallRecap('session-1', 'user-1', 'You asked about a job.');

    expect(calls.set).toEqual({ callRecap: 'You asked about a job.' });
    const query = compile(calls.where);
    expect(query.sql).toBe('("chat_sessions"."id" = $1 and "chat_sessions"."user_id" = $2)');
    expect(query.params).toEqual(['session-1', 'user-1']);
  });
});

describe('updateChatSession — SECURITY FIX: now scoped to (id, userId, birthProfileId)', () => {
  it('scopes the update to (id, userId, birth_profile_id IS NULL) for the primary profile — previously had NO ownership filter at all', async () => {
    const { chain, calls } = makeUpdateChain([makeSessionRow()]);
    state.update.mockReturnValue(chain);

    await updateChatSession('session-1', 'user-1', null, [{ role: 'user', content: 'hi' }]);

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("chat_sessions"."id" = $1 and "chat_sessions"."user_id" = $2 and "chat_sessions"."birth_profile_id" is null)',
    );
    expect(query.params).toEqual(['session-1', 'user-1']);
  });

  it('scopes the update to (id, userId, birth_profile_id = <id>) for an additional profile — a mismatched user/profile pair can no longer match any row', async () => {
    const { chain, calls } = makeUpdateChain([makeSessionRow({ birthProfileId: 'profile-a' })]);
    state.update.mockReturnValue(chain);

    await updateChatSession('session-1', 'user-1', 'profile-a', [{ role: 'user', content: 'hi' }]);

    const query = compile(calls.where);
    expect(query.sql).toBe(
      '("chat_sessions"."id" = $1 and "chat_sessions"."user_id" = $2 and "chat_sessions"."birth_profile_id" = $3)',
    );
    expect(query.params).toEqual(['session-1', 'user-1', 'profile-a']);
  });
});
