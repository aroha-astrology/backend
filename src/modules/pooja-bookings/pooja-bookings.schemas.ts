import { z } from '@hono/zod-openapi';

export const PoojaCatalogItemSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string(),
    deity: z.string().nullable(),
    basePricePaise: z.number().int(),
    durationMinutes: z.number().int(),
  })
  .openapi('PoojaCatalogItem');

export const PoojaCatalogListSchema = z
  .object({ items: z.array(PoojaCatalogItemSchema) })
  .openapi('PoojaCatalogList');

export const PoojaBookingStatusSchema = z.enum([
  'requested',
  'assigned',
  'completed',
  'cancelled',
  'refunded',
]);

export const PoojaBookingDtoSchema = z
  .object({
    id: z.string().uuid(),
    poojaId: z.string().uuid(),
    panditId: z.string().uuid().nullable(),
    preferredDate: z.string(),
    shipAddress: z.string(),
    shipPincode: z.string(),
    status: PoojaBookingStatusSchema,
    pricePaisePaid: z.number().int(),
    requestedAt: z.string(),
    assignedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    notes: z.string().nullable(),
  })
  .openapi('PoojaBookingDto');

export const PoojaBookingListSchema = z
  .object({ items: z.array(PoojaBookingDtoSchema) })
  .openapi('PoojaBookingList');

export const CreatePoojaBookingRequestSchema = z
  .object({
    poojaId: z.string().uuid(),
    preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'preferredDate must be YYYY-MM-DD'),
    shipAddress: z.string().min(1).max(500),
    shipPincode: z.string().regex(/^\d{6}$/, 'shipPincode must be a 6-digit Indian PIN code'),
    notes: z.string().max(1000).optional(),
  })
  .openapi('CreatePoojaBookingRequest');

export const BookingIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const AssignPanditRequestSchema = z
  .object({ panditId: z.string().uuid() })
  .openapi('AssignPanditRequest');

export const CreatePanditRequestSchema = z
  .object({
    displayName: z.string().min(1).max(200),
    phone: z.string().max(20).optional(),
    city: z.string().min(1).max(100),
    languages: z.array(z.string().min(1)).default([]),
  })
  .openapi('CreatePanditRequest');

export const PanditDtoSchema = z
  .object({
    id: z.string().uuid(),
    displayName: z.string(),
    phone: z.string().nullable(),
    city: z.string(),
    languages: z.array(z.string()),
    verified: z.boolean(),
    active: z.boolean(),
    createdAt: z.string(),
  })
  .openapi('PanditDto');

export const PanditIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const InvitePanditRequestSchema = z
  .object({ email: z.string().email() })
  .openapi('InvitePanditRequest');

export const InvitePanditResponseSchema = z
  .object({
    email: z.string().email(),
    temporaryPassword: z.string(),
  })
  .openapi('InvitePanditResponse');
