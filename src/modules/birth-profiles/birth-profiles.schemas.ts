import { z } from '@hono/zod-openapi';
import {
  BirthLocationAccuracySchema,
  BirthTimeAccuracySchema,
  BirthTimeSourceSchema,
  DateString,
  GenderSchema,
  PlaceSchema,
  TimeString,
} from '../users/users.schemas.js';

export const BirthProfileRelationshipSchema = z
  .enum(['partner', 'prospective_match', 'spouse', 'child', 'parent', 'sibling', 'friend', 'other'])
  .openapi('BirthProfileRelationship');

export const BirthProfileSchema = z
  .object({
    id: z.string().uuid(),
    ownerUserId: z.string().uuid(),
    relationship: BirthProfileRelationshipSchema.nullable(),
    displayName: z.string().nullable(),
    gender: GenderSchema.nullable(),
    dateOfBirth: z.string().nullable(),
    timeOfBirth: z.string().nullable(),
    placeOfBirth: PlaceSchema.nullable(),
    birthTimeAccuracy: BirthTimeAccuracySchema.nullable(),
    birthTimeSource: BirthTimeSourceSchema.nullable(),
    birthLocationAccuracy: BirthLocationAccuracySchema.nullable(),
    gotra: z.string().nullable(),
    addedWithConsent: z.boolean().nullable(),
    notes: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('BirthProfile');

export type BirthProfileDto = z.infer<typeof BirthProfileSchema>;

export const CreateBirthProfileBodySchema = z
  .object({
    relationship: BirthProfileRelationshipSchema.optional(),
    displayName: z.string().min(1).max(120),
    gender: GenderSchema.optional(),
    dateOfBirth: DateString.optional(),
    timeOfBirth: TimeString.nullable().optional(),
    placeOfBirth: PlaceSchema.optional(),
    birthTimeAccuracy: BirthTimeAccuracySchema.optional(),
    birthTimeSource: BirthTimeSourceSchema.optional(),
    birthLocationAccuracy: BirthLocationAccuracySchema.optional(),
    gotra: z.string().max(120).optional(),
    addedWithConsent: z.boolean().optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict()
  .openapi('CreateBirthProfileBody');

export type CreateBirthProfileBody = z.infer<typeof CreateBirthProfileBodySchema>;

export const UpdateBirthProfileBodySchema = z
  .object({
    relationship: BirthProfileRelationshipSchema.optional(),
    displayName: z.string().min(1).max(120).optional(),
    gender: GenderSchema.optional(),
    dateOfBirth: DateString.optional(),
    timeOfBirth: TimeString.nullable().optional(),
    placeOfBirth: PlaceSchema.optional(),
    birthTimeAccuracy: BirthTimeAccuracySchema.optional(),
    birthTimeSource: BirthTimeSourceSchema.optional(),
    birthLocationAccuracy: BirthLocationAccuracySchema.optional(),
    gotra: z.string().max(120).optional(),
    addedWithConsent: z.boolean().optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict()
  .openapi('UpdateBirthProfileBody');

export type UpdateBirthProfileBody = z.infer<typeof UpdateBirthProfileBodySchema>;
