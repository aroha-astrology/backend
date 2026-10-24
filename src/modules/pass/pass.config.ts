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
  'voiceCall',
  'palm',
] as const;
export type PassFeature = (typeof PASS_FEATURES)[number];

/**
 * Voice-call minutes every user gets free ONCE, Pass or not (the voice trial,
 * launched for Durga Puja 2026, admin switch `chat.voiceTrial`). Someone
 * without a Pass can talk for these and then sees the Pass lock; a member
 * spends them before their tier's monthly `voiceFreeMinutes`.
 */
export const VOICE_TRIAL_MINUTES = 3;

/**
 * Full palm readings a member may unlock in one Pass period (owner, 2026-10-23: every tier,
 * one a month). The photo scan itself stays free for everyone.
 */
export const PALM_READINGS_PER_PERIOD = 1;

/**
 * The three Passes, cheapest first. Each is its own admin key (on/off and the
 * shown price) and its own base plan on the one Play subscription. A user sees
 * every tier that is switched on and picks one. `variant` is what
 * user_subscriptions.price_variant stores: the letters are from when the three
 * were a price test with the same benefits.
 *
 * `monthlyCoins`: coins gifted at the start of each Pass period while the `money.passCoins`
 * switch is on (v7 spec: Gold 100, Platinum 200).
 *
 * `freeReportsPerPeriod`: reports free in each Pass period while the `money.platinumReport` switch
 * is on (v7 spec: Platinum 1). See pass-free-report.ts.
 *
 * `voiceFreeMinutes`: voice-call minutes free in each Pass period, across all
 * calls; after these each minute is charged to the wallet at the
 * `paid.voiceChat` price (see modules/voice/voice.service.ts). Every tier got 3
 * until 2026-10-17, when the owner set 10 / 15 / 20.
 */
export const PASS_TIERS = [
  {
    tier: 'silver',
    variant: 'A',
    key: 'paid.arohaPassA',
    fallbackPaise: 19900,
    playBasePlan: 'pass-199',
    questions: 15,
    voiceFreeMinutes: 10,
    monthlyCoins: 0,
    freeReportsPerPeriod: 0,
    reportDiscountPct: 10,
    features: ['timeline', 'bonds', 'voiceCall', 'palm'],
  },
  {
    tier: 'gold',
    variant: 'B',
    key: 'paid.arohaPassB',
    fallbackPaise: 29900,
    playBasePlan: 'pass-299',
    questions: 30,
    voiceFreeMinutes: 15,
    monthlyCoins: 100,
    freeReportsPerPeriod: 0,
    reportDiscountPct: 20,
    features: ['timeline', 'bonds', 'decisions', 'findMyDate', 'birthTime', 'voiceCall', 'palm'],
  },
  {
    tier: 'platinum',
    variant: 'C',
    key: 'paid.arohaPassC',
    fallbackPaise: 39900,
    playBasePlan: 'pass-399',
    questions: 60,
    voiceFreeMinutes: 20,
    monthlyCoins: 200,
    freeReportsPerPeriod: 1,
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
  voiceFreeMinutes: number;
  monthlyCoins: number;
  freeReportsPerPeriod: number;
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
  /** Free voice-call minutes per 30-day period. */
  voiceFreeMinutes: number;
  /** Percent off every report. */
  reportDiscountPct: number;
  /** Reports free each period (Platinum 1), only while money.platinumReport is on. */
  freeReportsPerPeriod: number;
  features: readonly PassFeature[];
}

const entitlementOf = (t: PassTierDef): PassEntitlement => ({
  tier: t.tier,
  questions: t.questions,
  voiceFreeMinutes: t.voiceFreeMinutes,
  reportDiscountPct: t.reportDiscountPct,
  freeReportsPerPeriod: t.freeReportsPerPeriod,
  features: t.features,
});

/**
 * A Pass from before the tiers keeps what it was sold with: every feature, 30
 * questions, 20% off, and the middle tier's voice minutes.
 */
const LEGACY_ENTITLEMENT: PassEntitlement = {
  tier: null,
  questions: 30,
  voiceFreeMinutes: 15,
  reportDiscountPct: 20,
  freeReportsPerPeriod: 0,
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

/**
 * Question Packs are bought through Google Play (owner, 2026-10-23), never from the wallet.
 * `playProductId` is a one-time (consumable) product in Play Console, priced at
 * `fallbackPaise`: Play charges its own fixed price, so the admin price is display only and
 * must be kept equal to Play's.
 */
export const QUESTION_PACKS = [
  {
    pack: 'small',
    key: 'paid.questionPackSmall',
    questions: 5,
    fallbackPaise: 4900,
    playProductId: 'question_pack_5',
  },
  {
    pack: 'medium',
    key: 'paid.questionPackMedium',
    questions: 12,
    fallbackPaise: 9900,
    playProductId: 'question_pack_12',
  },
  {
    pack: 'large',
    key: 'paid.questionPackLarge',
    questions: 30,
    fallbackPaise: 19900,
    playProductId: 'question_pack_30',
  },
] as const;

/** The pack a Play product id buys, or undefined for any other product (wallet top-ups). */
export function questionPackForProduct(productId: string) {
  return QUESTION_PACKS.find((p) => p.playProductId === productId);
}
export type QuestionPack = (typeof QUESTION_PACKS)[number]['pack'];
