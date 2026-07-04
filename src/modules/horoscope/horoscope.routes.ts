import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { GetHoroscopeQuerySchema, HoroscopeSchema } from './horoscope.schemas.js';
import { getOrGenerateHoroscope, toHoroscopeDto } from './horoscope.service.js';
import { findKundliByUserId } from '../kundli/kundli.repo.js';

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

export const horoscopeRouter = new OpenAPIHono();

horoscopeRouter.use('*', requireUser);

const getHoroscopeRoute = createRoute({
  method: 'get',
  path: '/horoscope',
  tags: ['Horoscope'],
  summary: "Get the current user's personalized horoscope",
  description:
    'Daily is pre-populated by the nightly CRON (IST) for speed, but every period ' +
    '(including daily) falls back to generating-and-caching on first request if the ' +
    'CRON missed it — so a cron miss/delay never leaves a user without a reading.',
  security: [{ bearerAuth: [] }],
  request: { query: GetHoroscopeQuerySchema },
  responses: {
    200: {
      description: 'Horoscope for the requested period',
      content: { 'application/json': { schema: HoroscopeSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

horoscopeRouter.openapi(getHoroscopeRoute, async (c) => {
  const user = c.get('user');
  const { period } = c.req.valid('query');
  const kundli = await findKundliByUserId(user.id);
  const dashaData = kundli && kundli.status === 'ready' ? kundli.dashaData : null;

  const row = await getOrGenerateHoroscope(user, period);
  return c.json(toHoroscopeDto(row, dashaData), 200);
});
