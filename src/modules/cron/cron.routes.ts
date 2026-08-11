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
import { runFactNudge } from './fact-nudge.service.js';
import { FactNudgeBodySchema, FactNudgeResultSchema } from './fact-nudge.schemas.js';
import {
  detectSaturnPhaseTransitions,
  sendSaturnPhaseAlerts,
} from './saturn-phase-alert.service.js';
import { SaturnPhaseRunBodySchema, SaturnPhaseRunResultSchema } from './saturn-phase.schemas.js';
import { checkConcurrentActivity } from '../admin-alerts/admin-alerts.service.js';
import { reapStaleReports } from '../reports/reports.service.js';
import { reapStalePalmReadings } from '../palm/palm.service.js';
import { runLowBalanceAlert } from './low-balance-alert.service.js';
import {
  DELETION_REMINDER_AFTER_DAYS,
  runDeletionRequestReminder,
} from './deletion-reminder.service.js';

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
  summary: 'Bulk-generate personalized horoscopes (manual backfill only)',
  description:
    'NOT on any schedule as of 2026-08-11 — the nightly crontab line was removed. Horoscopes ' +
    'are now generated on the fly on first view of each period (GET /v1/horoscope) and reused ' +
    'for the rest of that period, so nothing spends an LLM call on a page the user may never ' +
    'open. This endpoint remains as the manual backfill/admin tool (see ' +
    'scripts/regenerate-all-horoscopes.sh); do not re-wire it to cron without a reason. ' +
    'Omit `period` to sweep all 5 periods in one call, or pass `period` to run just one. ' +
    'Authenticated via the X-Cron-Secret header.',
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
//
// Disabled at user request 2026-08-07 — no horoscope broadcast notification
// should fire (daily/weekly/monthly/yearly all off). The EC2 crontab lines
// were removed too; BROADCAST_READING_DISABLED is the code-level backstop in
// case a crontab line survives or is re-added. Flip it back to send again.
// ---------------------------------------------------------------------------

const BROADCAST_READING_DISABLED = true;

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
  const period = body.period ?? 'daily';
  if (BROADCAST_READING_DISABLED) {
    return c.json(
      { period, skipped: true, reason: 'disabled', tokensFound: 0, success: 0, failure: 0 },
      200,
    );
  }
  const result = await broadcastPeriodReading(period, { force: body.force ?? false });
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
  if (BROADCAST_READING_DISABLED) {
    return c.json(
      {
        period: 'daily' as const,
        skipped: true,
        reason: 'disabled',
        tokensFound: 0,
        success: 0,
        failure: 0,
      },
      200,
    );
  }
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
// Fact-based re-engagement nudge — twice a month (1st/3rd Sunday, 11:30 IST
// per the crontab), reminds a user of a dated window or an unanswered
// follow-up drawn from their own saved user_facts row, or sends nothing that
// cycle. Gated dark by FACT_NUDGE_ENABLED until verified via dryRun.
// ---------------------------------------------------------------------------

const factNudgeRoute = createRoute({
  method: 'post',
  path: '/cron/fact-nudge',
  tags: ['Cron'],
  summary: 'Send the twice-monthly fact-based re-engagement nudge',
  description:
    'Machine-to-machine endpoint for the fact-nudge job. Only runs on the 1st/3rd Sunday of the ' +
    'month (IST) unless `force` is set. For every user with a saved user_facts row and no recent ' +
    'fact-nudge, picks a dated window or an unanswered follow-up, drafts Gemini copy through a ' +
    'suppression denylist + validator, and delivers via notifyUser (Bell inbox always, push only ' +
    'to live device tokens). No-op unless FACT_NUDGE_ENABLED. Authenticated via X-Cron-Secret.',
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: FactNudgeBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Run completed (or deliberately skipped — see `reason`)',
      content: { 'application/json': { schema: FactNudgeResultSchema } },
    },
    403: errorResponse('Invalid or missing cron secret'),
  },
});

cronRouter.openapi(factNudgeRoute, async (c) => {
  const body = c.req.valid('json');
  const r = await runFactNudge({ force: body.force ?? false, dryRun: body.dryRun ?? false });
  return c.json(r, 200);
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
    'Machine-to-machine endpoint, meant to run every 5 minutes via the OS crontab. A stale ' +
    'row is reclaimed and generation re-fired (`retried`) up to MAX_REPORT_GENERATION_ATTEMPTS ' +
    'times — a resumable generator (marriage/numerology/true_love) picks up from its last ' +
    "checkpoint rather than paying for the whole report again. Past that ceiling it's marked " +
    "'failed' (reason: generation timed out) and refunded (`reaped`) — the same self-heal a " +
    'repeat purchase against the same identity already gets via claimReportRow, but without ' +
    'requiring one. Authenticated via the X-Cron-Secret header.',
  responses: {
    200: {
      description: 'Sweep completed',
      content: {
        'application/json': { schema: z.object({ reaped: z.number(), retried: z.number() }) },
      },
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
// balance recovers (see low-balance-alert.service.ts). Wired to run once a
// day (see scripts/cron-low-balance-alert.sh).
// ---------------------------------------------------------------------------

const lowBalanceAlertRoute = createRoute({
  method: 'post',
  path: '/cron/low-balance-alert',
  tags: ['Cron'],
  summary: 'Nudge users below the wallet-balance threshold to share & earn',
  description:
    'Machine-to-machine endpoint, meant to run once a day via the OS crontab. Sends a ' +
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

// ---------------------------------------------------------------------------

const deletionRemindersRoute = createRoute({
  method: 'post',
  path: '/cron/deletion-reminders',
  tags: ['Cron'],
  summary: 'Re-alert the admin chat about unanswered account-deletion requests',
  description:
    'Machine-to-machine endpoint, meant to run once a day via the OS crontab. Sends one ' +
    'Telegram message per account-deletion request that has been pending for more than ' +
    `${DELETION_REMINDER_AFTER_DAYS} days without an admin decision, and keeps re-sending ` +
    'daily until the request is approved or rejected — nothing is ever erased on a timer. ' +
    'Authenticated via the X-Cron-Secret header.',
  responses: {
    200: {
      description: 'Sweep completed',
      content: {
        'application/json': {
          schema: z.object({ pending: z.number(), reminded: z.number() }),
        },
      },
    },
    403: errorResponse('Invalid or missing cron secret'),
  },
});

cronRouter.openapi(deletionRemindersRoute, async (c) => {
  const result = await runDeletionRequestReminder();
  return c.json(result, 200);
});
