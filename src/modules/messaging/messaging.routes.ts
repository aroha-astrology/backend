import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { streamSSE } from 'hono/streaming';
import type { Context } from 'hono';
import { requireUserOrProvider } from '../../middleware/auth.js';
import type { UserRow } from '../../db/schema.js';
import { listMessagesForBooking } from './messaging.repo.js';
import {
  assertValidBookingType,
  listMessages,
  sendMessage,
  toMessageDto,
  type Caller,
} from './messaging.service.js';
import {
  BookingMessageSchema,
  MessagingParamSchema,
  SendMessageBodySchema,
} from './messaging.schemas.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('MessagingError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const messagingRouter = new OpenAPIHono();

/**
 * requireUserOrProvider sets exactly ONE of c.var.user / c.var.provider —
 * ContextVariableMap declares both as always-present, so `user` is read as
 * `| undefined` here purely to detect which one the middleware actually set.
 */
function resolveCaller(c: Context): Caller {
  const user = c.get('user') as UserRow | undefined;
  if (user) return { role: 'customer', userId: user.id };
  const provider = c.get('provider');
  return {
    role: 'provider',
    providerId: provider.id,
    providerKind: provider.kind,
    providerRefId: provider.refId,
  };
}

const sendRoute = createRoute({
  method: 'post',
  path: '/bookings/{bookingType}/{bookingId}/messages',
  tags: ['Messaging'],
  summary: 'Send a chat message on a booking (customer or their assigned provider)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUserOrProvider] as const,
  request: {
    params: MessagingParamSchema,
    body: { required: true, content: { 'application/json': { schema: SendMessageBodySchema } } },
  },
  responses: {
    201: {
      description: 'Message sent',
      content: { 'application/json': { schema: BookingMessageSchema } },
    },
    400: errorResponse('Invalid booking type'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not your booking'),
    404: errorResponse('Booking not found'),
    422: errorResponse('Validation failed'),
  },
});

messagingRouter.openapi(
  sendRoute,
  async (c) => {
    const { bookingType, bookingId } = c.req.valid('param');
    const { body } = c.req.valid('json');
    const caller = resolveCaller(c);
    const dto = await sendMessage(caller, bookingType, bookingId, body);
    return c.json(dto, 201);
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

// Returns the FULL transcript, unpaginated, in this batch — a real
// limit/cursor query-param contract was left unspecified by this plan's
// source spec ("paginated list, newest-last") and is deliberately NOT
// invented here to avoid a shape mismatch with what the Pooja Booking Batch
// 1 plan's own agent might independently assume for the same route (it only
// needs to match this route's PATH and DB schema, not a pagination cursor
// shape neither plan has actually pinned down). Flagged as an open question
// in this plan's own review notes — add real pagination in a follow-up once
// a concrete contract is agreed, if transcript length ever becomes a
// problem in practice.
const listRoute = createRoute({
  method: 'get',
  path: '/bookings/{bookingType}/{bookingId}/messages',
  tags: ['Messaging'],
  summary:
    'List a booking chat transcript, oldest first (unpaginated in this batch — see comment above)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUserOrProvider] as const,
  request: { params: MessagingParamSchema },
  responses: {
    200: {
      description: 'Chat transcript',
      content: { 'application/json': { schema: z.array(BookingMessageSchema) } },
    },
    400: errorResponse('Invalid booking type'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not your booking'),
    404: errorResponse('Booking not found'),
  },
});

messagingRouter.openapi(listRoute, async (c) => {
  const { bookingType, bookingId } = c.req.valid('param');
  const caller = resolveCaller(c);
  const rows = await listMessages(caller, bookingType, bookingId);
  return c.json(rows, 200);
});

const MESSAGING_POLL_INTERVAL_MS = 2000;

/**
 * SSE stream — deliberately SIMPLE SERVER-SIDE POLLING, not a websocket or
 * pub/sub system (this codebase has no pub/sub infra at all). Every ~2s,
 * re-queries listMessagesForBooking for rows newer than the last one already
 * sent and writes each as a `message` SSE event, until the client
 * disconnects or the request is aborted. This is a "Batch 1 foundation"
 * tradeoff, not an oversight — see this plan's "Explicitly deferred" list.
 */
const streamRoute = createRoute({
  method: 'get',
  path: '/bookings/{bookingType}/{bookingId}/messages/stream',
  tags: ['Messaging'],
  summary: 'SSE stream of new booking chat messages (simple polling under the hood)',
  security: [{ bearerAuth: [] }],
  middleware: [requireUserOrProvider] as const,
  request: { params: MessagingParamSchema },
  responses: {
    200: {
      description: 'SSE stream of new messages',
      content: { 'text/event-stream': { schema: z.any() } },
    },
    400: errorResponse('Invalid booking type'),
    401: errorResponse('Unauthorized'),
    403: errorResponse('Not your booking'),
    404: errorResponse('Booking not found'),
  },
});

messagingRouter.openapi(streamRoute, async (c) => {
  const { bookingType, bookingId } = c.req.valid('param');
  const caller = resolveCaller(c);
  // Authorize (+ validate bookingType, + mark the OTHER party's existing
  // messages read as a side effect of opening the chat view) BEFORE the SSE
  // upgrade — a 403/404/400 must happen as a normal JSON error response, not
  // after the response has already switched to text/event-stream.
  await listMessages(caller, bookingType, bookingId);
  // Already validated by the call above (it throws on an invalid value) —
  // this just informs TypeScript so the polling loop below can call
  // listMessagesForBooking with a narrowed `bookingType`.
  assertValidBookingType(bookingType);

  const signal = c.req.raw.signal;

  return streamSSE(c, async (stream) => {
    let lastSeenAt = new Date();
    while (!signal.aborted && !stream.aborted) {
      const fresh = await listMessagesForBooking(bookingType, bookingId, { after: lastSeenAt });
      for (const row of fresh) {
        if (signal.aborted || stream.aborted) break;
        await stream.writeSSE({ event: 'message', data: JSON.stringify(toMessageDto(row)) });
        lastSeenAt = row.createdAt;
      }
      if (signal.aborted || stream.aborted) break;
      await stream.sleep(MESSAGING_POLL_INTERVAL_MS);
    }
  });
});
