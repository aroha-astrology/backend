import { describe, it, expect, vi } from 'vitest';

// The narrative writers call a paid model; these tests must never reach one.
const narrate = vi.hoisted(() => ({ numerology: vi.fn(), nameChange: vi.fn() }));
vi.mock('../../src/lib/llm/reports/numerology.js', () => ({
  generateNumerologyNarrative: narrate.numerology,
  translateNumerologyNarrative: vi.fn(),
}));
vi.mock('../../src/lib/llm/reports/name-change.js', () => ({
  generateNameChangeNarrative: narrate.nameChange,
  translateNameChangeNarrative: vi.fn(),
}));

import { computeNumerologyScores } from '../../src/lib/astro-engine/reports/numerology.js';
import { computeNameChangeScores } from '../../src/lib/astro-engine/reports/name-change.js';
import { numerologyGenerator } from '../../src/modules/reports/generators/numerology.generator.js';
import { nameChangeGenerator } from '../../src/modules/reports/generators/name-change.generator.js';
import type { ReportScoreContext } from '../../src/modules/reports/report-generator.types.js';

// =============================================================================
// Audit item NM5 (docs/engine-audit/C-critical-corrections.md)
// =============================================================================
// The person's name and date of birth reach these two reports through a
// best-effort lookup that returns nulls when it fails. The scores then fell
// back to "Unknown" and 1 January 1970, and a paid report was written from
// them as if they were the buyer's own numbers. The scores must say which
// input was missing, and no narrative may be written from a stand-in.
// =============================================================================

const ctx = (over: Partial<ReportScoreContext> = {}): ReportScoreContext => ({
  chart: null,
  personName: 'Asha Rao',
  personDob: '1990-05-20',
  personGender: 'female',
  ...over,
});

describe('[NM5] numerology never passes a stand-in name or date off as the person’s', () => {
  it('complete inputs: nothing is reported missing', () => {
    expect(computeNumerologyScores(ctx(), null).missingInputs).toEqual([]);
    expect(computeNameChangeScores(ctx(), null).missingInputs).toEqual([]);
  });

  it('a missing or unreadable date of birth is reported', () => {
    expect(computeNumerologyScores(ctx({ personDob: null }), null).missingInputs).toEqual(['dob']);
    expect(computeNumerologyScores(ctx({ personDob: 'not-a-date' }), null).missingInputs).toEqual([
      'dob',
    ]);
    expect(computeNameChangeScores(ctx({ personDob: null }), null).missingInputs).toEqual(['dob']);
  });

  it('a missing or blank name is reported', () => {
    expect(computeNumerologyScores(ctx({ personName: '  ' }), null).missingInputs).toEqual([
      'name',
    ]);
    expect(computeNameChangeScores(ctx({ personName: null }), null).missingInputs).toEqual([
      'name',
    ]);
  });

  it('no narrative is written when an input is missing (the purchase is retried, then refunded)', async () => {
    const numerology = computeNumerologyScores(ctx({ personDob: null }), null);
    await expect(numerologyGenerator.generateNarrative(numerology as never, 'en')).rejects.toThrow(
      /date of birth/,
    );

    const nameChange = computeNameChangeScores(ctx({ personName: null }), null);
    await expect(nameChangeGenerator.generateNarrative(nameChange as never, 'en')).rejects.toThrow(
      /name/,
    );

    expect(narrate.numerology).not.toHaveBeenCalled();
    expect(narrate.nameChange).not.toHaveBeenCalled();
  });
});
