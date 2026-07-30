import { z } from '@hono/zod-openapi';

/* -------------------------------------------------------------------------- */
/* GET /admin/groups                                                          */
/* -------------------------------------------------------------------------- */

export const AdminGroupRowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    createdAt: z.string(),
    createdBy: z.string().nullable(),
    memberCount: z.number().int(),
  })
  .openapi('AdminGroupRow');

export const AdminGroupsResponseSchema = z
  .object({ groups: z.array(AdminGroupRowSchema) })
  .openapi('AdminGroupsResponse');

/* -------------------------------------------------------------------------- */
/* POST /admin/groups                                                         */
/* -------------------------------------------------------------------------- */

export const CreateGroupBodySchema = z
  .object({
    name: z.string().min(1),
    description: z.string().nullable().optional(),
  })
  .openapi('CreateGroupBody');

/* -------------------------------------------------------------------------- */
/* Shared params                                                              */
/* -------------------------------------------------------------------------- */

export const AdminGroupIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: 'id', in: 'path' } }),
});

export const AdminGroupMemberParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: 'id', in: 'path' } }),
  userId: z
    .string()
    .uuid()
    .openapi({ param: { name: 'userId', in: 'path' } }),
});

/* -------------------------------------------------------------------------- */
/* GET /admin/groups/{id}/members, POST .../members                          */
/* -------------------------------------------------------------------------- */

export const AdminGroupMemberRowSchema = z
  .object({
    userId: z.string(),
    displayName: z.string().nullable(),
    phoneE164: z.string().nullable(),
    addedAt: z.string(),
  })
  .openapi('AdminGroupMemberRow');

export const AdminGroupMembersResponseSchema = z
  .object({ members: z.array(AdminGroupMemberRowSchema) })
  .openapi('AdminGroupMembersResponse');

export const AddGroupMemberBodySchema = z
  .object({ userId: z.string().uuid() })
  .openapi('AddGroupMemberBody');

/* -------------------------------------------------------------------------- */
/* GET/PUT /admin/groups/{id}/features                                       */
/* -------------------------------------------------------------------------- */

/** A group either explicitly overrides a feature (true/false) or 'inherit's the global default. */
export const GroupFeatureStateSchema = z.union([z.literal('inherit'), z.boolean()]);

export const AdminGroupFeatureRowSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    group: z.string(),
    state: GroupFeatureStateSchema,
  })
  .openapi('AdminGroupFeatureRow');

export const AdminGroupFeaturesResponseSchema = z
  .object({ features: z.array(AdminGroupFeatureRowSchema) })
  .openapi('AdminGroupFeaturesResponse');

export const UpdateGroupFeatureBodySchema = z
  .object({
    key: z.string().min(1),
    // null clears the override (back to 'inherit'); true/false upserts it.
    enabled: z.boolean().nullable(),
  })
  .openapi('UpdateGroupFeatureBody');
