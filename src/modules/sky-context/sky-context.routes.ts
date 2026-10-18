import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { users } from '../../db/schema.js';
import { requireUser } from '../../middleware/auth.js';
import { Errors } from '../../lib/errors.js';
import { isFeatureOn } from '../features/features.service.js';
import { isValidTimeZone } from '../astro/astro.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('SkyContextError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

const Zone = z.string().min(1).max(64).refine(isValidTimeZone, 'Not a time zone');

const HomePlaceSchema = z.object({
  name: z.string().min(1).max(120),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  tz: Zone,
});

const SkyModeSchema = z.enum(['HOME', 'TRAVEL_SYNCED', 'TRAVEL_DISMISSED']);

const SkyContextSchema = z
  .object({
    travelPill: z.boolean().describe('The experience.travelPill switch'),
    nriMode: z.boolean().describe('The experience.nriMode switch'),
    homeLocation: HomePlaceSchema.nullable(),
    homeTimezone: z.string().nullable(),
    skyMode: SkyModeSchema,
    skyDismissedTz: z.string().nullable(),
    isNri: z.boolean(),
  })
  .openapi('SkyContext');

const UpdateSkyContextBodySchema = z
  .object({
    homeLocation: HomePlaceSchema.nullable().optional(),
    homeTimezone: Zone.optional(),
    skyMode: SkyModeSchema.optional(),
    skyDismissedTz: Zone.nullable().optional(),
    isNri: z.boolean().optional(),
  })
  .openapi('UpdateSkyContextBody');

export type UpdateSkyContextBody = z.infer<typeof UpdateSkyContextBodySchema>;

/**
 * The columns an update changes. A home place also sets the home zone (they must agree), and going
 * back to HOME forgets any "keep home" answer so the next trip is asked about afresh.
 */
export function skyUpdateFrom(body: UpdateSkyContextBody) {
  const set: Partial<typeof users.$inferInsert> = {};
  if (body.homeLocation !== undefined) {
    set.homeLocation = body.homeLocation;
    if (body.homeLocation) set.homeTimezone = body.homeLocation.tz;
  }
  if (body.homeTimezone !== undefined && !(body.homeLocation && body.homeLocation.tz)) {
    set.homeTimezone = body.homeTimezone;
  }
  if (body.skyMode !== undefined) {
    set.skyMode = body.skyMode;
    if (body.skyMode === 'HOME' && body.skyDismissedTz === undefined) set.skyDismissedTz = null;
  }
  if (body.skyDismissedTz !== undefined) set.skyDismissedTz = body.skyDismissedTz;
  if (body.isNri !== undefined) set.isNri = body.isNri;
  return set;
}

const columns = {
  homeLocation: users.homeLocation,
  homeTimezone: users.homeTimezone,
  skyMode: users.skyMode,
  skyDismissedTz: users.skyDismissedTz,
  isNri: users.isNri,
};

async function read(userId: string) {
  const [row] = await db.select(columns).from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw Errors.notFound('No such user');
  const [travelPill, nriMode] = await Promise.all([
    isFeatureOn(userId, 'experience.travelPill'),
    isFeatureOn(userId, 'experience.nriMode'),
  ]);
  return {
    travelPill,
    nriMode,
    homeLocation: row.homeLocation ?? null,
    homeTimezone: row.homeTimezone ?? null,
    skyMode: row.skyMode,
    skyDismissedTz: row.skyDismissedTz ?? null,
    isNri: row.isNri,
  };
}

export const skyContextRouter = new OpenAPIHono();

const getRoute = createRoute({
  method: 'get',
  path: '/me/context',
  tags: ['Users'],
  summary: "Where the user's sky is: home place, travel mode and NRI mode",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: { description: 'The context', content: { 'application/json': { schema: SkyContextSchema } } },
    401: errorResponse('Unauthorized'),
  },
});

skyContextRouter.openapi(getRoute, async (c) => c.json(await read(c.get('user').id), 200));

const putRoute = createRoute({
  method: 'put',
  path: '/me/context',
  tags: ['Users'],
  summary: 'Set the home place, accept or dismiss the travel pill, or turn NRI mode on or off',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: { body: { required: true, content: { 'application/json': { schema: UpdateSkyContextBodySchema } } } },
  responses: {
    200: { description: 'The context after the change', content: { 'application/json': { schema: SkyContextSchema } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Neither the travel pill nor NRI mode is switched on'),
  },
});

skyContextRouter.openapi(putRoute, async (c) => {
  const user = c.get('user');
  const [pill, nri] = await Promise.all([
    isFeatureOn(user.id, 'experience.travelPill'),
    isFeatureOn(user.id, 'experience.nriMode'),
  ]);
  if (!pill && !nri) throw Errors.forbidden('This is not available yet');
  const set = skyUpdateFrom(c.req.valid('json'));
  if (Object.keys(set).length > 0) await db.update(users).set(set).where(eq(users.id, user.id));
  return c.json(await read(user.id), 200);
});
