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
  | 'match_report';

export interface ReportDef {
  key: ReportKey;
  /** Matches a key in FEATURE_REGISTRY (src/config/features.ts), e.g. 'reports.marriage'. */
  featureFlagKey: string;
  label: string;
  isMonthly: boolean;
  /** True for kundli_milan and match_report — the two reports that take a second person's birth details. */
  requiresPartner: boolean;
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
    requiresPartner: false,
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
    requiresPartner: false,
    basePricePaise: 9900,
  },
  {
    key: 'wealth',
    featureFlagKey: 'reports.wealth',
    label: 'Wealth Report',
    isMonthly: false,
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
