import { describe, it, expect } from 'vitest';
import { computeKundliMatch } from '../../src/lib/astro-engine/palm/palm-timing.js';

// =============================================================================
// Audit item PM3 (docs/engine-audit/C-critical-corrections.md)
// =============================================================================
// "Kundli Match %" is Aroha's own figure: how often the hand and the chart
// agree. A "chart-dated" event is one where the hand gave NO age and the age
// shown was taken from the chart. There is nothing to compare there, yet it
// was counted as full agreement.
//
// Worked example, timing only:
//   1 palm age inside the chart's window        -> agrees (1)
//   1 palm age near a window, moved to its edge -> half (0.5)
//   1 palm age the chart has no window for      -> disagrees (0)
//   3 events the hand did not date at all       -> nothing to compare
//   Agreement = 1.5 of 3 = 50%.
//   The old sum was (1 + 3 + 0.5) of 6 = 75%.
// =============================================================================

const timingOnly = (tally: {
  match: number;
  adjusted: number;
  chart: number;
  unsupported: number;
}) => computeKundliMatch({ tally, palmScores: null, chartScores: null, chartFacts: [] });

describe('[PM3] events the hand did not date are not counted as agreement', () => {
  it('the worked example gives 50%, not 75%', () => {
    const result = timingOnly({ match: 1, adjusted: 1, chart: 3, unsupported: 1 });
    expect(result?.percent).toBe(50);
    expect(result?.timing).toEqual({ agree: 1.5, total: 3 });
  });

  it('when the hand dated nothing there is no timing comparison, so no figure from it', () => {
    // Old result: 100%.
    expect(timingOnly({ match: 0, adjusted: 0, chart: 2, unsupported: 0 })).toBeNull();
  });

  it('a hand whose every age falls inside the chart’s windows still scores 100%', () => {
    expect(timingOnly({ match: 3, adjusted: 0, chart: 1, unsupported: 0 })?.percent).toBe(100);
  });
});
