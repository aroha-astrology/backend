import type { ReportKey } from '../../config/reports.js';

/** Everything a report generator needs to compute its deterministic facts. */
export interface ReportScoreContext {
  /** kundli.chartData for the primary person. */
  chart: Record<string, unknown> | null;
  /** Partner's computed chart — kundli_milan only, undefined/null for every other report key. */
  partnerChart?: Record<string, unknown> | null;
  /**
   * kundli.doshaData — DoshaAnalysis (mangal, kaalSarp, sadeSati, pitra, kemDruma, grahan,
   * guruChandal), same shape chat-grounding.ts's GroundingSource.doshas reads.
   *
   * Optional (not required) — deliberately, even though every real production call site
   * populates it: both places in reports.service.ts that construct a ReportScoreContext
   * (`runReportGeneration` and `recomputeScoresForRead`) always pass all four of these new
   * fields straight off the live `kundli` row. Making them required on the interface would ripple
   * into every existing report-type test file across the suite (report-marriage-scores.spec.ts,
   * report-baby-name-scores.spec.ts, kundli-milan-scores.spec.ts, etc.), none of which construct
   * this shape with these fields today — each would need editing just to keep compiling, for a
   * field their own report type doesn't even consume. Optional keeps this change purely additive.
   */
  doshaData?: Record<string, unknown> | null;
  /** kundli.yogaData — { yogas: Yoga[] }, same shape chat-grounding.ts's GroundingSource.yogas reads.
   * Optional for the same reason as `doshaData` above. */
  yogaData?: Record<string, unknown> | null;
  /** kundli.ashtakavargaData — AshtakavargaData ({ bhinna, sarva }).
   * Optional for the same reason as `doshaData` above. */
  ashtakavargaData?: Record<string, unknown> | null;
  /** kundli.dashaData — shape { vimshottari: VimshottariDasha, yogini: YoginiDasha }.
   * Optional for the same reason as `doshaData` above. */
  dashaData?: Record<string, unknown> | null;
  /**
   * The person's own display name (`users.displayName` for the primary profile, or
   * `birth_profiles.displayName` for an additional profile) — sourced through
   * `resolveProfileContext` in both reports.service.ts construction sites, never read off the
   * raw table directly. Added for `numerology`/`name_change`, whose entire deterministic scoring
   * is name+DOB math (no chart involved) — see `computeNameAlignment`/`calculateExpression` etc.
   * in `lib/astro-engine/numerology/`. Optional for the same additive-only reason as `doshaData`
   * above: every other report type's own test file constructs `ReportScoreContext` without this
   * field and must keep compiling untouched.
   */
  personName?: string | null;
  /**
   * The person's own date of birth, as the plain 'YYYY-MM-DD' string `resolveProfileContext`
   * already decrypts and returns (`users.dateOfBirth` is `text`, encrypted at rest — see the
   * comment on that column in db/schema.ts; this value is ALWAYS the already-decrypted plain
   * string, sourced through the same repo-layer call as `personName`, never the raw column).
   * `computeNameAlignment`/the vedic-numerology functions want a `Date` — parse with
   * `new Date(ctx.personDob)` inside `computeScores`. Optional for the same reason as
   * `personName` above.
   */
  personDob?: string | null;
  /**
   * The person's own gender (`users.gender`/`birth_profiles.gender` — plain, not encrypted),
   * sourced through the same `resolveProfileContext` call as `personName`/`personDob`. Added
   * alongside those two (rather than being "just" the two fields the widening was originally
   * scoped for) because `numerology`'s Kua Number/Feng-Shui element
   * (`calculateKuaNumber`/`getKuaData` in `lib/astro-engine/numerology/vedic.ts`) is a binary
   * male/female classical formula with no third branch — computing it at all requires this on
   * top of name+DOB. `'other'` and missing/null gender fall back to `'male'` in
   * `computeNumerologyScores` (documented there) since the classical formula has no
   * non-binary form; this is a judgment call, not a claim that the formula is complete.
   * Optional for the same additive-only reason as `personName`/`personDob`.
   */
  personGender?: 'male' | 'female' | 'other' | null;
}

/**
 * Everything deterministic about a report: computed once per call, persisted
 * nowhere (recomputed from the live chart on every read) — same policy as
 * gemstone's `buildDeterministicGems`, so a future scoring-rule fix applies
 * retroactively to every already-purchased report with no backfill needed.
 * Shape is intentionally `Record<string, unknown>` here since each report
 * type's score shape differs; the per-type module defines and exports its own
 * narrower interface (e.g. `KundliMilanScores`) and this is just what flows
 * through generic orchestration, which never inspects the fields itself.
 */
export type ReportScores = Record<string, unknown>;

export interface ReportSection {
  heading: string;
  paragraphs: string[];
}

/**
 * What a report-type module must export, registered into REPORT_GENERATORS
 * below. This is the seam between the generic orchestration in
 * reports.service.ts (purchase, payment, claim-fencing, translate-on-read
 * caching) and each report type's own domain logic — orchestration code
 * never needs to change when a new report type is added, it only ever calls
 * through this interface.
 */
export interface ReportGenerator {
  key: ReportKey;
  /**
   * Pure, deterministic, fast — no LLM call, no DB access. Called both at
   * generation time (to ground the narrative prompt in real numbers) and at
   * read time (to merge fresh scores into a cached English/translated
   * narrative, exactly like gemstone's buildDeterministicGems). `periodMonth`
   * is the report's period ('YYYY-MM-01' string) for monthly reports, null
   * for one-time reports.
   */
  computeScores(ctx: ReportScoreContext, periodMonth: string | null): ReportScores;
  /**
   * One or more bounded LLM calls that turn `scores` into narrative
   * `ReportSection[]`. Split into multiple calls if the combined narrative
   * would approach the profile's maxTokens ceiling (see REPORT_PROFILE in
   * config/llm.ts) — return the concatenated section list either way. Must
   * NOT invent any number that `scores` already computed; it writes prose
   * only, referencing the given numbers as facts.
   */
  generateNarrative(scores: ReportScores, language: 'en'): Promise<ReportSection[]>;
  /**
   * Translate an already-generated English `ReportSection[]` — one LLM call,
   * reusing the gemstone/house-insight translate-on-read idiom's prompt shape
   * where the section structure is generic enough, or a bespoke prompt if it
   * needs explaining to the model.
   */
  translateNarrative(sections: ReportSection[], language: string): Promise<ReportSection[]>;
}

/**
 * The generator registry. `kundli_milan` is the only key registered by this
 * task (see modules/reports/generators/index.ts, the barrel every generator
 * module is imported from for its self-registration side effect). The other
 * 9 catalogue keys (past_life, true_love, wealth, baby_name, and the 4
 * *_monthly reports) are legitimately purchasable today — REPORT_CATALOGUE
 * and the purchase route don't gate on "does a generator exist" — but have NO
 * registered generator until a following task fills them in.
 *
 * A report key with no registered generator must never crash the
 * orchestration layer: reports.service.ts's background generation step looks
 * up `REPORT_GENERATORS[reportKey]` and, if it's undefined, treats that
 * exactly like a generator that threw — mark the row `failed` with a clear
 * error message, refund the charge, and log at error level. This is a
 * deliberate, tested safety net (see the "no generator registered" test in
 * test/reports-service.spec.ts) so shipping the generic reports
 * infrastructure ahead of all 10 generators is safe: a user CAN buy `wealth`
 * today, they just get a clean refund instead of a report until the next
 * task registers `wealth`'s generator.
 */
export const REPORT_GENERATORS: Partial<Record<ReportKey, ReportGenerator>> = {};

export function registerReportGenerator(gen: ReportGenerator): void {
  REPORT_GENERATORS[gen.key] = gen;
}
