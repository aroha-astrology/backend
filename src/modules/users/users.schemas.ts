import { z } from '@hono/zod-openapi';

export const PlaceOfBirthSchema = z
  .object({
    name: z.string().min(1).max(200).openapi({ example: 'Mumbai, Maharashtra, India' }),
    lat: z.number().gte(-90).lte(90).openapi({ example: 19.076 }),
    lon: z.number().gte(-180).lte(180).openapi({ example: 72.8777 }),
    tz: z.string().min(1).max(64).openapi({ example: 'Asia/Kolkata' }),
  })
  .openapi('PlaceOfBirth');

export const GenderSchema = z.enum(['male', 'female', 'other']).openapi('Gender');

export const UserSchema = z
  .object({
    id: z.string().uuid(),
    firebaseUid: z.string(),
    phoneE164: z.string().nullable(),
    displayName: z.string().nullable(),
    gender: GenderSchema.nullable(),
    dateOfBirth: z.string().nullable().describe('ISO 8601 date (YYYY-MM-DD)'),
    timeOfBirth: z.string().nullable().describe('24h time (HH:mm or HH:mm:ss)'),
    placeOfBirth: PlaceOfBirthSchema.nullable(),
    profileCompletedAt: z.string().nullable().describe('ISO 8601 timestamp'),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('User');

export type UserDto = z.infer<typeof UserSchema>;

export const UpdateMeBodySchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    gender: GenderSchema.optional(),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
      .optional(),
    timeOfBirth: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Must be HH:mm or HH:mm:ss')
      .optional(),
    placeOfBirth: PlaceOfBirthSchema.optional(),
  })
  .strict()
  .openapi('UpdateMeBody');

export type UpdateMeBody = z.infer<typeof UpdateMeBodySchema>;
