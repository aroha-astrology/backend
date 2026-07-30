// =============================================================================
// Report timing windows — thin, report-facing wrapper around dasha-confidence.ts
// =============================================================================
// dasha-confidence.ts's `scoreDomainWindows` is the SAME confidence-tiered
// (Vimshottari anchor + Yogini alignment + transit alignment) dasha timing-
// window search the AI chat feature already uses for its own "when will X
// happen" facts (see chat-grounding.ts). Reports should call through to that
// ONE implementation rather than each report type inventing its own,
// shallower timing search — this is also the fix for a real bug where the
// Marriage report's old bespoke window logic could contradict what chat told
// the same user about the same domain.
//
// This module exists purely to spare report modules from having to know
// about `ascSignIndex` extraction or live-transit plumbing, neither of which
// a synchronous, DB-free, no-I/O `computeScores` call (see
// report-generator.types.ts's `ReportGenerator.computeScores` doc comment)
// can do anyway.
//
// Deliberate, documented simplification: `transits` is ALWAYS
// `{ saturnSignIndex: null, jupiterSignIndex: null }` here — reports never do
// a live ephemeris lookup synchronously. `scoreDomainWindows`'s own
// `transitAlignment` step degrades gracefully on null transit input (verified
// by reading dasha-confidence.ts directly: `transitAlignment` returns
// `{ aligned: false, reason: '...position unknown.' }` when `transitSignIndex`
// is null — it never throws). So every report-generated window is scored
// WITHOUT the "is a slow transit currently supporting this" point, capping it
// one point below what chat's live version could award the exact same
// window. Windows are still correctly ranked and tiered relative to EACH
// OTHER (the Vimshottari anchor and Yogini alignment points still score
// normally) — they just can never reach a transit-boosted HIGH from a
// report's synchronous scoring pass alone. This is an accepted tradeoff, not
// an oversight.
// =============================================================================

import { scoreDomainWindows } from '../dasha-confidence.js';
import type { Domain, RankedWindow, DomainWindowResult } from '../dasha-confidence.js';

// Re-exported so report modules only need to import from this file, not reach
// into dasha-confidence.ts directly.
export type { Domain, RankedWindow, DomainWindowResult };

/**
 * Extract a chart's ascendant sign index (0=Aries..11=Pisces) the exact same way
 * chat-grounding.ts does it (see its `ascSignIndex` derivation, e.g. around the
 * `const asc = chart?.ascendant as Record<string, unknown> | undefined;` line) —
 * kept as an identical field-access pattern so a report and a chat session reading
 * the same chart can never disagree on the Ascendant sign. Returns null if the
 * chart or its ascendant/signIndex is missing.
 */
function ascSignIndexFromChart(chart: Record<string, unknown> | null): number | null {
  const asc = chart?.ascendant as Record<string, unknown> | undefined;
  return asc?.signIndex != null ? Number(asc.signIndex) : null;
}

/**
 * Report-facing wrapper around `scoreDomainWindows` (dasha-confidence.ts) — the same
 * confidence-tiered dasha/Yogini/transit timing-window search chat's grounding layer
 * uses. Finds and ranks (strongest first) the top windows in `dashaData` whose
 * Mahadasha or Antardasha lord is one of `significatorLords`, for the given `domain`.
 *
 * @param domain             One of dasha-confidence.ts's `Domain` keys (career, love,
 *                           health, children, wealth, education, property, vehicle,
 *                           siblings, parents, legal, foreign, spirituality, business,
 *                           friends).
 * @param significatorLords  Planet names whose Mahadasha/Antardasha lordship qualifies a
 *                           window for this report (e.g. marriage: ['Venus', 'Jupiter',
 *                           seventhLord]).
 * @param dashaData          `kundli.dashaData` as-is — `{ vimshottari, yogini }` — or null.
 *                           (Same shape `ReportScoreContext.dashaData` carries.)
 * @param chart              `kundli.chartData` as-is — used ONLY to derive `ascSignIndex`
 *                           for the (always-degraded, see module doc comment) transit
 *                           alignment check.
 * @param now                Defaults to `new Date()`; pass explicitly in tests for
 *                           deterministic output.
 * @returns                  `{ domain, windows }` — `windows` is empty (never a fabricated
 *                           guess) when nothing qualifies. Never throws.
 */
export function computeReportTimingWindows(
  domain: Domain,
  significatorLords: string[],
  dashaData: Record<string, unknown> | null,
  chart: Record<string, unknown> | null,
  now: Date = new Date(),
): DomainWindowResult {
  const ascSignIndex = ascSignIndexFromChart(chart);
  const result = scoreDomainWindows(
    domain,
    significatorLords,
    dashaData,
    ascSignIndex,
    now,
    { saturnSignIndex: null, jupiterSignIndex: null },
    undefined,
    { ensureNearTermAnchor: true },
  );

  // Re-sort chronologically (soonest-first) for display — ONLY here, not inside
  // scoreDomainWindows itself. That function's own tier/score ordering must survive for its OTHER
  // direct caller (chat-grounding.ts), which labels windows[0] as 'STRONGEST' in an LLM-facing
  // fact; re-sorting there would silently break that labeling. This wrapper is the correct, narrow
  // seam for the report-facing "when" answer to lead with the nearest window rather than
  // whichever tier/score ranked highest, without touching chat's semantics at all.
  const windows = [...result.windows].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
  );
  return { domain, windows };
}
