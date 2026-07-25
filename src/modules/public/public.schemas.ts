import { z } from '@hono/zod-openapi';

/* -------------------------------------------------------------------------- */
/* Validation helpers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Rejects calendar dates that match the `YYYY-MM-DD` shape but don't actually
 * exist (e.g. 2024-02-30, 2023-02-29). `Date.UTC` silently rolls invalid
 * day/month combinations forward into the next month, so the only reliable
 * check is a round-trip: build the UTC date, then confirm the
 * year/month/day read back out match what was fed in.
 */
function isRealCalendarDate(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/* -------------------------------------------------------------------------- */
/* Request schema                                                             */
/* -------------------------------------------------------------------------- */

export const MoonSignRequestSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format')
      .refine(
        (value) => {
          const [year, month, day] = value.split('-').map(Number);
          return isRealCalendarDate(year!, month!, day!);
        },
        { message: 'date is not a real calendar date' },
      )
      .openapi({ example: '1990-04-17', description: 'Birth date (YYYY-MM-DD)' }),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be in 24-hour HH:mm format')
      .openapi({ example: '14:30', description: 'Birth time (HH:mm, 24-hour)' }),
    tzOffsetMinutes: z
      .number()
      .int('tzOffsetMinutes must be an integer')
      // Real-world IANA zone offsets range from UTC-12:00 to UTC+14:00, but a
      // little slack is kept on the negative side (-720 = -12:00 exactly) and
      // the positive side (+840 = +14:00 exactly, e.g. Kiribati) is the true
      // ceiling — this also comfortably covers half/quarter-hour zones like
      // IST (+330) and Nepal (+345).
      .min(-720, 'tzOffsetMinutes must be >= -720')
      .max(840, 'tzOffsetMinutes must be <= 840')
      .openapi({ example: 330, description: 'Signed minutes offset from UTC (e.g. IST = 330)' }),
  })
  .openapi('MoonSignRequest');

export type MoonSignRequest = z.infer<typeof MoonSignRequestSchema>;

/* -------------------------------------------------------------------------- */
/* Response schema                                                            */
/* -------------------------------------------------------------------------- */

export const MoonSignResponseSchema = z
  .object({
    sign: z.string().openapi({ example: 'Cancer' }),
    signIndex: z.number().int().min(0).max(11).openapi({ example: 3 }),
    degree: z.number().min(0).max(30).openapi({
      example: 14.37,
      description: 'Degree within the sign (signDegree), 0-30, 2 decimal places',
    }),
    nakshatra: z.string().openapi({ example: 'Pushya' }),
    nakshatraIndex: z.number().int().min(0).max(26).openapi({ example: 7 }),
    pada: z.number().int().min(1).max(4).openapi({ example: 2 }),
    nakshatraLord: z.string().openapi({ example: 'Saturn' }),
  })
  .openapi('MoonSignResponse');

export type MoonSignResponse = z.infer<typeof MoonSignResponseSchema>;
