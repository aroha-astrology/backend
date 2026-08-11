import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUserRow, makeProfileContext } from './helpers/mocks.js';
import type * as AstroService from '../src/modules/astro/astro.service.js';

// The product rule is "you can't ask the next question until the current answer
// has finished". The app enforces that in the composer (ChatConversation.tsx
// disables the send button while `streaming`), but that is presentation only —
// a second tab, a replayed request or a script bypasses it and fires concurrent
// generations at the shared Gemini free tier, each one charging the wallet.
//
// These cover the server-side enforcement: a Redis single-flight lock taken
// before the wallet debit. Crucially it must fail OPEN when Redis itself is
// unreachable — rejecting on "can't tell" would turn a Redis blip into a total
// chat outage, which is the failure this codebase already shipped once
// (the /v1 limiter incident, 8c6e412).

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
  acquire: vi.fn(),
  release: vi.fn(),
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

vi.mock('../src/lib/cache/locks.js', () => ({
  acquire: state.acquire,
  release: state.release,
}));

vi.mock('../src/modules/features/features.service.js', () => ({
  resolveFeaturesForUser: state.resolveFeaturesForUser,
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
  state.findUserByFirebaseUid
    .mockReset()
    .mockResolvedValue(
      makeUserRow({ id: 'user-1', dataProcessingConsentAt: new Date('2026-01-01') }),
    );
  state.touchUserLastActive.mockReset().mockResolvedValue(undefined);
  state.deductWalletBalance.mockReset().mockResolvedValue(true);
  state.addWalletBalance.mockReset().mockResolvedValue(undefined);
  state.resolveActiveProfileContext
    .mockReset()
    .mockResolvedValue(makeProfileContext({ birthProfileId: null }));
  state.getChatSession.mockReset();
  state.createChatSession.mockReset().mockResolvedValue({ id: 'new-session-1' });
  state.updateChatSession.mockReset();
  state.chatStream.mockReset().mockImplementation(function* () {
    yield { type: 'token', content: 'An answer.' };
  });
  state.acquire.mockReset().mockResolvedValue({ ok: true, owner: 'owner-1' });
  state.release.mockReset().mockResolvedValue(true);
  // No 'paid.chat' override — the route falls back to
  // CHAT_MESSAGE_COST_FALLBACK_PAISE (2000), matching every existing test's
  // expectations below.
  state.resolveFeaturesForUser.mockReset().mockResolvedValue({});
});

describe('POST /v1/chat — charges the resolved paid.chat price, not a hardcoded one', () => {
  // Regression coverage: the route used to charge a bare hardcoded constant
  // that ignored any admin-set 'paid.chat' price, so a user could be shown
  // one price (frontend reads the same resolved feature) and charged another.
  it('charges the admin-resolved price instead of the 2000 fallback', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({
      'paid.chat': { enabled: true, pricePaise: 800, originalPricePaise: null },
    });

    const res = await callChat({ message: 'Q1' });
    await res.text();

    expect(state.deductWalletBalance).toHaveBeenCalledWith('user-1', 800, 'chat_message');
  });

  it('refunds the same resolved price it charged, on generation failure', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({
      'paid.chat': { enabled: true, pricePaise: 800, originalPricePaise: null },
    });
    state.chatStream.mockImplementation(function* () {
      yield { type: 'token', content: 'partial answer' };
      throw new Error('gemini exploded');
    });

    const res = await callChat({ message: 'Q1' });
    await res.text();

    expect(state.addWalletBalance).toHaveBeenCalledWith('user-1', 800, 'refund:chat_message');
  });
});

describe("POST /v1/chat — the model's own suggested follow-up is free", () => {
  // The chip existed for months and every tap cost the full price — the exact
  // mechanism built to keep a conversation going was the reason it didn't.
  // Verified against the server's OWN stored transcript (chatSessionsRepo
  // .getChatSession), never a client-supplied flag.
  const storedSessionWithFollowUp = {
    history: [
      { role: 'user' as const, content: 'How will my week be?' },
      {
        role: 'assistant' as const,
        content: 'Steady progress ahead.\nAsk next: What about my finances this month?',
      },
    ],
    summary: null,
    updatedAt: new Date('2026-08-01T00:00:00Z'),
  };

  it('does not charge when the message matches the suggested follow-up', async () => {
    state.getChatSession.mockResolvedValue(storedSessionWithFollowUp);
    state.resolveFeaturesForUser.mockResolvedValue({
      'paid.chat': { enabled: true, pricePaise: 800, originalPricePaise: null },
    });

    const res = await callChat({
      message: 'What about my finances this month?',
      sessionId: '11111111-1111-1111-1111-111111111111',
    });
    await res.text();

    expect(state.deductWalletBalance).not.toHaveBeenCalled();
  });

  it('is tolerant of whitespace/punctuation/case differences in the tap', async () => {
    state.getChatSession.mockResolvedValue(storedSessionWithFollowUp);
    state.resolveFeaturesForUser.mockResolvedValue({});

    const res = await callChat({
      message: '  WHAT about my finances this month?  ',
      sessionId: '11111111-1111-1111-1111-111111111111',
    });
    await res.text();

    expect(state.deductWalletBalance).not.toHaveBeenCalled();
  });

  it('still charges full price for an unrelated message in the same session', async () => {
    state.getChatSession.mockResolvedValue(storedSessionWithFollowUp);
    state.resolveFeaturesForUser.mockResolvedValue({
      'paid.chat': { enabled: true, pricePaise: 800, originalPricePaise: null },
    });

    const res = await callChat({
      message: 'What about my health?',
      sessionId: '11111111-1111-1111-1111-111111111111',
    });
    await res.text();

    expect(state.deductWalletBalance).toHaveBeenCalledWith('user-1', 800, 'chat_message');
  });

  it('never refunds a free follow-up even when generation fails (nothing was charged)', async () => {
    state.getChatSession.mockResolvedValue(storedSessionWithFollowUp);
    state.resolveFeaturesForUser.mockResolvedValue({});
    state.chatStream.mockImplementation(function* () {
      yield { type: 'token', content: 'partial' };
      throw new Error('gemini exploded');
    });

    const res = await callChat({
      message: 'What about my finances this month?',
      sessionId: '11111111-1111-1111-1111-111111111111',
    });
    await res.text();

    expect(state.addWalletBalance).not.toHaveBeenCalled();
  });

  it('charges normally for a brand-new session with no prior assistant turn to match against', async () => {
    state.getChatSession.mockResolvedValue(undefined);
    state.resolveFeaturesForUser.mockResolvedValue({
      'paid.chat': { enabled: true, pricePaise: 800, originalPricePaise: null },
    });

    const res = await callChat({ message: 'What about my finances this month?' });
    await res.text();

    expect(state.deductWalletBalance).toHaveBeenCalledWith('user-1', 800, 'chat_message');
  });
});

describe('POST /v1/chat — one question at a time', () => {
  it('rejects a second question while the first answer is still being written', async () => {
    state.acquire.mockResolvedValue({ ok: false, reason: 'held' });

    const res = await callChat({ message: 'Q2' });

    expect(res.status).toBe(429);
    expect(state.chatStream).not.toHaveBeenCalled();
  });

  it('keeps the pacing rejection distinguishable from "not enough credits"', async () => {
    // Both used to be a 409/CONFLICT, which left the client unable to tell a
    // duplicate send (swallow silently) from a genuine out-of-credits response
    // (must be shown, with a top-up prompt).
    state.acquire.mockResolvedValue({ ok: false, reason: 'held' });
    const paced = await callChat({ message: 'Q2' });

    state.acquire.mockResolvedValue({ ok: true, owner: 'owner-1' });
    state.deductWalletBalance.mockResolvedValue(false);
    const broke = await callChat({ message: 'Q2' });

    expect(paced.status).toBe(429);
    expect(broke.status).toBe(409);
  });

  it('does not charge the wallet for a rejected duplicate', async () => {
    // The lock is taken BEFORE the debit precisely so this can't happen — a
    // duplicate that charged and then refunded would still show up as a pair of
    // wallet_transactions rows the user has to reconcile.
    state.acquire.mockResolvedValue({ ok: false, reason: 'held' });

    await callChat({ message: 'Q2' });

    expect(state.deductWalletBalance).not.toHaveBeenCalled();
    expect(state.addWalletBalance).not.toHaveBeenCalled();
  });

  it('discloses no ceiling, window or retry delay in the rejection body', async () => {
    // The 429 status inherently means "slow down" and the app never renders
    // this body at all (ChatConversation.tsx swallows a 429 and restores the
    // draft). What must never leak is the *shape* of the pacing rule — a
    // number of questions, a window, or a countdown — since that is what would
    // let someone tune against it, and what the product promises never to show.
    state.acquire.mockResolvedValue({ ok: false, reason: 'held' });

    const res = await callChat({ message: 'Q2' });
    const { error } = (await res.json()) as { error: { message: string } };

    // Asserted on the message alone — the envelope also carries a requestId,
    // which is a correlation id for the logs and discloses nothing about pacing.
    expect(error.message).not.toMatch(/\d/); // no counts, windows or retry seconds
    expect(error.message).not.toMatch(/per minute|try again|wait|quota|remaining/i);
    expect(res.headers.get('Retry-After')).toBeNull();
  });

  it('lets the question through when Redis is unreachable (fails open)', async () => {
    state.acquire.mockResolvedValue({ ok: false, reason: 'unavailable' });

    const res = await callChat({ message: 'Q1' });

    expect(res.status).toBe(200);
    await res.text();
    expect(state.chatStream).toHaveBeenCalled();
  });

  it('releases the lock once the answer completes, so the next question can proceed', async () => {
    const res = await callChat({ message: 'Q1' });
    await res.text();

    expect(state.release).toHaveBeenCalledWith('chat:inflight', 'user-1', 'owner-1');
  });

  it('releases the lock when generation fails', async () => {
    // Fails partway through rather than at the first tick — the realistic
    // shape, and the one where the lock has definitely been held for a while.
    state.chatStream.mockImplementation(function* () {
      yield { type: 'token', content: 'partial answer' };
      throw new Error('gemini exploded');
    });

    const res = await callChat({ message: 'Q1' });
    await res.text();

    expect(state.release).toHaveBeenCalledWith('chat:inflight', 'user-1', 'owner-1');
  });

  it('releases the lock when the user cannot afford the question', async () => {
    // This path throws before streamSSE is ever reached, so it has no `finally`
    // to fall back on — without an explicit release the user would be locked
    // out of chat until the TTL expired, purely for being out of credits.
    state.deductWalletBalance.mockResolvedValue(false);

    const res = await callChat({ message: 'Q1' });

    expect(res.status).toBe(409);
    expect(state.release).toHaveBeenCalledWith('chat:inflight', 'user-1', 'owner-1');
  });

  it('releases the lock when the wallet debit itself throws', async () => {
    // Same "throws before streamSSE" hazard as the case above, but via a DB
    // failure rather than an insufficient balance.
    state.deductWalletBalance.mockRejectedValue(new Error('db down'));

    await callChat({ message: 'Q1' });

    expect(state.release).toHaveBeenCalledWith('chat:inflight', 'user-1', 'owner-1');
  });

  it('does not attempt a release when the lock was never held', async () => {
    state.acquire.mockResolvedValue({ ok: false, reason: 'unavailable' });

    const res = await callChat({ message: 'Q1' });
    await res.text();

    expect(state.release).not.toHaveBeenCalled();
  });

  it('releases the lock and refunds when persisting the question (before generation) throws', async () => {
    // Same "throws before streamSSE" hazard as the wallet-debit failure cases
    // above, but for the new pre-generation session write: the wallet was
    // already charged, so a DB failure here must not leave the user both
    // charged and locked out.
    state.createChatSession.mockRejectedValue(new Error('db down'));

    const res = await callChat({ message: 'Q1' });

    expect(state.release).toHaveBeenCalledWith('chat:inflight', 'user-1', 'owner-1');
    expect(state.addWalletBalance).toHaveBeenCalledWith('user-1', 2000, 'refund:chat_message');
    expect(state.chatStream).not.toHaveBeenCalled();
    expect(res.status).toBe(500);
  });
});
