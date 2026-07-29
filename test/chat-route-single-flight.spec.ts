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
});
