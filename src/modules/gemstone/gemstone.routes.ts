import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { logger } from '../../lib/logger.js';
import { findKundliByUserId } from '../kundli/kundli.repo.js';
import {
  GemstoneReportSchema,
  GemstoneStatusSchema,
  LanguageQuerySchema,
} from './gemstone.schemas.js';
import {
  findGemstoneRecommendation,
  isGemstoneStale,
  requestGemstoneGeneration,
  toGemstoneReportDtoForLanguage,
} from './gemstone.service.js';

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

export const gemstoneRouter = new OpenAPIHono();

/** Kick off report generation without blocking the response. */
function fireGemstoneGeneration(
  userId: string,
  kundli: { chartData: Record<string, unknown> | null },
): void {
  void requestGemstoneGeneration(userId, kundli).catch((err: unknown) => {
    logger.error({ err, userId }, 'gemstone background generation errored');
  });
}

const getGemstoneRoute = createRoute({
  method: 'get',
  path: '/gemstone',
  tags: ['Gemstone'],
  summary: "Get the current user's personalized gemstone report",
  description:
    'Returns 200 with the report when ready, 202 while it is still being generated ' +
    '(poll again — generated lazily the first time it is viewed, then cached forever ' +
    "since the natal chart never changes), or 403 if the report isn't unlocked " +
    '(spend credits via POST /v1/me/unlock-gemstone first).',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: { query: LanguageQuerySchema },
  responses: {
    200: {
      description: 'Gemstone report',
      content: { 'application/json': { schema: GemstoneReportSchema } },
    },
    202: {
      description: 'Generation in progress or last attempt failed — poll again',
      content: { 'application/json': { schema: GemstoneStatusSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Gemstone report is not unlocked'),
  },
});

gemstoneRouter.openapi(getGemstoneRoute, async (c) => {
  const user = c.get('user');
  const { language } = c.req.valid('query');

  if (user.gemstoneUnlockedAt === null) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'The gemstone report is not unlocked yet.' } },
      403,
    );
  }

  const kundli = await findKundliByUserId(user.id);
  if (!kundli || kundli.status !== 'ready') {
    return c.json({ status: 'generating' as const }, 202);
  }

  const existing = await findGemstoneRecommendation(user.id);

  if (existing?.status === 'ready') {
    return c.json(
      await toGemstoneReportDtoForLanguage(existing, language || 'en', kundli.chartData),
      200,
    );
  }

  if (existing?.status === 'generating' && !isGemstoneStale(existing)) {
    return c.json({ status: 'generating' as const }, 202);
  }

  fireGemstoneGeneration(user.id, { chartData: kundli.chartData });
  return c.json({ status: 'generating' as const }, 202);
});
