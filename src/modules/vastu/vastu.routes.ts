import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { requireConsent } from '../../middleware/consent.js';
import { rateLimiter } from '../../middleware/rate-limit.js';
import { requireFeature } from '../../middleware/feature.js';
import { resolveActiveProfileContext } from '../birth-profiles/profile-context.js';
import {
  AnalyzeVastuBodySchema,
  AskVastuBodySchema,
  VastuPlanSchema,
  PlanIdParamSchema,
  LanguageQuerySchema,
  CreateVastuHomeBodySchema,
  UpdateVastuHomeBodySchema,
  VastuHomeSchema,
  CreateVastuHomeVersionBodySchema,
  HomeVersionParamSchema,
  VastuHomeVersionSchema,
  VastuHomeVersionSummarySchema,
} from './vastu.schemas.js';
import {
  requestVastuAnalysis,
  askVastuQuestion,
  getPlansForUser,
  getPlanForUser,
  removePlanForUser,
  createHome,
  getHomesForUser,
  getHomeForUser,
  patchHomeForUser,
  removeHomeForUser,
  createHomeVersion,
  getHomeVersionsForUser,
  getHomeVersionForUser,
  restoreHomeVersion,
} from './vastu.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('VastuError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

/** The AI call is expensive — its own tight limit, independent of astro LLM calls. */
const analyzeRateLimit = rateLimiter({ windowMs: 60_000, max: 5, name: 'vastu-analyze' });

export const vastuRouter = new OpenAPIHono();

vastuRouter.use('*', requireUser);

/**
 * The admin "Vastu page" switch, enforced server-side on every route (not only by hiding the
 * page), so a client that ignores its UI toggle can't reach the API. Per-route rather than a
 * router-wide `use('*')`: this router is mounted at /v1, and a wildcard there would also run
 * for every router registered after it.
 */
const vastuOn = requireFeature('nav.vastu');
/** Admin switch for the paid AI report. */
const paidVastuOn = requireFeature('paid.vastu');

const analyzeRoute = createRoute({
  method: 'post',
  path: '/vastu/analyze',
  tags: ['Vastu'],
  summary: 'Request AI Vastu remedies for a floor plan',
  description:
    'Runs the deterministic rules engine immediately and kicks off a background ' +
    'AI analysis — returns a planId to poll via GET /vastu/{id}.',
  security: [{ bearerAuth: [] }],
  middleware: [vastuOn, paidVastuOn, analyzeRateLimit, requireConsent] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: AnalyzeVastuBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Analysis accepted — poll GET /vastu/{id} for the result',
      content: { 'application/json': { schema: z.object({ planId: z.string() }) } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Consent required, or feature disabled (message FEATURE_DISABLED)'),
    404: errorResponse('homeId is not one of your homes'),
    409: errorResponse('Insufficient credits (message INSUFFICIENT_CREDITS)'),
    422: errorResponse('Validation failed'),
    429: errorResponse('Daily analysis limit reached'),
  },
});

vastuRouter.openapi(analyzeRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const profile = await resolveActiveProfileContext(user);
  const result = await requestVastuAnalysis(user.id, profile.birthProfileId, body);
  return c.json(result, 200);
});

/* -------------------------------------------------------------------------- */
/* Homes — the account copy of the planner. Registered before GET /vastu/{id}   */
/* so "homes" is never parsed as a plan id.                                     */
/* -------------------------------------------------------------------------- */

const homesRateLimit = rateLimiter({ windowMs: 60_000, max: 60, name: 'vastu-homes' });
const HomeIdParamSchema = PlanIdParamSchema;

const createHomeRoute = createRoute({
  method: 'post',
  path: '/vastu/homes',
  tags: ['Vastu'],
  summary: 'Save a new home (floor plan) for the active profile',
  security: [{ bearerAuth: [] }],
  middleware: [vastuOn, homesRateLimit] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: CreateVastuHomeBodySchema } },
    },
  },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: VastuHomeSchema } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled'),
    409: errorResponse('Home limit reached (message HOME_LIMIT_REACHED)'),
    422: errorResponse('Validation failed'),
  },
});

vastuRouter.openapi(createHomeRoute, async (c) => {
  const user = c.get('user');
  const profile = await resolveActiveProfileContext(user);
  const home = await createHome(user.id, profile.birthProfileId, c.req.valid('json'));
  return c.json(home, 201);
});

const listHomesRoute = createRoute({
  method: 'get',
  path: '/vastu/homes',
  tags: ['Vastu'],
  summary: "List the active profile's saved homes (most recently edited first)",
  security: [{ bearerAuth: [] }],
  middleware: [vastuOn] as const,
  responses: {
    200: {
      description: 'Saved homes',
      content: { 'application/json': { schema: z.object({ homes: z.array(VastuHomeSchema) }) } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled'),
  },
});

vastuRouter.openapi(listHomesRoute, async (c) => {
  const user = c.get('user');
  const profile = await resolveActiveProfileContext(user);
  const homes = await getHomesForUser(user.id, profile.birthProfileId);
  return c.json({ homes }, 200);
});

const getHomeRoute = createRoute({
  method: 'get',
  path: '/vastu/homes/{id}',
  tags: ['Vastu'],
  summary: 'Get one saved home',
  security: [{ bearerAuth: [] }],
  middleware: [vastuOn] as const,
  request: { params: HomeIdParamSchema },
  responses: {
    200: { description: 'The home', content: { 'application/json': { schema: VastuHomeSchema } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled'),
    404: errorResponse('Not found'),
  },
});

vastuRouter.openapi(getHomeRoute, async (c) => {
  const user = c.get('user');
  const home = await getHomeForUser(c.req.valid('param').id, user.id);
  return c.json(home, 200);
});

const patchHomeRoute = createRoute({
  method: 'patch',
  path: '/vastu/homes/{id}',
  tags: ['Vastu'],
  summary: 'Rename, save the layout of, or archive a home',
  security: [{ bearerAuth: [] }],
  middleware: [vastuOn, homesRateLimit] as const,
  request: {
    params: HomeIdParamSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: UpdateVastuHomeBodySchema } },
    },
  },
  responses: {
    200: { description: 'Updated', content: { 'application/json': { schema: VastuHomeSchema } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled'),
    404: errorResponse('Not found'),
    422: errorResponse('Validation failed'),
  },
});

vastuRouter.openapi(patchHomeRoute, async (c) => {
  const user = c.get('user');
  const home = await patchHomeForUser(c.req.valid('param').id, user.id, c.req.valid('json'));
  return c.json(home, 200);
});

const deleteHomeRoute = createRoute({
  method: 'delete',
  path: '/vastu/homes/{id}',
  tags: ['Vastu'],
  summary: 'Delete a saved home (its reports are kept)',
  security: [{ bearerAuth: [] }],
  middleware: [vastuOn] as const,
  request: { params: HomeIdParamSchema },
  responses: {
    204: { description: 'Deleted' },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled'),
    404: errorResponse('Not found'),
  },
});

vastuRouter.openapi(deleteHomeRoute, async (c) => {
  const user = c.get('user');
  await removeHomeForUser(c.req.valid('param').id, user.id);
  return c.body(null, 204);
});

/* -------------------------------------------------------------------------- */
/* Home versions — snapshots of a home's layout, newest first, capped per home. */
/* -------------------------------------------------------------------------- */

const createHomeVersionRoute = createRoute({
  method: 'post',
  path: '/vastu/homes/{id}/versions',
  tags: ['Vastu'],
  summary: "Save the home's current stored layout as a version",
  description: 'Keeps the newest 30 versions per home; the oldest is pruned past that.',
  security: [{ bearerAuth: [] }],
  middleware: [vastuOn, homesRateLimit] as const,
  request: {
    params: HomeIdParamSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: CreateVastuHomeVersionBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: VastuHomeVersionSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled'),
    404: errorResponse('Home not found'),
    422: errorResponse('Validation failed'),
  },
});

vastuRouter.openapi(createHomeVersionRoute, async (c) => {
  const user = c.get('user');
  const version = await createHomeVersion(c.req.valid('param').id, user.id, c.req.valid('json'));
  return c.json(version, 201);
});

const listHomeVersionsRoute = createRoute({
  method: 'get',
  path: '/vastu/homes/{id}/versions',
  tags: ['Vastu'],
  summary: "List a home's saved versions (newest first, without layouts)",
  security: [{ bearerAuth: [] }],
  middleware: [vastuOn] as const,
  request: { params: HomeIdParamSchema },
  responses: {
    200: {
      description: 'Saved versions',
      content: {
        'application/json': {
          schema: z.object({ versions: z.array(VastuHomeVersionSummarySchema) }),
        },
      },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled'),
    404: errorResponse('Home not found'),
  },
});

vastuRouter.openapi(listHomeVersionsRoute, async (c) => {
  const user = c.get('user');
  const versions = await getHomeVersionsForUser(c.req.valid('param').id, user.id);
  return c.json({ versions }, 200);
});

const getHomeVersionRoute = createRoute({
  method: 'get',
  path: '/vastu/homes/{id}/versions/{versionId}',
  tags: ['Vastu'],
  summary: 'Get one saved version, including its layout',
  security: [{ bearerAuth: [] }],
  middleware: [vastuOn] as const,
  request: { params: HomeVersionParamSchema },
  responses: {
    200: {
      description: 'The version',
      content: { 'application/json': { schema: VastuHomeVersionSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled'),
    404: errorResponse('Not found'),
  },
});

vastuRouter.openapi(getHomeVersionRoute, async (c) => {
  const user = c.get('user');
  const { id, versionId } = c.req.valid('param');
  const version = await getHomeVersionForUser(id, versionId, user.id);
  return c.json(version, 200);
});

const restoreHomeVersionRoute = createRoute({
  method: 'post',
  path: '/vastu/homes/{id}/versions/{versionId}/restore',
  tags: ['Vastu'],
  summary: 'Restore a saved version onto the home',
  description:
    'Snapshots the current state first (label "Before restore") so the restore can be ' +
    'undone, then sets the home layout and score from the version.',
  security: [{ bearerAuth: [] }],
  middleware: [vastuOn, homesRateLimit] as const,
  request: { params: HomeVersionParamSchema },
  responses: {
    200: {
      description: 'The restored home',
      content: { 'application/json': { schema: VastuHomeSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled'),
    404: errorResponse('Not found'),
  },
});

vastuRouter.openapi(restoreHomeVersionRoute, async (c) => {
  const user = c.get('user');
  const { id, versionId } = c.req.valid('param');
  const home = await restoreHomeVersion(id, versionId, user.id);
  return c.json(home, 200);
});

const askRoute = createRoute({
  method: 'post',
  path: '/vastu/{id}/ask',
  tags: ['Vastu'],
  summary: 'Ask one free follow-up question about a completed Vastu report',
  security: [{ bearerAuth: [] }],
  middleware: [vastuOn, rateLimiter({ windowMs: 60_000, max: 8, name: 'vastu-plans' })] as const,
  request: {
    params: PlanIdParamSchema,
    body: { required: true, content: { 'application/json': { schema: AskVastuBodySchema } } },
  },
  responses: {
    200: {
      description: 'The plan with the follow-up answer',
      content: { 'application/json': { schema: VastuPlanSchema } },
    },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Not found'),
    409: errorResponse('Not ready or already asked'),
  },
});

vastuRouter.openapi(askRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const { question, language } = c.req.valid('json');
  const profile = await resolveActiveProfileContext(user);
  const plan = await askVastuQuestion(id, user.id, profile.birthProfileId, question, language);
  return c.json(plan, 200);
});

const listRoute = createRoute({
  method: 'get',
  path: '/vastu',
  tags: ['Vastu'],
  summary: "List the current user's recent Vastu plans",
  description:
    'Reports come back in the language they were written in (or a cached translation) — ' +
    'the list never triggers a translation. GET /vastu/{id}?language= translates one report.',
  security: [{ bearerAuth: [] }],
  middleware: [vastuOn] as const,
  request: { query: LanguageQuerySchema },
  responses: {
    200: {
      description: 'Recent plans',
      content: { 'application/json': { schema: z.object({ plans: z.array(VastuPlanSchema) }) } },
    },
    401: errorResponse('Unauthorized'),
  },
});

vastuRouter.openapi(listRoute, async (c) => {
  const user = c.get('user');
  const { language } = c.req.valid('query');
  const profile = await resolveActiveProfileContext(user);
  const plans = await getPlansForUser(user.id, profile.birthProfileId, language);
  return c.json({ plans }, 200);
});

const getOneRoute = createRoute({
  method: 'get',
  path: '/vastu/{id}',
  tags: ['Vastu'],
  summary: 'Get a single Vastu plan (poll target)',
  security: [{ bearerAuth: [] }],
  middleware: [vastuOn] as const,
  request: { params: PlanIdParamSchema, query: LanguageQuerySchema },
  responses: {
    200: { description: 'The plan', content: { 'application/json': { schema: VastuPlanSchema } } },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Not found'),
  },
});

vastuRouter.openapi(getOneRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const { language } = c.req.valid('query');
  const plan = await getPlanForUser(id, user.id, language);
  return c.json(plan, 200);
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/vastu/{id}',
  tags: ['Vastu'],
  summary: 'Delete a Vastu plan',
  security: [{ bearerAuth: [] }],
  middleware: [vastuOn] as const,
  request: { params: PlanIdParamSchema },
  responses: {
    204: { description: 'Deleted' },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Not found'),
  },
});

vastuRouter.openapi(deleteRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  await removePlanForUser(id, user.id);
  return c.body(null, 204);
});
