import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUserRow, makeProfileContext } from './helpers/mocks.js';
import type * as AstroService from '../src/modules/astro/astro.service.js';

// Regression coverage for the "middle Q&A pairs disappear from long chat
// conversations" bug: the route used to persist chat_sessions.history by
// blindly overwriting it with the CLIENT-supplied `body.history` (a buffer
// the frontend resets to just the latest turn once the backend signals
// compaction — see chat-compaction.ts). That let the compacted MODEL-CONTEXT
// window leak into durable storage, permanently deleting older turns.
//
// The fix: the route now loads the session's own STORED full history from
// the DB, uses that (not body.history) as both the model-context input and
// the base for the persisted write, and appends only the new turn.
// Client-supplied `history`/`summary` are accepted for backward
// compatibility (old app builds still in the field) but ignored.

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  touchUserLastActive: vi.fn(),
  deductWalletBalance: vi.fn(),
  addWalletBalance: vi.fn(),
  resolveActiveProfileContext: vi.fn(),
  getChatSession: vi.fn(),
  createChatSession: vi.fn(),
  updateChatSession: vi.fn(),
  chatStream: vi.fn(),
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
  touchUserLastActive: state.touchUserLastActive,
  deductWalletBalance: state.deductWalletBalance,
  addWalletBalance: state.addWalletBalance,
}));

vi.mock('../src/modules/birth-profiles/profile-context.js', () => ({
  resolveActiveProfileContext: state.resolveActiveProfileContext,
}));

vi.mock('../src/modules/astro/chat-sessions.repo.js', () => ({
  getChatSession: state.getChatSession,
  createChatSession: state.createChatSession,
  updateChatSession: state.updateChatSession,
}));

vi.mock('../src/modules/astro/astro.service.js', async () => {
  const actual = await vi.importActual<typeof AstroService>(
    '../src/modules/astro/astro.service.js',
  );
  return { ...actual, chatStream: state.chatStream };
});

const { createApp } = await import('../src/app.js');

async function callChat(body: Record<string, unknown>) {
  const app = createApp();
  return app.request('/v1/chat', {
    method: 'POST',
    headers: { Authorization: 'Bearer good-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.verifyIdToken.mockReset().mockResolvedValue({ uid: 'firebase-uid-1' });
  state.findUserByFirebaseUid.mockReset();
  state.touchUserLastActive.mockReset().mockResolvedValue(undefined);
  state.deductWalletBalance.mockReset().mockResolvedValue(true);
  state.addWalletBalance.mockReset().mockResolvedValue(undefined);
  state.resolveActiveProfileContext.mockReset();
  state.getChatSession.mockReset();
  state.createChatSession.mockReset();
  state.updateChatSession.mockReset();
  state.chatStream.mockReset();
});

describe('POST /v1/chat — persists the full transcript, not the client-carried buffer', () => {
  it('a brand-new session (no sessionId) persists exactly the new turn and grounds on empty history', async () => {
    const user = makeUserRow({ id: 'user-1', dataProcessingConsentAt: new Date('2026-01-01') });
    state.findUserByFirebaseUid.mockResolvedValue(user);
    state.resolveActiveProfileContext.mockResolvedValue(
      makeProfileContext({ birthProfileId: null }),
    );
    state.chatStream.mockImplementation(function* () {
      yield { type: 'token', content: 'Hello, seeker.' };
    });
    state.createChatSession.mockResolvedValue({ id: 'new-session-1' });

    const res = await callChat({ message: 'What is my rising sign?', history: [] });

    expect(res.status).toBe(200);
    await res.text();

    expect(state.chatStream).toHaveBeenCalled();
    const chatStreamArgs = state.chatStream.mock.calls[0] as unknown[];
    expect(chatStreamArgs[2]).toEqual([]); // history arg — nothing stored yet for a new session

    expect(state.createChatSession).toHaveBeenCalledWith(
      'user-1',
      null,
      expect.any(String),
      [
        { role: 'user', content: 'What is my rising sign?' },
        { role: 'assistant', content: 'Hello, seeker.' },
      ],
      undefined,
    );
  });

  it('continuing an existing session persists the FULL stored history plus the new turn, and grounds the model on the stored history — even when the request body carries a different/empty `history`', async () => {
    const user = makeUserRow({ id: 'user-1', dataProcessingConsentAt: new Date('2026-01-01') });
    state.findUserByFirebaseUid.mockResolvedValue(user);
    state.resolveActiveProfileContext.mockResolvedValue(
      makeProfileContext({ birthProfileId: null }),
    );

    const storedHistory = [
      { role: 'user', content: 'Q1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'Q2' },
      { role: 'assistant', content: 'A2' },
    ];
    const sessionId = '11111111-1111-1111-1111-111111111111';
    state.getChatSession.mockResolvedValue({
      id: sessionId,
      userId: 'user-1',
      birthProfileId: null,
      history: storedHistory,
      summary: 'old running summary',
    });
    state.chatStream.mockImplementation(function* () {
      yield { type: 'token', content: 'A3' };
    });
    state.updateChatSession.mockResolvedValue({ id: sessionId });

    // Simulates a client (old or new) that sends an empty/stale `history` —
    // the fix must ignore this and use the server's own stored transcript.
    const res = await callChat({ sessionId, message: 'Q3', history: [] });

    expect(res.status).toBe(200);
    await res.text();

    // Model context must come from the STORED history, not the empty body.history.
    const chatStreamArgs = state.chatStream.mock.calls[0] as unknown[];
    expect(chatStreamArgs[2]).toEqual(storedHistory);
    expect(chatStreamArgs[3]).toBe('old running summary');

    // Persisted write must be the full stored history plus the new turn —
    // all 4 prior messages must survive, proving nothing from the middle is dropped.
    expect(state.updateChatSession).toHaveBeenCalledWith(
      sessionId,
      'user-1',
      null,
      [...storedHistory, { role: 'user', content: 'Q3' }, { role: 'assistant', content: 'A3' }],
      'old running summary',
    );
  });

  it('an unknown or foreign sessionId 404s before charging credits or calling the model', async () => {
    const user = makeUserRow({ id: 'user-1', dataProcessingConsentAt: new Date('2026-01-01') });
    state.findUserByFirebaseUid.mockResolvedValue(user);
    state.resolveActiveProfileContext.mockResolvedValue(
      makeProfileContext({ birthProfileId: null }),
    );
    state.getChatSession.mockResolvedValue(null);

    const res = await callChat({
      sessionId: '22222222-2222-2222-2222-222222222222',
      message: 'Q1',
      history: [],
    });

    expect(res.status).toBe(404);
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
    expect(state.chatStream).not.toHaveBeenCalled();
  });
});
