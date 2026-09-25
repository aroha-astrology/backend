import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { requireAnyFeature, requireFeature } from '../../middleware/feature.js';
import { LIFE_EVENT_DOMAINS } from '../../lib/astro-engine/calculations/rectification.js';
import {
  MAX_EVENTS_PER_DAY,
  MAX_NOTE_LENGTH,
  journalInsights,
  journalLifeEvents,
  listEntries,
  removeEntry,
  saveEntry,
} from './journal.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('JournalError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

/** Loose on purpose — the shapes are documented on the service types. */
// z.any (not z.unknown) values: Hono types an `unknown` JSON value as `never`.
const Json = z.record(z.string(), z.any());

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Rating = z.number().int().min(1).max(5).nullable().optional();

export const journalRouter = new OpenAPIHono();

// Home's "How was today?" card logs a mood, so reading and saving are open to
// it; the rest of the journal belongs to the page.
const cardOrPage = requireAnyFeature(['nav.journal', 'home.journalPrompt']);

const listRoute = createRoute({
  method: 'get',
  path: '/journal',
  tags: ['Journal'],
  summary: 'Journal entries in a date range (default: the last 60 days)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, cardOrPage] as const,
  request: { query: z.object({ from: DateSchema.optional(), to: DateSchema.optional() }) },
  responses: {
    200: { description: 'Entries', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
  },
});

journalRouter.openapi(listRoute, async (c) => {
  const list = await listEntries(c.get('user'), c.req.valid('query'));
  return c.json(list as unknown as Record<string, unknown>, 200);
});

const insightsRoute = createRoute({
  method: 'get',
  path: '/journal/insights',
  tags: ['Journal'],
  summary: 'Patterns in your own entries, by dasha period and by the day’s star (self-reflection)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireFeature('nav.journal')] as const,
  responses: {
    200: { description: 'Insights', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
  },
});

journalRouter.openapi(insightsRoute, async (c) => {
  const insights = await journalInsights(c.get('user'));
  return c.json(insights as unknown as Record<string, unknown>, 200);
});

const lifeEventsRoute = createRoute({
  method: 'get',
  path: '/journal/life-events',
  tags: ['Journal'],
  summary: 'Every dated life event in the journal, for a Birth Time Confidence check',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireFeature('nav.journal')] as const,
  responses: {
    200: { description: 'Life events', content: { 'application/json': { schema: Json } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
  },
});

journalRouter.openapi(lifeEventsRoute, async (c) => {
  const events = await journalLifeEvents(c.get('user'));
  return c.json(events as unknown as Record<string, unknown>, 200);
});

const saveRoute = createRoute({
  method: 'put',
  path: '/journal/{date}',
  tags: ['Journal'],
  summary: 'Save the check-in for a day (fields left out keep their value; null clears)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, cardOrPage] as const,
  request: {
    params: z.object({ date: DateSchema }),
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({
            mood: Rating,
            energy: Rating,
            career: Rating,
            relationship: Rating,
            money: Rating,
            note: z.string().max(MAX_NOTE_LENGTH).nullable().optional(),
            events: z.array(z.enum(LIFE_EVENT_DOMAINS)).max(MAX_EVENTS_PER_DAY).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { description: 'The saved entry', content: { 'application/json': { schema: Json } } },
    400: errorResponse('JOURNAL_DATE_IN_FUTURE or invalid body'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
  },
});

journalRouter.openapi(saveRoute, async (c) => {
  const entry = await saveEntry(c.get('user'), c.req.valid('param').date, c.req.valid('json'));
  return c.json(entry as unknown as Record<string, unknown>, 200);
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/journal/{date}',
  tags: ['Journal'],
  summary: "Delete a day's entry",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, requireFeature('nav.journal')] as const,
  request: { params: z.object({ date: DateSchema }) },
  responses: {
    200: {
      description: 'Deleted',
      content: { 'application/json': { schema: z.object({ deleted: z.boolean() }) } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Feature disabled for this user'),
    404: errorResponse('No entry for that day'),
  },
});

journalRouter.openapi(deleteRoute, async (c) => {
  await removeEntry(c.get('user'), c.req.valid('param').date);
  return c.json({ deleted: true }, 200);
});
