import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireUser, requireAdmin } from '../../middleware/auth.js';
import { rateLimiter } from '../../middleware/rate-limit.js';
import { logger } from '../../lib/logger.js';
import { notifySupportTicket } from '../../lib/notifications/telegram.js';
import { logAdminAction } from '../admin/admin.repo.js';
import {
  CreateTicketBodySchema,
  CreatePublicTicketBodySchema,
  SupportTicketSchema,
  ListMyTicketsResponseSchema,
  AdminListTicketsQuerySchema,
  AdminListTicketsResponseSchema,
  AdminTicketIdParamSchema,
  UpdateTicketBodySchema,
  AdminSupportTicketSchema,
} from './support.schemas.js';
import {
  createTicket,
  listMyTickets,
  listTicketsForAdmin,
  updateTicketForAdmin,
} from './support.service.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('SupportError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const supportRouter = new OpenAPIHono();

/**
 * `requireAdmin` is applied PER-ROUTE via each `createRoute`'s own inline
 * `middleware: [requireAdmin] as const` — deliberately NOT a router-wide
 * `.use('*', requireAdmin)`. Same reasoning as admin.routes.ts's own top-of-file
 * comment: a router-wide wildcard `.use()` on a child OpenAPIHono mounted via
 * `app.route(base, child)` does not reliably stay scoped to that child's own
 * paths once merged into the parent app's route tree, and leaks 403s onto
 * other, later-mounted routers. This file also mounts non-admin `/support/*`
 * routes on the SAME router, so a wildcard here would be doubly wrong — it
 * would 403 this router's own `requireUser`-only routes too.
 */

/** Same identity-from-already-validated-token shortcut as admin.routes.ts's own adminPhoneOf. */
function adminPhoneOf(c: { get: (key: 'firebaseToken') => { phone_number?: string } }): string {
  return c.get('firebaseToken').phone_number ?? 'unknown';
}

/** Audit-logs a READ, mirroring admin.routes.ts's own auditRead — awaited but never allowed to fail the request. */
async function auditRead(
  c: { get: (key: 'firebaseToken') => { phone_number?: string } },
  route: string,
  params: unknown,
): Promise<void> {
  await logAdminAction(adminPhoneOf(c), route, params).catch((err: unknown) =>
    logger.warn({ err, route }, 'admin_audit_log insert failed'),
  );
}

/** Ticket creation is a rare, deliberate user action (not an LLM call) — capped tightly enough to stop spam without ever bothering a real user submitting one genuine ticket. */
const createTicketRateLimit = rateLimiter({ windowMs: 60_000, max: 5, name: 'support-tickets' });

/** Public form is a much smaller trickle than the in-app flow but has no auth to lean on, so the cap is tighter and keyed by IP — rateLimiter's identify() already falls back to `ip:<addr>` whenever there's no authenticated user (see middleware/rate-limit.ts). */
const publicTicketRateLimit = rateLimiter({
  windowMs: 60 * 60_000,
  max: 3,
  name: 'public-support-tickets',
});

/* -------------------------------------------------------------------------- */
/* POST /support/tickets                                                      */
/* -------------------------------------------------------------------------- */

const createTicketRoute = createRoute({
  method: 'post',
  path: '/support/tickets',
  tags: ['Support'],
  summary: 'Submit a help/support request',
  security: [{ bearerAuth: [] }],
  middleware: [requireUser, createTicketRateLimit] as const,
  request: {
    body: { required: true, content: { 'application/json': { schema: CreateTicketBodySchema } } },
  },
  responses: {
    201: {
      description: 'Ticket created',
      content: { 'application/json': { schema: SupportTicketSchema } },
    },
    401: errorResponse('Unauthorized'),
    422: errorResponse('Validation failed'),
    429: errorResponse('Rate limit exceeded'),
  },
});

supportRouter.openapi(createTicketRoute, async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');

  const locale = body.locale ?? user.locale ?? null;
  const appVersion = body.appVersion ?? user.appVersion ?? null;

  const ticket = await createTicket({
    userId: user.id,
    category: body.category,
    message: body.message,
    locale,
    appVersion,
  });

  // Fire-and-forget — a Telegram/mailbox outage must never fail the ticket-creation request.
  void notifySupportTicket({
    ticketId: ticket.id,
    userId: user.id,
    contact: user.phoneE164 ?? user.email,
    category: body.category,
    message: body.message,
  }).catch(() => {});

  return c.json(ticket, 201);
});

/* -------------------------------------------------------------------------- */
/* POST /public/support/tickets                                              */
/* -------------------------------------------------------------------------- */

const createPublicTicketRoute = createRoute({
  method: 'post',
  path: '/public/support/tickets',
  tags: ['Support'],
  summary: 'Submit a help/support request without an account (landing site /support form)',
  middleware: [publicTicketRateLimit] as const,
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: CreatePublicTicketBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'Ticket created (or a no-op fake success if the honeypot was filled)',
      content: { 'application/json': { schema: SupportTicketSchema } },
    },
    422: errorResponse('Validation failed'),
    429: errorResponse('Rate limit exceeded'),
  },
});

supportRouter.openapi(createPublicTicketRoute, async (c) => {
  const body = c.req.valid('json');

  // Honeypot: a real visitor never sees or fills this field (hidden
  // client-side on the landing form). A bot that fills every field gets a
  // normal-looking 201 with nothing actually written — a validation error
  // here would just teach it to omit the field and retry.
  if (body.website) {
    return c.json(
      {
        id: '00000000-0000-0000-0000-000000000000',
        category: body.category,
        message: body.message,
        locale: null,
        appVersion: null,
        status: 'open',
        adminNote: null,
        createdAt: new Date().toISOString(),
        resolvedAt: null,
      },
      201,
    );
  }

  const ticket = await createTicket({
    contactName: body.name,
    contactEmail: body.email,
    category: body.category,
    message: body.message,
  });

  // Fire-and-forget, same as the authenticated route above.
  void notifySupportTicket({
    ticketId: ticket.id,
    userId: null,
    contact: body.email,
    category: body.category,
    message: body.message,
  }).catch(() => {});

  return c.json(ticket, 201);
});

/* -------------------------------------------------------------------------- */
/* GET /support/tickets                                                       */
/* -------------------------------------------------------------------------- */

const listMyTicketsRoute = createRoute({
  method: 'get',
  path: '/support/tickets',
  tags: ['Support'],
  summary: "The caller's own support tickets, newest first",
  security: [{ bearerAuth: [] }],
  middleware: [requireUser] as const,
  responses: {
    200: {
      description: 'Ticket list',
      content: { 'application/json': { schema: ListMyTicketsResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

supportRouter.openapi(listMyTicketsRoute, async (c) => {
  const user = c.get('user');
  const tickets = await listMyTickets(user.id);
  return c.json({ tickets }, 200);
});

/* -------------------------------------------------------------------------- */
/* GET /admin/support/tickets                                                */
/* -------------------------------------------------------------------------- */

const adminListTicketsRoute = createRoute({
  method: 'get',
  path: '/admin/support/tickets',
  tags: ['Admin'],
  summary: 'Paginated support ticket list, optionally filtered by userId/status',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: { query: AdminListTicketsQuerySchema },
  responses: {
    200: {
      description: 'Ticket page',
      content: { 'application/json': { schema: AdminListTicketsResponseSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
  },
});

supportRouter.openapi(adminListTicketsRoute, async (c) => {
  const { userId, status, offset, limit } = c.req.valid('query');
  const page = await listTicketsForAdmin({ userId, status }, limit, offset);
  await auditRead(c, 'GET /v1/admin/support/tickets', { userId, status, offset, limit });
  return c.json(page, 200);
});

/* -------------------------------------------------------------------------- */
/* PATCH /admin/support/tickets/{id}                                         */
/* -------------------------------------------------------------------------- */

const adminUpdateTicketRoute = createRoute({
  method: 'patch',
  path: '/admin/support/tickets/{id}',
  tags: ['Admin'],
  summary: 'Set status and/or an internal admin note on a ticket',
  security: [{ bearerAuth: [] }],
  middleware: [requireAdmin] as const,
  request: {
    params: AdminTicketIdParamSchema,
    body: { required: true, content: { 'application/json': { schema: UpdateTicketBodySchema } } },
  },
  responses: {
    200: {
      description: 'Updated ticket',
      content: { 'application/json': { schema: AdminSupportTicketSchema } },
    },
    401: errorResponse('Unauthorized'),
    403: errorResponse('Admin access required'),
    404: errorResponse('Ticket not found'),
    422: errorResponse('Validation failed'),
  },
});

supportRouter.openapi(adminUpdateTicketRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const ticket = await updateTicketForAdmin(id, body, adminPhoneOf(c));
  return c.json(ticket, 200);
});
