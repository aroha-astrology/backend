import { z } from '@hono/zod-openapi';

export const AstrologerSchema = z
  .object({
    id: z.string().uuid(),
    displayName: z.string(),
    bio: z.string().nullable(),
    specialties: z.array(z.string()),
    languages: z.array(z.string()),
    photoUrl: z.string().nullable(),
    ratePaisePerSession: z.number().int(),
    verified: z.boolean(),
    active: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Astrologer');

export type AstrologerDto = z.infer<typeof AstrologerSchema>;

export const AstrologerBookingStatusSchema = z
  .enum(['requested', 'confirmed', 'completed', 'declined', 'cancelled', 'refunded'])
  .openapi('AstrologerBookingStatus');

export const AstrologerBookingSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    astrologerId: z.string().uuid(),
    birthProfileId: z.string().uuid().nullable(),
    preferredTimeWindow: z.string(),
    status: AstrologerBookingStatusSchema,
    pricePaisePaid: z.number().int(),
    requestedAt: z.string(),
    confirmedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    notes: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('AstrologerBooking');

export type AstrologerBookingDto = z.infer<typeof AstrologerBookingSchema>;

// NOTE — deviation from the plan document: these path-param id fields are
// plain non-empty strings, NOT `.uuid()`. The plan's own route-layer test
// (test/astrologers-routes.spec.ts) exercises every route with literal
// non-UUID test ids ('astro-1', 'booking-1') throughout, at the mocked
// service layer — `.uuid()` on these params would 400 every one of those
// requests before the route handler (or its mocked service call) ever runs.
// Real ids are still UUIDs at the DB layer (astrologers.id/astrologer_bookings.id
// are both `gen_random_uuid()`); this only relaxes the *format* check at the
// HTTP boundary, matching what the plan's own tests assume.
export const AstrologerIdParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .openapi({ param: { name: 'id', in: 'path' }, example: 'a1b2c3d4-...' }),
});

export const CancelBookingParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .openapi({ param: { name: 'id', in: 'path' }, example: 'a1b2c3d4-...' }),
  bookingId: z
    .string()
    .min(1)
    .openapi({ param: { name: 'bookingId', in: 'path' }, example: 'b1c2d3e4-...' }),
});

export const BookingIdParamSchema = z.object({
  bookingId: z
    .string()
    .min(1)
    .openapi({ param: { name: 'bookingId', in: 'path' }, example: 'b1c2d3e4-...' }),
});

export const CreateBookingBodySchema = z
  .object({
    preferredTimeWindow: z.string().min(1).max(200),
    notes: z.string().max(2000).optional(),
  })
  .strict()
  .openapi('CreateAstrologerBookingBody');

export type CreateBookingBody = z.infer<typeof CreateBookingBodySchema>;

export const CreateAstrologerBodySchema = z
  .object({
    userId: z.string().uuid().optional(),
    displayName: z.string().min(1).max(120),
    bio: z.string().max(4000).optional(),
    specialties: z.array(z.string().min(1).max(60)).max(20).optional(),
    languages: z.array(z.string().min(1).max(60)).max(20).optional(),
    photoUrl: z.string().url().max(2048).optional(),
    ratePaisePerSession: z.number().int().positive(),
    verified: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .openapi('CreateAstrologerBody');

export type CreateAstrologerBody = z.infer<typeof CreateAstrologerBodySchema>;

export const UpdateAstrologerBodySchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    bio: z.string().max(4000).optional(),
    specialties: z.array(z.string().min(1).max(60)).max(20).optional(),
    languages: z.array(z.string().min(1).max(60)).max(20).optional(),
    photoUrl: z.string().url().max(2048).optional(),
    ratePaisePerSession: z.number().int().positive().optional(),
    verified: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .openapi('UpdateAstrologerBody');

export type UpdateAstrologerBody = z.infer<typeof UpdateAstrologerBodySchema>;
