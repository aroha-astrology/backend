import { z } from '@hono/zod-openapi';

/* -------------------------------------------------------------------------- */
/* POST /support/tickets                                                      */
/* -------------------------------------------------------------------------- */

export const CreateTicketBodySchema = z
  .object({
    category: z.string().min(1).max(100).openapi({ example: 'billing' }),
    message: z.string().min(1).max(5000).openapi({
      example: 'My wallet top-up succeeded on Razorpay but the balance never updated.',
    }),
    // Not read from any HTTP header today (this codebase has no
    // Accept-Language-style convention) — optional body fields, falling back
    // to the authenticated user's own users.locale/users.appVersion columns
    // (already collected at signup/device-registration) when omitted, the
    // same "body wins, user-row is the fallback" idiom device-tokens.schemas.ts
    // uses for its own optional locale/appVersion fields.
    locale: z.string().min(2).max(35).optional().openapi({ example: 'hi' }),
    appVersion: z.string().max(40).optional().openapi({ example: '1.4.2' }),
  })
  .openapi('CreateSupportTicketBody');

export type CreateTicketBody = z.infer<typeof CreateTicketBodySchema>;

/** Caller-facing shape — deliberately omits `userId` (implicit: it's always the caller's own) and `adminNote` (admin-internal). */
export const SupportTicketSchema = z
  .object({
    id: z.string().uuid(),
    category: z.string(),
    message: z.string(),
    locale: z.string().nullable(),
    appVersion: z.string().nullable(),
    status: z.string(),
    createdAt: z.string(),
    resolvedAt: z.string().nullable(),
  })
  .openapi('SupportTicket');

export type SupportTicketDto = z.infer<typeof SupportTicketSchema>;

export const ListMyTicketsResponseSchema = z
  .object({ tickets: z.array(SupportTicketSchema) })
  .openapi('ListMySupportTicketsResponse');

/* -------------------------------------------------------------------------- */
/* GET/PATCH /admin/support/tickets                                          */
/* -------------------------------------------------------------------------- */

/** Admin-facing shape — carries `userId` (whose ticket) and `adminNote` (internal), unlike the caller-facing SupportTicketSchema. */
export const AdminSupportTicketSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    category: z.string(),
    message: z.string(),
    locale: z.string().nullable(),
    appVersion: z.string().nullable(),
    status: z.string(),
    adminNote: z.string().nullable(),
    createdAt: z.string(),
    resolvedAt: z.string().nullable(),
  })
  .openapi('AdminSupportTicket');

export type AdminSupportTicketDto = z.infer<typeof AdminSupportTicketSchema>;

export const AdminListTicketsQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  status: z.string().optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const AdminListTicketsResponseSchema = z
  .object({
    tickets: z.array(AdminSupportTicketSchema),
    total: z.number(),
    offset: z.number(),
    limit: z.number(),
  })
  .openapi('AdminListSupportTicketsResponse');

export const AdminTicketIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: 'id', in: 'path' } }),
});

export const UpdateTicketBodySchema = z
  .object({
    status: z.string().min(1).max(40).optional().openapi({ example: 'resolved' }),
    adminNote: z
      .string()
      .max(5000)
      .optional()
      .openapi({ example: 'Refunded via Razorpay dashboard.' }),
  })
  .refine((body) => body.status !== undefined || body.adminNote !== undefined, {
    message: 'At least one of "status" or "adminNote" is required',
  })
  .openapi('UpdateSupportTicketBody');

export type UpdateTicketBody = z.infer<typeof UpdateTicketBodySchema>;
