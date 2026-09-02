import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { logger } from '../../lib/logger.js';
import {
  HouseInsightQuerySchema,
  HouseInsightSchema,
  HouseInsightStatusSchema,
  HouseParamSchema,
  KundliMissingParamsSchema,
  KundliQuerySchema,
  KundliSchema,
  KundliStatusSchema,
} from './kundli.schemas.js';
import {
  birthInputsForProfile,
  birthTimeQuality,
  chartWarning,
  findHouseInsight,
  getKundliForUser,
  isHouseInsightStale,
  isStaleGenerating,
  missingKundliParams,
  regenerateKundli,
  requestHouseInsightGeneration,
  requestKundliGeneration,
  toHouseInsightDtoForLanguage,
  toKundliDto,
  toKundliDtoForLanguage,
  type KundliRequiredField,
} from './kundli.service.js';
import { resolveActiveProfileContext } from '../birth-profiles/profile-context.js';

/** Don't re-run a failed generation on the engine more often than this. */
const FAILED_RETRY_COOLDOWN_MS = 30_000;

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

/** Human-readable labels for the required fields, for the FE-facing message. */
const FIELD_LABELS: Record<KundliRequiredField, string> = {
  dateOfBirth: 'birth date',
  timeOfBirth: 'exact birth time',
  placeOfBirth: 'birth place (with coordinates and timezone)',
};

/** Attaches the accuracy caveat onto a ready kundli DTO — computed from the PROFILE
 * (birthTimeAccuracy lives there, not on the kundli row itself), so this must run in the
 * route handler where `profile` is already resolved, not inside kundli.service.ts's DTO
 * builders. A 'ready' chart is never from an 'unknown' time (missingKundliParams blocks
 * that), so the quality here is always 'exact' or 'approximate'. */
function withAccuracy<T extends object>(
  dto: T,
  profile: Parameters<typeof birthTimeQuality>[0],
): T & { birthTimeAccuracy: 'exact' | 'approximate'; warning: string | null } {
  const quality = birthTimeQuality(profile);
  return {
    ...dto,
    birthTimeAccuracy: quality === 'unknown' ? 'exact' : quality,
    warning: chartWarning(quality, profile),
  };
}

function missingResponseBody(
  missing: KundliRequiredField[],
  profile: Parameters<typeof birthTimeQuality>[0],
) {
  const labels = missing.map((f) => FIELD_LABELS[f]).join(', ');
  return {
    status: 'missing_parameters' as const,
    missing,
    message: `Cannot generate a kundli yet — missing required birth details: ${labels}.`,
    // The funnel decision: a user who explicitly said they don't know their birth time has
    // already answered "do you have a time?" — sending them back to the same entry field asks
    // the same question again. Route straight to rectification instead. Anyone else missing
    // timeOfBirth simply hasn't entered one yet.
    ...(missing.includes('timeOfBirth')
      ? {
          nextStep:
            profile.birthTimeAccuracy === 'unknown'
              ? ('rectify_birth_time' as const)
              : ('enter_birth_time' as const),
        }
      : {}),
  };
}

export const kundliRouter = new OpenAPIHono();

kundliRouter.use('*', requireUser);

/** Kick off generation without blocking the response. */
function fireGeneration(userId: string, birthProfileId: string | null): void {
  void requestKundliGeneration(userId, birthProfileId).catch((err: unknown) => {
    logger.error({ err, userId, birthProfileId }, 'kundli background generation errored');
  });
}

/* -------------------------------------------------------------------------- */
/* GET /v1/kundli                                                              */
/* -------------------------------------------------------------------------- */

const getKundliRoute = createRoute({
  method: 'get',
  path: '/kundli',
  tags: ['Kundli'],
  summary: 'Get the current user’s natal kundli',
  description:
    'Returns 200 with the kundli when ready, 202 while it is still being ' +
    'generated (poll again), or 422 with the list of missing required birth ' +
    'parameters the frontend must collect.',
  security: [{ bearerAuth: [] }],
  request: { query: KundliQuerySchema },
  responses: {
    200: {
      description: 'Kundli ready',
      content: { 'application/json': { schema: KundliSchema } },
    },
    202: {
      description: 'Kundli generation in progress — poll again',
      content: { 'application/json': { schema: KundliStatusSchema } },
    },
    422: {
      description: 'Required birth parameters are missing',
      content: { 'application/json': { schema: KundliMissingParamsSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

kundliRouter.openapi(getKundliRoute, async (c) => {
  const user = c.get('user');
  const { language } = c.req.valid('query');
  const profile = await resolveActiveProfileContext(user);

  // Strict: refuse and tell the FE exactly what's missing.
  const missing = missingKundliParams(profile);
  if (missing.length > 0) {
    return c.json(missingResponseBody(missing, profile), 422);
  }

  const existing = await getKundliForUser(user.id, profile.birthProfileId);

  if (!existing) {
    // Self-heal: nothing on record but the data is complete — start now.
    fireGeneration(user.id, profile.birthProfileId);
    return c.json({ status: 'generating' as const }, 202);
  }

  if (existing.status === 'ready') {
    // Read-time staleness self-heal: if birth inputs changed since this was
    // computed, the stored chart is for old data — regenerate and report WIP.
    const currentHash = birthInputsForProfile(profile, user)?.birthHash;
    if (currentHash && existing.birthHash && existing.birthHash !== currentHash) {
      fireGeneration(user.id, profile.birthProfileId);
      return c.json({ status: 'generating' as const }, 202);
    }
    return c.json(
      withAccuracy(await toKundliDtoForLanguage(existing, language || 'en'), profile),
      200,
    );
  }

  // pending / generating / failed → ensure a run is (re)started (with a cooldown
  // so a permanently-failing chart doesn't hammer the engine on every poll) and
  // report the ACTUAL status.
  const status = existing.status;
  if (status === 'pending' || isStaleGenerating(existing)) {
    fireGeneration(user.id, profile.birthProfileId);
  } else if (status === 'failed') {
    if (Date.now() - existing.updatedAt.getTime() > FAILED_RETRY_COOLDOWN_MS) {
      fireGeneration(user.id, profile.birthProfileId);
    }
  }
  return c.json({ status }, 202);
});

/* -------------------------------------------------------------------------- */
/* POST /v1/kundli/regenerate  (test/debug — force + synchronous)              */
/* -------------------------------------------------------------------------- */

const regenerateRoute = createRoute({
  method: 'post',
  path: '/kundli/regenerate',
  tags: ['Kundli'],
  summary: 'Force-regenerate the current user’s kundli (synchronous; for testing)',
  description:
    'Recomputes the kundli from the latest birth data and returns the fresh ' +
    'result in one call. 422 lists any missing required parameters.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Kundli regenerated',
      content: { 'application/json': { schema: KundliSchema } },
    },
    202: {
      description: 'Regeneration in progress (another run was already active)',
      content: { 'application/json': { schema: KundliStatusSchema } },
    },
    422: {
      description: 'Required birth parameters are missing',
      content: { 'application/json': { schema: KundliMissingParamsSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

kundliRouter.openapi(regenerateRoute, async (c) => {
  const user = c.get('user');
  const profile = await resolveActiveProfileContext(user);
  const result = await regenerateKundli(user.id, profile.birthProfileId);

  if (!result.ok) {
    return c.json(missingResponseBody(result.missing, profile), 422);
  }
  if (result.row.status === 'ready') {
    return c.json(withAccuracy(await toKundliDto(result.row), profile), 200);
  }
  // 'failed' or still 'generating' (a concurrent run owns it).
  return c.json(
    {
      status: result.row.status === 'failed' ? ('failed' as const) : ('generating' as const),
      message:
        result.row.status === 'failed'
          ? 'Kundli generation failed. Please try again.'
          : 'Regeneration already in progress.',
    },
    202,
  );
});

/* -------------------------------------------------------------------------- */
/* GET /v1/kundli/houses/{house}/insight                                       */
/* -------------------------------------------------------------------------- */

/** Kick off house-insight generation without blocking the response. */
function fireHouseInsightGeneration(
  userId: string,
  house: number,
  kundliRow: NonNullable<Awaited<ReturnType<typeof getKundliForUser>>>,
): void {
  void requestHouseInsightGeneration(userId, house, kundliRow).catch((err: unknown) => {
    logger.error(
      { err, userId, house, birthProfileId: kundliRow.birthProfileId },
      'house insight background generation errored',
    );
  });
}

const getHouseInsightRoute = createRoute({
  method: 'get',
  path: '/kundli/houses/{house}/insight',
  tags: ['Kundli'],
  summary: "Get the current user's personalized insight for one house (1-12)",
  description:
    'Returns 200 with the insight when ready, 202 while it is still being generated ' +
    '(poll again — generated lazily the first time a house is viewed, then cached ' +
    "forever since the natal chart never changes), or 403 if the house isn't unlocked.",
  security: [{ bearerAuth: [] }],
  request: { params: HouseParamSchema, query: HouseInsightQuerySchema },
  responses: {
    200: {
      description: 'House insight',
      content: { 'application/json': { schema: HouseInsightSchema } },
    },
    202: {
      description: 'Generation in progress or the last attempt failed — poll again',
      content: { 'application/json': { schema: HouseInsightStatusSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('House is not unlocked'),
  },
});

kundliRouter.openapi(getHouseInsightRoute, async (c) => {
  const user = c.get('user');
  const profile = await resolveActiveProfileContext(user);
  const { house } = c.req.valid('param');
  const { language } = c.req.valid('query');

  if (!profile.unlockedHouses.includes(house)) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'This house is not unlocked yet.' } },
      403,
    );
  }

  const kundli = await getKundliForUser(user.id, profile.birthProfileId);
  if (!kundli || kundli.status !== 'ready') {
    return c.json({ status: 'generating' as const }, 202);
  }

  const existing = await findHouseInsight(user.id, profile.birthProfileId, house);

  if (existing?.status === 'ready') {
    return c.json(await toHouseInsightDtoForLanguage(existing, language || 'en'), 200);
  }

  if (existing?.status === 'generating' && !isHouseInsightStale(existing)) {
    return c.json({ status: 'generating' as const }, 202);
  }

  fireHouseInsightGeneration(user.id, house, kundli);
  return c.json({ status: 'generating' as const }, 202);
});
