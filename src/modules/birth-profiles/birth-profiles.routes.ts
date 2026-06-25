import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import {
  BirthProfileSchema,
  CreateBirthProfileBodySchema,
  UpdateBirthProfileBodySchema,
} from './birth-profiles.schemas.js';
import {
  createBirthProfile,
  deleteBirthProfile,
  getBirthProfile,
  listBirthProfiles,
  toBirthProfileDto,
  updateBirthProfile,
} from './birth-profiles.service.js';

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

const IdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: 'id', in: 'path' }, example: 'a1b2c3d4-...' }),
});

export const birthProfilesRouter = new OpenAPIHono();

birthProfilesRouter.use('*', requireUser);

const createBpRoute = createRoute({
  method: 'post',
  path: '/birth-profiles',
  tags: ['BirthProfiles'],
  summary: "Save another person's birth details (partner / family) for matching",
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: CreateBirthProfileBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'Birth profile created',
      content: { 'application/json': { schema: BirthProfileSchema } },
    },
    401: errorResponse('Unauthorized'),
    422: errorResponse('Validation failed'),
  },
});

const listBpRoute = createRoute({
  method: 'get',
  path: '/birth-profiles',
  tags: ['BirthProfiles'],
  summary: 'List the saved birth profiles you own',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Owned birth profiles',
      content: { 'application/json': { schema: z.array(BirthProfileSchema) } },
    },
    401: errorResponse('Unauthorized'),
  },
});

const getBpRoute = createRoute({
  method: 'get',
  path: '/birth-profiles/{id}',
  tags: ['BirthProfiles'],
  summary: 'Fetch one owned birth profile',
  security: [{ bearerAuth: [] }],
  request: { params: IdParamSchema },
  responses: {
    200: {
      description: 'The birth profile',
      content: { 'application/json': { schema: BirthProfileSchema } },
    },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Not found'),
  },
});

const patchBpRoute = createRoute({
  method: 'patch',
  path: '/birth-profiles/{id}',
  tags: ['BirthProfiles'],
  summary: 'Update an owned birth profile',
  security: [{ bearerAuth: [] }],
  request: {
    params: IdParamSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: UpdateBirthProfileBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'The updated birth profile',
      content: { 'application/json': { schema: BirthProfileSchema } },
    },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Not found'),
    422: errorResponse('Validation failed'),
  },
});

const deleteBpRoute = createRoute({
  method: 'delete',
  path: '/birth-profiles/{id}',
  tags: ['BirthProfiles'],
  summary: 'Soft-delete an owned birth profile',
  security: [{ bearerAuth: [] }],
  request: { params: IdParamSchema },
  responses: {
    204: { description: 'Deleted' },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Not found'),
  },
});

birthProfilesRouter.openapi(createBpRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');
  const created = await createBirthProfile(user.id, body);
  return c.json(toBirthProfileDto(created), 201);
});

birthProfilesRouter.openapi(listBpRoute, async (c) => {
  const user = c.get('user');
  const rows = await listBirthProfiles(user.id);
  return c.json(rows.map(toBirthProfileDto), 200);
});

birthProfilesRouter.openapi(getBpRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const row = await getBirthProfile(user.id, id);
  return c.json(toBirthProfileDto(row), 200);
});

birthProfilesRouter.openapi(patchBpRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const row = await updateBirthProfile(user.id, id, body);
  return c.json(toBirthProfileDto(row), 200);
});

birthProfilesRouter.openapi(deleteBpRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');
  await deleteBirthProfile(user.id, id);
  return c.body(null, 204);
});
