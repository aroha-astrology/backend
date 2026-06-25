import { z } from '@hono/zod-openapi';
import { UserSchema } from '../users/users.schemas.js';

export const SessionResponseSchema = z
  .object({
    user: UserSchema,
    /**
     * `true` when the user row was created by this call.
     * `false` when an existing row was returned.
     */
    created: z.boolean(),
  })
  .openapi('SessionResponse');

export type SessionResponse = z.infer<typeof SessionResponseSchema>;
