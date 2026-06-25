import { z } from '@hono/zod-openapi';

/* -------------------------------------------------------------------------- */
/* Shared / reusable pieces                                                    */
/* -------------------------------------------------------------------------- */

export const BirthInputSchema = z
  .object({
    date: z.string().openapi({ example: '1990-05-15', description: 'Birth date (YYYY-MM-DD)' }),
    time: z
      .string()
      .default('12:00')
      .openapi({ example: '14:30', description: 'Birth time (HH:mm), defaults to 12:00 if unknown' }),
    latitude: z.number().min(-90).max(90).openapi({ example: 28.6139 }),
    longitude: z.number().min(-180).max(180).openapi({ example: 77.209 }),
    timezone: z
      .string()
      .default('Asia/Kolkata')
      .openapi({ example: 'Asia/Kolkata', description: 'IANA timezone' }),
  })
  .openapi('BirthInput');

export type BirthInput = z.infer<typeof BirthInputSchema>;

/* -------------------------------------------------------------------------- */
/* Request schemas                                                             */
/* -------------------------------------------------------------------------- */

export const OnboardingRequestSchema = z
  .object({
    birth: BirthInputSchema,
    locale: z.string().default('en').openapi({ example: 'hi' }),
    region: z.string().default('IN').openapi({ example: 'IN' }),
    consent: z.boolean().openapi({ description: 'User has granted data-processing consent' }),
  })
  .openapi('OnboardingRequest');

export type OnboardingRequest = z.infer<typeof OnboardingRequestSchema>;

export const ForecastRequestSchema = z
  .object({
    birth: BirthInputSchema,
    locale: z.string().default('en'),
    region: z.string().default('IN'),
    consent: z.boolean(),
  })
  .openapi('ForecastRequest');

export type ForecastRequest = z.infer<typeof ForecastRequestSchema>;

export const MatchmakingRequestSchema = z
  .object({
    person1: BirthInputSchema,
    person2: BirthInputSchema,
    locale: z.string().default('en'),
    consent: z.boolean(),
  })
  .openapi('MatchmakingRequest');

export type MatchmakingRequest = z.infer<typeof MatchmakingRequestSchema>;

export const ChatRequestSchema = z
  .object({
    message: z
      .string()
      .min(1)
      .max(2000)
      .openapi({ example: 'What does my Jupiter transit mean?' }),
    profileId: z.string().uuid().optional().openapi({ description: 'Optional birth-profile ID for context' }),
    locale: z.string().default('en'),
  })
  .openapi('ChatRequest');

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Response schemas                                                            */
/* -------------------------------------------------------------------------- */

export const OnboardingResponseSchema = z
  .object({
    profileId: z.string().uuid(),
    summary: z.string(),
    charts: z.record(z.unknown()).optional(),
    insights: z.array(z.string()).optional(),
  })
  .openapi('OnboardingResponse');

export type OnboardingResponse = z.infer<typeof OnboardingResponseSchema>;

export const ForecastResponseSchema = z
  .object({
    date: z.string(),
    forecast: z.string(),
    scores: z.record(z.number()).optional(),
    transits: z.array(z.record(z.unknown())).optional(),
    remedies: z.array(z.string()).optional(),
  })
  .openapi('ForecastResponse');

export type ForecastResponse = z.infer<typeof ForecastResponseSchema>;

export const MatchmakingResponseSchema = z
  .object({
    totalScore: z.number(),
    maxScore: z.number(),
    kutaDetails: z.array(
      z.object({
        name: z.string(),
        obtained: z.number(),
        maximum: z.number(),
        description: z.string().optional(),
      }),
    ),
    compatibility: z.string(),
    recommendation: z.string().optional(),
  })
  .openapi('MatchmakingResponse');

export type MatchmakingResponse = z.infer<typeof MatchmakingResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Path-parameter schemas                                                      */
/* -------------------------------------------------------------------------- */

export const SignIndexParamSchema = z.object({
  signIndex: z
    .string()
    .transform(Number)
    .pipe(z.number().int().min(0).max(11))
    .openapi({
      param: { name: 'signIndex', in: 'path' },
      example: '0',
      description: 'Zodiac sign index (0 = Aries/Mesha, 11 = Pisces/Meena)',
    }),
});
