// =============================================================================
// Gemini Live — ephemeral token minting
// =============================================================================
// Realtime voice does not go through gemini-client.ts. That client speaks to
// the OpenAI-compatible /chat/completions endpoint with a request/response (or
// SSE) shape; the Live API is a stateful WebSocket carrying raw PCM frames in
// both directions, on a different model entirely (`gemini-3.1-flash-live-
// preview` — `gemini-3.1-flash-lite`, which every other call site here uses,
// has no realtime audio capability at all).
//
// The client connects to Google DIRECTLY rather than relaying audio through
// this server. Two reasons: 16kHz PCM up plus 24kHz PCM down is ~64KB/s per
// speaker, which is not traffic to push through the box that also serves the
// whole API; and Google's own guidance is that browsers should use ephemeral
// tokens rather than a proxy. The real API keys never leave this process.
//
// What makes that safe is `liveConnectConstraints`: the model, the system
// instruction (persona + this user's chart grounding) and the response modality
// are all fixed HERE, at mint time. A token cannot be pointed at another model
// or re-prompted — it can only open the exact session this server described.
//
// What makes it *billable* is that a token is single-use and short-lived. The
// backend cannot observe the audio, so it cannot count spoken turns; instead
// each token buys exactly one paid minute, and continuing costs another mint.
// See modules/voice/voice.service.ts for the charging and ceiling logic.

import { env } from '../../config/env.js';
import { logger } from '../logger.js';
import { alertThrottled } from '../notifications/alerts.js';
import { pickKey, markRateLimited, poolSize } from './gemini-key-pool.js';
import { recordPaidKeyUse } from './paid-usage.js';

export class GeminiLiveTokenError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'GeminiLiveTokenError';
  }
}

/**
 * How long a minted token can carry a session. This is the mechanism the
 * per-minute price is built on, and it is enforced by Google rather than by us
 * — past `expireTime` the socket can no longer send, whatever the client does.
 *
 * A few seconds of slack over 60 so that a minute the user has already paid for
 * isn't cut short by clock skew or a slow reconnect; the ceiling on total spend
 * comes from the mint count (VOICE_MAX_MINUTES), not from this value.
 */
const TOKEN_LIFETIME_MS = 65_000;

/**
 * How long the client has to actually open the socket after minting. Short on
 * purpose: a token that leaks is only useful for this window, and a legitimate
 * client connects immediately. Distinct from `expireTime` above, which bounds
 * the session once established.
 */
const NEW_SESSION_WINDOW_MS = 60_000;

const MINT_TIMEOUT_MS = 10_000;

export interface MintedLiveToken {
  /** Opaque token the client passes to Google in place of an API key. */
  token: string;
  /** Epoch ms after which the session can no longer send — the paid minute's end. */
  expiresAt: number;
  /** The model the token is pinned to; echoed to the client so it connects to the right one. */
  model: string;
}

interface MintOptions {
  /** Persona + chart grounding. Fixed at mint time so the client cannot alter it. */
  systemInstruction: string;
  /**
   * Resumption handle from a previous segment, when continuing an existing
   * conversation into its next paid minute. Absent for the first minute.
   */
  resumptionHandle?: string | undefined;
}

interface AuthTokenResponse {
  name?: string;
}

/**
 * Mints one single-use ephemeral token for a single paid minute of voice.
 *
 * Draws its API key from the same rotation pool as every other Gemini call
 * (`pickKey`/`markRateLimited`) so voice shares the pool's cooldown state
 * rather than hammering one key — the Live API's quota comes out of the same
 * project allowance the text features depend on, which is exactly why voice is
 * gated behind a feature flag that ships off.
 *
 * Failure is deliberately NOT retried across the whole pool the way
 * gemini-client.ts retries a generation. A mint sits in front of a user waiting
 * to start talking, and a multi-second retry storm is worse than a prompt "try
 * again" — so this fails over on 429 only, and only to keys that aren't already
 * cooling down.
 */
export async function mintLiveToken(opts: MintOptions): Promise<MintedLiveToken> {
  if (!env.GEMINI_LIVE_ENABLED) {
    // Operational kill switch, checked here as well as at the route so that no
    // future call site can bypass it. See config/env.ts.
    throw new GeminiLiveTokenError('Realtime voice is disabled');
  }

  const tried = new Set<number>();
  const attempts = Math.max(1, poolSize());
  let lastStatus: number | undefined;
  let lastBody = '';

  for (let attempt = 0; attempt < attempts; attempt++) {
    // preferPaid: true — voice deliberately draws from the paid reserve
    // first rather than spending the shared free-tier pool every other
    // Gemini feature depends on, falling back to free only once the
    // reserve itself is exhausted or cooling down (see pickKey's contract).
    const picked = await pickKey(tried, true);
    if (!picked) break; // every key excluded or cooling down

    // See gemini-client.ts: reaching the reserve means this mint is about to
    // be billed. Without this, paid voice usage was invisible — no Telegram
    // alert, no counter — since voice never writes an ai_usage row either.
    if (picked.tier === 'paid') void recordPaidKeyUse('voice');

    const now = Date.now();
    const expiresAt = now + TOKEN_LIFETIME_MS;

    const body = {
      uses: 1,
      expireTime: new Date(expiresAt).toISOString(),
      newSessionExpireTime: new Date(now + NEW_SESSION_WINDOW_MS).toISOString(),
      // `bidiGenerateContentSetup`, NOT the `liveConnectConstraints` wrapper the
      // published docs and the Python/JS SDKs show. That name is the SDK's, and
      // the REST endpoint parses this body directly as the AuthToken message,
      // which has no such field — it answers 400 "Unknown name
      // \"liveConnectConstraints\" at 'auth_token'". Verified against the live
      // endpoint on both v1beta and v1alpha; both accept the shape below.
      //
      // The contents are a flat BidiGenerateContentSetup — there is no nested
      // `config`, and `responseModalities` lives under `generationConfig`.
      bidiGenerateContentSetup: {
        model: `models/${env.GEMINI_LIVE_MODEL}`,
        // `speechConfig` pins the voice. Without it Gemini Live picks its own
        // default, and the persona ("Yogi Baba") was being spoken by whatever
        // that happened to be. Deliberately voiceName ONLY — `speechConfig` also
        // accepts a `languageCode`, and setting it here would override the
        // per-call language that rides in on the system instruction's locale
        // (scholar.ts's buildVoiceSystemInstruction), breaking every non-English
        // call. This also closes the gap the `tools: []` note below describes:
        // anything left unconstrained is something the token-holding browser can
        // declare for itself, and the voice was unconstrained.
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: env.GEMINI_LIVE_VOICE } },
          },
        },
        // Required for the client to resume across paid-minute boundaries
        // without losing the conversation — each minute is a fresh socket.
        sessionResumption: opts.resumptionHandle ? { handle: opts.resumptionHandle } : {},
        // A Content message, not a bare string.
        systemInstruction: { parts: [{ text: opts.systemInstruction }] },
        // Pin tools to none. Anything left unconstrained here is something the
        // browser can declare for itself in its own setup frame, since it holds
        // the token — an empty list is what stops a tampered client granting
        // itself tool access on our quota.
        tools: [],
      },
    };

    let response: Response;
    try {
      response = await fetch(`${env.GEMINI_LIVE_BASE_URL}/auth_tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': picked.key,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(MINT_TIMEOUT_MS),
      });
    } catch (err) {
      logger.warn({ err, attempt }, 'gemini-live: token mint network error');
      throw new GeminiLiveTokenError(`Token mint network error: ${String(err)}`);
    }

    const text = await response.text();

    if (response.status === 429) {
      await markRateLimited(picked.index, 10_000);
      tried.add(picked.index);
      lastStatus = 429;
      lastBody = text;
      logger.warn({ keyIndex: picked.index }, 'gemini-live: token mint 429, failing over');
      continue;
    }

    if (!response.ok) {
      logger.warn(
        { status: response.status, body: text.slice(0, 300) },
        'gemini-live: token mint failed',
      );
      void alertThrottled(
        `gemini-live:http-${response.status}`,
        `Gemini Live token mint failed (${response.status})`,
        text.slice(0, 300),
      );
      throw new GeminiLiveTokenError(`Token mint failed with ${response.status}`, response.status);
    }

    let parsed: AuthTokenResponse;
    try {
      parsed = JSON.parse(text) as AuthTokenResponse;
    } catch {
      throw new GeminiLiveTokenError('Token mint returned a non-JSON body');
    }

    // The API returns the token in `name`. Treat an empty one as a hard failure
    // rather than handing the client a token it will only fail to connect with.
    if (!parsed.name) {
      throw new GeminiLiveTokenError('Token mint returned no token');
    }

    return { token: parsed.name, expiresAt, model: env.GEMINI_LIVE_MODEL };
  }

  // Only reachable when every key in the pool is rate limited or cooling down.
  void alertThrottled(
    'gemini-live:quota',
    'Gemini Live token mint — key pool exhausted',
    `All ${poolSize()} key(s) rate limited while minting a voice token. ` +
      `Voice sessions are failing to start.`,
  );
  throw new GeminiLiveTokenError('All Gemini keys are rate limited', lastStatus ?? 429);
}

/** Test seam — exposed so specs can assert the exact paid-minute length. */
export const __TOKEN_LIFETIME_MS = TOKEN_LIFETIME_MS;
