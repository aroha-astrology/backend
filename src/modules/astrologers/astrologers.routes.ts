import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin, requireUser } from '../../middleware/auth.js';
import { resolveActiveProfileContext } from '../birth-profiles/profile-context.js';
import {
  adminCompleteBooking,
  adminConfirmBooking,
  adminCreateAstrologer,
  adminInviteAstrologer,
  adminUpdateAstrologer,
  cancelBooking,
  createBooking,
  listDirectory,
  listMyBookings,
  toAstrologerDto,
  toBookingDto,
} from './astrologers.service.js';
import {
  AstrologerBookingSchema,
  AstrologerIdParamSchema,
  AstrologerSchema,
  BookingIdParamSchema,
  CancelBookingParamSchema,
  CreateAstrologerBodySchema,
  CreateBookingBodySchema,
  InviteAstrologerResponseSchema,
  UpdateAstrologerBodySchema,
} from './astrologers.schemas.js';

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

export const astrologersRouter = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Customer-facing routes
// ---------------------------------------------------------------------------

const listRoute = createRoute({
  method: 'get',
  path: '/astrologers',
  tags: ['Astrologers'],
  summary: 'Browse the verified, active astrologer directory',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'Astrologer directory',
      content: { 'application/json': { schema: z.array(AstrologerSchema) } },
    },
    401: errorResponse('Unauthorized'),
  },
});

astrologersRouter.openapi(listRoute, async (c) => {
  const rows = await listDirectory();
  return c.json(rows.map(toAstrologerDto), 200);
});

const bookRoute = createRoute({
  method: 'post',
  path: '/astrologers/{id}/book',
  tags: ['Astrologers'],
  summary: 'Request a scheduled-callback booking with an astrologer (wallet debited upfront)',
  description:
    'No live video/chat delivery exists yet — the astrologer follows up off-platform ' +
    '(e.g. a direct phone call) once an admin confirms the booking.',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: {
    params: AstrologerIdParamSchema,
    body: { required: true, content: { 'application/json': { schema: CreateBookingBodySchema } } },
  },
  responses: {
    201: {
      description: 'Booking requested',
      content: { 'application/json': { schema: AstrologerBookingSchema } },
    },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Astrologer not found'),
    409: errorResponse('Astrologer is not bookable, or wallet balance is insufficient'),
    422: errorResponse('Validation failed'),
  },
});

astrologersRouter.openapi(
  bookRoute,
  async (c) => {
    const user = c.get('user');
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const profile = await resolveActiveProfileContext(user);

    const result = await createBooking(user.id, id, profile, body);
    if (result.outcome === 'astrologer_not_found') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Astrologer not found' } }, 404);
    }
    if (result.outcome === 'not_bookable_or_insufficient_balance') {
      return c.json(
        {
          error: {
            code: 'CONFLICT',
            message: 'Astrologer is not bookable, or wallet balance is insufficient.',
          },
        },
        409,
      );
    }
    return c.json(toBookingDto(result.booking), 201);
  },
  // @hono/zod-openapi's own default (no hook passed) resolves a failed request
  // validation to a plain `c.json(result, 400)` — it never throws, so it
  // never reaches errorHandler's `AppError`/`ZodError` branches. This route's
  // documented contract above is 422, so map validation failures to that
  // shape explicitly, same as palm-photo.routes.ts's uploadRoute.
  (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'UNPROCESSABLE',
            message: 'Validation failed',
            details: result.error.flatten(),
          },
        },
        422,
      );
    }
  },
);

const cancelRoute = createRoute({
  method: 'post',
  path: '/astrologers/{id}/bookings/{bookingId}/cancel',
  tags: ['Astrologers'],
  summary: 'Cancel a REQUESTED (not yet confirmed) booking and refund the wallet',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: { params: CancelBookingParamSchema },
  responses: {
    200: {
      description: 'Booking cancelled and refunded',
      content: { 'application/json': { schema: AstrologerBookingSchema } },
    },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Booking not found'),
    409: errorResponse('Booking is not in a cancellable state (must be "requested")'),
  },
});

astrologersRouter.openapi(cancelRoute, async (c) => {
  const user = c.get('user');
  const { id, bookingId } = c.req.valid('param');
  const result = await cancelBooking(id, bookingId, user.id);
  if (result.outcome === 'not_found') {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Booking not found' } }, 404);
  }
  if (result.outcome === 'not_cancellable') {
    return c.json(
      {
        error: {
          code: 'CONFLICT',
          message: 'Booking is not in a cancellable state (must be "requested").',
        },
      },
      409,
    );
  }
  return c.json(toBookingDto(result.booking), 200);
});

// Registered alongside the /astrologers/{id}/... routes above — Hono's
// router matches this literal path over param routes at the same segment
// position regardless of declaration order (static segments always win
// over param segments in Hono's trie router), so `GET /astrologers/bookings/me`
// can never be shadowed by, e.g., a hypothetical future `GET /astrologers/{id}`.
// Covered explicitly by a routes test (see test/astrologers-routes.spec.ts).
const myBookingsRoute = createRoute({
  method: 'get',
  path: '/astrologers/bookings/me',
  tags: ['Astrologers'],
  summary: "The caller's own astrologer-booking history",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'Booking history',
      content: { 'application/json': { schema: z.array(AstrologerBookingSchema) } },
    },
    401: errorResponse('Unauthorized'),
  },
});

astrologersRouter.openapi(myBookingsRoute, async (c) => {
  const user = c.get('user');
  const rows = await listMyBookings(user.id);
  return c.json(rows.map(toBookingDto), 200);
});

// ---------------------------------------------------------------------------
// Admin-only routes (requireAdmin — admin-curated roster, no self-onboarding
// or astrologer self-service portal in this batch)
// ---------------------------------------------------------------------------

const adminCreateRoute = createRoute({
  method: 'post',
  path: '/admin/astrologers',
  tags: ['Astrologers Admin'],
  summary: 'Create an astrologer profile (admin-curated roster — no self-onboarding in this batch)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: CreateAstrologerBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'Astrologer profile created',
      content: { 'application/json': { schema: AstrologerSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    422: errorResponse('Validation failed'),
  },
});

astrologersRouter.openapi(
  adminCreateRoute,
  async (c) => {
    const body = c.req.valid('json');
    const row = await adminCreateAstrologer(body);
    return c.json(toAstrologerDto(row), 201);
  },
  // See bookRoute's identical comment above — 422 is this route's documented
  // contract for validation failures, not @hono/zod-openapi's plain 400 default.
  (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'UNPROCESSABLE',
            message: 'Validation failed',
            details: result.error.flatten(),
          },
        },
        422,
      );
    }
  },
);

const adminUpdateRoute = createRoute({
  method: 'patch',
  path: '/admin/astrologers/{id}',
  tags: ['Astrologers Admin'],
  summary: 'Update an astrologer profile (e.g. toggle verified/active)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    params: AstrologerIdParamSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: UpdateAstrologerBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'The updated astrologer profile',
      content: { 'application/json': { schema: AstrologerSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    404: errorResponse('Astrologer not found'),
    422: errorResponse('Validation failed'),
  },
});

astrologersRouter.openapi(
  adminUpdateRoute,
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const row = await adminUpdateAstrologer(id, body);
    return c.json(toAstrologerDto(row), 200);
  },
  // See bookRoute's identical comment above — 422 is this route's documented
  // contract for validation failures, not @hono/zod-openapi's plain 400 default.
  (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'UNPROCESSABLE',
            message: 'Validation failed',
            details: result.error.flatten(),
          },
        },
        422,
      );
    }
  },
);

const adminInviteRoute = createRoute({
  method: 'post',
  path: '/admin/astrologers/{id}/invite',
  tags: ['Astrologers Admin'],
  summary: 'Invite an existing astrologer profile to the self-serve provider portal',
  description:
    'Phone+OTP login, exactly like customer login — creates a Firebase Auth user keyed on ' +
    "the astrologer's already-stored phone number plus a provider_accounts row. No request " +
    'body: the phone must already be set on the astrologer profile (via the create/update ' +
    'admin routes) before inviting.',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    params: AstrologerIdParamSchema,
  },
  responses: {
    200: {
      description: 'Invite created — confirms the phone number the login was provisioned for',
      content: { 'application/json': { schema: InviteAstrologerResponseSchema } },
    },
    400: errorResponse('Astrologer has no phone number on file'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    404: errorResponse('Astrologer not found'),
    409: errorResponse('Astrologer has already been invited'),
  },
});

astrologersRouter.openapi(adminInviteRoute, async (c) => {
  const { id } = c.req.valid('param');
  const result = await adminInviteAstrologer(id);
  return c.json(result, 200);
});

const adminConfirmRoute = createRoute({
  method: 'post',
  path: '/admin/astrologers/bookings/{bookingId}/confirm',
  tags: ['Astrologers Admin'],
  summary:
    "Admin manually confirms a REQUESTED booking on the astrologer's behalf (no astrologer self-service portal in this batch)",
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: { params: BookingIdParamSchema },
  responses: {
    200: {
      description: 'Booking confirmed',
      content: { 'application/json': { schema: AstrologerBookingSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    409: errorResponse('Booking is not in a confirmable state (must be "requested")'),
  },
});

astrologersRouter.openapi(adminConfirmRoute, async (c) => {
  const { bookingId } = c.req.valid('param');
  const row = await adminConfirmBooking(bookingId);
  return c.json(toBookingDto(row), 200);
});

const adminCompleteRoute = createRoute({
  method: 'post',
  path: '/admin/astrologers/bookings/{bookingId}/complete',
  tags: ['Astrologers Admin'],
  summary:
    'Admin manually marks a CONFIRMED booking complete — the acknowledgment that the off-platform consultation happened (no automated call-completion signal without live telephony/video infra)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: { params: BookingIdParamSchema },
  responses: {
    200: {
      description: 'Booking completed',
      content: { 'application/json': { schema: AstrologerBookingSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    409: errorResponse('Booking is not in a completable state (must be "confirmed")'),
  },
});

astrologersRouter.openapi(adminCompleteRoute, async (c) => {
  const { bookingId } = c.req.valid('param');
  const row = await adminCompleteBooking(bookingId);
  return c.json(toBookingDto(row), 200);
});
