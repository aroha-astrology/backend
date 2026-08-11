import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeProfileContext } from './helpers/mocks.js';

// Realtime voice bills for something this server cannot observe: the audio goes
// straight from the client to Google. The only lever the backend holds is
// whether it mints the next short-lived token, so every guarantee below —
// the 3-minute ceiling, the per-minute price, the refunds — is really a
// statement about mint behaviour. These specs pin that down.

const state = vi.hoisted(() => ({
  claimVoiceMinute: vi.fn(),
  releaseVoiceMinute: vi.fn(),
  createVoiceSession: vi.fn(),
  getVoiceSession: vi.fn(),
  endVoiceSession: vi.fn(),
  endVoiceSessionWithRefund: vi.fn(),
  deductWalletBalance: vi.fn(),
  addWalletBalance: vi.fn(),
  findActiveUserById: vi.fn(),
  resolveFeaturesForUser: vi.fn(),
  mintLiveToken: vi.fn(),
  getKundliForUser: vi.fn(),
  withLiveSadeSati: vi.fn(),
  getUserFacts: vi.fn(),
  buildGroundingFacts: vi.fn(),
  buildProfileFacts: vi.fn(),
  buildVoiceSystemInstruction: vi.fn(),
  insertAiUsage: vi.fn(),
}));

const fakeEnv = {
  GEMINI_LIVE_ENABLED: true,
  GEMINI_LIVE_MODEL: 'gemini-3.1-flash-live-preview',
  // The service pulls in the shared logger, which reads this at import time.
  LOG_LEVEL: 'silent',
};
vi.mock('../src/config/env.js', () => ({
  env: fakeEnv,
  isProduction: false,
  isTest: true,
}));

vi.mock('../src/modules/voice/voice.repo.js', () => ({
  claimVoiceMinute: state.claimVoiceMinute,
  releaseVoiceMinute: state.releaseVoiceMinute,
  createVoiceSession: state.createVoiceSession,
  getVoiceSession: state.getVoiceSession,
  endVoiceSession: state.endVoiceSession,
  endVoiceSessionWithRefund: state.endVoiceSessionWithRefund,
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  deductWalletBalance: state.deductWalletBalance,
  addWalletBalance: state.addWalletBalance,
  findActiveUserById: state.findActiveUserById,
}));

vi.mock('../src/modules/features/features.service.js', () => ({
  resolveFeaturesForUser: state.resolveFeaturesForUser,
}));

vi.mock('../src/lib/llm/gemini-live-token.js', () => ({
  mintLiveToken: state.mintLiveToken,
}));

vi.mock('../src/modules/kundli/kundli.service.js', () => ({
  getKundliForUser: state.getKundliForUser,
  withLiveSadeSati: state.withLiveSadeSati,
}));

vi.mock('../src/modules/astro/user-facts.repo.js', () => ({
  getUserFacts: state.getUserFacts,
}));

vi.mock('../src/lib/chat-grounding.js', () => ({
  buildGroundingFacts: state.buildGroundingFacts,
  buildProfileFacts: state.buildProfileFacts,
}));

vi.mock('../src/lib/swarm/agents/scholar.js', () => ({
  buildVoiceSystemInstruction: state.buildVoiceSystemInstruction,
}));

vi.mock('../src/modules/admin/ai-usage.repo.js', () => ({
  insertAiUsage: state.insertAiUsage,
}));

const { startVoiceSession, extendVoiceSession, endVoiceSessionForUser, VOICE_MAX_MINUTES } =
  await import('../src/modules/voice/voice.service.js');

const PRICE = 2000;
const USER = 'user-1';
const SESSION = 'session-1';
const profile = makeProfileContext({ birthProfileId: null });

/** A successful minute claim landing on `minutesCharged`. */
function claimed(minutesCharged: number) {
  return { id: SESSION, userId: USER, minutesCharged, active: true };
}

beforeEach(() => {
  fakeEnv.GEMINI_LIVE_ENABLED = true;

  state.claimVoiceMinute.mockReset().mockResolvedValue(claimed(1));
  state.releaseVoiceMinute.mockReset().mockResolvedValue(undefined);
  state.createVoiceSession.mockReset().mockResolvedValue({ id: SESSION });
  state.getVoiceSession.mockReset().mockResolvedValue({ id: SESSION, active: true });
  state.endVoiceSession.mockReset().mockResolvedValue(undefined);
  state.endVoiceSessionWithRefund.mockReset().mockResolvedValue(null);

  state.deductWalletBalance.mockReset().mockResolvedValue(true);
  state.addWalletBalance.mockReset().mockResolvedValue(undefined);
  state.findActiveUserById.mockReset().mockResolvedValue({ id: USER });
  state.resolveFeaturesForUser
    .mockReset()
    .mockResolvedValue({ 'paid.voiceChat': { enabled: true, pricePaise: PRICE } });

  state.mintLiveToken
    .mockReset()
    .mockResolvedValue({ token: 'tok-abc', expiresAt: 1_800_000, model: 'live-model' });

  state.getKundliForUser.mockReset().mockResolvedValue({ status: 'ready', chartData: {} });
  state.withLiveSadeSati.mockReset().mockImplementation((doshaData) => Promise.resolve(doshaData));
  state.getUserFacts.mockReset().mockResolvedValue([]);
  state.buildGroundingFacts.mockReset().mockResolvedValue(['Ascendant: Leo']);
  state.buildProfileFacts.mockReset().mockReturnValue([]);
  state.buildVoiceSystemInstruction.mockReset().mockReturnValue('SYSTEM PROMPT');
  state.insertAiUsage.mockReset().mockResolvedValue(undefined);
});

describe('startVoiceSession', () => {
  it('charges exactly one minute and returns a token', async () => {
    const grant = await startVoiceSession(USER, profile, 'en');

    expect(state.deductWalletBalance).toHaveBeenCalledTimes(1);
    expect(state.deductWalletBalance).toHaveBeenCalledWith(USER, PRICE, 'voice_minute');
    expect(grant.token).toBe('tok-abc');
    expect(grant.minutesUsed).toBe(1);
    expect(grant.minutesRemaining).toBe(VOICE_MAX_MINUTES - 1);
  });

  it('records the minute in ai_usage — the only point this server can observe voice usage at all', async () => {
    // Regression: realtime voice was previously invisible everywhere in ai_usage-based cost
    // reporting, since the conversation itself never touches this server (see the module doc
    // comment). tokensIn/tokensOut are deliberately 0, not omitted — there is no verified
    // token-equivalent for Gemini Live's audio pricing in this codebase, so this only makes
    // call volume/duration visible, not $ cost, until that conversion exists.
    await startVoiceSession(USER, profile, 'en');

    await vi.waitFor(() => {
      expect(state.insertAiUsage).toHaveBeenCalledWith({
        userId: USER,
        agent: 'voice',
        model: 'live-model',
        tokensIn: 0,
        tokensOut: 0,
        durationMs: 60_000,
      });
    });
  });

  it('never blocks the session grant on an ai_usage write failure', async () => {
    state.insertAiUsage.mockRejectedValue(new Error('db down'));

    const grant = await startVoiceSession(USER, profile, 'en');

    expect(grant.token).toBe('tok-abc');
  });

  it('claims the minute before touching the wallet', async () => {
    // Ordering matters: the claim is the atomic ceiling check, so a mint that
    // the ceiling would refuse must never reach the wallet at all.
    const order: string[] = [];
    state.claimVoiceMinute.mockImplementation(() => {
      order.push('claim');
      return Promise.resolve(claimed(1));
    });
    state.deductWalletBalance.mockImplementation(() => {
      order.push('charge');
      return Promise.resolve(true);
    });

    await startVoiceSession(USER, profile, 'en');

    expect(order).toEqual(['claim', 'charge']);
  });

  it('pins the system instruction into the token at mint time', async () => {
    // The client connects straight to Google, so the persona, chart grounding
    // and content policy have to be baked into the token — anything the client
    // could supply instead would be something it could also change.
    await startVoiceSession(USER, profile, 'en');

    expect(state.mintLiveToken).toHaveBeenCalledWith(
      expect.objectContaining({ systemInstruction: 'SYSTEM PROMPT' }),
    );
  });

  it('refuses to start when the kill switch is off, without charging', async () => {
    fakeEnv.GEMINI_LIVE_ENABLED = false;

    await expect(startVoiceSession(USER, profile, 'en')).rejects.toThrow();
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
    expect(state.mintLiveToken).not.toHaveBeenCalled();
  });

  it('gives the minute back when the wallet has insufficient balance', async () => {
    state.deductWalletBalance.mockResolvedValue(false);

    await expect(startVoiceSession(USER, profile, 'en')).rejects.toThrow();

    expect(state.releaseVoiceMinute).toHaveBeenCalledWith(SESSION, USER);
    expect(state.mintLiveToken).not.toHaveBeenCalled();
  });

  it('refunds BOTH the money and the minute when Google refuses to mint', async () => {
    // The user got nothing, so neither the charge nor the consumed allowance
    // may survive — a refund that returned the money but kept the minute would
    // still shorten the call they paid for.
    state.mintLiveToken.mockRejectedValue(new Error('502 from Google'));

    await expect(startVoiceSession(USER, profile, 'en')).rejects.toThrow();

    expect(state.addWalletBalance).toHaveBeenCalledWith(USER, PRICE, 'refund:voice_minute');
    expect(state.releaseVoiceMinute).toHaveBeenCalledWith(SESSION, USER);
  });

  it('uses the admin-configured price rather than the hardcoded default', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({
      'paid.voiceChat': { enabled: true, pricePaise: 3500 },
    });

    const grant = await startVoiceSession(USER, profile, 'en');

    expect(state.deductWalletBalance).toHaveBeenCalledWith(USER, 3500, 'voice_minute');
    expect(grant.pricePerMinutePaise).toBe(3500);
  });

  it("passes the active profile's displayName through to the greeting instruction", async () => {
    // Whichever profile the call is grounded to (primary or an additional
    // profile) — this is what makes the AI's opening "Radhe Radhe, <name>"
    // greeting personalized, without touching PERSONAL_TOUCH's "never use the
    // name" rule for the rest of the call.
    const named = makeProfileContext({ birthProfileId: null, displayName: 'Priya' });

    await startVoiceSession(USER, named, 'en');

    expect(state.buildVoiceSystemInstruction).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Priya' }),
    );
  });

  it('still starts when the chart is unavailable', async () => {
    // Grounding is best-effort everywhere else in this codebase; a missing
    // kundli must not block a call the user is about to be charged for.
    state.getKundliForUser.mockRejectedValue(new Error('kundli service down'));

    const grant = await startVoiceSession(USER, profile, 'en');

    expect(grant.token).toBe('tok-abc');
  });
});

describe('extendVoiceSession — the 3-minute ceiling', () => {
  it('refuses the minute past the ceiling and charges nothing', async () => {
    // claimVoiceMinute returns null when its `minutes_charged < max` predicate
    // fails, which is the ceiling being enforced in SQL rather than in JS.
    state.claimVoiceMinute.mockResolvedValue(null);

    await expect(extendVoiceSession(USER, SESSION, profile, 'en', 'handle')).rejects.toThrow();

    expect(state.deductWalletBalance).not.toHaveBeenCalled();
    expect(state.mintLiveToken).not.toHaveBeenCalled();
  });

  it('reports no minutes remaining on the last allowed minute', async () => {
    state.claimVoiceMinute.mockResolvedValue(claimed(VOICE_MAX_MINUTES));

    const grant = await extendVoiceSession(USER, SESSION, profile, 'en', 'handle');

    expect(grant.minutesUsed).toBe(VOICE_MAX_MINUTES);
    expect(grant.minutesRemaining).toBe(0);
  });

  it('caps total spend at the price times the ceiling', async () => {
    // Walk a whole session: VOICE_MAX_MINUTES granted minutes, then a refusal.
    // Driven off the constant rather than a fixed call count, so this stays
    // correct whatever the ceiling is currently set to.
    let charged = 0;
    state.claimVoiceMinute.mockImplementation(() => {
      charged += 1;
      return Promise.resolve(charged <= VOICE_MAX_MINUTES ? claimed(charged) : null);
    });

    await startVoiceSession(USER, profile, 'en');
    for (let i = 1; i < VOICE_MAX_MINUTES; i++) {
      await extendVoiceSession(USER, SESSION, profile, 'en', 'h');
    }
    await expect(extendVoiceSession(USER, SESSION, profile, 'en', 'h')).rejects.toThrow();

    expect(state.deductWalletBalance).toHaveBeenCalledTimes(VOICE_MAX_MINUTES);
  });

  it('forwards the resumption handle so the conversation continues', async () => {
    await extendVoiceSession(USER, SESSION, profile, 'en', 'resume-me');

    expect(state.mintLiveToken).toHaveBeenCalledWith(
      expect.objectContaining({ resumptionHandle: 'resume-me' }),
    );
  });

  it('404s an unknown session before charging', async () => {
    state.getVoiceSession.mockResolvedValue(null);

    await expect(extendVoiceSession(USER, SESSION, profile, 'en', 'h')).rejects.toThrow();
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
  });

  it('refuses to extend a session that has already ended', async () => {
    state.getVoiceSession.mockResolvedValue({ id: SESSION, active: false });

    await expect(extendVoiceSession(USER, SESSION, profile, 'en', 'h')).rejects.toThrow();
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
  });
});

describe('endVoiceSessionForUser', () => {
  it('marks the session ended', async () => {
    await endVoiceSessionForUser(USER, SESSION);
    expect(state.endVoiceSession).toHaveBeenCalledWith(SESSION, USER);
  });

  it('never throws — the client calls it on unload and on error paths', async () => {
    state.endVoiceSession.mockRejectedValue(new Error('db down'));
    await expect(endVoiceSessionForUser(USER, SESSION)).resolves.toBeUndefined();
  });

  it('refunds nothing on an ordinary hangup, because minutes are paid for when granted', async () => {
    await endVoiceSessionForUser(USER, SESSION);
    expect(state.addWalletBalance).not.toHaveBeenCalled();
    // Not even attempted: a plain hangup has no business asking the
    // grace-window question at all.
    expect(state.endVoiceSessionWithRefund).not.toHaveBeenCalled();
  });

  it('refunds nothing when connected is explicitly true', async () => {
    await endVoiceSessionForUser(USER, SESSION, true);
    expect(state.addWalletBalance).not.toHaveBeenCalled();
    expect(state.endVoiceSessionWithRefund).not.toHaveBeenCalled();
  });

  it('refunds the most recent minute when connected:false lands inside the grace window', async () => {
    state.endVoiceSessionWithRefund.mockResolvedValue({ refundedMinutes: 1 });

    await endVoiceSessionForUser(USER, SESSION, false);

    expect(state.endVoiceSessionWithRefund).toHaveBeenCalledWith(SESSION, USER, expect.any(Number));
    expect(state.addWalletBalance).toHaveBeenCalledWith(USER, PRICE, 'refund:voice_minute');
    // The atomic repo call already marked the session ended — a second,
    // plain end would be redundant (and would race the same row).
    expect(state.endVoiceSession).not.toHaveBeenCalled();
  });

  it('refunds at the currently configured price, not a hardcoded one', async () => {
    state.endVoiceSessionWithRefund.mockResolvedValue({ refundedMinutes: 1 });
    state.resolveFeaturesForUser.mockResolvedValue({
      'paid.voiceChat': { enabled: true, pricePaise: 3500 },
    });

    await endVoiceSessionForUser(USER, SESSION, false);

    expect(state.addWalletBalance).toHaveBeenCalledWith(USER, 3500, 'refund:voice_minute');
  });

  it('falls back to a plain end when connected:false arrives outside the grace window', async () => {
    // null is exactly what the atomic repo call returns when its WHERE clause
    // fails — already ended, no minute to give back, or too late.
    state.endVoiceSessionWithRefund.mockResolvedValue(null);

    await endVoiceSessionForUser(USER, SESSION, false);

    expect(state.addWalletBalance).not.toHaveBeenCalled();
    expect(state.endVoiceSession).toHaveBeenCalledWith(SESSION, USER);
  });

  it('falls back to a plain end if the refund check itself fails, without throwing', async () => {
    state.endVoiceSessionWithRefund.mockRejectedValue(new Error('db down'));

    await expect(endVoiceSessionForUser(USER, SESSION, false)).resolves.toBeUndefined();

    expect(state.addWalletBalance).not.toHaveBeenCalled();
    expect(state.endVoiceSession).toHaveBeenCalledWith(SESSION, USER);
  });
});
