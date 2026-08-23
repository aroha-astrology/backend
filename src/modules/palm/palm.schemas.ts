import { z } from '@hono/zod-openapi';
import { PALM_CAPTURE_SLOTS } from '../../lib/palm/storage-paths.js';

export const LanguageQuerySchema = z.object({
  language: z
    .string()
    .optional()
    .openapi({ param: { name: 'language', in: 'query' }, example: 'hi' }),
});

export const PalmSlotSchema = z.enum(PALM_CAPTURE_SLOTS);

export const CreatePalmReadingBodySchema = z
  .object({
    birthProfileId: z.string().uuid().optional(),
  })
  .openapi('CreatePalmReadingBody');

export const AnalyzePalmReadingBodySchema = z.object({}).openapi('AnalyzePalmReadingBody');

export const PalmReadingIdParamSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: 'id', in: 'path' } }),
});

export const PalmReportSectionSchema = z
  .object({
    heading: z.string(),
    paragraphs: z.array(z.string()),
  })
  .openapi('PalmReportSection');

/** Loosely typed on purpose — the Stage A observation shape is large and internal to the
 * pipeline (see palm-types.ts); the wire contract only needs "some JSON object" here, the
 * same posture reports.schemas.ts takes toward its per-report-type `scores` field. */
export const PalmReadingResponseSchema = z
  .object({
    id: z.string(),
    status: z.enum(['pending', 'generating', 'observed', 'ready', 'failed']),
    primaryHand: z.string(),
    frames: z.record(z.string(), z.unknown()),
    unlocked: z.boolean(),
    confidenceScore: z.number().nullable(),
    sections: z.array(PalmReportSectionSchema).optional(),
    observations: z.record(z.string(), z.unknown()).optional(),
    scores: z.record(z.string(), z.number()).optional(),
    synthesis: z.record(z.string(), z.unknown()).optional(),
    error: z.string().nullable().optional(),
  })
  .openapi('PalmReadingResponse');

export const PalmReadingListResponseSchema = z
  .object({ readings: z.array(PalmReadingResponseSchema) })
  .openapi('PalmReadingListResponse');

/** Derived from the schema (not hand-declared) so the service's DTO can never structurally
 * drift from the OpenAPI response contract — same pattern as reports.schemas.ts's ReportDto. */
export type PalmReadingDto = z.infer<typeof PalmReadingResponseSchema>;

export const SaveMountReliefBodySchema = z
  .object({
    hand: z.enum(['primary', 'secondary']),
    scores: z.record(z.string(), z.number()),
    /** Where each mount actually sits on THIS photograph, normalized 0-1, derived from the
     * MediaPipe hand landmarks the relief pass already computes. Optional: the same detection
     * produces both, so a client that can send scores can send these, but an older client that
     * only sends scores stays valid. The overlay draws its mount dots from these instead of
     * from fixed anatomical averages that know nothing about this hand or its framing. */
    regions: z
      .record(z.string(), z.object({ cx: z.number(), cy: z.number(), radius: z.number() }))
      .optional(),
  })
  .openapi('SaveMountReliefBody');
