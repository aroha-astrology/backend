import { z } from '@hono/zod-openapi';

export const GitaVerseSchema = z
  .object({
    id: z.string().openapi({ example: 'ch2-v47' }),
    chapter: z.number().int(),
    verse: z.number().int(),
    sanskrit: z.string(),
    mainCategory: z.string().openapi({ description: 'Devanagari category label, e.g. कर्मयोग' }),
    tags: z
      .array(z.string())
      .openapi({
        description:
          'Need tags this verse addresses, e.g. ["anxiety"]. May be empty for narrative verses.',
      }),
  })
  .openapi('GitaVerse');

export const GitaVersesResponseSchema = z
  .object({
    verses: z.array(GitaVerseSchema),
  })
  .openapi('GitaVersesResponse');
