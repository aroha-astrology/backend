import { z } from '@hono/zod-openapi';

/** The four parts of the day the owner can give a different hero card. */
export const SLOTS = ['morning', 'midday', 'evening', 'night'] as const;
export type Slot = (typeof SLOTS)[number];

/** A card id as the app's card registry spells it: lower-case letters, digits, dot, dash, underscore. */
const CardIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,59}$/, 'Not a card id');

const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, 24-hour');

const LookLayoutSchema = z
  .object({
    order: z.array(CardIdSchema).max(80).describe('Card ids, top to bottom'),
    heroBySlot: z.object({
      morning: CardIdSchema.nullable(),
      midday: CardIdSchema.nullable(),
      evening: CardIdSchema.nullable(),
      night: CardIdSchema.nullable(),
    }),
  })
  .superRefine((look, ctx) => {
    const unique = new Set(look.order);
    if (unique.size !== look.order.length) ctx.addIssue({ code: 'custom', message: 'A card appears twice', path: ['order'] });
    for (const slot of SLOTS) {
      const hero = look.heroBySlot[slot];
      if (hero !== null && !unique.has(hero)) {
        ctx.addIssue({ code: 'custom', message: 'The hero card must be in the order', path: ['heroBySlot', slot] });
      }
    }
  });

/** The whole Home layout: one order per look, plus when each part of the day starts. */
export const HomeLayoutDocSchema = z
  .object({
    vedic: LookLayoutSchema,
    cosmic: LookLayoutSchema,
    slots: z
      .object({ morning: TimeSchema, midday: TimeSchema, evening: TimeSchema, night: TimeSchema })
      .refine((s) => s.morning < s.midday && s.midday < s.evening && s.evening < s.night, {
        message: 'The slots must start in order: morning, midday, evening, night',
      }),
  })
  .openapi('HomeLayoutDoc');

export type HomeLayoutDoc = z.infer<typeof HomeLayoutDocSchema>;

/** What is stored under app_settings 'home.layout'. */
export const StoredHomeLayoutSchema = z
  .object({
    draft: HomeLayoutDocSchema.nullable(),
    published: HomeLayoutDocSchema.nullable(),
    /** The published layout before the last publish; "Undo" brings it back. */
    previous: HomeLayoutDocSchema.nullable(),
  })
  .openapi('HomeLayoutStored');

export type StoredHomeLayout = z.infer<typeof StoredHomeLayoutSchema>;

export const EMPTY_STORED: StoredHomeLayout = { draft: null, published: null, previous: null };

export const HomeLayoutForAppSchema = z
  .object({
    layout: HomeLayoutDocSchema.nullable().describe('Null: keep the built-in order'),
    source: z.enum(['published', 'draft']).nullable(),
  })
  .openapi('HomeLayoutForApp');
