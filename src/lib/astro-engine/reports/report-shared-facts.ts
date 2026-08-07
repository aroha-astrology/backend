// =============================================================================
// Shared fact mixins every report type's own Scores interface extends
// =============================================================================
// `header` (report-header.ts) and `lifeContext` (report-life-context.ts) are
// computed identically by all 14 report types; `gemstones` (report-gemstones.ts)
// only by the 5 flagship report types that carry one (see reportHasGemstones).
// Declared once here so each report type's own `XScores extends
// Record<string, unknown>` interface adds these fields via `, ReportSharedFacts`
// (or `, ReportSharedFactsWithGemstones`) instead of re-declaring them 14 times.
// =============================================================================

import type { ReportHeader } from './report-header.js';
import type { LifeContext } from './report-life-context.js';
import type { ReportGemstone } from './report-gemstones.js';
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
}

export interface ReportSharedFactsWithGemstones extends ReportSharedFacts {
  gemstones: ReportGemstone[];
}
