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
    /** This group's model override, for a model-picker key; null = inherit the global model.
     * Always null for a non-model-picker key (mirrors AdminFeatureRow.model's own convention). */
    model: z.string().nullable(),
    /** Non-empty only for model-picker keys — same registry-sourced list AdminFeatureRow carries,
     * repeated here so the group page's dropdown doesn't need a second fetch to render it. */
    modelOptions: z.array(z.string()),
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
    // The group's full intended model choice: null = inherit the global model, a string = pin
    // this group to it. Omitted (defaults to null) for a non-model-picker key, or when `enabled`
    // is null (the row is being deleted, so no model is meaningful). Unlike the global PUT
    // /admin/features, this is always a COMPLETE statement, not a partial update — the group page
    // sends one full row per save, so there's no "leave untouched" case to preserve here.
    model: z.string().nullable().default(null),
  })
  .openapi('UpdateGroupFeatureBody');
