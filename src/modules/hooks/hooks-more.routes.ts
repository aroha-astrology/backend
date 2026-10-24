// The other hooks' routes (Kavach, Receipts, Text timing, Sleep, Mystery) plus the reader's hook push
// settings. Same rules as hooks.routes.ts: every route needs sign-in and the hook's own switch.

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin, requireUser } from '../../middleware/auth.js';
import { PlaceQuerySchema } from './hooks.routes.js';
import { addBeads, getKavach } from './kavach.service.js';
import { getReceipts, markCard, peekTomorrow } from './receipts.service.js';
import { armPeakAlert, getTextTiming, listTextPeople } from './text-timing.service.js';
import { getSleep, logSleep, unlockSleepReport } from './sleep.service.js';
import { getMystery, scratchCard } from './mystery.service.js';
import { getHookPrefs, setHookPref } from './hooks-prefs.service.js';
import { clampPushCap, HOOKS, MAX_PUSH_CAP } from './hooks-rules.js';
import { pushCap } from './hooks-common.js';
import { writeSettings } from './hooks.repo.js';

const ErrorSchema = z
  .object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional(), requestId: z.string().optional() }) })
  .openapi('HooksMoreError');
const errorResponse = (description: string) => ({ description, content: { 'application/json': { schema: ErrorSchema } } });
const Json = z.record(z.string(), z.any());
const std = {
  200: { description: 'OK', content: { 'application/json': { schema: Json } } },
  401: errorResponse('Unauthorized'),
  403: errorResponse('Feature disabled for this user'),
};
const out = (v: unknown) => v as Record<string, unknown>;

export const hooksMoreRouter = new OpenAPIHono();

/* --------------------------------------------------------------- Ghar Ka Kavach */

hooksMoreRouter.openapi(
  createRoute({
    method: 'get', path: '/hooks/ghar-kavach', tags: ['Hooks'], summary: "Ghar Ka Kavach: today's family pick, beads, the Kalash and the streak",
    security: [{ bearerAuth: [] }], middleware: [requireUser] as const, request: { query: PlaceQuerySchema }, responses: std,
  }),
  async (c) => c.json(out(await getKavach(c.get('user'), c.req.valid('query'))), 200),
);

hooksMoreRouter.openapi(
  createRoute({
    method: 'post', path: '/hooks/ghar-kavach/beads', tags: ['Hooks'], summary: 'Count beads chanted for today\'s pick; the 11th finishes the day',
    security: [{ bearerAuth: [] }], middleware: [requireUser] as const,
    request: {
      query: PlaceQuerySchema,
      body: { required: true, content: { 'application/json': { schema: z.object({ count: z.number().int().min(1).max(11) }).openapi('KavachBeadsBody') } } },
    },
    responses: std,
  }),
  async (c) => c.json(out(await addBeads(c.get('user'), { ...c.req.valid('query'), count: c.req.valid('json').count })), 200),
);

/* ------------------------------------------------------------- Cosmic Receipts */

hooksMoreRouter.openapi(
  createRoute({
    method: 'get', path: '/hooks/cosmic-receipts', tags: ['Hooks'], summary: "Cosmic Receipts: today's three timed cards",
    security: [{ bearerAuth: [] }], middleware: [requireUser] as const, request: { query: PlaceQuerySchema }, responses: std,
  }),
  async (c) => c.json(out(await getReceipts(c.get('user'), c.req.valid('query'))), 200),
);

hooksMoreRouter.openapi(
  createRoute({
    method: 'post', path: '/hooks/cosmic-receipts/mark', tags: ['Hooks'], summary: 'Mark a card Nailed, Partly or Missed (once per card)',
    security: [{ bearerAuth: [] }], middleware: [requireUser] as const,
    request: {
      query: PlaceQuerySchema,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z
              .object({
                date: z.enum(['today', 'yesterday']),
                part: z.enum(['morning', 'afternoon', 'evening']),
                verdict: z.enum(['nailed', 'partly', 'missed']),
              })
              .openapi('ReceiptMarkBody'),
          },
        },
      },
    },
    responses: std,
  }),
  async (c) => c.json(out(await markCard(c.get('user'), { ...c.req.valid('query'), ...c.req.valid('json') })), 200),
);

hooksMoreRouter.openapi(
  createRoute({
    method: 'post', path: '/hooks/cosmic-receipts/peek', tags: ['Hooks'], summary: "Peek at tomorrow's cards (coins, once per day)",
    security: [{ bearerAuth: [] }], middleware: [requireUser] as const, request: { query: PlaceQuerySchema }, responses: std,
  }),
  async (c) => c.json(out(await peekTomorrow(c.get('user'), c.req.valid('query'))), 200),
);

/* ---------------------------------------------------------------- Text timing */

hooksMoreRouter.openapi(
  createRoute({
    method: 'get', path: '/hooks/text-timing/people', tags: ['Hooks'], summary: "The reader's own saved profiles a timing can be read for",
    security: [{ bearerAuth: [] }], middleware: [requireUser] as const, responses: std,
  }),
  async (c) => c.json({ people: await listTextPeople(c.get('user')) }, 200),
);

hooksMoreRouter.openapi(
  createRoute({
    method: 'get', path: '/hooks/text-timing', tags: ['Hooks'], summary: 'Timing suggestion (green / amber / red) for one saved profile',
    security: [{ bearerAuth: [] }], middleware: [requireUser] as const,
    request: { query: PlaceQuerySchema.extend({ profileId: z.string().uuid().openapi({ param: { name: 'profileId', in: 'query' } }) }) },
    responses: std,
  }),
  async (c) => c.json(out(await getTextTiming(c.get('user'), c.req.valid('query'))), 200),
);

hooksMoreRouter.openapi(
  createRoute({
    method: 'post', path: '/hooks/text-timing/alert', tags: ['Hooks'], summary: "Alert me at the start of today's best stretch (coins)",
    security: [{ bearerAuth: [] }], middleware: [requireUser] as const,
    request: {
      query: PlaceQuerySchema,
      body: { required: true, content: { 'application/json': { schema: z.object({ profileId: z.string().uuid() }).openapi('TextAlertBody') } } },
    },
    responses: std,
  }),
  async (c) => c.json(out(await armPeakAlert(c.get('user'), { ...c.req.valid('query'), profileId: c.req.valid('json').profileId })), 200),
);

/* ---------------------------------------------------------------- Sleep Sync */

hooksMoreRouter.openapi(
  createRoute({
    method: 'get', path: '/hooks/sleep-sync', tags: ['Hooks'], summary: "Sleep Sync: last night's Moon, recent scores and the pattern",
    security: [{ bearerAuth: [] }], middleware: [requireUser] as const, request: { query: PlaceQuerySchema }, responses: std,
  }),
  async (c) => c.json(out(await getSleep(c.get('user'), c.req.valid('query'))), 200),
);

hooksMoreRouter.openapi(
  createRoute({
    method: 'post', path: '/hooks/sleep-sync/log', tags: ['Hooks'], summary: "Log how last night was, 1 to 5",
    security: [{ bearerAuth: [] }], middleware: [requireUser] as const,
    request: {
      query: PlaceQuerySchema,
      body: { required: true, content: { 'application/json': { schema: z.object({ score: z.number().int().min(1).max(5) }).openapi('SleepLogBody') } } },
    },
    responses: std,
  }),
  async (c) => c.json(out(await logSleep(c.get('user'), { ...c.req.valid('query'), score: c.req.valid('json').score })), 200),
);

hooksMoreRouter.openapi(
  createRoute({
    method: 'post', path: '/hooks/sleep-sync/report', tags: ['Hooks'], summary: 'Open the 30-day pattern report (coins, once per day)',
    security: [{ bearerAuth: [] }], middleware: [requireUser] as const, request: { query: PlaceQuerySchema }, responses: std,
  }),
  async (c) => c.json(out(await unlockSleepReport(c.get('user'), c.req.valid('query'))), 200),
);

/* ---------------------------------------------------------- Mystery Synastry */

hooksMoreRouter.openapi(
  createRoute({
    method: 'get', path: '/hooks/mystery', tags: ['Hooks'], summary: "Mystery Synastry: today's scratch card(s), from 18:00",
    security: [{ bearerAuth: [] }], middleware: [requireUser] as const, request: { query: PlaceQuerySchema }, responses: std,
  }),
  async (c) => c.json(out(await getMystery(c.get('user'), c.req.valid('query'))), 200),
);

hooksMoreRouter.openapi(
  createRoute({
    method: 'post', path: '/hooks/mystery/scratch', tags: ['Hooks'], summary: 'Scratch a card to reveal it',
    security: [{ bearerAuth: [] }], middleware: [requireUser] as const,
    request: {
      query: PlaceQuerySchema,
      body: { required: true, content: { 'application/json': { schema: z.object({ index: z.number().int().min(0).max(1) }).openapi('MysteryScratchBody') } } },
    },
    responses: std,
  }),
  async (c) => c.json(out(await scratchCard(c.get('user'), { ...c.req.valid('query'), index: c.req.valid('json').index })), 200),
);

/* ------------------------------------------------------------- Push settings */

hooksMoreRouter.openapi(
  createRoute({
    method: 'get', path: '/hooks/prefs', tags: ['Hooks'], summary: 'Which hook pushes the reader has switched off',
    security: [{ bearerAuth: [] }], middleware: [requireUser] as const, responses: std,
  }),
  async (c) => c.json(out(await getHookPrefs(c.get('user'))), 200),
);

hooksMoreRouter.openapi(
  createRoute({
    method: 'put', path: '/hooks/prefs', tags: ['Hooks'], summary: 'Switch one hook\'s push on or off',
    security: [{ bearerAuth: [] }], middleware: [requireUser] as const,
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: z.object({ hook: z.enum(HOOKS), push: z.boolean() }).openapi('HookPrefBody') } },
      },
    },
    responses: std,
  }),
  async (c) => c.json(out(await setHookPref(c.get('user'), c.req.valid('json').hook, c.req.valid('json').push)), 200),
);

/* ------------------------------------------------------------- Admin setting */

hooksMoreRouter.openapi(
  createRoute({
    method: 'get', path: '/admin/hooks/settings', tags: ['Hooks'], summary: 'Admin: the daily cap on hook pushes',
    security: [{ bearerAuth: [] }], middleware: [requireAdmin] as const, responses: std,
  }),
  async (c) => c.json({ pushCap: await pushCap(), max: MAX_PUSH_CAP }, 200),
);

hooksMoreRouter.openapi(
  createRoute({
    method: 'put', path: '/admin/hooks/settings', tags: ['Hooks'], summary: 'Admin: set the daily cap on hook pushes (0 to 8)',
    security: [{ bearerAuth: [] }], middleware: [requireAdmin] as const,
    request: { body: { required: true, content: { 'application/json': { schema: z.object({ pushCap: z.number().int().min(0).max(MAX_PUSH_CAP) }).openapi('HooksSettingsBody') } } } },
    responses: std,
  }),
  async (c) => {
    const cap = clampPushCap(c.req.valid('json').pushCap);
    await writeSettings({ pushCap: cap }, c.get('user').id);
    return c.json({ pushCap: cap, max: MAX_PUSH_CAP }, 200);
  },
);
