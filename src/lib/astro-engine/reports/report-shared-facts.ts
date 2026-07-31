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

export interface ReportSharedFacts {
  header: ReportHeader;
  lifeContext: LifeContext;
  /** Optional pre-purchase questionnaire answers, carried onto `scores` by the report types that
   * have a configured question set — see `ReportScoreContext.userAnswers`'s doc comment for why
   * this is sourced fresh from the purchase request rather than being a truly deterministic fact. */
  userAnswers?: Record<string, string> | null;
}

export interface ReportSharedFactsWithGemstones extends ReportSharedFacts {
  gemstones: ReportGemstone[];
}
