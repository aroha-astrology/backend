import { z } from '@hono/zod-openapi';

/*
 * The editable plan the planner saves. Mirrors frontend lib/vastu/types.ts's
 * Plan. Validated for shape and size only — unknown keys pass through so a
 * newer client's fields (levels, metadata) survive a round-trip.
 */
const PointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

const FixtureSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.enum(['door', 'window']),
    wall: z.enum(['top', 'right', 'bottom', 'left']),
    t: z.number().min(0).max(1),
  })
  .passthrough();

const RoomSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.string().min(1).max(40),
    x: z.number().finite(),
    y: z.number().finite(),
    w: z.number().positive(),
    h: z.number().positive(),
    fixtures: z.array(FixtureSchema).max(24).default([]),
  })
  .passthrough();

export const VastuLayoutSchema = z
  .object({
    plot: z.array(PointSchema).min(3).max(64),
    northOffsetDeg: z.number().min(0).max(360),
    rooms: z.array(RoomSchema).max(80),
  })
  .passthrough()
  .openapi('VastuLayout');

export type VastuLayout = z.infer<typeof VastuLayoutSchema>;

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
    /** The saved home this report is taken from, when the plan is cloud-saved. */
    homeId: z.string().uuid().optional(),
    language: z.string().optional().default('en'),
  })
  .refine((b) => Object.keys(b.roomLayout).length > 0, {
    message: 'roomLayout must contain at least one room',
  })
  .openapi('AnalyzeVastuBody');

export type AnalyzeVastuBody = z.infer<typeof AnalyzeVastuBodySchema>;

export const AskVastuBodySchema = z
  .object({ question: z.string().min(2).max(500), language: z.string().optional() })
  .openapi('AskVastuBody');

export type AskVastuBody = z.infer<typeof AskVastuBodySchema>;

export const VastuPlanSchema = z
  .object({
    id: z.string(),
    status: z.enum(['pending', 'processing', 'done', 'error']),
    overallScore: z.number().nullable(),
    roomLayout: z.record(z.string(), z.array(z.string())),
    /** The editable plan as it was when the report was bought — reopen it in the editor. */
    layout: z.record(z.string(), z.unknown()).nullable(),
    analysis: z.record(z.string(), z.unknown()).nullable(),
    /** Language the analysis was written in (before any translation on read). */
    language: z.string(),
    ruleSetId: z.string(),
    homeId: z.string().nullable(),
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

/* -------------------------------------------------------------------------- */
/* Homes                                                                      */
/* -------------------------------------------------------------------------- */

const HomeNameSchema = z.string().trim().min(1).max(60);

export const CreateVastuHomeBodySchema = z
  .object({
    name: HomeNameSchema,
    layout: VastuLayoutSchema,
    overallScore: z.number().int().min(0).max(100).optional(),
  })
  .openapi('CreateVastuHomeBody');

export const UpdateVastuHomeBodySchema = z
  .object({
    name: HomeNameSchema.optional(),
    layout: VastuLayoutSchema.optional(),
    overallScore: z.number().int().min(0).max(100).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Nothing to update',
  })
  .openapi('UpdateVastuHomeBody');

export type CreateVastuHomeBody = z.infer<typeof CreateVastuHomeBodySchema>;
export type UpdateVastuHomeBody = z.infer<typeof UpdateVastuHomeBodySchema>;

export const VastuHomeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    layout: z.record(z.string(), z.unknown()),
    overallScore: z.number().nullable(),
    ruleSetId: z.string(),
    archived: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('VastuHome');

export type VastuHomeDto = z.infer<typeof VastuHomeSchema>;
