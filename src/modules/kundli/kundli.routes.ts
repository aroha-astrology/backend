import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { logger } from '../../lib/logger.js';
import {
  HouseInsightSchema,
  HouseInsightStatusSchema,
  HouseParamSchema,
  KundliMissingParamsSchema,
  KundliSchema,
  KundliStatusSchema,
} from './kundli.schemas.js';
import {
  birthInputsForUser,
  findHouseInsight,
  getKundliForUser,
  isHouseInsightStale,
  isStaleGenerating,
  missingKundliParams,
  regenerateKundli,
  requestHouseInsightGeneration,
  requestKundliGeneration,
  toHouseInsightDto,
  toKundliDto,
  type KundliRequiredField,
} from './kundli.service.js';

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
  displayName: 'name',
  gender: 'gender',
  dateOfBirth: 'birth date',
  timeOfBirth: 'exact birth time',
  placeOfBirth: 'birth place (with coordinates and timezone)',
};

function missingResponseBody(missing: KundliRequiredField[]) {
  const labels = missing.map((f) => FIELD_LABELS[f]).join(', ');
  return {
    status: 'missing_parameters' as const,
    missing,
    message: `Cannot generate a kundli yet — missing required birth details: ${labels}.`,
  };
}

export const kundliRouter = new OpenAPIHono();

kundliRouter.use('*', requireUser);

/** Kick off generation without blocking the response. */
function fireGeneration(userId: string): void {
  void requestKundliGeneration(userId).catch((err: unknown) => {
    logger.error({ err, userId }, 'kundli background generation errored');
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

  // Strict: refuse and tell the FE exactly what's missing.
  const missing = missingKundliParams(user);
  if (missing.length > 0) {
    return c.json(missingResponseBody(missing), 422);
  }

  const existing = await getKundliForUser(user.id);

  if (!existing) {
    // Self-heal: nothing on record but the data is complete — start now.
    fireGeneration(user.id);
    return c.json({ status: 'generating' as const }, 202);
  }

  if (existing.status === 'ready') {
    // Read-time staleness self-heal: if birth inputs changed since this was
    // computed, the stored chart is for old data — regenerate and report WIP.
    const currentHash = birthInputsForUser(user)?.birthHash;
    if (currentHash && existing.birthHash && existing.birthHash !== currentHash) {
      fireGeneration(user.id);
      return c.json({ status: 'generating' as const }, 202);
    }
    return c.json(toKundliDto(existing), 200);
  }

  // pending / generating / failed → ensure a run is (re)started (with a cooldown
  // so a permanently-failing chart doesn't hammer the engine on every poll) and
  // report the ACTUAL status.
  const status = existing.status;
  if (status === 'pending' || isStaleGenerating(existing)) {
    fireGeneration(user.id);
  } else if (status === 'failed') {
    if (Date.now() - existing.updatedAt.getTime() > FAILED_RETRY_COOLDOWN_MS) {
      fireGeneration(user.id);
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
  const result = await regenerateKundli(user.id);

  if (!result.ok) {
    return c.json(missingResponseBody(result.missing), 422);
  }
  if (result.row.status === 'ready') {
    return c.json(toKundliDto(result.row), 200);
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
    logger.error({ err, userId, house }, 'house insight background generation errored');
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
  request: { params: HouseParamSchema },
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
  const { house } = c.req.valid('param');

  const unlockedHouses = user.unlockedHouses ?? [];
  if (!unlockedHouses.includes(house)) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'This house is not unlocked yet.' } },
      403,
    );
  }

  const kundli = await getKundliForUser(user.id);
  if (!kundli || kundli.status !== 'ready') {
    return c.json({ status: 'generating' as const }, 202);
  }

  const existing = await findHouseInsight(user.id, house);

  if (existing?.status === 'ready') {
    return c.json(toHouseInsightDto(existing), 200);
  }

  if (existing?.status === 'generating' && !isHouseInsightStale(existing)) {
    return c.json({ status: 'generating' as const }, 202);
  }

  fireHouseInsightGeneration(user.id, house, kundli);
  return c.json({ status: 'generating' as const }, 202);
});
