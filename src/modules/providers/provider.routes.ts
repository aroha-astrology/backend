import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { requireProvider } from '../../middleware/auth.js';
import { AstrologerBookingSchema } from '../astrologers/astrologers.schemas.js';
import { getProviderMe, listProviderBookings } from './provider.service.js';
import { ProviderMeSchema } from './provider.schemas.js';

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .openapi('ProviderError');

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
});

export const providerRouter = new OpenAPIHono();

const meRoute = createRoute({
  method: 'get',
  path: '/provider/me',
  tags: ['Provider'],
  summary: "The logged-in provider's own identity + profile",
  security: [{ bearerAuth: [] }],
  middleware: [requireProvider] as const,
  responses: {
    200: {
      description: 'Provider identity + profile',
      content: { 'application/json': { schema: ProviderMeSchema } },
    },
    401: errorResponse('Unauthorized'),
  },
});

providerRouter.openapi(meRoute, async (c) => {
  const provider = c.get('provider');
  const result = await getProviderMe(provider);
  return c.json(result, 200);
});

const bookingsRoute = createRoute({
  method: 'get',
  path: '/provider/bookings',
  tags: ['Provider'],
  summary: "The logged-in provider's own booking list",
  security: [{ bearerAuth: [] }],
  middleware: [requireProvider] as const,
  responses: {
    200: {
      description: 'Booking list',
      content: { 'application/json': { schema: z.array(AstrologerBookingSchema) } },
    },
    401: errorResponse('Unauthorized'),
  },
});

providerRouter.openapi(bookingsRoute, async (c) => {
  const provider = c.get('provider');
  const rows = await listProviderBookings(provider);
  return c.json(rows, 200);
});
