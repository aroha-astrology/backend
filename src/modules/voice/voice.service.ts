// =============================================================================
// Realtime voice (Gemini Live) — session lifecycle, metering and grounding
// =============================================================================
// The defining constraint of this module is that the conversation itself never
// touches this server. The client streams PCM straight to Google over a
// WebSocket (see lib/llm/gemini-live-token.ts for why), which means:
//
//   * there is no per-turn request to charge, count or moderate;
//   * this server never observes when the user stops talking;
//   * anything the client reports about the call is unverifiable.
//
// So metering is built on the one thing the server does control — issuing the
// short-lived tokens without which no audio can flow at all. One token buys one
// minute (Google enforces the expiry), one minute costs a fixed price, and the
// count of tokens issued for a session is capped. A user who wants a fourth
// minute has to ask this server for it, and this server says no.

import { logger } from '../../lib/logger.js';
import { Errors } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import { mintLiveToken } from '../../lib/llm/gemini-live-token.js';
import { buildVoiceSystemInstruction } from '../../lib/swarm/agents/scholar.js';
import { buildGroundingFacts, buildProfileFacts } from '../../lib/chat-grounding.js';
import type { GroundingSource } from '../../lib/chat-grounding.js';
import { getKundliForUser, withLiveSadeSati } from '../kundli/kundli.service.js';
import { getUserFacts, saveUserFacts } from '../astro/user-facts.repo.js';
import { findActiveUserById, deductWalletBalance, addWalletBalance } from '../users/users.repo.js';
import { resolveFeaturesForUser } from '../features/features.service.js';
import type { ProfileContext } from '../birth-profiles/profile-context.js';
import { insertAiUsage } from '../admin/ai-usage.repo.js';
import * as voiceRepo from './voice.repo.js';
import * as chatSessionsRepo from '../astro/chat-sessions.repo.js';
import { extractTurnFacts } from '../../lib/chat-fact-extraction.js';
import type { ChatHistoryTurn } from '../astro/astro.schemas.js';

/**
 * Hard ceiling on billable minutes per session. Enforced in SQL
 * (voice.repo.ts's claimVoiceMinute), not here, so concurrent mint requests
 * cannot race past it.
 *
 * A deliberate product choice rather than a technical limit: voice now mints
 * from the paid reserve (see gemini-live-token.ts's preferPaid), so this
 * ceiling bounds real spend per call rather than shared free-tier quota — 3
 * minutes is ₹60 at the default price.
 *
 * 15 -> 3 (2026-08-19): tightened once voice started drawing on the paid key
 * on every call instead of only as a free-pool fallback.
 */
export const VOICE_MAX_MINUTES = 3;

/** Fallback when the feature registry has no price configured for voice. */
const DEFAULT_MINUTE_PRICE_PAISE = 2000;

const WALLET_REASON_CHARGE = 'voice_minute';
const WALLET_REASON_REFUND = 'refund:voice_minute';

/**
 * How long after a minute is granted `/end connected:false` still refunds it.
 *
 * The wallet is charged the instant a minute is granted — before the client
 * has even tried the socket — because minting is the only step this server
 * can observe; whether the call then actually worked is not. A genuine
 * connect failure (wrong endpoint, refused token, no mic, an instant crash)
 * shows up within a second or two of that charge. Bounding the window this
 * tightly is what keeps it from being a free-minute lever: a client that
 * talks for the better part of a minute and only then claims `connected:
 * false` misses the window and keeps the charge, and even inside the window
 * this only ever gives back the ONE most recently charged minute (see
 * `endVoiceSessionWithRefund`), never the whole session.
 */
const CONNECT_GRACE_MS = 15_000;

export interface VoiceSessionGrant {
  voiceSessionId: string;
  token: string;
  model: string;
  /** Epoch ms at which this paid minute's socket stops accepting audio. */
  expiresAt: number;
  minutesUsed: number;
  minutesRemaining: number;
  pricePerMinutePaise: number;
}

async function minutePricePaise(userId: string): Promise<number> {
  const features = await resolveFeaturesForUser(userId);
  return features['paid.voiceChat']?.pricePaise ?? DEFAULT_MINUTE_PRICE_PAISE;
}

/**
 * Assembles the system instruction for a session: the same persona, chart
 * grounding and remembered user facts the text chat is given, with a spoken
 * output style (see scholar.ts's buildVoiceSystemInstruction).
 *
 * Every lookup here is best-effort, matching chatStream's contract exactly — an
 * unready kundli or an unreachable facts table degrades the answer's
 * specificity but must never stop a user from starting a call they are about to
 * be charged for.
 *
 * Built once per SESSION, not per minute: the instruction is baked into the
 * token's constraints at mint time, and re-deriving it for each segment would
 * let the persona shift mid-conversation if the underlying data changed.
 */
async function buildSessionInstruction(
  userId: string,
  profile: ProfileContext,
  locale: string,
): Promise<string> {
  const user = await findActiveUserById(userId).catch(() => undefined);

  const [kundli, userFacts] = await Promise.all([
    getKundliForUser(userId, profile.birthProfileId ?? null).catch(() => undefined),
    getUserFacts(userId, profile.birthProfileId ?? null).catch(() => []),
  ]);

  const ready = kundli?.status === 'ready';
  const groundingSource: GroundingSource = {
    chart: ready ? (kundli.chartData ?? null) : null,
    dasha: ready ? (kundli.dashaData ?? null) : null,
    yogas: ready ? (kundli.yogaData ?? null) : null,
    // Sade Sati is transit-dependent — recompute it live, same as chat (astro.service.ts), so a
    // voice call never states a possibly months-stale cached phase.
    doshas: ready ? await withLiveSadeSati(kundli.doshaData ?? null) : null,
    ashtakavarga: ready ? (kundli.ashtakavargaData ?? null) : null,
  };

  const chartFacts = await buildGroundingFacts(groundingSource).catch(() => []);
  const profileFacts = user ? buildProfileFacts(profile, user) : [];

  return buildVoiceSystemInstruction({
    groundingFacts: [...chartFacts, ...profileFacts],
    // A profile that onboarded without an exact birth time will never have a
    // chart at all — distinct from one still generating, and the prompt picks
    // different copy for each.
    birthTimeUnknown: profile.birthTimeAccuracy === 'unknown',
    locale,
    userFacts,
    // Whichever profile this call is grounded to (primary or an additional
    // profile) — used ONLY for the one-time call-connected opening greeting,
    // never for the rest of the conversation. See buildVoiceSystemInstruction.
    displayName: profile.displayName,
  });
}

/**
 * Charges one minute and mints the token for it.
 *
 * Ordering is load-bearing and mirrors the chat route's charge-then-refund
 * shape. The minute is claimed first (that is the atomic ceiling check), then
 * the wallet is debited, then the token is minted — and each step undoes the
 * ones before it on failure. Minting last matters because it is the only step
 * that talks to a third party: if Google refuses, the user must end up with
 * both their money and their unused minute back.
 */
async function chargeAndMint(
  userId: string,
  voiceSessionId: string,
  systemInstruction: string,
  resumptionHandle: string | undefined,
): Promise<VoiceSessionGrant> {
  const claimed = await voiceRepo.claimVoiceMinute(voiceSessionId, userId, VOICE_MAX_MINUTES);
  if (!claimed) {
    // Either the ceiling is reached or the session is over. Both are a refusal
    // to sell another minute, and neither is an error the user can act on
    // beyond starting a fresh call.
    throw Errors.conflict('This voice session has reached its limit');
  }

  const pricePaise = await minutePricePaise(userId);

  const charged = await deductWalletBalance(userId, pricePaise, WALLET_REASON_CHARGE).catch(
    (err: unknown) => {
      logger.error({ err, userId, voiceSessionId }, 'voice: wallet debit threw');
      return false;
    },
  );
  if (!charged) {
    await voiceRepo.releaseVoiceMinute(voiceSessionId, userId).catch(() => {});
    throw Errors.conflict('Not enough credits for another minute');
  }

  try {
    const minted = await mintLiveToken({ systemInstruction, resumptionHandle });
    // Best-effort, matching gemini-client.ts's own usage-write discipline (never fail the
    // call over a telemetry write). This is the ONLY place voice usage can be captured at
    // all — the conversation itself streams client-to-Google and never touches this server
    // (see the module doc comment) — so tokensIn/tokensOut are deliberately 0, not omitted:
    // Gemini Live's audio pricing has no verified token-equivalent conversion in this
    // codebase yet, and a guessed rate would be confidently wrong in a cost dashboard. This
    // at least makes voice call volume and duration visible; ai_usage's $ rollups (which key
    // off tokens) will undercount voice cost until that conversion is added.
    void insertAiUsage({
      userId,
      agent: 'voice',
      model: minted.model,
      tokensIn: 0,
      tokensOut: 0,
      durationMs: 60_000,
    }).catch((err: unknown) => {
      logger.warn({ err, userId, voiceSessionId }, 'voice: ai_usage write failed');
    });
    return {
      voiceSessionId,
      token: minted.token,
      model: minted.model,
      expiresAt: minted.expiresAt,
      minutesUsed: claimed.minutesCharged,
      minutesRemaining: Math.max(0, VOICE_MAX_MINUTES - claimed.minutesCharged),
      pricePerMinutePaise: pricePaise,
    };
  } catch (err) {
    // Give back both the money and the minute — the user got nothing.
    await addWalletBalance(userId, pricePaise, WALLET_REASON_REFUND).catch(() => {});
    await voiceRepo.releaseVoiceMinute(voiceSessionId, userId).catch(() => {});
    logger.error({ err, userId, voiceSessionId }, 'voice: token mint failed, charge refunded');
    throw Errors.internal('Could not start the voice session. Please try again.');
  }
}

/**
 * Starts a session: creates the ledger row, then charges and mints minute one.
 *
 * A session row is created even if the first mint then fails, which is
 * deliberate — an abandoned zero-minute row costs nothing and leaves a trace of
 * the attempt, whereas creating it lazily would mean the failure path has no
 * id to report against.
 */
export async function startVoiceSession(
  userId: string,
  profile: ProfileContext,
  locale: string,
): Promise<VoiceSessionGrant> {
  assertVoiceEnabled();

  const systemInstruction = await buildSessionInstruction(userId, profile, locale);
  const session = await voiceRepo.createVoiceSession({
    userId,
    birthProfileId: profile.birthProfileId ?? null,
    locale,
  });

  return chargeAndMint(userId, session.id, systemInstruction, undefined);
}

/**
 * Buys the next minute of an existing session.
 *
 * `resumptionHandle` is what keeps the conversation continuous across the
 * per-minute socket boundary; without it the model would restart with no memory
 * of what was just said. It comes from the client because the resumption handle
 * is issued by Google over the socket this server never sees — it is not a
 * credential (the token minted around it is), so accepting it from the client
 * grants nothing beyond continuity of a session the caller already owns.
 */
export async function extendVoiceSession(
  userId: string,
  voiceSessionId: string,
  profile: ProfileContext,
  locale: string,
  resumptionHandle: string | undefined,
): Promise<VoiceSessionGrant> {
  assertVoiceEnabled();

  const session = await voiceRepo.getVoiceSession(voiceSessionId, userId);
  if (!session) throw Errors.notFound('Voice session not found');
  if (!session.active) throw Errors.conflict('This voice session has ended');

  const systemInstruction = await buildSessionInstruction(userId, profile, locale);
  return chargeAndMint(userId, voiceSessionId, systemInstruction, resumptionHandle);
}

/**
 * Marks a session finished. Idempotent, and safe to call for a session that is
 * already over or never existed — the client fires this on hangup, on page
 * unload and on error, and none of those should surface a failure to the user.
 *
 * `connected: false` is the client reporting that the minute it just paid for
 * never turned into a working call — see CONNECT_GRACE_MS for the window this
 * is honored in and why. Anything else (connected omitted, or true) behaves
 * exactly as before: nothing charged or refunded, just marked ended.
 *
 * `transcript`, when the call actually connected, is saved as an ordinary
 * chat-history session and mined for durable facts — see `persistTranscript`.
 * A call that never connected (the `connected: false` branch above) has
 * nothing worth saving and returns before reaching that step.
 */
export async function endVoiceSessionForUser(
  userId: string,
  voiceSessionId: string,
  connected?: boolean,
  transcript?: ChatHistoryTurn[],
): Promise<void> {
  if (connected === false) {
    try {
      const refund = await voiceRepo.endVoiceSessionWithRefund(
        voiceSessionId,
        userId,
        CONNECT_GRACE_MS,
      );
      if (refund) {
        const pricePaise = await minutePricePaise(userId);
        await addWalletBalance(userId, pricePaise, WALLET_REASON_REFUND).catch((err: unknown) => {
          logger.error(
            { err, userId, voiceSessionId },
            'voice: session refund granted but wallet credit failed',
          );
        });
        return;
      }
    } catch (err) {
      logger.warn(
        { err, userId, voiceSessionId },
        'voice: refund-on-disconnect check failed, falling back to a plain end',
      );
    }
  }

  // `active: true` is in voiceRepo's WHERE clause, so only the call that
  // actually flips the row gets one back — a retried /end (error handler and
  // page-unload both firing, or the refund branch above having already ended
  // it) gets null and must not save the transcript a second time.
  const row = await voiceRepo.endVoiceSession(voiceSessionId, userId).catch((err: unknown) => {
    logger.warn({ err, userId, voiceSessionId }, 'voice: failed to mark session ended');
    return null;
  });

  if (row && transcript && transcript.length > 0) {
    await persistTranscript(userId, row.birthProfileId, transcript).catch((err: unknown) => {
      logger.warn({ err, userId, voiceSessionId }, 'voice: failed to persist call transcript');
    });
  }
}

/**
 * Saves a finished call as an ordinary `chat_sessions` row — the same
 * encrypt-on-write path text chat uses (chat-sessions.repo.ts), so the
 * transcript is readable in Chat History and encrypted at rest identically.
 *
 * Scoped to the profile the call was GROUNDED to (the voice_sessions row),
 * not whichever profile happens to be active now — the user may have
 * switched profiles between hanging up and this write landing.
 *
 * Fact extraction is fire-and-forget, copying chatStream's exact discipline
 * (astro.service.ts): a failure here must never affect a call the user
 * already ended, and this is what makes the call's content available to
 * later TEXT chats too, not just a reopened copy of this same session.
 */
async function persistTranscript(
  userId: string,
  birthProfileId: string | null,
  transcript: ChatHistoryTurn[],
): Promise<void> {
  const firstUserTurn = transcript.find((t) => t.role === 'user')?.content ?? '';
  const title =
    firstUserTurn.length > 50 ? firstUserTurn.slice(0, 47) + '...' : firstUserTurn || 'Voice call';

  await chatSessionsRepo.createChatSession(userId, birthProfileId, title, transcript);

  const userText = transcript
    .filter((t) => t.role === 'user')
    .map((t) => t.content)
    .join('\n');
  const assistantText = transcript
    .filter((t) => t.role === 'assistant')
    .map((t) => t.content)
    .join('\n');
  if (!userText && !assistantText) return;

  void Promise.all([
    getUserFacts(userId, birthProfileId).catch(() => []),
    findActiveUserById(userId).catch(() => undefined),
  ])
    .then(([existingFacts, user]) =>
      extractTurnFacts(
        userText,
        assistantText,
        existingFacts,
        userId,
        user?.relationshipStatus ?? null,
      ),
    )
    .then((newFacts) => {
      if (newFacts.length > 0) return saveUserFacts(userId, birthProfileId, newFacts);
    })
    .catch(() => {});
}

/**
 * The operational kill switch, separate from the `paid.voiceChat` feature flag
 * the routes check. See config/env.ts's GEMINI_LIVE_ENABLED for why both exist.
 */
function assertVoiceEnabled(): void {
  if (!env.GEMINI_LIVE_ENABLED) {
    throw Errors.forbidden('Realtime voice is not available');
  }
}
