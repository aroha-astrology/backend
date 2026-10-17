import { z } from '@hono/zod-openapi';

const TierSchema = z.enum(['free', 'paid']);

export const GeminiKeyRowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    tier: TierSchema,
    /** 'env' = from the server's .env (can be switched off, not deleted); 'admin' = pasted here. */
    source: z.enum(['env', 'admin']),
    enabled: z.boolean(),
    /** Position among paid keys, 1 = tried first. Null for a free key. */
    paidPosition: z.number().int().nullable(),
    /** The key's last 4 characters. The full key never leaves the server. */
    last4: z.string(),
    /** False for an 'env' row whose key has since been removed from .env. */
    available: z.boolean(),
    coolingDown: z.boolean(),
    lastTestedAt: z.string().nullable(),
    lastTestOk: z.boolean().nullable(),
    lastTestMessage: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('GeminiKeyRow');

export const GeminiKeysResponseSchema = z
  .object({ keys: z.array(GeminiKeyRowSchema) })
  .openapi('GeminiKeysResponse');

export const AddGeminiKeyBodySchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    tier: TierSchema,
    key: z.string().trim().min(20).max(200),
  })
  .openapi('AddGeminiKeyBody');

export const UpdateGeminiKeyBodySchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    tier: TierSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .openapi('UpdateGeminiKeyBody');

export const GeminiKeyIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: 'id', in: 'path' } }),
});

export const GeminiKeyTestResponseSchema = z
  .object({
    ok: z.boolean(),
    /** HTTP status Gemini answered with; null when the call never got an answer. */
    status: z.number().int().nullable(),
    latencyMs: z.number().int(),
    message: z.string(),
  })
  .openapi('GeminiKeyTestResponse');

export const GeminiKeyDeletedResponseSchema = z
  .object({ deleted: z.literal(true) })
  .openapi('GeminiKeyDeletedResponse');
