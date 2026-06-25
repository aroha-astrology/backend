import { z } from '@hono/zod-openapi';

export const LegalDocumentSchema = z
  .object({
    version: z.string(),
    url: z.string().url(),
  })
  .openapi('LegalDocument');

export const CurrentLegalResponseSchema = z
  .object({
    terms: LegalDocumentSchema,
    privacy: LegalDocumentSchema,
    disclaimer: LegalDocumentSchema,
  })
  .openapi('CurrentLegalResponse');

export const AcceptLegalBodySchema = z
  .object({
    termsVersion: z.string().min(1),
    privacyVersion: z.string().min(1),
  })
  .strict()
  .openapi('AcceptLegalBody');

export const AcceptLegalResponseSchema = z
  .object({
    accepted: z.boolean(),
  })
  .openapi('AcceptLegalResponse');

export const LegalStatusResponseSchema = z
  .object({
    termsAcceptedAt: z.string().nullable(),
    termsVersion: z.string().nullable(),
    privacyPolicyAcceptedAt: z.string().nullable(),
    privacyPolicyVersion: z.string().nullable(),
    dataProcessingConsentAt: z.string().nullable(),
    dataProcessingConsentRevokedAt: z.string().nullable(),
    marketingConsentAt: z.string().nullable(),
    marketingConsentRevokedAt: z.string().nullable(),
  })
  .openapi('LegalStatusResponse');
