/**
 * The canonical reports catalogue — 10 named, purchasable AI-generated report
 * types (6 one-time, 4 monthly). Each `featureFlagKey` matches an entry in
 * `FEATURE_REGISTRY` (src/config/features.ts) so the admin dashboard can
 * toggle/reprice a report exactly like any other feature — this file only
 * owns the report-specific shape (isMonthly/requiresPartner/basePricePaise),
 * not enabled/price, which are resolved server-side via `resolveFeatures()`.
 *
 * Only `kundli_milan` has a registered generator (see
 * src/modules/reports/report-generator.types.ts) as of this task — the other
 * 9 keys are intentionally purchasable but unregistered, to be filled in by a
 * following task. See that file's doc comment for how the orchestration
 * layer handles an unregistered key safely (fail-and-refund, never crash).
 */

export type ReportKey =
  | 'marriage'
  | 'past_life'
  | 'kundli_milan'
  | 'true_love'
  | 'wealth'
  | 'baby_name'
  | 'health_monthly'
  | 'career_monthly'
  | 'finance_monthly'
  | 'relationship_monthly'
  | 'match_report'
  | 'numerology'
  | 'name_change'
  | 'remedies';

export interface ReportDef {
  key: ReportKey;
  /** Matches a key in FEATURE_REGISTRY (src/config/features.ts), e.g. 'reports.marriage'. */
  featureFlagKey: string;
  label: string;
  isMonthly: boolean;
  /**
   * True for the 4 one-time report types whose content genuinely moves year to year
   * (marriage/wealth/true_love/numerology — timing windows, decade arcs, personal year) —
   * false/absent for every other key, including every `isMonthly` key (those are never
   * yearly; the two are mutually exclusive purchase shapes, never combined).
   *
   * A yearly purchase is still a SINGLE flat-price row, structurally identical to a
   * one-time purchase (`purchaseReportShapeCheck`/`computeRowPrices` both key off `isMonthly`
   * alone and are untouched by this flag) — the only two differences are (1) `periodMonth`
   * is set to the PURCHASE date instead of staying null (see `purchaseReport`'s
   * `periodMonths` construction — deliberately reusing the `period_month` column as a
   * period START rather than adding a new column/migration; see that column's own doc
   * comment in db/schema.ts for the ceiling this shortcut has and the upgrade path), and
   * (2) the catalogue card renews once a year instead of never (see frontend's
   * `yearlyCardState` in reports-logic.ts). Expiry is ALWAYS derived (`start + 1 year`),
   * never stored.
   */
  isYearly?: boolean;
  /** True for kundli_milan and match_report — the two reports that take a second person's birth details. */
  requiresPartner: boolean;
  /**
   * True ONLY for marriage: a partner is optional, not required, and only shown to a user whose
   * own relationshipStatus is 'married' (see frontend's ReportPurchaseDrawer). Deliberately a
   * SEPARATE flag from requiresPartner rather than reusing it — requiresPartner blocks purchase
   * without a partner (correct for kundli_milan/match_report, wrong for marriage, whose majority
   * of buyers are unmarried people asking about a future spouse they cannot supply details for).
   */
  acceptsOptionalPartner?: boolean;
  /** Fallback price if the feature flag has no admin price override. For monthly reports this
   * is the PER-MONTH base price — see monthlyBundlePricePaise for the multi-month bundle curve. */
  basePricePaise: number;
}

export const REPORT_CATALOGUE: readonly ReportDef[] = [
  {
    key: 'marriage',
    featureFlagKey: 'reports.marriage',
    label: 'Marriage Report',
    isMonthly: false,
    isYearly: true,
    requiresPartner: false,
    acceptsOptionalPartner: true,
    basePricePaise: 9900,
  },
  {
    key: 'past_life',
    featureFlagKey: 'reports.past_life',
    label: 'Past Life Report',
    isMonthly: false,
    requiresPartner: false,
    basePricePaise: 2500,
  },
  {
    key: 'kundli_milan',
    featureFlagKey: 'reports.kundli_milan',
    label: 'Kundli Milan Report',
    isMonthly: false,
    requiresPartner: true,
    basePricePaise: 9900,
  },
  {
    key: 'true_love',
    featureFlagKey: 'reports.true_love',
    label: 'True Love Report',
    isMonthly: false,
    isYearly: true,
    requiresPartner: false,
    basePricePaise: 9900,
  },
  {
    key: 'wealth',
    featureFlagKey: 'reports.wealth',
    label: 'Wealth Report',
    isMonthly: false,
    isYearly: true,
    requiresPartner: false,
    basePricePaise: 9900,
  },
  {
    key: 'baby_name',
    featureFlagKey: 'reports.baby_name',
    label: 'Baby Name Report',
    isMonthly: false,
    requiresPartner: false,
    basePricePaise: 9900,
  },
  {
    key: 'health_monthly',
    featureFlagKey: 'reports.health_monthly',
    label: 'Health Report',
    isMonthly: true,
    requiresPartner: false,
    basePricePaise: 2500,
  },
  {
    key: 'career_monthly',
    featureFlagKey: 'reports.career_monthly',
    label: 'Career Report',
    isMonthly: true,
    requiresPartner: false,
    basePricePaise: 2500,
  },
  {
    key: 'finance_monthly',
    featureFlagKey: 'reports.finance_monthly',
    label: 'Finance Report',
    isMonthly: true,
    requiresPartner: false,
    basePricePaise: 2500,
  },
  {
    key: 'relationship_monthly',
    featureFlagKey: 'reports.relationship_monthly',
    label: 'Relationship Report',
    isMonthly: true,
    requiresPartner: false,
    basePricePaise: 2500,
  },
  {
    key: 'match_report',
    featureFlagKey: 'reports.match_report',
    label: 'Compatibility Match Report',
    isMonthly: false,
    requiresPartner: true,
    basePricePaise: 5000,
  },
  // Both of the following are pure name+DOB math (lib/astro-engine/numerology/) — no birth
  // chart involved at all, unlike every other report above.
  {
    key: 'numerology',
    featureFlagKey: 'reports.numerology',
    label: 'Numerology Report',
    isMonthly: false,
    isYearly: true,
    requiresPartner: false,
    // Same ₹99 tier as marriage/wealth/true_love/baby_name: a 3-call narrative (6 sections)
    // covering the full deterministic number set (Mulank/Bhagyank/Life Path/Expression/Soul
    // Urge/Personality, Lo Shu Grid, Challenge Numbers, Name Planes, Kua Number, Personal
    // Year/Month + a 12-month forecast) — comparable content depth to this codebase's other
    // "large" reports, not the lighter single-call ones.
    basePricePaise: 9900,
  },
  {
    key: 'name_change',
    featureFlagKey: 'reports.name_change',
    label: 'Name Change Report',
    isMonthly: false,
    requiresPartner: false,
    // Deliberately below the ₹99 tier: a single, focused LLM call (2 sections) over a narrower
    // fact surface (one name's alignment + up to 5 spelling variants) than numerology's 3-call,
    // 6-section report above — but above the ₹25 base tier since it still runs a full
    // personalized pipeline (computeNameAlignment + generateDeterministicVariants) rather than
    // a fixed lookup. Priced between the two existing tiers rather than matching either one
    // exactly — a judgment call, not an exact science; see match_report's ₹50 for another
    // report type that similarly sits between the ₹25/₹99 tiers.
    basePricePaise: 4900,
  },
  {
    key: 'remedies',
    featureFlagKey: 'reports.remedies',
    label: 'Remedies Report (Lal Kitab)',
    isMonthly: false,
    requiresPartner: false,
    // Same ₹99 tier as numerology/marriage/wealth/baby_name: comparable content depth (karmic
    // debts + Pakka Ghar + blind planets + a natal Lal Kitab remedy per classical planet).
    // Distinct from the free /remedies page (app/remedies/page.tsx), which live-fetches a
    // thinner "weak planets only" list via GET /v1/remedies and isn't part of this catalogue.
    basePricePaise: 9900,
  },
] as const;

const REPORT_BY_KEY: ReadonlyMap<string, ReportDef> = new Map(
  REPORT_CATALOGUE.map((r) => [r.key, r]),
);

export function getReportDef(key: string): ReportDef | undefined {
  return REPORT_BY_KEY.get(key);
}

/**
 * Bundle pricing for N months of ONE monthly report type, in paise. ₹25 for
 * the first month, +₹20 for each additional month, capped at ₹199 total —
 * chosen so a longer commitment is always at least as cheap per-month as a
 * shorter one, never more expensive in total (see the monotonicity test:
 * monthlyBundlePricePaise(n+1) >= monthlyBundlePricePaise(n) for every n,
 * including across the point where the cap kicks in around month 9-10).
 */
export function monthlyBundlePricePaise(months: number): number {
  if (months < 1) throw new Error('months must be >= 1');
  return Math.min(2500 + (months - 1) * 2000, 19900);
}
