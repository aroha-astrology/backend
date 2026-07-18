import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { CreateBirthProfileBodySchema } from './birth-profiles.schemas.js';
import {
  ActivateProfileParamSchema,
  ProfileIdParamSchema,
  ProfileSchema,
} from './profiles.schemas.js';
import {
  PROFILE_CREATION_COST,
  activateProfile,
  createProfile,
  deleteProfile,
  listProfiles,
} from './profiles.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('ProfilesError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const profilesRouter = new OpenAPIHono();

profilesRouter.use('*', requireUser);

const listProfilesRoute = createRoute({
  method: 'get',
  path: '/profiles',
  tags: ['Profiles'],
  summary: 'List the account’s switchable profiles',
  description:
    'Returns the primary/self profile (id "primary") prepended to the ' +
    'owned additional birth_profiles, each flagged isPrimary/isActive.',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Primary profile plus owned additional profiles',
      content: { 'application/json': { schema: z.array(ProfileSchema) } },
    },
    401: errorResponse('Unauthorized'),
  },
});

const createProfileRoute = createRoute({
  method: 'post',
  path: '/profiles',
  tags: ['Profiles'],
  summary: 'Create a new additional profile and make it active',
  description:
    `Charges ${PROFILE_CREATION_COST} credits. The new profile becomes the ` +
    'active profile immediately and kundli generation starts in the ' +
    'background — poll GET /v1/kundli for status.',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: CreateBirthProfileBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'Profile created and made active',
      content: { 'application/json': { schema: ProfileSchema } },
    },
    401: errorResponse('Unauthorized'),
    409: errorResponse('Insufficient credits (message INSUFFICIENT_CREDITS)'),
    422: errorResponse('Validation failed'),
  },
});

const activateProfileRoute = createRoute({
  method: 'post',
  path: '/profiles/{id}/activate',
  tags: ['Profiles'],
  summary: 'Switch the account’s active profile',
  description: 'Pass "primary" for the primary/self profile, or an owned additional profile id.',
  security: [{ bearerAuth: [] }],
  request: { params: ActivateProfileParamSchema },
  responses: {
    200: {
      description: 'The now-active profile',
      content: { 'application/json': { schema: ProfileSchema } },
    },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Not found (not owned / does not exist)'),
  },
});

const deleteProfileRoute = createRoute({
  method: 'delete',
  path: '/profiles/{id}',
  tags: ['Profiles'],
  summary: 'Permanently delete an owned additional profile',
  description:
    'Hard delete — cascades its kundli/horoscope/house-insight/gemstone/chat ' +
    'data. If this was the active profile, activeProfileId self-heals to ' +
    'the primary profile.',
  security: [{ bearerAuth: [] }],
  request: { params: ProfileIdParamSchema },
  responses: {
    204: { description: 'Deleted' },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Not found (not owned / does not exist)'),
  },
});

profilesRouter.openapi(listProfilesRoute, async (c) => {
  const user = c.get('user');
  const profiles = await listProfiles(user);
  return c.json(profiles, 200);
});

profilesRouter.openapi(createProfileRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const profile = await createProfile(user, body);
  return c.json(profile, 201);
});

profilesRouter.openapi(activateProfileRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const profile = await activateProfile(user, id);
  return c.json(profile, 200);
});

profilesRouter.openapi(deleteProfileRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  await deleteProfile(user, id);
  return c.body(null, 204);
});
