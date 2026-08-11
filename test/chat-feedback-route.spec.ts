import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUserRow } from './helpers/mocks.js';

// Regression coverage for the chat-feedback ownership gap: recordChatFeedbackVote/
// saveChatFeedbackReport used to insert a client-supplied `sessionId` with no check
// that the session belonged to the caller — a client could attach a vote/report to
// ANY session id, including another user's, poisoning that session's feedback
// record. The route now verifies ownership (via the same chatSessionsRepo.
// getChatSession helper POST /chat itself uses) before inserting anything.

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  touchUserLastActive: vi.fn(),
  resolveActiveProfileContext: vi.fn(),
  getChatSession: vi.fn(),
  incrementFeedbackCounter: vi.fn(),
  recordChatFeedbackVote: vi.fn(),
  saveChatFeedbackReport: vi.fn(),
  notifyChatDownvote: vi.fn(),
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
  deductWalletBalance: vi.fn(),
  addWalletBalance: vi.fn(),
}));

vi.mock('../src/modules/birth-profiles/profile-context.js', () => ({
  resolveActiveProfileContext: state.resolveActiveProfileContext,
}));

vi.mock('../src/modules/astro/chat-sessions.repo.js', () => ({
  getChatSession: state.getChatSession,
  createChatSession: vi.fn(),
  updateChatSession: vi.fn(),
}));

vi.mock('../src/modules/astro/feedback.repo.js', () => ({
  incrementFeedbackCounter: state.incrementFeedbackCounter,
  recordChatFeedbackVote: state.recordChatFeedbackVote,
  saveChatFeedbackReport: state.saveChatFeedbackReport,
}));

vi.mock('../src/lib/notifications/telegram.js', () => ({
  notifyChatDownvote: state.notifyChatDownvote,
}));

const { createApp } = await import('../src/app.js');

async function callFeedback(body: Record<string, unknown>) {
  const app = createApp();
  return app.request('/v1/chat/feedback', {
    method: 'POST',
    headers: { Authorization: 'Bearer good-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const PROFILE = { birthProfileId: null };
const SESSION_ID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  state.verifyIdToken.mockReset().mockResolvedValue({ uid: 'firebase-uid-1' });
  state.findUserByFirebaseUid
    .mockReset()
    .mockResolvedValue(
      makeUserRow({ id: 'user-1', dataProcessingConsentAt: new Date('2026-01-01') }),
    );
  state.touchUserLastActive.mockReset().mockResolvedValue(undefined);
  state.resolveActiveProfileContext.mockReset().mockResolvedValue(PROFILE);
  state.getChatSession.mockReset();
  state.incrementFeedbackCounter.mockReset().mockResolvedValue(undefined);
  state.recordChatFeedbackVote.mockReset().mockResolvedValue(undefined);
  state.saveChatFeedbackReport.mockReset().mockResolvedValue(undefined);
  state.notifyChatDownvote.mockReset().mockResolvedValue(undefined);
});

describe('POST /v1/chat/feedback — session ownership', () => {
  it('404s and records nothing when sessionId does not belong to the caller (or does not exist)', async () => {
    state.getChatSession.mockResolvedValue(null);

    const res = await callFeedback({ vote: 'up', sessionId: SESSION_ID });

    expect(res.status).toBe(404);
    expect(state.getChatSession).toHaveBeenCalledWith(SESSION_ID, 'user-1', null);
    expect(state.recordChatFeedbackVote).not.toHaveBeenCalled();
    expect(state.incrementFeedbackCounter).not.toHaveBeenCalled();
  });

  it('records the vote when sessionId belongs to the caller', async () => {
    state.getChatSession.mockResolvedValue({ id: SESSION_ID, userId: 'user-1' });

    const res = await callFeedback({ vote: 'up', sessionId: SESSION_ID });

    expect(res.status).toBe(200);
    expect(state.recordChatFeedbackVote).toHaveBeenCalledWith({
      userId: 'user-1',
      vote: 'up',
      sessionId: SESSION_ID,
    });
  });

  it('skips the ownership check entirely (and records normally) when no sessionId is given', async () => {
    const res = await callFeedback({ vote: 'up' });

    expect(res.status).toBe(200);
    expect(state.getChatSession).not.toHaveBeenCalled();
    expect(state.recordChatFeedbackVote).toHaveBeenCalledWith({
      userId: 'user-1',
      vote: 'up',
      sessionId: undefined,
    });
  });

  it('also blocks a downvote report from attaching to a session the caller does not own', async () => {
    state.getChatSession.mockResolvedValue(null);

    const res = await callFeedback({
      vote: 'down',
      sessionId: SESSION_ID,
      question: 'Q',
      answer: 'A',
    });

    expect(res.status).toBe(404);
    expect(state.saveChatFeedbackReport).not.toHaveBeenCalled();
    expect(state.notifyChatDownvote).not.toHaveBeenCalled();
  });
});
