import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireAdmin } from '../../middleware/auth.js';
import { createPandit } from './pandits.repo.js';
import { adminAssignPandit, adminCompleteBooking, invitePandit } from './pooja-bookings.service.js';
import type { PoojaBookingRow } from '../../db/schema.js';
import {
  CreatePanditRequestSchema,
  PanditDtoSchema,
  AssignPanditRequestSchema,
  PoojaBookingDtoSchema,
  BookingIdParamSchema,
  PanditIdParamSchema,
  InvitePanditResponseSchema,
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

export const poojaBookingsAdminRouter = new OpenAPIHono();

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

const createPanditRoute = createRoute({
  method: 'post',
  path: '/admin/pandits',
  tags: ['Admin — Pooja Bookings'],
  summary: 'Admin-only: add a pre-vetted pandit to the roster (no self-onboarding in this batch)',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    body: { content: { 'application/json': { schema: CreatePanditRequestSchema } } },
  },
  responses: {
    201: {
      description: 'Pandit created',
      content: { 'application/json': { schema: PanditDtoSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not an admin'),
    422: errorResponse('Invalid request body'),
  },
});

poojaBookingsAdminRouter.openapi(
  createPanditRoute,
  async (c) => {
    const body = c.req.valid('json');
    const pandit = await createPandit({
      displayName: body.displayName,
      phone: body.phone ?? null,
      city: body.city,
      languages: body.languages,
      verified: true,
      active: true,
    });
    return c.json(
      {
        id: pandit.id,
        displayName: pandit.displayName,
        phone: pandit.phone,
        city: pandit.city,
        languages: pandit.languages,
        verified: pandit.verified,
        active: pandit.active,
        createdAt: pandit.createdAt.toISOString(),
      },
      201,
    );
  },
  // Same @hono/zod-openapi validation-hook gotcha as
  // pooja-bookings.routes.ts's createBookingRoute — without the 3-arg hook,
  // a failed request validation resolves to a plain 400, not the 422
  // documented above.
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

const assignRoute = createRoute({
  method: 'post',
  path: '/admin/pooja-bookings/{id}/assign',
  tags: ['Admin — Pooja Bookings'],
  summary: 'Admin-only: assign a pandit to a requested booking',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    params: BookingIdParamSchema,
    body: { content: { 'application/json': { schema: AssignPanditRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Booking assigned',
      content: { 'application/json': { schema: PoojaBookingDtoSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not an admin'),
    404: errorResponse('Unknown or inactive pandit'),
    409: errorResponse('Booking not found or not currently requested'),
  },
});

poojaBookingsAdminRouter.openapi(assignRoute, async (c) => {
  const { id } = c.req.valid('param');
  const { panditId } = c.req.valid('json');

  const result = await adminAssignPandit(id, panditId);
  if (result === 'unknown_pandit') {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Unknown or inactive pandit.' } }, 404);
  }
  if (!result) {
    return c.json(
      { error: { code: 'CONFLICT', message: 'Booking not found or not currently requested.' } },
      409,
    );
  }
  return c.json(toBookingDto(result), 200);
});

const completeRoute = createRoute({
  method: 'post',
  path: '/admin/pooja-bookings/{id}/complete',
  tags: ['Admin — Pooja Bookings'],
  summary:
    'Admin-only: manually acknowledge a pooja was performed — a trust-the-admin/ops-process step, no video-proof requirement in this batch',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: { params: BookingIdParamSchema },
  responses: {
    200: {
      description: 'Booking marked complete',
      content: { 'application/json': { schema: PoojaBookingDtoSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not an admin'),
    409: errorResponse('Booking not found or not currently assigned'),
  },
});

poojaBookingsAdminRouter.openapi(completeRoute, async (c) => {
  const { id } = c.req.valid('param');
  const result = await adminCompleteBooking(id);
  if (!result) {
    return c.json(
      { error: { code: 'CONFLICT', message: 'Booking not found or not currently assigned.' } },
      409,
    );
  }
  return c.json(toBookingDto(result), 200);
});

const invitePanditRoute = createRoute({
  method: 'post',
  path: '/admin/pandits/{id}/invite',
  tags: ['Admin — Pooja Bookings'],
  summary:
    'Admin-only: provision a real login for a pandit (phone+OTP via Firebase Auth + a shared provider_accounts row) — mirrors the astrologer invite endpoint exactly',
  description:
    'No request body: the phone must already be set on the pandit profile (via the create ' +
    'admin route) before inviting.',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    params: PanditIdParamSchema,
  },
  responses: {
    200: {
      description: 'Pandit invited — confirms the phone number the login was provisioned for',
      content: { 'application/json': { schema: InvitePanditResponseSchema } },
    },
    400: errorResponse('Pandit has no phone number on file'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not an admin'),
    404: errorResponse('Unknown pandit'),
    409: errorResponse('This pandit already has a provider account'),
  },
});

poojaBookingsAdminRouter.openapi(invitePanditRoute, async (c) => {
  const { id } = c.req.valid('param');

  const result = await invitePandit(id);
  if (result.outcome === 'unknown_pandit') {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Unknown pandit.' } }, 404);
  }
  if (result.outcome === 'already_invited') {
    return c.json(
      { error: { code: 'CONFLICT', message: 'This pandit already has a provider account.' } },
      409,
    );
  }
  return c.json({ phoneE164: result.phoneE164 }, 200);
});
