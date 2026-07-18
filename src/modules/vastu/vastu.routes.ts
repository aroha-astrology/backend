import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { requireConsent } from '../../middleware/consent.js';
import { rateLimiter } from '../../middleware/rate-limit.js';
import { resolveActiveProfileContext } from '../birth-profiles/profile-context.js';
import {
  AnalyzeVastuBodySchema,
  AskVastuBodySchema,
  VastuPlanSchema,
  PlanIdParamSchema,
  LanguageQuerySchema,
} from './vastu.schemas.js';
import {
  requestVastuAnalysis,
  askVastuQuestion,
  getPlansForUser,
  getPlanForUser,
  removePlanForUser,
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
const analyzeRateLimit = rateLimiter({ windowMs: 60_000, max: 5 });

export const vastuRouter = new OpenAPIHono();

vastuRouter.use('*', requireUser);

const analyzeRoute = createRoute({
  method: 'post',
  path: '/vastu/analyze',
  tags: ['Vastu'],
  summary: 'Request AI Vastu remedies for a floor plan',
  description:
    'Runs the deterministic rules engine immediately and kicks off a background ' +
    'AI analysis — returns a planId to poll via GET /vastu/{id}.',
  security: [{ bearerAuth: [] }],
  middleware: [analyzeRateLimit, requireConsent] as const,
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
    403: errorResponse('Consent required'),
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

const askRoute = createRoute({
  method: 'post',
  path: '/vastu/{id}/ask',
  tags: ['Vastu'],
  summary: 'Ask one free follow-up question about a completed Vastu report',
  security: [{ bearerAuth: [] }],
  middleware: [rateLimiter({ windowMs: 60_000, max: 8 })] as const,
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
  const { question } = c.req.valid('json');
  const profile = await resolveActiveProfileContext(user);
  const plan = await askVastuQuestion(id, user.id, profile.birthProfileId, question);
  return c.json(plan, 200);
});

const listRoute = createRoute({
  method: 'get',
  path: '/vastu',
  tags: ['Vastu'],
  summary: "List the current user's recent Vastu plans",
  security: [{ bearerAuth: [] }],
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
  const plans = await getPlansForUser(user.id, language);
  return c.json({ plans }, 200);
});

const getOneRoute = createRoute({
  method: 'get',
  path: '/vastu/{id}',
  tags: ['Vastu'],
  summary: 'Get a single Vastu plan (poll target)',
  security: [{ bearerAuth: [] }],
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
