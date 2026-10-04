// =============================================================================
// Aroha Pass + Question Packs — the fixed rules (roadmap step 10)
// =============================================================================
// Prices live on the admin board (config/features.ts) like every other price;
// what's here is what an admin can't change from there: what each Pass tier
// gives, pack sizes and the Play product ids.
// =============================================================================

export const PASS_PLAN_NAME = 'aroha_pass';
export const PASS_PERIOD_DAYS = 30;
/** Days before a wallet Pass ends that the reminder goes out. */
export const PASS_REMINDER_DAYS = 3;

/** The Pass-only features. `requirePass()` in lib/entitlements.ts takes one of these. */
export const PASS_FEATURES = [
  'timeline',
  'bonds',
  'decisions',
  'findMyDate',
  'birthTime',
  'relocation',
] as const;
export type PassFeature = (typeof PASS_FEATURES)[number];

/**
 * The three Passes, cheapest first. Each is its own admin key (on/off and the
 * shown price) and its own base plan on the one Play subscription. A user sees
 * every tier that is switched on and picks one. `variant` is what
 * user_subscriptions.price_variant stores: the letters are from when the three
 * were a price test with the same benefits.
 */
export const PASS_TIERS = [
  {
    tier: 'silver',
    variant: 'A',
    key: 'paid.arohaPassA',
    fallbackPaise: 19900,
    playBasePlan: 'pass-199',
    questions: 15,
    reportDiscountPct: 10,
    features: ['timeline', 'bonds'],
  },
  {
    tier: 'gold',
    variant: 'B',
    key: 'paid.arohaPassB',
    fallbackPaise: 29900,
    playBasePlan: 'pass-299',
    questions: 30,
    reportDiscountPct: 20,
    features: ['timeline', 'bonds', 'decisions', 'findMyDate', 'birthTime'],
  },
  {
    tier: 'platinum',
    variant: 'C',
    key: 'paid.arohaPassC',
    fallbackPaise: 39900,
    playBasePlan: 'pass-399',
    questions: 60,
    reportDiscountPct: 30,
    features: PASS_FEATURES,
  },
] as const satisfies ReadonlyArray<{
  tier: string;
  variant: string;
  key: string;
  fallbackPaise: number;
  playBasePlan: string;
  questions: number;
  reportDiscountPct: number;
  features: readonly PassFeature[];
}>;
export type PassTierDef = (typeof PASS_TIERS)[number];
export type PassTier = PassTierDef['tier'];
export type PassVariant = PassTierDef['variant'];

/** What a live Pass gives its holder. */
export interface PassEntitlement {
  /** Null on a Pass from before the tiers. */
  tier: PassTier | null;
  /** Chat questions included per 30-day period. */
  questions: number;
  /** Percent off every report. */
  reportDiscountPct: number;
  features: readonly PassFeature[];
}

const entitlementOf = (t: PassTierDef): PassEntitlement => ({
  tier: t.tier,
  questions: t.questions,
  reportDiscountPct: t.reportDiscountPct,
  features: t.features,
});

/** A Pass from before the tiers keeps what it was sold with: every feature, 30 questions, 20% off. */
const LEGACY_ENTITLEMENT: PassEntitlement = {
  tier: null,
  questions: 30,
  reportDiscountPct: 20,
  features: PASS_FEATURES,
};

/** A member of an admin user group gets the top Pass free. */
export const GROUP_ENTITLEMENT: PassEntitlement = entitlementOf(PASS_TIERS[PASS_TIERS.length - 1]!);

/** What a subscription row gives. Wallet rows and rows with no known tier are from before the tiers. */
export function entitlementForRow(row: {
  source: string;
  priceVariant: string | null;
}): PassEntitlement {
  const def =
    row.source === 'wallet' ? null : PASS_TIERS.find((t) => t.variant === row.priceVariant);
  return def ? entitlementOf(def) : LEGACY_ENTITLEMENT;
}

/** The Play subscription product; its base plans are the three tiers (set in Play Console). */
export const PASS_PLAY_PRODUCT_ID = 'aroha_pass_monthly';

export const QUESTION_PACKS = [
  { pack: 'small', key: 'paid.questionPackSmall', questions: 5, fallbackPaise: 4900 },
  { pack: 'medium', key: 'paid.questionPackMedium', questions: 12, fallbackPaise: 9900 },
  { pack: 'large', key: 'paid.questionPackLarge', questions: 30, fallbackPaise: 19900 },
] as const;
export type QuestionPack = (typeof QUESTION_PACKS)[number]['pack'];
