import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import {
  PreferencesResponseSchema,
  UpdatePreferencesBodySchema,
} from './preferences.schemas.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('PreferencesError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const preferencesRouter = new OpenAPIHono();

preferencesRouter.use('*', requireUser);

/* -------------------------------------------------------------------------- */
/* GET /preferences                                                            */
/* -------------------------------------------------------------------------- */

const getPreferencesRoute = createRoute({
  method: 'get',
  path: '/preferences',
  tags: ['Preferences'],
  summary: "Get the authenticated user's preferences",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'User preferences',
      content: { 'application/json': { schema: PreferencesResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

preferencesRouter.openapi(getPreferencesRoute, async (c) => {
  const user = c.get('user');
  return c.json(
    {
      locale: user.locale ?? null,
      contentLanguage: user.contentLanguage ?? null,
      preferredSystem: user.preferredSystem ?? null,
      preferredAyanamsa: user.preferredAyanamsa ?? null,
      preferredHouseSystem: user.preferredHouseSystem ?? null,
      preferredChartStyle: user.preferredChartStyle ?? null,
      preferredDashaSystem: user.preferredDashaSystem ?? null,
      preferredNodeType: user.preferredNodeType ?? null,
      preferredCalendarLocale: user.preferredCalendarLocale ?? null,
      dailyHoroscopeSendHourLocal: user.dailyHoroscopeSendHourLocal ?? null,
      interestAreas: user.interestAreas ?? null,
      notificationPrefs: user.notificationPrefs ?? null,
      quietHours: user.quietHours ?? null,
    },
    200,
  );
});

/* -------------------------------------------------------------------------- */
/* PUT /preferences                                                            */
/* -------------------------------------------------------------------------- */

const updatePreferencesRoute = createRoute({
  method: 'put',
  path: '/preferences',
  tags: ['Preferences'],
  summary: "Update the authenticated user's preferences",
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: UpdatePreferencesBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Updated preferences',
      content: { 'application/json': { schema: PreferencesResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    422: errorResponse('Validation failed'),
  },
});

preferencesRouter.openapi(updatePreferencesRoute, async (c) => {
  const _user = c.get('user');
  const _body = c.req.valid('json');
  // TODO: persist to users table via users.repo
  return c.json(
    {
      locale: null,
      contentLanguage: null,
      preferredSystem: null,
      preferredAyanamsa: null,
      preferredHouseSystem: null,
      preferredChartStyle: null,
      preferredDashaSystem: null,
      preferredNodeType: null,
      preferredCalendarLocale: null,
      dailyHoroscopeSendHourLocal: null,
      interestAreas: null,
      notificationPrefs: null,
      quietHours: null,
    },
    200,
  );
});
