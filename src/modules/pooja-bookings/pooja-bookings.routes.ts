import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser } from '../../middleware/auth.js';
import { resolveActiveProfileContext } from '../birth-profiles/profile-context.js';
import { listCatalog, bookPooja, cancelBooking, listMyBookings } from './pooja-bookings.service.js';
import type { PoojaBookingRow } from '../../db/schema.js';
import {
  PoojaCatalogListSchema,
  PoojaBookingDtoSchema,
  PoojaBookingListSchema,
  CreatePoojaBookingRequestSchema,
  BookingIdParamSchema,
} from './pooja-bookings.schemas.js';

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

export const poojaBookingsRouter = new OpenAPIHono();

function toBookingDto(row: PoojaBookingRow) {
  return {
    id: row.id,
    poojaId: row.poojaId,
    panditId: row.panditId,
    preferredDate: row.preferredDate,
    shipAddress: row.shipAddress,
    shipPincode: row.shipPincode,
    status: row.status,
    pricePaisePaid: row.pricePaisePaid,
    requestedAt: row.requestedAt.toISOString(),
    assignedAt: row.assignedAt ? row.assignedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    notes: row.notes,
  };
}

const catalogRoute = createRoute({
  method: 'get',
  path: '/pooja-bookings/catalog',
  tags: ['Pooja Bookings'],
  summary: 'List active poojas available for booking',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'Active pooja catalog',
      content: { 'application/json': { schema: PoojaCatalogListSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

poojaBookingsRouter.openapi(catalogRoute, async (c) => {
  const items = await listCatalog();
  return c.json(
    {
      items: items.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        deity: p.deity,
        basePricePaise: p.basePricePaise,
        durationMinutes: p.durationMinutes,
      })),
    },
    200,
  );
});

const createBookingRoute = createRoute({
  method: 'post',
  path: '/pooja-bookings',
  tags: ['Pooja Bookings'],
  summary: 'Book a pooja for the active profile (debits wallet immediately)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: {
    body: { content: { 'application/json': { schema: CreatePoojaBookingRequestSchema } } },
  },
  responses: {
    201: {
      description: 'Booking created',
      content: { 'application/json': { schema: PoojaBookingDtoSchema } },
    },
    401: errorResponse('Unauthorized'),
    404: errorResponse('Unknown or inactive pooja'),
    409: errorResponse('Insufficient wallet balance'),
    422: errorResponse('Invalid request body'),
  },
});

poojaBookingsRouter.openapi(
  createBookingRoute,
  async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const profile = await resolveActiveProfileContext(user);

    const result = await bookPooja(user.id, profile, body);

    if (result.outcome === 'unknown_pooja') {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Unknown or inactive pooja.' } }, 404);
    }
    if (result.outcome === 'insufficient_balance') {
      return c.json(
        { error: { code: 'CONFLICT', message: 'Insufficient wallet balance to book this pooja.' } },
        409,
      );
    }
    return c.json(toBookingDto(result.booking), 201);
  },
  // @hono/zod-openapi's own default (no hook passed) resolves a failed
  // request validation to a plain `c.json(result, 400)` — it never throws,
  // so it never reaches errorHandler's AppError/ZodError branches. This
  // route's documented contract above is 422, so map validation failures to
  // that shape explicitly, same as palm-photo.routes.ts's uploadRoute.
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

const cancelBookingRoute = createRoute({
  method: 'post',
  path: '/pooja-bookings/{id}/cancel',
  tags: ['Pooja Bookings'],
  summary: 'Cancel a booking still in requested/assigned status and refund the wallet',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  request: { params: BookingIdParamSchema },
  responses: {
    200: {
      description: 'Booking cancelled and refunded',
      content: { 'application/json': { schema: PoojaBookingDtoSchema } },
    },
    401: errorResponse('Unauthorized'),
    409: errorResponse('Booking not found, not owned by you, or no longer cancellable'),
  },
});

poojaBookingsRouter.openapi(cancelBookingRoute, async (c) => {
  const user = c.get('user');
  const { id } = c.req.valid('param');

  const refunded = await cancelBooking(id, user.id);
  if (!refunded) {
    return c.json(
      {
        error: {
          code: 'CONFLICT',
          message: 'Booking not found, not owned by you, or no longer cancellable.',
        },
      },
      409,
    );
  }
  return c.json(toBookingDto(refunded), 200);
});

const myBookingsRoute = createRoute({
  method: 'get',
  path: '/pooja-bookings/me',
  tags: ['Pooja Bookings'],
  summary: "The signed-in user's own pooja booking history",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'Booking history',
      content: { 'application/json': { schema: PoojaBookingListSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

poojaBookingsRouter.openapi(myBookingsRoute, async (c) => {
  const user = c.get('user');
  const bookings = await listMyBookings(user.id);
  return c.json({ items: bookings.map(toBookingDto) }, 200);
});
