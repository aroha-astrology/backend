import { z } from '@hono/zod-openapi';
import { GenderSchema, PlaceSchema } from '../users/users.schemas.js';
import { BirthProfileRelationshipSchema } from './birth-profiles.schemas.js';

/**
 * A profile-list-friendly shape for `/v1/profiles` — distinct from
 * `BirthProfileDto` (`/v1/birth-profiles`), which has `ownerUserId` and no
 * active/primary flags. `id` is the literal string `'primary'` for the
 * primary/self profile (stored on `users`), or the `birth_profiles` uuid for
 * an additional profile.
 */
export const ProfileSchema = z
  .object({
    id: z.string().openapi({ example: 'primary' }),
    isPrimary: z.boolean(),
    isActive: z.boolean(),
    relationship: BirthProfileRelationshipSchema.nullable(),
    displayName: z.string().nullable(),
    gender: GenderSchema.nullable(),
    dateOfBirth: z.string().nullable(),
    timeOfBirth: z.string().nullable(),
    placeOfBirth: PlaceSchema.nullable(),
    createdAt: z.string(),
  })
  .openapi('Profile');

export type ProfileDto = z.infer<typeof ProfileSchema>;

/** DELETE /v1/profiles/{id} — hard-delete is only ever valid for an additional profile. */
export const ProfileIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: 'id', in: 'path' }, example: 'a1b2c3d4-...' }),
});

/**
 * POST /v1/profiles/{id}/activate — accepts either the literal `'primary'`
 * or an additional profile's uuid.
 */
export const ActivateProfileParamSchema = z.object({
  id: z
    .union([z.literal('primary'), z.string().uuid()])
    .openapi({ param: { name: 'id', in: 'path' }, example: 'primary' }),
});
