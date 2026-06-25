import { z } from '@hono/zod-openapi';
import { PlatformSchema } from '../users/users.schemas.js';

/** Read model — deliberately omits the raw push token. */
export const DeviceTokenSchema = z
  .object({
    id: z.string().uuid(),
    platform: PlatformSchema,
    deviceId: z.string().nullable(),
    locale: z.string().nullable(),
    appVersion: z.string().nullable(),
    osVersion: z.string().nullable(),
    pushEnabled: z.boolean().nullable(),
    lastSeenAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('DeviceToken');

export type DeviceTokenDto = z.infer<typeof DeviceTokenSchema>;

export const RegisterDeviceTokenBodySchema = z
  .object({
    token: z.string().min(1).max(4096).openapi({ example: 'fcm-registration-token' }),
    platform: PlatformSchema,
    deviceId: z.string().max(200).optional(),
    locale: z.string().min(2).max(35).optional(),
    appVersion: z.string().max(40).optional(),
    osVersion: z.string().max(40).optional(),
    pushEnabled: z.boolean().optional(),
  })
  .strict()
  .openapi('RegisterDeviceTokenBody');

export type RegisterDeviceTokenBody = z.infer<typeof RegisterDeviceTokenBodySchema>;

export const IdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: 'id', in: 'path' } }),
});
