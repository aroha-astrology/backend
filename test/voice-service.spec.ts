import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeProfileContext } from './helpers/mocks.js';

// Realtime voice bills for something this server cannot observe: the audio goes
// straight from the client to Google. The only lever the backend holds is
// whether it mints the next short-lived token, so every guarantee below —
// Pass members only, the free minutes, the per-minute price, the refunds, the
// safety ceiling — is really a statement about mint behaviour. These specs pin
// that down.

const state = vi.hoisted(() => ({
  passEntitlement: vi.fn(),
  findActivePass: vi.fn(),
  claimFreeVoiceMinute: vi.fn(),
  countFreeVoiceMinutesUsed: vi.fn(),
  claimTrialVoiceMinute: vi.fn(),
  countTrialVoiceMinutesUsed: vi.fn(),
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
  saveUserFacts: vi.fn(),
  buildGroundingFacts: vi.fn(),
  buildProfileFacts: vi.fn(),
  buildVoiceSystemInstruction: vi.fn(),
  insertAiUsage: vi.fn(),
  createChatSession: vi.fn(),
  setCallRecap: vi.fn(),
  extractTurnFacts: vi.fn(),
  summarizeCall: vi.fn(),
  saveVoiceFeedback: vi.fn(),
  alertThrottled: vi.fn(),
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

vi.mock('../src/lib/entitlements.js', () => ({
  passEntitlement: state.passEntitlement,
}));

vi.mock('../src/modules/pass/pass.repo.js', () => ({
  findActivePass: state.findActivePass,
}));

vi.mock('../src/modules/voice/voice.repo.js', () => ({
  claimFreeVoiceMinute: state.claimFreeVoiceMinute,
  countFreeVoiceMinutesUsed: state.countFreeVoiceMinutesUsed,
  claimTrialVoiceMinute: state.claimTrialVoiceMinute,
  countTrialVoiceMinutesUsed: state.countTrialVoiceMinutesUsed,
  claimVoiceMinute: state.claimVoiceMinute,
  releaseVoiceMinute: state.releaseVoiceMinute,
  createVoiceSession: state.createVoiceSession,
  getVoiceSession: state.getVoiceSession,
  endVoiceSession: state.endVoiceSession,
  endVoiceSessionWithRefund: state.endVoiceSessionWithRefund,
  saveVoiceFeedback: state.saveVoiceFeedback,
}));

vi.mock('../src/lib/notifications/alerts.js', () => ({
  alertThrottled: state.alertThrottled,
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
  saveUserFacts: state.saveUserFacts,
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

vi.mock('../src/modules/astro/chat-sessions.repo.js', () => ({
  createChatSession: state.createChatSession,
  setCallRecap: state.setCallRecap,
}));

vi.mock('../src/lib/voice-call-recap.js', () => ({
  summarizeCall: state.summarizeCall,
}));

vi.mock('../src/lib/chat-fact-extraction.js', () => ({
  extractTurnFacts: state.extractTurnFacts,
}));

const {
  startVoiceSession,
  extendVoiceSession,
  endVoiceSessionForUser,
  submitVoiceFeedback,
  VOICE_MAX_MINUTES,
} = await import('../src/modules/voice/voice.service.js');

const { PASS_TIERS, VOICE_TRIAL_MINUTES } = await import('../src/modules/pass/pass.config.js');

/** The member in these tests holds a Silver Pass: 10 free minutes a period. */
const PASS_VOICE_FREE_MINUTES = 10;

const PRICE = 2000;
const USER = 'user-1';
const SESSION = 'session-1';
const PERIOD_START = new Date('2026-10-01T00:00:00Z');
const profile = makeProfileContext({ birthProfileId: null });

/** A successful minute claim landing on `minutesCharged`. */
function claimed(minutesCharged: number) {
  return { id: SESSION, userId: USER, minutesCharged, active: true };
}

/** The member still has free Pass minutes: the next minute is claimed as a free one. */
function withFreeMinutes(minutesCharged = 1, usedAfter = minutesCharged) {
  state.claimFreeVoiceMinute.mockResolvedValue(claimed(minutesCharged));
  state.countFreeVoiceMinutesUsed.mockResolvedValue(usedAfter);
}

beforeEach(() => {
  fakeEnv.GEMINI_LIVE_ENABLED = true;

  // A Silver member whose free minutes for this period are already spent, so a
  // minute is a wallet minute unless a test says otherwise (`withFreeMinutes`).
  state.passEntitlement
    .mockReset()
    .mockResolvedValue({
      tier: 'silver',
      voiceFreeMinutes: PASS_VOICE_FREE_MINUTES,
      features: ['timeline', 'bonds', 'voiceCall'],
    });
  state.findActivePass.mockReset().mockResolvedValue({ periodStart: PERIOD_START });
  state.claimFreeVoiceMinute.mockReset().mockResolvedValue(null);
  state.countFreeVoiceMinutesUsed.mockReset().mockResolvedValue(PASS_VOICE_FREE_MINUTES);
  // The trial is switched off unless a test turns it on (`withTrial`), so these
  // default specs describe the Pass rules alone.
  state.claimTrialVoiceMinute.mockReset().mockResolvedValue(null);
  state.countTrialVoiceMinutesUsed.mockReset().mockResolvedValue(0);

  state.claimVoiceMinute.mockReset().mockResolvedValue(claimed(1));
  state.releaseVoiceMinute.mockReset().mockResolvedValue(undefined);
  state.createVoiceSession.mockReset().mockResolvedValue({ id: SESSION });
  state.getVoiceSession.mockReset().mockResolvedValue({ id: SESSION, active: true });
  // A row means "this call flipped active=true -> false"; voice.repo.ts
  // returns null on a duplicate/retried /end, which most tests below don't
  // exercise, so the default here is the common "this was the real end" case.
  state.endVoiceSession
    .mockReset()
    .mockResolvedValue({ id: SESSION, userId: USER, birthProfileId: null, active: false });
  state.endVoiceSessionWithRefund.mockReset().mockResolvedValue(null);

  state.deductWalletBalance.mockReset().mockResolvedValue(true);
  state.addWalletBalance.mockReset().mockResolvedValue(undefined);
  // ₹100 left after the charge: 5 more minutes at the default price.
  state.findActiveUserById.mockReset().mockResolvedValue({ id: USER, walletBalancePaise: 10_000 });
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

  state.createChatSession.mockReset().mockResolvedValue({ id: 'chat-session-1' });
  state.setCallRecap.mockReset().mockResolvedValue(undefined);
  state.summarizeCall.mockReset().mockResolvedValue(null);
  state.extractTurnFacts.mockReset().mockResolvedValue([]);
  state.saveUserFacts.mockReset().mockResolvedValue(undefined);
});

describe('startVoiceSession', () => {
  it('charges exactly one minute and returns a token', async () => {
    const grant = await startVoiceSession(USER, profile, 'en');

    expect(state.deductWalletBalance).toHaveBeenCalledTimes(1);
    expect(state.deductWalletBalance).toHaveBeenCalledWith(USER, PRICE, 'voice_minute');
    expect(grant.token).toBe('tok-abc');
    expect(grant.minutesUsed).toBe(1);
    expect(grant.freeMinute).toBe(false);
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
    expect(state.releaseVoiceMinute).toHaveBeenCalledWith(SESSION, USER, 'paid');
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

describe('voice call is a Pass benefit', () => {
  it('refuses to start without a Pass, before creating a session or charging', async () => {
    state.passEntitlement.mockResolvedValue(null);

    await expect(startVoiceSession(USER, profile, 'en')).rejects.toThrow('PASS_REQUIRED');

    expect(state.createVoiceSession).not.toHaveBeenCalled();
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
    expect(state.mintLiveToken).not.toHaveBeenCalled();
  });

  it('refuses a Pass whose tier does not include voice call', async () => {
    state.passEntitlement.mockResolvedValue({ tier: 'silver', features: ['timeline', 'bonds'] });

    await expect(startVoiceSession(USER, profile, 'en')).rejects.toThrow('PASS_REQUIRED');
  });

  it('stops the next minute when the Pass ends in the middle of a call', async () => {
    state.passEntitlement.mockResolvedValue(null);

    await expect(extendVoiceSession(USER, SESSION, profile, 'en', 'h')).rejects.toThrow(
      'PASS_REQUIRED',
    );
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
  });

  it('every tier includes voice call', () => {
    for (const tier of PASS_TIERS) expect(tier.features, tier.tier).toContain('voiceCall');
  });

  // Owner, 2026-10-17: 3 free minutes for every tier became 10 / 15 / 20.
  it('gives Silver 10, Gold 15 and Platinum 20 free minutes a period', () => {
    expect(PASS_TIERS.map((t) => [t.tier, t.voiceFreeMinutes])).toEqual([
      ['silver', 10],
      ['gold', 15],
      ['platinum', 20],
    ]);
  });

  it("counts the member's own tier allowance, not a fixed number", async () => {
    state.passEntitlement.mockResolvedValue({
      tier: 'platinum',
      voiceFreeMinutes: 20,
      features: ['voiceCall'],
    });
    withFreeMinutes(1);

    const grant = await startVoiceSession(USER, profile, 'en');

    expect(state.claimFreeVoiceMinute).toHaveBeenCalledWith(
      SESSION,
      USER,
      VOICE_MAX_MINUTES,
      PERIOD_START,
      20,
    );
    expect(grant.freeMinutesLeft).toBe(19);
  });
});

describe('free Pass minutes', () => {
  it('gives a free minute without touching the wallet', async () => {
    withFreeMinutes(1);

    const grant = await startVoiceSession(USER, profile, 'en');

    expect(state.deductWalletBalance).not.toHaveBeenCalled();
    expect(state.claimVoiceMinute).not.toHaveBeenCalled();
    expect(grant.freeMinute).toBe(true);
    expect(grant.freeMinutesLeft).toBe(PASS_VOICE_FREE_MINUTES - 1);
  });

  it('counts the allowance from the start of the Pass period, across all calls', async () => {
    withFreeMinutes(1);

    await startVoiceSession(USER, profile, 'en');

    expect(state.claimFreeVoiceMinute).toHaveBeenCalledWith(
      SESSION,
      USER,
      VOICE_MAX_MINUTES,
      PERIOD_START,
      PASS_VOICE_FREE_MINUTES,
    );
  });

  it('counts a group member with no Pass row over the last 30 days', async () => {
    state.findActivePass.mockResolvedValue(null);
    withFreeMinutes(1);
    const before = Date.now();

    await startVoiceSession(USER, profile, 'en');

    const since = state.claimFreeVoiceMinute.mock.calls[0]![3] as Date;
    expect(before - since.getTime()).toBeGreaterThanOrEqual(30 * 86_400_000 - 5_000);
    expect(before - since.getTime()).toBeLessThanOrEqual(30 * 86_400_000 + 5_000);
  });

  it('charges the wallet once the free minutes are spent', async () => {
    // The default setup: the free claim comes back empty.
    const grant = await extendVoiceSession(USER, SESSION, profile, 'en', 'h');

    expect(state.claimFreeVoiceMinute).toHaveBeenCalledTimes(1);
    expect(state.deductWalletBalance).toHaveBeenCalledWith(USER, PRICE, 'voice_minute');
    expect(grant.freeMinute).toBe(false);
    expect(grant.freeMinutesLeft).toBe(0);
  });

  it('a whole call: free minutes first, then one wallet charge per minute', async () => {
    let minute = 0;
    state.claimFreeVoiceMinute.mockImplementation(() => {
      if (minute >= PASS_VOICE_FREE_MINUTES) return Promise.resolve(null);
      minute += 1;
      return Promise.resolve(claimed(minute));
    });
    state.claimVoiceMinute.mockImplementation(() => {
      minute += 1;
      return Promise.resolve(claimed(minute));
    });

    const grants = [await startVoiceSession(USER, profile, 'en')];
    for (let i = 0; i < PASS_VOICE_FREE_MINUTES + 1; i++) {
      grants.push(await extendVoiceSession(USER, SESSION, profile, 'en', 'h'));
    }

    expect(grants.map((g) => g.freeMinute)).toEqual([
      ...Array<boolean>(PASS_VOICE_FREE_MINUTES).fill(true),
      false,
      false,
    ]);
    expect(state.deductWalletBalance).toHaveBeenCalledTimes(2);
  });

  it('gives a free minute back to the allowance, not the wallet, when Google refuses to mint', async () => {
    withFreeMinutes(1);
    state.mintLiveToken.mockRejectedValue(new Error('502 from Google'));

    await expect(startVoiceSession(USER, profile, 'en')).rejects.toThrow();

    expect(state.addWalletBalance).not.toHaveBeenCalled();
    expect(state.releaseVoiceMinute).toHaveBeenCalledWith(SESSION, USER, 'pass');
  });

  it('refunds no money when the minute that never connected was a free one', async () => {
    state.endVoiceSessionWithRefund.mockResolvedValue({ refundedMinutes: 1, free: true });

    await endVoiceSessionForUser(USER, SESSION, false);

    expect(state.addWalletBalance).not.toHaveBeenCalled();
    expect(state.endVoiceSession).not.toHaveBeenCalled();
  });
});

describe('the voice trial: 3 free minutes once for every user', () => {
  /**
   * Turns the trial on and plays out a user's trial minutes: `usedBefore`
   * already spent on earlier calls, each claim takes the next one until
   * VOICE_TRIAL_MINUTES, and `minutesCharged` counts this session's minutes.
   */
  function withTrial(usedBefore = 0) {
    state.resolveFeaturesForUser.mockResolvedValue({
      'paid.voiceChat': { enabled: true, pricePaise: PRICE },
      'chat.voiceTrial': { enabled: true, pricePaise: null },
    });
    let used = usedBefore;
    let minute = 0;
    state.countTrialVoiceMinutesUsed.mockImplementation(() => Promise.resolve(used));
    state.claimTrialVoiceMinute.mockImplementation(() => {
      if (used >= VOICE_TRIAL_MINUTES) return Promise.resolve(null);
      used += 1;
      minute += 1;
      return Promise.resolve(claimed(minute));
    });
    state.claimFreeVoiceMinute.mockImplementation(() => {
      minute += 1;
      return Promise.resolve(claimed(minute));
    });
    state.claimVoiceMinute.mockImplementation(() => {
      minute += 1;
      return Promise.resolve(claimed(minute));
    });
  }

  it('lets someone without a Pass talk for 3 minutes, then refuses the 4th with the Pass lock', async () => {
    state.passEntitlement.mockResolvedValue(null);
    withTrial();

    const grants = [await startVoiceSession(USER, profile, 'en')];
    grants.push(await extendVoiceSession(USER, SESSION, profile, 'en', 'h'));
    grants.push(await extendVoiceSession(USER, SESSION, profile, 'en', 'h'));
    await expect(extendVoiceSession(USER, SESSION, profile, 'en', 'h')).rejects.toThrow(
      'PASS_REQUIRED',
    );

    expect(grants.map((g) => g.trialMinute)).toEqual([true, true, true]);
    expect(grants.every((g) => g.freeMinute && !g.passMember)).toBe(true);
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
    expect(state.claimVoiceMinute).not.toHaveBeenCalled();
  });

  it('counts a trial call down from the trial alone, however full the wallet is', async () => {
    // ₹100 in the wallet would be 5 paid minutes for a member; it must not show here.
    state.passEntitlement.mockResolvedValue(null);
    withTrial();

    const first = await startVoiceSession(USER, profile, 'en');
    const second = await extendVoiceSession(USER, SESSION, profile, 'en', 'h');
    const third = await extendVoiceSession(USER, SESSION, profile, 'en', 'h');

    // The current minute plus these is the 3:00 the app shows.
    expect([first, second, third].map((g) => g.minutesRemaining)).toEqual([2, 1, 0]);
  });

  it('is used once: a later call without a Pass gets the Pass lock at once', async () => {
    state.passEntitlement.mockResolvedValue(null);
    withTrial(VOICE_TRIAL_MINUTES);

    await expect(startVoiceSession(USER, profile, 'en')).rejects.toThrow('PASS_REQUIRED');
    expect(state.createVoiceSession).not.toHaveBeenCalled();
  });

  it('a call cut short keeps the rest of the trial for the next call', async () => {
    state.passEntitlement.mockResolvedValue(null);
    withTrial(1);

    const grant = await startVoiceSession(USER, profile, 'en');

    expect(grant.trialMinute).toBe(true);
    expect(grant.minutesRemaining).toBe(1);
  });

  it('gives a Pass member the trial first, then the monthly Pass minutes, then the wallet', async () => {
    withTrial();
    let passUsed = 0;
    state.claimFreeVoiceMinute.mockImplementation(() => {
      if (passUsed >= PASS_VOICE_FREE_MINUTES) return Promise.resolve(null);
      passUsed += 1;
      return Promise.resolve(claimed(VOICE_TRIAL_MINUTES + passUsed));
    });
    state.claimVoiceMinute.mockResolvedValue(claimed(VOICE_TRIAL_MINUTES + PASS_VOICE_FREE_MINUTES + 1));

    const grants = [await startVoiceSession(USER, profile, 'en')];
    for (let i = 0; i < VOICE_TRIAL_MINUTES + PASS_VOICE_FREE_MINUTES; i++) {
      grants.push(await extendVoiceSession(USER, SESSION, profile, 'en', 'h'));
    }

    expect(grants.map((g) => (g.trialMinute ? 'trial' : g.freeMinute ? 'pass' : 'paid'))).toEqual([
      ...Array<string>(VOICE_TRIAL_MINUTES).fill('trial'),
      ...Array<string>(PASS_VOICE_FREE_MINUTES).fill('pass'),
      'paid',
    ]);
    expect(grants.every((g) => g.passMember)).toBe(true);
    expect(state.deductWalletBalance).toHaveBeenCalledTimes(1);
  });

  it("adds a member's trial minutes to their usual countdown", async () => {
    // Trial 1 of 3 used, the Pass minutes untouched (3), ₹100 in the wallet (5).
    state.countFreeVoiceMinutesUsed.mockResolvedValue(0);
    withTrial();

    const grant = await startVoiceSession(USER, profile, 'en');

    expect(grant.freeMinutesLeft).toBe(2 + PASS_VOICE_FREE_MINUTES);
    expect(grant.minutesRemaining).toBe(2 + PASS_VOICE_FREE_MINUTES + 5);
  });

  it('gives a trial minute back to the trial when Google refuses to mint', async () => {
    state.passEntitlement.mockResolvedValue(null);
    withTrial();
    state.mintLiveToken.mockRejectedValue(new Error('502 from Google'));

    await expect(startVoiceSession(USER, profile, 'en')).rejects.toThrow();

    expect(state.addWalletBalance).not.toHaveBeenCalled();
    expect(state.releaseVoiceMinute).toHaveBeenCalledWith(SESSION, USER, 'trial');
  });

  it('switched off, voice is Pass-only again', async () => {
    state.passEntitlement.mockResolvedValue(null);
    withTrial();
    state.resolveFeaturesForUser.mockResolvedValue({
      'paid.voiceChat': { enabled: true, pricePaise: PRICE },
      'chat.voiceTrial': { enabled: false, pricePaise: null },
    });

    await expect(startVoiceSession(USER, profile, 'en')).rejects.toThrow('PASS_REQUIRED');
    expect(state.claimTrialVoiceMinute).not.toHaveBeenCalled();
  });

  it('a failed trial lookup hands out no trial minute', async () => {
    state.passEntitlement.mockResolvedValue(null);
    withTrial();
    state.countTrialVoiceMinutesUsed.mockRejectedValue(new Error('db down'));

    await expect(startVoiceSession(USER, profile, 'en')).rejects.toThrow('PASS_REQUIRED');
  });
});

describe('how long the call can still run', () => {
  it('adds the free minutes left to what the wallet can pay for', async () => {
    // First free minute of three used; ₹100 in the wallet is 5 paid minutes.
    withFreeMinutes(1);

    const grant = await startVoiceSession(USER, profile, 'en');

    expect(grant.minutesRemaining).toBe(PASS_VOICE_FREE_MINUTES - 1 + 5);
  });

  it('reports nothing left when the wallet cannot pay for another minute', async () => {
    state.findActiveUserById.mockResolvedValue({ id: USER, walletBalancePaise: PRICE - 1 });

    const grant = await extendVoiceSession(USER, SESSION, profile, 'en', 'h');

    expect(grant.minutesRemaining).toBe(0);
  });

  it('is not capped at 3 minutes: a full wallet keeps the call going', async () => {
    state.claimVoiceMinute.mockResolvedValue(claimed(10));
    state.findActiveUserById.mockResolvedValue({ id: USER, walletBalancePaise: 40 * PRICE });

    const grant = await extendVoiceSession(USER, SESSION, profile, 'en', 'h');

    expect(grant.minutesUsed).toBe(10);
    expect(grant.minutesRemaining).toBe(40);
  });

  it('still grants the minute when the balance lookup fails', async () => {
    state.findActiveUserById.mockRejectedValue(new Error('db down'));
    state.countFreeVoiceMinutesUsed.mockRejectedValue(new Error('db down'));

    const grant = await extendVoiceSession(USER, SESSION, profile, 'en', 'h');

    expect(grant.token).toBe('tok-abc');
    expect(grant.minutesRemaining).toBe(0);
  });
});

describe('extendVoiceSession — out of money, and the safety ceiling', () => {
  it('says the wallet is empty in a way the app can tell from the ceiling', async () => {
    state.deductWalletBalance.mockResolvedValue(false);

    await expect(extendVoiceSession(USER, SESSION, profile, 'en', 'h')).rejects.toThrow(
      'VOICE_OUT_OF_CREDIT',
    );
    expect(state.releaseVoiceMinute).toHaveBeenCalledWith(SESSION, USER);
    expect(state.mintLiveToken).not.toHaveBeenCalled();
  });

  it('refuses the minute past the ceiling and charges nothing', async () => {
    // Both claims return null when their `minutes_charged < max` predicate
    // fails, which is the ceiling being enforced in SQL rather than in JS.
    state.claimVoiceMinute.mockResolvedValue(null);

    await expect(extendVoiceSession(USER, SESSION, profile, 'en', 'handle')).rejects.toThrow(
      'VOICE_SESSION_LIMIT',
    );

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
    state.endVoiceSessionWithRefund.mockResolvedValue({ refundedMinutes: 1, free: false });

    await endVoiceSessionForUser(USER, SESSION, false);

    expect(state.endVoiceSessionWithRefund).toHaveBeenCalledWith(SESSION, USER, expect.any(Number));
    expect(state.addWalletBalance).toHaveBeenCalledWith(USER, PRICE, 'refund:voice_minute');
    // The atomic repo call already marked the session ended — a second,
    // plain end would be redundant (and would race the same row).
    expect(state.endVoiceSession).not.toHaveBeenCalled();
  });

  it('refunds at the currently configured price, not a hardcoded one', async () => {
    state.endVoiceSessionWithRefund.mockResolvedValue({ refundedMinutes: 1, free: false });
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

describe('endVoiceSessionForUser — saving the call as a chat session', () => {
  const TRANSCRIPT = [
    { role: 'user' as const, content: 'What does my chart say about marriage?' },
    { role: 'assistant' as const, content: 'Your 7th house is strong, expect a good match.' },
  ];

  it('saves the transcript as a chat session, titled from the first user turn', async () => {
    state.endVoiceSession.mockResolvedValue({
      id: SESSION,
      userId: USER,
      birthProfileId: null,
      active: false,
    });

    await endVoiceSessionForUser(USER, SESSION, undefined, TRANSCRIPT);

    expect(state.createChatSession).toHaveBeenCalledWith(
      USER,
      null,
      'What does my chart say about marriage?',
      TRANSCRIPT,
      undefined,
      SESSION,
    );
  });

  it('writes what the call was about onto the saved session', async () => {
    state.summarizeCall.mockResolvedValue('You asked about marriage. A good match is expected.');

    await endVoiceSessionForUser(USER, SESSION, undefined, TRANSCRIPT);

    expect(state.summarizeCall).toHaveBeenCalledWith(TRANSCRIPT, USER);
    await vi.waitFor(() => {
      expect(state.setCallRecap).toHaveBeenCalledWith(
        'chat-session-1',
        USER,
        'You asked about marriage. A good match is expected.',
      );
    });
  });

  it('saves the call without a note when there is nothing to say about it', async () => {
    state.summarizeCall.mockResolvedValue(null);

    await endVoiceSessionForUser(USER, SESSION, undefined, TRANSCRIPT);
    await vi.waitFor(() => expect(state.summarizeCall).toHaveBeenCalled());

    expect(state.createChatSession).toHaveBeenCalled();
    expect(state.setCallRecap).not.toHaveBeenCalled();
  });

  it('never throws when the note cannot be saved, because the call is already saved', async () => {
    state.summarizeCall.mockResolvedValue('You asked about marriage.');
    state.setCallRecap.mockRejectedValue(new Error('db down'));

    await expect(
      endVoiceSessionForUser(USER, SESSION, undefined, TRANSCRIPT),
    ).resolves.toBeUndefined();
    await vi.waitFor(() => expect(state.setCallRecap).toHaveBeenCalled());
  });

  it('truncates a long first turn to match the text-chat title convention', async () => {
    const longTurn = 'a'.repeat(80);
    await endVoiceSessionForUser(USER, SESSION, undefined, [{ role: 'user', content: longTurn }]);

    const title = state.createChatSession.mock.calls[0]?.[2] as string;
    expect(title).toBe('a'.repeat(47) + '...');
  });

  it('scopes the saved session to the profile the CALL was grounded to, not a param', async () => {
    state.endVoiceSession.mockResolvedValue({
      id: SESSION,
      userId: USER,
      birthProfileId: 'profile-xyz',
      active: false,
    });

    await endVoiceSessionForUser(USER, SESSION, undefined, TRANSCRIPT);

    expect(state.createChatSession).toHaveBeenCalledWith(
      USER,
      'profile-xyz',
      expect.any(String),
      TRANSCRIPT,
      undefined,
      SESSION,
    );
  });

  it('extracts and saves durable facts from the call, same as text chat', async () => {
    state.extractTurnFacts.mockResolvedValue([{ fact: 'is engaged', followUpQuestion: null }]);
    // The account's relationship status is the 5th argument, and it must reach the extractor
    // here exactly as it does from text chat (astro.service.ts) — without it the extractor can
    // store the assistant's own speculative prose about a spouse as "is married".
    state.findActiveUserById.mockResolvedValue({ id: USER, relationshipStatus: 'single' });

    await endVoiceSessionForUser(USER, SESSION, undefined, TRANSCRIPT);

    await vi.waitFor(() => {
      expect(state.extractTurnFacts).toHaveBeenCalledWith(
        TRANSCRIPT[0]!.content,
        TRANSCRIPT[1]!.content,
        [],
        USER,
        'single',
      );
      expect(state.saveUserFacts).toHaveBeenCalledWith(USER, null, [
        { fact: 'is engaged', followUpQuestion: null },
      ]);
    });
  });

  it('does not save anything when no transcript is given (ordinary hangup)', async () => {
    await endVoiceSessionForUser(USER, SESSION);

    expect(state.createChatSession).not.toHaveBeenCalled();
    expect(state.extractTurnFacts).not.toHaveBeenCalled();
  });

  it('does not save anything for an empty transcript', async () => {
    await endVoiceSessionForUser(USER, SESSION, undefined, []);

    expect(state.createChatSession).not.toHaveBeenCalled();
  });

  it('does not save anything when connected:false refunds the call (nothing to save)', async () => {
    state.endVoiceSessionWithRefund.mockResolvedValue({ refundedMinutes: 1, free: false });

    await endVoiceSessionForUser(USER, SESSION, false, TRANSCRIPT);

    expect(state.createChatSession).not.toHaveBeenCalled();
  });

  it('never saves twice — a retried /end gets null from the repo and is a no-op', async () => {
    // null is what voiceRepo.endVoiceSession returns when its `active = true`
    // predicate fails, i.e. a session this call (or another in flight) already
    // ended. This is the duplicate guard: the SECOND /end for the same call
    // (error handler AND page-unload both firing) must not double-save.
    state.endVoiceSession.mockResolvedValue(null);

    await endVoiceSessionForUser(USER, SESSION, undefined, TRANSCRIPT);

    expect(state.createChatSession).not.toHaveBeenCalled();
  });

  it('never throws when saving the transcript fails — the client already hung up', async () => {
    state.createChatSession.mockRejectedValue(new Error('db down'));

    await expect(
      endVoiceSessionForUser(USER, SESSION, undefined, TRANSCRIPT),
    ).resolves.toBeUndefined();
  });
});

describe('submitVoiceFeedback — "how was your call?"', () => {
  beforeEach(() => {
    state.saveVoiceFeedback.mockReset().mockResolvedValue(true);
    state.alertThrottled.mockReset().mockResolvedValue(undefined);
  });

  it('saves the stars, tags and comment onto the call', async () => {
    await submitVoiceFeedback(USER, SESSION, {
      rating: 5,
      tags: ['clearVoice', 'helpfulAnswers'],
      comment: 'Loved it',
    });
    expect(state.saveVoiceFeedback).toHaveBeenCalledWith({
      id: SESSION,
      userId: USER,
      rating: 5,
      tags: ['clearVoice', 'helpfulAnswers'],
      comment: 'Loved it',
    });
    expect(state.alertThrottled).not.toHaveBeenCalled();
  });

  it('drops a repeated tag', async () => {
    await submitVoiceFeedback(USER, SESSION, { rating: 4, tags: ['callCut', 'callCut'] });
    expect(state.saveVoiceFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['callCut'] }),
    );
  });

  it('tells the ops chat about a rating of 2 or less, with what was wrong', async () => {
    await submitVoiceFeedback(USER, SESSION, {
      rating: 2,
      tags: ['hardToHear'],
      comment: 'Could not hear Baba Ji',
    });
    expect(state.alertThrottled).toHaveBeenCalledTimes(1);
    const [signature, , message] = state.alertThrottled.mock.calls[0]!;
    expect(signature).toBe('voice-feedback:low');
    expect(message).toContain('2/5');
    expect(message).toContain('hardToHear');
    expect(message).toContain('Could not hear Baba Ji');
  });

  it('does not alert for a 3-star call', async () => {
    await submitVoiceFeedback(USER, SESSION, { rating: 3, tags: [] });
    expect(state.alertThrottled).not.toHaveBeenCalled();
  });

  it("answers 404 for someone else's call", async () => {
    state.saveVoiceFeedback.mockResolvedValue(false);
    state.getVoiceSession.mockResolvedValue(null);
    await expect(submitVoiceFeedback(USER, SESSION, { rating: 1, tags: [] })).rejects.toThrow(
      /not found/i,
    );
    expect(state.alertThrottled).not.toHaveBeenCalled();
  });

  it('ignores a second answer for the same call, without a second alert', async () => {
    state.saveVoiceFeedback.mockResolvedValue(false);
    state.getVoiceSession.mockResolvedValue({ id: SESSION, active: false });
    await expect(
      submitVoiceFeedback(USER, SESSION, { rating: 1, tags: [] }),
    ).resolves.toBeUndefined();
    expect(state.alertThrottled).not.toHaveBeenCalled();
  });
});
