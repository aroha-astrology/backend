import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { rateLimiter } from '../../middleware/rate-limit.js';
import { Errors } from '../../lib/errors.js';
import { isFeatureOnGlobally } from '../features/features.service.js';
import { getPanchang, isValidTimeZone } from '../astro/astro.service.js';
import {
  buildLiveNow,
  LIVE_NOW_TTL_SECONDS,
  LiveNowCache,
  roundCoord,
} from './live-now.js';

export const widgetsRouter = new OpenAPIHono();

const cache = new LiveNowCache();

// Public like /panchang (a widget has no sign-in), so it is rate limited the same way.
const liveNowRateLimit = rateLimiter({ windowMs: 60_000, max: 60, name: 'live-now' });

const QuerySchema = z.object({
  lat: z.string().transform(Number).pipe(z.number().min(-90).max(90)).openapi({
    param: { name: 'lat', in: 'query' },
    example: '28.61',
  }),
  lon: z.string().transform(Number).pipe(z.number().min(-180).max(180)).openapi({
    param: { name: 'lon', in: 'query' },
    example: '77.21',
  }),
  tz: z
    .string()
    .max(64)
    .refine(isValidTimeZone, { message: 'Unknown time zone' })
    .openapi({ param: { name: 'tz', in: 'query' }, example: 'Asia/Kolkata' }),
});

const route = createRoute({
  method: 'get',
  path: '/widgets/live-now',
  tags: ['Widgets'],
  summary: 'What is running at a place right now: hora, choghadiya, Rahu Kaal, next good window (public, under 2 KB, cached 15 minutes)',
  middleware: [liveNowRateLimit] as const,
  request: { query: QuerySchema },
  responses: {
    200: {
      description: 'The live answer',
      content: { 'application/json': { schema: z.record(z.string(), z.any()) } },
    },
    404: {
      description: 'Neither the Now Bar nor the widget feed is switched on',
      content: { 'application/json': { schema: z.record(z.string(), z.any()) } },
    },
  },
});

widgetsRouter.openapi(route, async (c) => {
  const [bar, widget] = await Promise.all([
    isFeatureOnGlobally('live.nowBar'),
    isFeatureOnGlobally('live.widget'),
  ]);
  if (!bar && !widget) throw Errors.notFound('Not available yet');

  const { lat, lon, tz } = c.req.valid('query');
  const now = new Date();
  let value = cache.get(lat, lon, tz, now);
  if (!value) {
    // The panchang itself is cached per place and day; the place is rounded so a walk across a
    // street does not miss the cache.
    const panchang = await getPanchang(roundCoord(lat), roundCoord(lon), undefined, { timeZone: tz });
    value = buildLiveNow(panchang as never, now, tz);
    cache.set(lat, lon, tz, now, value);
  }
  c.header('Cache-Control', `public, max-age=${LIVE_NOW_TTL_SECONDS}`);
  return c.json(value as unknown as Record<string, unknown>, 200);
});
