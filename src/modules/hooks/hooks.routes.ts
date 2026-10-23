import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { isValidTimeZone } from '../astro/astro.service.js';
import { armAlarm, getShubhLabh, unlockWeek } from './shubh-labh.service.js';
import { getDiya, lightDiya } from './diya.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('HooksError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

/** Loose on purpose: the payload shapes are documented on the service types. */
const Json = z.record(z.string(), z.any());

const num = (min: number, max: number) =>
  z
    .string()
    .transform(Number)
    .pipe(z.number().min(min).max(max))
    .optional();

/** The sky place the app reads the day at; every part is optional (the saved home city is the fallback). */
export const PlaceQuerySchema = z.object({
  lat: num(-90, 90).openapi({ param: { name: 'lat', in: 'query' } }),
  lon: num(-180, 180).openapi({ param: { name: 'lon', in: 'query' } }),
  tz: z
    .string()
    .max(64)
    .refine(isValidTimeZone, { message: 'Unknown time zone' })
    .optional()
    .openapi({ param: { name: 'tz', in: 'query' } }),
});

const DateParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .openapi({ param: { name: 'date', in: 'query' }, example: '2026-10-26' });

export const hooksRouter = new OpenAPIHono();

const std = {
  200: { description: 'OK', content: { 'application/json': { schema: Json } } },
  401: errorResponse('Unauthorized'),
  403: errorResponse('Feature disabled for this user, or locked'),
};

/* ----------------------------------------------------------------- Shubh-Labh */

hooksRouter.openapi(
  createRoute({
    method: 'get',
    path: '/hooks/shubh-labh',
    tags: ['Hooks'],
    summary: "Shubh-Labh radar: today's 24-hour green/amber/red strip (free); other days need the unlocked week",
    security: [{ bearerAuth: [] }],
    middleware: [requireUser] as const,
    request: { query: PlaceQuerySchema.extend({ date: DateParam }) },
    responses: std,
  }),
  async (c) => c.json((await getShubhLabh(c.get('user'), c.req.valid('query'))) as unknown as Record<string, unknown>, 200),
);

hooksRouter.openapi(
  createRoute({
    method: 'post',
    path: '/hooks/shubh-labh/week',
    tags: ['Hooks'],
    summary: 'Unlock the 7-day Shubh-Labh view and alarms (coins, once per day it is asked on)',
    security: [{ bearerAuth: [] }],
    middleware: [requireUser] as const,
    request: { query: PlaceQuerySchema },
    responses: { ...std, 409: errorResponse('INSUFFICIENT_CREDITS') },
  }),
  async (c) => c.json((await unlockWeek(c.get('user'), c.req.valid('query'))) as unknown as Record<string, unknown>, 200),
);

hooksRouter.openapi(
  createRoute({
    method: 'post',
    path: '/hooks/shubh-labh/alarm',
    tags: ['Hooks'],
    summary: "Tell me 5 minutes before the best window of a day in the unlocked week",
    security: [{ bearerAuth: [] }],
    middleware: [requireUser] as const,
    request: {
      query: PlaceQuerySchema,
      body: {
        required: true,
        content: { 'application/json': { schema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).openapi('ShubhLabhAlarmBody') } },
      },
    },
    responses: std,
  }),
  async (c) =>
    c.json(
      (await armAlarm(c.get('user'), { ...c.req.valid('query'), date: c.req.valid('json').date })) as unknown as Record<string, unknown>,
      200,
    ),
);

/* ---------------------------------------------------------------- Sankalp Diya */

hooksRouter.openapi(
  createRoute({
    method: 'get',
    path: '/hooks/sankalp-diya',
    tags: ['Hooks'],
    summary: "Sankalp Diya: today's window, the streak and the real count of diyas lit",
    security: [{ bearerAuth: [] }],
    middleware: [requireUser] as const,
    request: { query: PlaceQuerySchema },
    responses: std,
  }),
  async (c) => c.json((await getDiya(c.get('user'), c.req.valid('query'))) as unknown as Record<string, unknown>, 200),
);

hooksRouter.openapi(
  createRoute({
    method: 'post',
    path: '/hooks/sankalp-diya/light',
    tags: ['Hooks'],
    summary: 'Light the diya (only inside the window; one per local day)',
    security: [{ bearerAuth: [] }],
    middleware: [requireUser] as const,
    request: { query: PlaceQuerySchema },
    responses: { ...std, 409: errorResponse('NOT_YET or WINDOW_PASSED') },
  }),
  async (c) => c.json((await lightDiya(c.get('user'), c.req.valid('query'))) as unknown as Record<string, unknown>, 200),
);
