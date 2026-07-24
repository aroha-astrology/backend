import { z } from '@hono/zod-openapi';

// E.164, India-only: '+91' followed by a 10-digit number starting 6-9 — the
// same format the live customer app already validates against (see
// usePhoneAuth.ts's `/^[6-9]\d{9}$/` local-number check + its own '+91'
// prefix). Used for astrologers.phone (below) and pandits.phone
// (pooja-bookings.schemas.ts) — both now provider-portal login numbers, not
// just ops contact numbers.
export const PHONE_E164_IN_REGEX = /^\+91[6-9]\d{9}$/;
const PHONE_E164_IN_MESSAGE = 'Must be an Indian E.164 number, e.g. +919876543210';

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
    /** Provider-portal login number (phone+OTP, admin-set) — see PHONE_E164_IN_REGEX above. Not returned on the public AstrologerSchema DTO. */
    phone: z.string().regex(PHONE_E164_IN_REGEX, PHONE_E164_IN_MESSAGE).optional(),
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
    /** Provider-portal login number (phone+OTP, admin-set) — see PHONE_E164_IN_REGEX above. Not returned on the public AstrologerSchema DTO. */
    phone: z.string().regex(PHONE_E164_IN_REGEX, PHONE_E164_IN_MESSAGE).optional(),
    ratePaisePerSession: z.number().int().positive().optional(),
    verified: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .openapi('UpdateAstrologerBody');

export type UpdateAstrologerBody = z.infer<typeof UpdateAstrologerBodySchema>;

// No request body for the invite route anymore — the phone number is already
// on the astrologer's stored row (set via the create/update routes above),
// not supplied at invite time. See adminInviteAstrologer, astrologers.service.ts.
export const InviteAstrologerResponseSchema = z
  .object({
    phoneE164: z.string(),
  })
  .openapi('InviteAstrologerResponse');

export type InviteAstrologerResponse = z.infer<typeof InviteAstrologerResponseSchema>;
