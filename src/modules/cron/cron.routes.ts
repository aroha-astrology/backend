import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireCronSecret } from '../../middleware/cron-auth.js';
import {
  DailyHoroscopeRunBodySchema,
  DailyHoroscopeRunSchema,
  HoroscopeRunBodySchema,
  HoroscopeRunResponseSchema,
  SelfHealRunBodySchema,
  SelfHealRunResultSchema,
} from '../horoscope/horoscope.schemas.js';
import {
  runAllHoroscopeBatches,
  runHoroscopeBatch,
  runHoroscopeSelfHeal,
} from '../horoscope/horoscope.service.js';
import { PanchangWarmupBodySchema, PanchangWarmupResultSchema } from '../astro/astro.schemas.js';
import { warmupPanchangCache } from '../astro/astro.service.js';
import { runHealthReport } from '../health-report/health-report.service.js';
import { broadcastPeriodReading } from './broadcast.service.js';
import { BroadcastReadingBodySchema, BroadcastReadingResultSchema } from './broadcast.schemas.js';
import {
  detectAndStoreTransits,
  draftTransitCopy,
  sendTransitAlerts,
} from './transit-alert.service.js';
import { TransitAlertBodySchema, TransitAlertResultSchema } from './transit-alert.schemas.js';
import {
  detectSaturnPhaseTransitions,
  sendSaturnPhaseAlerts,
} from './saturn-phase-alert.service.js';
import { SaturnPhaseRunBodySchema, SaturnPhaseRunResultSchema } from './saturn-phase.schemas.js';
import { checkConcurrentActivity } from '../admin-alerts/admin-alerts.service.js';
import { reapStaleReports } from '../reports/reports.service.js';
import { reapStalePalmReadings } from '../palm/palm.service.js';
import { runLowBalanceAlert } from './low-balance-alert.service.js';

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

const selfHealRoute = createRoute({
  method: 'post',
  path: '/cron/horoscopes-selfheal',
  tags: ['Cron'],
  summary: 'Retry failed or stale-generating horoscope rows',
  description:
    'Narrow safety-net sweep: unlike POST /cron/horoscopes (which pages through ALL recently-active ' +
    'users), this only re-attempts rows that are currently in "failed" status or stuck in ' +
    '"generating" past the stale threshold — so it is very cheap to run frequently (every 15 min). ' +
    'Authenticated via the X-Cron-Secret header.',
  request: {
    body: {
      required: false,
      content: { 'application/json': { schema: SelfHealRunBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Sweep completed',
      content: { 'application/json': { schema: SelfHealRunResultSchema } },
    },
    403: errorResponse('Invalid or missing cron secret'),
  },
});

cronRouter.openapi(selfHealRoute, async (c) => {
  const body = c.req.valid('json') ?? {};
  const result = await runHoroscopeSelfHeal(body);
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

// ---------------------------------------------------------------------------
// Transit pre-alerts — "a planet moves in 2 days" push, in three phases wired
// to their own crontab lines (see scripts/cron-transit-alerts.sh):
//   detect  07:30 IST, 1st of month  — extend the computed transit calendar
//   draft   09:00 IST, daily         — write copy for events pushing in 48h
//   send    19:00 IST, daily         — deliver whatever is due
// The phases are separate so a Gemini failure at draft time degrades to static
// copy a day early, rather than becoming a bad send at 19:00.
// ---------------------------------------------------------------------------

const transitAlertsRoute = createRoute({
  method: 'post',
  path: '/cron/transit-alerts',
  tags: ['Cron'],
  summary: 'Detect planetary transits, draft their push copy, or send due alerts',
  description:
    'Machine-to-machine endpoint for the transit pre-alert pipeline. `detect` recomputes the ' +
    'transit calendar from the bundled Swiss Ephemeris (never an external source — ours is ' +
    'Lahiri sidereal) and re-runs collision selection over all pending future events. `draft` ' +
    'generates Gemini copy per (event, Moon sign, language) for combinations that actually have ' +
    'a live device, validating each and substituting static copy on failure. `send` delivers, ' +
    'idempotent per IST date via cron_batch_runs. Authenticated via the X-Cron-Secret header.',
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: TransitAlertBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Phase completed',
      content: { 'application/json': { schema: TransitAlertResultSchema } },
    },
    403: errorResponse('Invalid or missing cron secret'),
  },
});

cronRouter.openapi(transitAlertsRoute, async (c) => {
  const body = c.req.valid('json');

  if (body.action === 'detect') {
    const r = await detectAndStoreTransits(
      body.horizonDays !== undefined ? { horizonDays: body.horizonDays } : {},
    );
    return c.json({ action: 'detect' as const, ...r }, 200);
  }

  if (body.action === 'draft') {
    const r = await draftTransitCopy();
    return c.json({ action: 'draft' as const, ...r }, 200);
  }

  const r = await sendTransitAlerts({
    force: body.force ?? false,
    dryRun: body.dryRun ?? false,
  });
  // `skipped` is a count in the detect/draft results and a boolean here, so
  // the boolean is folded into `reason` rather than overloading the field.
  const { skipped: _skipped, reason, ...rest } = r;
  return c.json({ action: 'send' as const, ...rest, ...(reason ? { reason } : {}) }, 200);
});

// ---------------------------------------------------------------------------
// Saturn phase (Sade Sati / Dhaiya) detection + persistence + change alert.
// Single combined action, unlike transit-alerts' 3-phase split: copy here is
// static (not Gemini-drafted), so there's no draft step to isolate a model
// failure from — see saturn-phase-alert.service.ts's header comment.
// ---------------------------------------------------------------------------

const saturnPhasesRoute = createRoute({
  method: 'post',
  path: '/cron/saturn-phases',
  tags: ['Cron'],
  summary: 'Detect Sade Sati/Dhaiya phase transitions, persist, and alert',
  description:
    "Recomputes every ready kundli's current Saturn phase from the real-ingress timeline " +
    '(astro-engine/doshas/saturnPhaseTimeline.ts), persists it to saturn_phases, and pushes a ' +
    'notification for every primary-profile user whose phase changed since the last run. ' +
    'Authenticated via the X-Cron-Secret header.',
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: SaturnPhaseRunBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Detection completed',
      content: { 'application/json': { schema: SaturnPhaseRunResultSchema } },
    },
    403: errorResponse('Invalid or missing cron secret'),
  },
});

cronRouter.openapi(saturnPhasesRoute, async (c) => {
  const body = c.req.valid('json');
  const { checked, transitions } = await detectSaturnPhaseTransitions();
  const alertsSent = body.dryRun ? 0 : await sendSaturnPhaseAlerts(transitions);
  return c.json({ checked, transitions: transitions.length, alertsSent }, 200);
});

// ---------------------------------------------------------------------------
// Live-activity check — polls how many users have been active in the last 5
// minutes for the ">15 simultaneous" and online-milestone Telegram alerts.
// Wired to run every 2 minutes (see scripts/cron-live-activity.sh).
// ---------------------------------------------------------------------------

const liveActivityCheckRoute = createRoute({
  method: 'post',
  path: '/cron/live-activity-check',
  tags: ['Cron'],
  summary: 'Poll concurrent active-user count for admin Telegram alerts',
  description:
    'Machine-to-machine endpoint, meant to run every 2 minutes via the OS crontab. Computes ' +
    'how many users have been active in the last 5 minutes; alerts (throttled to once per 15 ' +
    'min) if that exceeds 15, and separately alerts whenever it crosses a new 50/100/250/500 ' +
    'milestone band. Authenticated via the X-Cron-Secret header.',
  responses: {
    200: {
      description: 'Check completed',
      content: {
        'application/json': {
          schema: z.object({
            activeCount: z.number(),
            onlineMilestoneCrossed: z.number().nullable(),
          }),
        },
      },
    },
    403: errorResponse('Invalid or missing cron secret'),
  },
});

cronRouter.openapi(liveActivityCheckRoute, async (c) => {
  const result = await checkConcurrentActivity();
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// Reports stale-generating reaper — self-heals any purchased-report row stuck
// at 'generating' because the process that claimed it crashed mid-run. Wired
// to run every 5 minutes (see scripts/cron-reports-reap-stale.sh), matching
// REPORT_STALE_GENERATING_MS in reports.repo.ts.
// ---------------------------------------------------------------------------

const reportsReapStaleRoute = createRoute({
  method: 'post',
  path: '/cron/reports-reap-stale',
  tags: ['Cron'],
  summary: "Reap purchased-report rows stuck at 'generating' past the stale threshold",
  description:
    'Machine-to-machine endpoint, meant to run every 5 minutes via the OS crontab. Marks any ' +
    "report row whose generation claim is older than REPORT_STALE_GENERATING_MS as 'failed' " +
    '(reason: generation timed out) and refunds its price share — the same self-heal a repeat ' +
    'purchase against the same identity already gets via claimReportRow, but without requiring ' +
    'one. Authenticated via the X-Cron-Secret header.',
  responses: {
    200: {
      description: 'Sweep completed',
      content: { 'application/json': { schema: z.object({ reaped: z.number() }) } },
    },
    403: errorResponse('Invalid or missing cron secret'),
  },
});

cronRouter.openapi(reportsReapStaleRoute, async (c) => {
  const result = await reapStaleReports();
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// Palm readings stale-generating reaper — same self-heal as reports above,
// keyed to PALM_STALE_GENERATING_MS in palm.repo.ts (see
// scripts/cron-palm-reap-stale.sh).
// ---------------------------------------------------------------------------

const palmReapStaleRoute = createRoute({
  method: 'post',
  path: '/cron/palm-reap-stale',
  tags: ['Cron'],
  summary: "Reap palm_readings rows stuck at 'generating' past the stale threshold",
  description:
    'Machine-to-machine endpoint, meant to run every 5 minutes via the OS crontab. Marks any ' +
    "palm reading whose generation claim is older than PALM_STALE_GENERATING_MS as 'failed' " +
    '(reason: generation timed out) and refunds its price. Authenticated via the ' +
    'X-Cron-Secret header.',
  responses: {
    200: {
      description: 'Sweep completed',
      content: { 'application/json': { schema: z.object({ reaped: z.number() }) } },
    },
    403: errorResponse('Invalid or missing cron secret'),
  },
});

cronRouter.openapi(palmReapStaleRoute, async (c) => {
  const result = await reapStalePalmReadings();
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// Low-balance share nudge — one push per dip below ₹100, rearmed once the
// balance recovers (see low-balance-alert.service.ts). Wired to run every 30
// minutes (see scripts/cron-low-balance-alert.sh).
// ---------------------------------------------------------------------------

const lowBalanceAlertRoute = createRoute({
  method: 'post',
  path: '/cron/low-balance-alert',
  tags: ['Cron'],
  summary: 'Nudge users below the wallet-balance threshold to share & earn',
  description:
    'Machine-to-machine endpoint, meant to run every 30 minutes via the OS crontab. Sends a ' +
    '"share & earn ₹100" push (+ Bell inbox row) to every user whose wallet balance is below ' +
    '₹100 and who has not already been nudged since their balance last recovered to ₹100 or ' +
    'above. Authenticated via the X-Cron-Secret header.',
  responses: {
    200: {
      description: 'Sweep completed',
      content: {
        'application/json': {
          schema: z.object({ rearmed: z.number(), alerted: z.number() }),
        },
      },
    },
    403: errorResponse('Invalid or missing cron secret'),
  },
});

cronRouter.openapi(lowBalanceAlertRoute, async (c) => {
  const result = await runLowBalanceAlert();
  return c.json(result, 200);
});
