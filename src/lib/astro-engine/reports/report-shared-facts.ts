// =============================================================================
// Shared fact mixins every report type's own Scores interface extends
// =============================================================================
// `header` (report-header.ts) and `lifeContext` (report-life-context.ts) are
// computed identically by all 14 report types; `planetRemedies`
// (report-remedy-slots.ts) only by the 4 flagship report types that carry one
// (see reportHasRemedySlots). Declared once here so each report type's own
// `XScores extends Record<string, unknown>` interface adds these fields via
// `, ReportSharedFacts` (or `, ReportSharedFactsWithRemedies`) instead of
// re-declaring them 14 times.
// =============================================================================

import type { ReportHeader } from './report-header.js';
import type { LifeContext } from './report-life-context.js';
import type { ReportRemedyEntry } from './report-remedy-slots.js';
import type { ReportVarga } from './report-vargas.js';

export interface ReportSharedFacts {
  header: ReportHeader;
  lifeContext: LifeContext;
  /** Optional pre-purchase questionnaire answers, carried onto `scores` by the report types that
   * have a configured question set — see `ReportScoreContext.userAnswers`'s doc comment for why
   * this is sourced fresh from the purchase request rather than being a truly deterministic fact. */
  userAnswers?: Record<string, string> | null;
  /** The divisional chart(s) this report domain classically calls for (see report-vargas.ts) —
   * e.g. D9 for marriage, D10 for career. Optional: the 3 name/DOB-only report types (numerology,
   * name_change, remedies) do no chart analysis at all and never set this. */
  vargas?: ReportVarga[];
  /** Ashtakavarga (Sarvashtakavarga) house-strength summary, reusing chat-grounding.ts's own
   * `ashtakavargaFacts` — already-formatted prose lines, not raw data, since that function's whole
   * job is turning the Sarva bindu table into house-strength sentences. `ctx.ashtakavargaData` was
   * passed into every report's ReportScoreContext already but read by zero report generators until
   * now. Optional: only the report types whose focus houses it speaks to (marriage/wealth/
   * career_monthly/finance_monthly/health_monthly) set this. */
  ashtakavargaSummary?: string[];
  /**
   * Shadbala strength + retrogression + combustion + Bhava Chalit lines for this report's chart —
   * chat-grounding.ts's `chartConditionFacts`, the SAME function that grounds chat, voice and
   * horoscopes, so a report can never disagree with what the astrologer says in chat.
   *
   * Unlike every other field here it is NOT set by the report generators: reports.service.ts
   * attaches it to `scores` right after `computeScores` returns, for every report type at once
   * (see `withChartCondition` there). Reports were the one surface still narrating a yoga as if
   * it fires cleanly regardless of whether its ruling planet had the strength to deliver it.
   */
  planetCondition?: string[];
}

export interface ReportSharedFactsWithRemedies extends ReportSharedFacts {
  planetRemedies: ReportRemedyEntry[];
}
