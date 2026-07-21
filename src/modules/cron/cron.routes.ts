import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireCronSecret } from '../../middleware/cron-auth.js';
import {
  DailyHoroscopeRunBodySchema,
  DailyHoroscopeRunSchema,
  HoroscopeRunBodySchema,
  HoroscopeRunResponseSchema,
} from '../horoscope/horoscope.schemas.js';
import { runAllHoroscopeBatches, runHoroscopeBatch } from '../horoscope/horoscope.service.js';
import { PanchangWarmupBodySchema, PanchangWarmupResultSchema } from '../astro/astro.schemas.js';
import { warmupPanchangCache } from '../astro/astro.service.js';
import { runHealthReport } from '../health-report/health-report.service.js';
import { broadcastPeriodReading } from './broadcast.service.js';
import { BroadcastReadingBodySchema, BroadcastReadingResultSchema } from './broadcast.schemas.js';

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

cronRouter.use('/cron/*', requireCronSecret);

const horoscopesRoute = createRoute({
  method: 'post',
  path: '/cron/horoscopes',
  tags: ['Cron'],
  summary: 'Generate personalized horoscopes for all active users',
  description:
    'Machine-to-machine endpoint, triggered by the OS crontab at 00:01 IST. ' +
    'Omit `period` to sweep all 4 periods (daily/weekly/monthly/yearly) in one call — ' +
    'each is a near-instant no-op except on its own rollover day, and the sweep doubles ' +
    'as a nightly self-heal for any stuck/failed row. Pass `period` to run just one (e.g. ' +
    'for a targeted backfill). Authenticated via the X-Cron-Secret header.',
  request: {
    body: {
      required: false,
      content: { 'application/json': { schema: HoroscopeRunBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Run(s) completed',
      content: { 'application/json': { schema: HoroscopeRunResponseSchema } },
    },
    403: errorResponse('Invalid or missing cron secret'),
  },
});

cronRouter.openapi(horoscopesRoute, async (c) => {
  const body = c.req.valid('json') ?? {};
  const { period, ...rest } = body;
  const result = period
    ? await runHoroscopeBatch(period, rest)
    : await runAllHoroscopeBatches(rest);
  return c.json(result, 200);
});

/**
 * @deprecated Thin alias for the old daily-only route, kept for one deploy
 * cycle so the EC2 crontab/script update isn't a hard cutover with the app
 * deploy. Remove once scripts/cron-daily-horoscopes.sh is retired in favor
 * of a generalized script hitting /cron/horoscopes.
 */
const dailyHoroscopesRoute = createRoute({
  method: 'post',
  path: '/cron/daily-horoscopes',
  tags: ['Cron'],
  summary: '[Deprecated] Use POST /cron/horoscopes instead',
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
  const result = await runHoroscopeBatch('daily', body);
  return c.json(result, 200);
});

const panchangWarmupRoute = createRoute({
  method: 'post',
  path: '/cron/panchang-warmup',
  tags: ['Cron'],
  summary: 'Pre-populate panchang_cache for the 5 named reference cities',
  description:
    'Machine-to-machine endpoint, meant to run once daily shortly after midnight IST, ' +
    'before user traffic. Authenticated via the X-Cron-Secret header.',
  request: {
    body: {
      required: false,
      content: { 'application/json': { schema: PanchangWarmupBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Warmup completed',
      content: { 'application/json': { schema: PanchangWarmupResultSchema } },
    },
    403: errorResponse('Invalid or missing cron secret'),
  },
});

cronRouter.openapi(panchangWarmupRoute, async (c) => {
  const body = c.req.valid('json') ?? {};
  const result = await warmupPanchangCache(body);
  return c.json(result, 200);
});

const healthReportRoute = createRoute({
  method: 'post',
  path: '/cron/health-report',
  tags: ['Cron'],
  summary: 'Run the health report and send to Telegram',
  responses: {
    200: {
      description: 'Report completed',
      content: { 'application/json': { schema: z.object({ status: z.literal('ok') }) } },
    },
    403: errorResponse('Invalid or missing cron secret'),
  },
});

cronRouter.openapi(healthReportRoute, async (c) => {
  await runHealthReport();
  return c.json({ status: 'ok' as const }, 200);
});

// ---------------------------------------------------------------------------
// Broadcast: "Your reading is ready" — daily/weekly/monthly/yearly, each
// wired to its own crontab line (see scripts/cron-broadcast-reading.sh):
//   daily   07:00 IST   — every day
//   weekly  10:00 IST   — Mondays
//   monthly 11:00 IST   — the 1st of the month
//   yearly  18:00 IST   — Jan 1
// shouldBroadcast() in broadcast.service.ts is the actual source of truth
// for "does today count" — a mis-scheduled crontab line is a harmless no-op
// against it rather than a duplicate/wrong-day send.
// ---------------------------------------------------------------------------

const broadcastReadingRoute = createRoute({
  method: 'post',
  path: '/cron/broadcast-reading',
  tags: ['Cron'],
  summary: 'Broadcast "your reading is ready" to all active device tokens',
  description:
    'Sends a localized FCM push (grouped by device locale, English fallback) to every ' +
    'un-revoked, push-enabled device token — including dormant users, since the copy is ' +
    'templated and reveals no generated content. Idempotent per (period, IST date) via ' +
    "cron_batch_runs; a no-op if `shouldBroadcast(period)` says today is not that period's " +
    'scheduled day, unless `force`. Authenticated via the X-Cron-Secret header.',
  request: {
    body: {
      required: false,
      content: { 'application/json': { schema: BroadcastReadingBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Broadcast completed (or skipped — see `skipped`/`reason`)',
      content: { 'application/json': { schema: BroadcastReadingResultSchema } },
    },
    403: errorResponse('Invalid or missing cron secret'),
  },
});

cronRouter.openapi(broadcastReadingRoute, async (c) => {
  const body = c.req.valid('json') ?? {};
  const result = await broadcastPeriodReading(body.period ?? 'daily', {
    force: body.force ?? false,
  });
  return c.json(result, 200);
});

/**
 * @deprecated Thin alias for the old daily-only route, kept for one deploy
 * cycle so the EC2 crontab update isn't a hard cutover with the app deploy.
 * Remove once scripts/cron-broadcast-reading.sh is confirmed switched over
 * to hitting /cron/broadcast-reading directly.
 */
const broadcastDailyReadingRoute = createRoute({
  method: 'post',
  path: '/cron/broadcast-daily-reading',
  tags: ['Cron'],
  summary: '[Deprecated] Use POST /cron/broadcast-reading instead',
  responses: {
    200: {
      description: 'Broadcast completed',
      content: { 'application/json': { schema: BroadcastReadingResultSchema } },
    },
    403: errorResponse('Invalid or missing cron secret'),
  },
});

cronRouter.openapi(broadcastDailyReadingRoute, async (c) => {
  const result = await broadcastPeriodReading('daily');
  return c.json(result, 200);
});
