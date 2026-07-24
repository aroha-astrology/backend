import { z } from '@hono/zod-openapi';

export const BookingTypeSchema = z.enum(['astrologer', 'pooja']).openapi('BookingType');
export type BookingType = z.infer<typeof BookingTypeSchema>;

export const BookingMessageSchema = z
  .object({
    id: z.string().uuid(),
    bookingType: BookingTypeSchema,
    bookingId: z.string().uuid(),
    senderRole: z.enum(['customer', 'provider']),
    body: z.string(),
    readAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('BookingMessage');

export type BookingMessageDto = z.infer<typeof BookingMessageSchema>;

export const SendMessageBodySchema = z
  .object({
    body: z.string().min(1).max(4000),
  })
  .strict()
  .openapi('SendMessageBody');

export type SendMessageBody = z.infer<typeof SendMessageBodySchema>;

// bookingType is deliberately a plain string here, NOT BookingTypeSchema
// (an enum) — an invalid value must reach the service layer and get a
// deliberate 400 via Errors.badRequest (see
// messaging.service.ts#assertValidBookingType), not the framework's default
// 422 zod-validation-failure path a z.enum() path param would trigger.
export const MessagingParamSchema = z.object({
  bookingType: z
    .string()
    .openapi({ param: { name: 'bookingType', in: 'path' }, example: 'astrologer' }),
  bookingId: z
    .string()
    .uuid()
    .openapi({ param: { name: 'bookingId', in: 'path' }, example: 'b1c2d3e4-...' }),
});
