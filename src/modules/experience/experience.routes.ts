import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin, requireUser } from '../../middleware/auth.js';
import { AppError, Errors } from '../../lib/errors.js';
import { isFeatureOn } from '../features/features.service.js';
import { logAdminAction } from '../admin/admin.repo.js';
import { getExperience, resetExperience, setExperience } from './experience.service.js';
import { SKINS } from './experience-rules.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('ExperienceError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

const SkinSchema = z.enum(SKINS as unknown as [string, ...string[]]).openapi('ExperienceSkin');

const ExperienceSchema = z
  .object({
    enabled: z.boolean().describe('The experience.picker switch. While false the app shows no picker and no setting.'),
    skin: SkinSchema.nullable(),
    picked: z.boolean().describe('False until the user has chosen once: the app shows the picker.'),
    freeChangeLeft: z.boolean(),
    canChange: z.boolean(),
    nextAllowedAt: z.string().nullable().describe('ISO time the next change is allowed; null when allowed now.'),
  })
  .openapi('Experience');

export const experienceRouter = new OpenAPIHono();

const getRoute = createRoute({
  method: 'get',
  path: '/me/experience',
  tags: ['Users'],
  summary: "The user's look (Classic Vedic or Modern Cosmic) and whether they can change it now",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: { description: 'The look and the change rule', content: { 'application/json': { schema: ExperienceSchema } } },
    401: errorResponse('Unauthorized'),
  },
});

experienceRouter.openapi(getRoute, async (c) => {
  const user = c.get('user');
  const enabled = await isFeatureOn(user.id, 'experience.picker');
  // experience.testSwitch (switched on for a test group): the look can be changed at any time.
  const status = await getExperience(user.id, new Date(), await isFeatureOn(user.id, 'experience.testSwitch'));
  return c.json({ enabled, ...status }, 200);
});

const putRoute = createRoute({
  method: 'put',
  path: '/me/experience',
  tags: ['Users'],
  summary: 'Pick the look the first time, or change it',
  description:
    'The first pick has no wait. After it the user has one free change at any time; every later ' +
    'change needs 30 days since the previous one (409 with `details.reason = EXPERIENCE_COOLDOWN` ' +
    'and `details.nextAllowedAt`). Asking for the look the user already has changes nothing.',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: {
    body: { required: true, content: { 'application/json': { schema: z.object({ skin: SkinSchema }) } } },
  },
  responses: {
    200: { description: 'The look after the request', content: { 'application/json': { schema: ExperienceSchema } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('The experience picker is switched off'),
    409: errorResponse('Changed too recently'),
  },
});

experienceRouter.openapi(putRoute, async (c) => {
  const user = c.get('user');
  if (!(await isFeatureOn(user.id, 'experience.picker'))) throw Errors.forbidden('The experience picker is not available yet');
  const { skin } = c.req.valid('json');
  const unlimited = await isFeatureOn(user.id, 'experience.testSwitch');
  const outcome = await setExperience(user.id, skin as (typeof SKINS)[number], new Date(), unlimited);
  if (outcome.blocked) {
    throw new AppError('CONFLICT', 'You can switch your experience again later', {
      reason: 'EXPERIENCE_COOLDOWN',
      nextAllowedAt: outcome.blocked.toISOString(),
    });
  }
  return c.json({ enabled: true, ...outcome.status }, 200);
});

/** Same identity-from-already-validated-token shortcut as the other admin routers. */
function adminPhoneOf(c: { get: (key: 'firebaseToken') => { phone_number?: string } }): string {
  return c.get('firebaseToken').phone_number ?? 'unknown';
}

const resetRoute = createRoute({
  method: 'post',
  path: '/admin/users/{id}/experience/reset',
  tags: ['Admin'],
  summary: "Give a user their free change of look back and clear the wait (support)",
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    params: z.object({
      id: z
        .string()
        .uuid()
        .openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: { description: 'The user after the reset', content: { 'application/json': { schema: ExperienceSchema } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    404: errorResponse('No such user'),
  },
});

experienceRouter.openapi(resetRoute, async (c) => {
  const { id } = c.req.valid('param');
  const status = await resetExperience(id);
  if (!status) throw Errors.notFound('No such user');
  await logAdminAction(adminPhoneOf(c), 'POST /v1/admin/users/:id/experience/reset', { id });
  return c.json({ enabled: true, ...status }, 200);
});
