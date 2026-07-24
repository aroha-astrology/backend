import { z } from '@hono/zod-openapi';
import { AstrologerSchema } from '../astrologers/astrologers.schemas.js';

export const ProviderKindSchema = z.enum(['astrologer', 'pandit']).openapi('ProviderKind');

export const ProviderMeSchema = z
  .object({
    kind: ProviderKindSchema,
    refId: z.string().uuid(),
    displayName: z.string(),
    /** Populated when kind === 'astrologer'; null otherwise (no pandit profile table exists yet). */
    astrologer: AstrologerSchema.nullable(),
  })
  .openapi('ProviderMe');

export type ProviderMeDto = z.infer<typeof ProviderMeSchema>;
