import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin } from '../../middleware/auth.js';
import { logger } from '../../lib/logger.js';
import {
  AdminGroupsResponseSchema,
  CreateGroupBodySchema,
  AdminGroupRowSchema,
  AdminGroupIdParamSchema,
  AdminGroupMemberParamSchema,
  AdminGroupMembersResponseSchema,
  AddGroupMemberBodySchema,
  AdminGroupFeaturesResponseSchema,
  UpdateGroupFeatureBodySchema,
  AdminGroupFeatureRowSchema,
} from './admin-groups.schemas.js';
import { logAdminAction } from './admin.repo.js';
import {
  listGroupsForAdmin,
  createGroupForAdmin,
  deleteGroupForAdmin,
  listMembersForAdmin,
  addMemberForAdmin,
  removeMemberForAdmin,
  listGroupFeaturesForAdmin,
  updateGroupFeatureForAdmin,
} from './admin-groups.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('AdminGroupsError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const adminGroupsRouter = new OpenAPIHono();

/**
 * Sibling router to admin.routes.ts, kept as its own file/router rather than
 * extending the existing one — the groups feature is a whole new resource
 * (groups, members, per-group feature overrides) and admin.routes.ts/
 * admin.service.ts/admin.repo.ts are already sizeable. `requireAdmin` is
 * still applied per-route via each `createRoute`'s own `middleware:
 * [requireAdmin] as const` — NOT a router-wide `.use('*', requireAdmin)` —
 * for the exact same reason documented at the top of admin.routes.ts: a
 * router-wide wildcard `.use()` on a child OpenAPIHono mounted via
 * `app.route(base, child)` does not reliably stay scoped to that child's own
 * paths once merged into the parent's route tree, and leaked into other,
 * later-mounted routers in a way that was only caught because `requireAdmin`
 * 403s instead of silently passing (unlike `requireUser`, whose accidental
 * leak elsewhere is invisible).
 */

/** Same identity-from-already-validated-token shortcut as admin.routes.ts's own adminPhoneOf — requireAdmin already 403'd anything that wouldn't reach here. */
function adminPhoneOf(c: { get: (key: 'firebaseToken') => { phone_number?: string } }): string {
  return c.get('firebaseToken').phone_number ?? 'unknown';
}

/** Audit-logs a READ, mirroring admin.routes.ts's own auditRead — awaited but never allowed to fail the request. */
async function auditRead(
  c: { get: (key: 'firebaseToken') => { phone_number?: string } },
  route: string,
  params: unknown,
): Promise<void> {
  await logAdminAction(adminPhoneOf(c), route, params).catch((err: unknown) =>
    logger.warn({ err, route }, 'admin_audit_log insert failed'),
  );
}

/* -------------------------------------------------------------------------- */
/* GET /admin/groups                                                          */
/* -------------------------------------------------------------------------- */

const listGroupsRoute = createRoute({
  method: 'get',
  path: '/admin/groups',
  tags: ['Admin'],
  summary: 'List every user group with its member count',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  responses: {
    200: { description: 'Group list', content: { 'application/json': { schema: AdminGroupsResponseSchema } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminGroupsRouter.openapi(listGroupsRoute, async (c) => {
  const groups = await listGroupsForAdmin();
  await auditRead(c, 'GET /v1/admin/groups', {});
  return c.json({ groups }, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /admin/groups                                                         */
/* -------------------------------------------------------------------------- */

const createGroupRoute = createRoute({
  method: 'post',
  path: '/admin/groups',
  tags: ['Admin'],
  summary: 'Create a manually-curated user group (e.g. "beta testers")',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    body: { required: true, content: { 'application/json': { schema: CreateGroupBodySchema } } },
  },
  responses: {
    200: { description: 'Created group', content: { 'application/json': { schema: AdminGroupRowSchema } } },
    400: errorResponse('A group with that name (case-insensitive) already exists'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminGroupsRouter.openapi(createGroupRoute, async (c) => {
  const { name, description } = c.req.valid('json');
  const group = await createGroupForAdmin(name, description, adminPhoneOf(c));
  return c.json(group, 200);
});

/* -------------------------------------------------------------------------- */
/* DELETE /admin/groups/{id}                                                  */
/* -------------------------------------------------------------------------- */

const deleteGroupRoute = createRoute({
  method: 'delete',
  path: '/admin/groups/{id}',
  tags: ['Admin'],
  summary: 'Delete a group (cascades its members and feature overrides)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: { params: AdminGroupIdParamSchema },
  responses: {
    204: { description: 'Deleted' },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminGroupsRouter.openapi(deleteGroupRoute, async (c) => {
  const { id } = c.req.valid('param');
  await deleteGroupForAdmin(id, adminPhoneOf(c));
  return c.body(null, 204);
});

/* -------------------------------------------------------------------------- */
/* GET /admin/groups/{id}/members                                            */
/* -------------------------------------------------------------------------- */

const listMembersRoute = createRoute({
  method: 'get',
  path: '/admin/groups/{id}/members',
  tags: ['Admin'],
  summary: 'List a group\'s members',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: { params: AdminGroupIdParamSchema },
  responses: {
    200: { description: 'Member list', content: { 'application/json': { schema: AdminGroupMembersResponseSchema } } },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminGroupsRouter.openapi(listMembersRoute, async (c) => {
  const { id } = c.req.valid('param');
  const members = await listMembersForAdmin(id);
  await auditRead(c, 'GET /v1/admin/groups/{id}/members', { id });
  return c.json({ members }, 200);
});

/* -------------------------------------------------------------------------- */
/* POST /admin/groups/{id}/members                                           */
/* -------------------------------------------------------------------------- */

const addMemberRoute = createRoute({
  method: 'post',
  path: '/admin/groups/{id}/members',
  tags: ['Admin'],
  summary: 'Add a user to a group (idempotent)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    params: AdminGroupIdParamSchema,
    body: { required: true, content: { 'application/json': { schema: AddGroupMemberBodySchema } } },
  },
  responses: {
    204: { description: 'Added (or already a member)' },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminGroupsRouter.openapi(addMemberRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { userId } = c.req.valid('json');
  await addMemberForAdmin(id, userId, adminPhoneOf(c));
  return c.body(null, 204);
});

/* -------------------------------------------------------------------------- */
/* DELETE /admin/groups/{id}/members/{userId}                                */
/* -------------------------------------------------------------------------- */

const removeMemberRoute = createRoute({
  method: 'delete',
  path: '/admin/groups/{id}/members/{userId}',
  tags: ['Admin'],
  summary: 'Remove a user from a group',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: { params: AdminGroupMemberParamSchema },
  responses: {
    204: { description: 'Removed (or was not a member)' },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminGroupsRouter.openapi(removeMemberRoute, async (c) => {
  const { id, userId } = c.req.valid('param');
  await removeMemberForAdmin(id, userId, adminPhoneOf(c));
  return c.body(null, 204);
});

/* -------------------------------------------------------------------------- */
/* GET /admin/groups/{id}/features                                           */
/* -------------------------------------------------------------------------- */

const listGroupFeaturesRoute = createRoute({
  method: 'get',
  path: '/admin/groups/{id}/features',
  tags: ['Admin'],
  summary: 'FEATURE_REGISTRY merged with this group\'s own overrides ("inherit" | true | false per key)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: { params: AdminGroupIdParamSchema },
  responses: {
    200: {
      description: 'Group feature list',
      content: { 'application/json': { schema: AdminGroupFeaturesResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminGroupsRouter.openapi(listGroupFeaturesRoute, async (c) => {
  const { id } = c.req.valid('param');
  const features = await listGroupFeaturesForAdmin(id);
  await auditRead(c, 'GET /v1/admin/groups/{id}/features', { id });
  return c.json({ features }, 200);
});

/* -------------------------------------------------------------------------- */
/* PUT /admin/groups/{id}/features                                           */
/* -------------------------------------------------------------------------- */

const updateGroupFeatureRoute = createRoute({
  method: 'put',
  path: '/admin/groups/{id}/features',
  tags: ['Admin'],
  summary: 'Set (true/false) or clear (null -> "inherit") this group\'s override for one feature key',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    params: AdminGroupIdParamSchema,
    body: { required: true, content: { 'application/json': { schema: UpdateGroupFeatureBodySchema } } },
  },
  responses: {
    200: {
      description: 'Updated group feature row',
      content: { 'application/json': { schema: AdminGroupFeatureRowSchema } },
    },
    400: errorResponse('Unknown feature key'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

adminGroupsRouter.openapi(updateGroupFeatureRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { key, enabled } = c.req.valid('json');
  const row = await updateGroupFeatureForAdmin(id, key, enabled, adminPhoneOf(c));
  return c.json(row, 200);
});
