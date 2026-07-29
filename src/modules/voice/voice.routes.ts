import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { requireConsent } from '../../middleware/consent.js';
import { requireFeature } from '../../middleware/feature.js';
import { rateLimiter } from '../../middleware/rate-limit.js';
import { Errors } from '../../lib/errors.js';
import { resolveActiveProfileContext } from '../birth-profiles/profile-context.js';
import {
  startVoiceSession,
  extendVoiceSession,
  endVoiceSessionForUser,
  VOICE_MAX_MINUTES,
} from './voice.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('Error');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const voiceRouter = new OpenAPIHono();

/**
 * Caps how often a user can ask for a token, independent of the per-session
 * 3-minute ceiling which resets every time they start a new session. Without
 * this, someone could start-and-abandon sessions in a loop and mint tokens far
 * faster than 1/minute.
 *
 * 6/min leaves comfortable headroom over the ~1 mint per minute a real call
 * needs (plus a retry and a reconnect or two) while making a mint loop
 * pointless. `silent` for the same reason the chat pacing limiter is: a user
 * who trips it should see a plain failure, not a description of the ceiling.
 */
const voiceMintLimit = rateLimiter({
  windowMs: 60_000,
  max: 6,
  name: 'voice-mint',
  silent: true,
});

const VoiceGrantSchema = z
  .object({
    voiceSessionId: z.string().uuid(),
    token: z.string().describe('Single-use ephemeral token; connect to Gemini Live with this'),
    model: z.string(),
    expiresAt: z.number().describe('Epoch ms when this paid minute stops accepting audio'),
    minutesUsed: z.number(),
    minutesRemaining: z.number(),
    pricePerMinutePaise: z.number(),
  })
  .openapi('VoiceGrant');

/**
 * Three gates gate every voice route, and all must pass:
 *   - `GEMINI_LIVE_ENABLED`  — the operational kill switch (checked in the service)
 *   - `paid.voiceChat`       — the admin/product toggle, ships disabled
 *   - voice consent          — the per-user grant, checked by this function
 *
 * `requireConsent` in the middleware list covers only the general
 * data-processing grant, which deliberately does NOT imply consent to stream
 * one's live voice to Google — hence this separate check.
 *
 * It lives in the handler rather than in middleware because it is the only gate
 * whose failure the client must be able to act on: it opens the consent sheet
 * instead of hiding the feature. Its distinct code is what lets the app tell
 * "not allowed" from "not asked yet".
 *
 * (The middleware arrays below are spelled out inline per route, rather than
 * shared. Hoisting them into a shared const erases Hono's env inference and
 * makes `c.get('user')` resolve to `never` in the handlers — every other router
 * here inlines them for the same reason.)
 */
function requireVoiceConsent(user: {
  voiceConsentAt: Date | null;
  voiceConsentRevokedAt: Date | null;
}): void {
  const granted = user.voiceConsentAt !== null;
  const revoked =
    user.voiceConsentRevokedAt !== null &&
    (user.voiceConsentAt === null || user.voiceConsentRevokedAt > user.voiceConsentAt);
  if (!granted || revoked) {
    throw Errors.forbidden('VOICE_CONSENT_REQUIRED');
  }
}

/* -------------------------------------------------------------------------- */
/* POST /voice/sessions — start a call, buy minute one                        */
/* -------------------------------------------------------------------------- */

const startRoute = createRoute({
  method: 'post',
  path: '/voice/sessions',
  tags: ['Voice'],
  summary: 'Start a realtime voice session',
  description:
    'Charges one minute and returns a single-use ephemeral token the client uses to open a ' +
    'WebSocket directly to Gemini Live. Audio never passes through this server. Each minute ' +
    `must be bought separately via the extend endpoint, up to ${VOICE_MAX_MINUTES} per session.`,
  security: [{ bearerAuth: [] }],
  middleware: [
    requireUser,
    requireConsent,
    requireFeature('paid.voiceChat'),
    voiceMintLimit,
  ] as const,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({ locale: z.string().min(2).max(12).default('en') }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Session started',
      content: { 'application/json': { schema: VoiceGrantSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled, or voice consent not granted'),
    409: errorResponse('Not enough credits'),
    429: errorResponse('Starting sessions too quickly'),
  },
});

voiceRouter.openapi(startRoute, async (c) => {
  const user = c.get('user');
  requireVoiceConsent(user);

  const { locale } = c.req.valid('json');
  const profile = await resolveActiveProfileContext(user);
  const grant = await startVoiceSession(user.id, profile, locale);

  return c.json(grant, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /voice/sessions/{id}/extend — buy the next minute                     */
/* -------------------------------------------------------------------------- */

const extendRoute = createRoute({
  method: 'post',
  path: '/voice/sessions/{id}/extend',
  tags: ['Voice'],
  summary: 'Buy the next minute of an in-progress voice session',
  description:
    'Charges another minute and mints a fresh token. Pass the sessionResumption handle the ' +
    'client received from Gemini so the conversation continues rather than restarting. ' +
    `Returns 409 once ${VOICE_MAX_MINUTES} minutes have been used.`,
  security: [{ bearerAuth: [] }],
  middleware: [
    requireUser,
    requireConsent,
    requireFeature('paid.voiceChat'),
    voiceMintLimit,
  ] as const,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({
            resumptionHandle: z.string().max(4096).optional(),
            locale: z.string().min(2).max(12).default('en'),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Next minute granted',
      content: { 'application/json': { schema: VoiceGrantSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled, or voice consent not granted'),
    404: errorResponse('Voice session not found'),
    409: errorResponse('Session limit reached, ended, or not enough credits'),
    429: errorResponse('Requesting minutes too quickly'),
  },
});

voiceRouter.openapi(extendRoute, async (c) => {
  const user = c.get('user');
  requireVoiceConsent(user);

  const { id } = c.req.valid('param');
  const { resumptionHandle, locale } = c.req.valid('json');
  const profile = await resolveActiveProfileContext(user);

  const grant = await extendVoiceSession(user.id, id, profile, locale, resumptionHandle);

  return c.json(grant, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /voice/sessions/{id}/end — hang up                                    */
/* -------------------------------------------------------------------------- */

const endRoute = createRoute({
  method: 'post',
  path: '/voice/sessions/{id}/end',
  tags: ['Voice'],
  summary: 'End a voice session',
  description:
    'Idempotent and best-effort — the client calls this on hangup, on page unload and on ' +
    'error. Nothing is charged or refunded: minutes are paid for when they are granted. ' +
    'Deliberately NOT gated on the feature flag, so a session already in progress can always ' +
    'be closed even if voice is switched off mid-call.',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: {
      description: 'Session marked ended',
      content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
    },
    401: errorResponse('Unauthorized'),
  },
});

voiceRouter.openapi(endRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  await endVoiceSessionForUser(user.id, id);
  return c.json({ ok: true as const }, 200);
});
