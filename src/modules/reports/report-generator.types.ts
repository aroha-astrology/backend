import type { ReportKey } from '../../config/reports.js';

/** Everything a report generator needs to compute its deterministic facts. */
export interface ReportScoreContext {
  /** kundli.chartData for the primary person. */
  chart: Record<string, unknown> | null;
  /** Partner's computed chart — kundli_milan only, undefined/null for every other report key. */
  partnerChart?: Record<string, unknown> | null;
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
