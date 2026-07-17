import { z } from '@hono/zod-openapi';

export const AnalyzeVastuBodySchema = z
  .object({
    /** room type → the direction(s) it occupies, e.g. { kitchen: ["SE"] }. */
    roomLayout: z.record(z.string(), z.array(z.string())),
    /** Door/window facings, notes, etc. Passed to the AI as context. */
    roomDetails: z.record(z.string(), z.unknown()).optional().default({}),
    /** The full editable CAD plan, stored verbatim for reload. */
    layout: z.record(z.string(), z.unknown()).optional(),
    /** e.g. "rectangle", "l_shape", plus a cut-corner note — fed to the AI. */
    houseShape: z.string().optional(),
    language: z.string().optional().default('en'),
  })
  .refine((b) => Object.keys(b.roomLayout).length > 0, {
    message: 'roomLayout must contain at least one room',
  })
  .openapi('AnalyzeVastuBody');

export type AnalyzeVastuBody = z.infer<typeof AnalyzeVastuBodySchema>;

export const AskVastuBodySchema = z
  .object({ question: z.string().min(2).max(500) })
  .openapi('AskVastuBody');

export type AskVastuBody = z.infer<typeof AskVastuBodySchema>;

export const VastuPlanSchema = z
  .object({
    id: z.string(),
    status: z.enum(['pending', 'processing', 'done', 'error']),
    overallScore: z.number().nullable(),
    roomLayout: z.record(z.string(), z.array(z.string())),
    analysis: z.record(z.string(), z.unknown()).nullable(),
    errorMessage: z.string().nullable(),
    createdAt: z.string(),
    completedAt: z.string().nullable(),
  })
  .openapi('VastuPlan');

export type VastuPlanDto = z.infer<typeof VastuPlanSchema>;

export const PlanIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: 'id', in: 'path' } }),
});

export const LanguageQuerySchema = z.object({
  language: z
    .string()
    .optional()
    .openapi({ param: { name: 'language', in: 'query' }, example: 'hi' }),
});
