// =============================================================================
// Aroha Pass + Question Packs — the fixed rules (roadmap step 10)
// =============================================================================
// Prices live on the admin board (config/features.ts) like every other price;
// what's here is what an admin can't change from there: pack sizes, the
// monthly question quota, the report discount and the Play product ids.
// =============================================================================

export const PASS_PLAN_NAME = 'aroha_pass';
export const PASS_PERIOD_DAYS = 30;
/** Chat questions included per 30-day period. */
export const PASS_QUESTIONS_PER_PERIOD = 30;
/** Percent off every report for Pass holders. */
export const PASS_REPORT_DISCOUNT_PCT = 20;
/** Days before a wallet Pass ends that the reminder goes out. */
export const PASS_REMINDER_DAYS = 3;

/**
 * The price test: each variant is its own admin key (groups can't change
 * prices, so the test runs on keys). A user is shown one variant, picked by a
 * stable hash of their id across the variants that are switched on.
 */
export const PASS_VARIANTS = [
  { variant: 'A', key: 'paid.arohaPassA', fallbackPaise: 19900, playBasePlan: 'pass-199' },
  { variant: 'B', key: 'paid.arohaPassB', fallbackPaise: 29900, playBasePlan: 'pass-299' },
  { variant: 'C', key: 'paid.arohaPassC', fallbackPaise: 39900, playBasePlan: 'pass-399' },
] as const;
export type PassVariant = (typeof PASS_VARIANTS)[number]['variant'];

/** The Play subscription product; its base plans carry the three prices (set in Play Console). */
export const PASS_PLAY_PRODUCT_ID = 'aroha_pass_monthly';

export const QUESTION_PACKS = [
  { pack: 'small', key: 'paid.questionPackSmall', questions: 5, fallbackPaise: 4900 },
  { pack: 'medium', key: 'paid.questionPackMedium', questions: 12, fallbackPaise: 9900 },
  { pack: 'large', key: 'paid.questionPackLarge', questions: 30, fallbackPaise: 19900 },
] as const;
export type QuestionPack = (typeof QUESTION_PACKS)[number]['pack'];
