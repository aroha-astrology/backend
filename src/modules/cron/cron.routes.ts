import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireCronSecret } from '../../middleware/cron-auth.js';
import {
  DailyHoroscopeRunBodySchema,
  DailyHoroscopeRunSchema,
} from '../horoscope/horoscope.schemas.js';
import { runDailyHoroscopes } from '../horoscope/horoscope.service.js';

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

export const cronRouter = new OpenAPIHono();

cronRouter.use('*', requireCronSecret);

const dailyHoroscopesRoute = createRoute({
  method: 'post',
  path: '/cron/daily-horoscopes',
  tags: ['Cron'],
  summary: 'Generate daily personalized horoscopes for all active users',
  description:
    'Machine-to-machine endpoint, triggered by the OS crontab at 00:01 IST. ' +
    'Authenticated via the X-Cron-Secret header.',
  request: {
    body: {
      required: false,
      content: { 'application/json': { schema: DailyHoroscopeRunBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Run completed',
      content: { 'application/json': { schema: DailyHoroscopeRunSchema } },
    },
    403: errorResponse('Invalid or missing cron secret'),
  },
});

cronRouter.openapi(dailyHoroscopesRoute, async (c) => {
  const body = c.req.valid('json') ?? {};
  const result = await runDailyHoroscopes(body);
  return c.json(result, 200);
});
