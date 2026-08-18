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
  /**
   * The account-level `users.relationship_status` enum value (single/in_relationship/engaged/
   * married/divorced/widowed) — has no per-profile equivalent (not on `ProfileContext`), same
   * account-level sourcing chat-grounding.ts's `buildProfileFacts` already uses for this same
   * field. Sourced through `fetchPersonContext` in reports.service.ts, off the `user` row it
   * already fetches — no new query. Optional for the same additive-only reason as `personName`
   * above: existing report-type test files construct `ReportScoreContext` without it.
   */
  personRelationshipStatus?: string | null;
  /**
   * The account-level `users.phone_e164` (E.164, e.g. "+919876543210") — already decrypted by
   * the repo layer by the time it reaches here (see that column's own doc comment in
   * db/schema.ts), same account-level sourcing as `personRelationshipStatus` above (no
   * per-profile equivalent exists). ONLY consumed by `numerology`'s phone-numerology block
   * (`computeMobileNumberScores` in astro-engine/numerology/mobileNumber.ts) — every other
   * report type ignores it. That module must never place the raw digits anywhere in `scores`
   * or the narrative prompt (see its own doc comment for why) — this field exists purely so
   * `computeScores` can compute FROM it, not so it can be echoed back. Optional for the same
   * additive-only reason as `personRelationshipStatus` above.
   */
  personPhone?: string | null;
  /**
   * Optional free-text/enum answers the user gave to a small, skippable pre-purchase
   * questionnaire (see `PurchaseReportBody.answers`, threaded through purely in-memory from
   * `purchaseReport` to `runReportGeneration` — never persisted, since it's only consumed once
   * by `generateNarrative` at generation time, unlike the deterministic fields above that
   * `computeScores` must reproduce on every read). Only the report types with a configured
   * question set (see frontend's `lib/report-questions.ts`) ever have this populated; every
   * other report type's `computeScores` ignores it entirely, same additive-only reasoning as
   * `personRelationshipStatus` above.
   */
  userAnswers?: Record<string, string> | null;
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

/**
 * A single ranked/scored/highlightable entry inside a section — currently only `name_change`
 * populates this (see llm/reports/name-change.ts), for its "Suggested Names" and "Suggested
 * Spelling Adjustments" sections. Additive-only on `ReportSection`, so every other report type's
 * generator and every existing stored report (which simply lacks `items`) is unaffected.
 */
export interface ReportSectionItem {
  /** The name, or the variant spelling. */
  title: string;
  /** Short fact chip, e.g. "Chaldean 5". */
  badge?: string;
  /** 0-100 match score (see astro-engine/numerology/name-scoring.ts) — clamped [40, 99] there. */
  score?: number;
  /** Top-2-by-score flag — renders as the "Best Match" pill. */
  highlight?: boolean;
  /** Spelling variants only: the exact edit applied, e.g. `added "a" at the end`. */
  note?: string;
  /** The practical benefits, in pointer form — never prose paragraphs. */
  bullets: string[];
}

export interface ReportSection {
  /** Canonical, stable section id (see config/report-sections.ts) — assigned by
   * `assignSectionIds` at read time, positionally, never generated by the LLM itself. Absent
   * on a report type not yet listed there, or when the section count doesn't match the
   * expected sequence (see that function's own doc comment) — the frontend falls back to
   * `heading` in that case. */
  id?: string;
  heading: string;
  /** One short, striking sentence for this section, rendered as a pull-quote between the
   * heading and the paragraphs. Optional and additive-only, exactly like `bullets`/`items`
   * below: a report type whose prompt doesn't ask for one — currently every type except
   * past_life — and every report generated before hooks shipped simply omits it. Translated
   * along with the rest of the section (it is plain prose inside the same JSON shape). */
  hook?: string;
  paragraphs: string[];
  /** Section-level bullet list, rendered under `paragraphs` — optional, additive-only. */
  bullets?: string[];
  /** Card-rendered ranked/scored items, rendered under `bullets` — optional, additive-only. */
  items?: ReportSectionItem[];
}

/**
 * Checkpoint hooks for a multi-call `generateNarrative` — see that method's
 * own doc comment for the contract. `existingGroups[i]` is what the i-th
 * previous `onGroupComplete(group)` call persisted; a resumable generator
 * making the same N calls in the same order can simply skip call i whenever
 * `existingGroups[i]` already exists and splice it back in unchanged.
 */
export interface SectionGenerationProgress {
  existingGroups: ReportSection[][];
  onGroupComplete(group: ReportSection[]): Promise<void>;
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
   *
   * `progress` is optional and purely a cost/resilience optimization — a
   * generator that only ever makes one LLM call (most of them) has nothing
   * meaningful to checkpoint and can ignore the parameter entirely; the
   * default (regenerate everything, on every attempt) is still correct. A
   * generator that makes several independent bounded calls (marriage,
   * numerology, true_love — see their own generateNarrative) SHOULD call
   * `progress.onGroupComplete` after each one succeeds, and skip regenerating
   * whatever `progress.existingGroups` already contains — otherwise a
   * transient failure on, say, the 4th of 4 calls discards the first 3
   * (already paid-for) calls' output on every retry.
   */
  generateNarrative(
    scores: ReportScores,
    language: 'en',
    progress?: SectionGenerationProgress,
  ): Promise<ReportSection[]>;
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
