import { describe, expect, it } from 'vitest';
import { computeScoresWithCondition } from '../src/modules/reports/reports.service.js';
import { REPORT_CATALOGUE } from '../src/config/reports.js';
import { approximateBirthTimeGuidance } from '../src/lib/birth-time-window.js';
import { buildProfileFacts } from '../src/lib/chat-grounding.js';
import type { ReportScoreContext } from '../src/modules/reports/report-generator.types.js';

// Audit Sprint 5, M6: chat told the model to hedge an APPROXIMATE birth time; reports hedged only
// an unknown one, so the 58 account owners and 2 family profiles who gave a remembered time got
// the Ascendant, houses, divisional charts and exact dasha dates narrated as certain. One shared
// test over every report type (fix-once-for-every-report): all go through computeScoresWithCondition.

const generator = { computeScores: () => ({ marker: 1 }) } as never;

function ctx(extra: Partial<ReportScoreContext>): ReportScoreContext {
  return { chart: null, ...extra };
}

function lines(scores: unknown): string[] {
  return (scores as { planetCondition?: string[] }).planetCondition ?? [];
}

describe('M6: an approximate birth time is hedged in every report', () => {
  it('the catalogue still has the 16 report types this test must cover', () => {
    expect(REPORT_CATALOGUE.length).toBe(16);
  });

  it.each(REPORT_CATALOGUE.map((r) => r.key))(
    '%s: the reader’s approximate time reaches the facts and the verdict',
    (reportKey) => {
      const scores = computeScoresWithCondition(
        generator,
        ctx({ personBirthTimeAccuracy: 'approximate', personTimeOfBirth: '09:30' }),
        null,
        reportKey,
      ) as Record<string, unknown>;
      expect(lines(scores).some((l) => l.startsWith('BIRTH TIME CONFIDENCE: approximate'))).toBe(
        true,
      );
      // Also its own score key, which the separate verdict call serialises.
      expect(String(scores.birthTimeCaveat)).toContain('BIRTH TIME CONFIDENCE: approximate');
    },
  );

  it('labels the partner’s approximate time PARTNER on a compatibility purchase', () => {
    const scores = computeScoresWithCondition(
      generator,
      ctx({ partnerBirthTimeAccuracy: 'approximate', partnerTimeOfBirth: '14:00' }),
      null,
      'kundli_milan',
    ) as Record<string, unknown>;
    expect(lines(scores).some((l) => l.startsWith('PARTNER — BIRTH TIME CONFIDENCE'))).toBe(true);
    expect(String(scores.partnerBirthTimeCaveat)).toContain('PARTNER — BIRTH TIME CONFIDENCE');
  });

  it('adds nothing for an exact time, and keeps the stronger unknown wording for unknown', () => {
    const exact = computeScoresWithCondition(
      generator,
      ctx({ personBirthTimeAccuracy: 'exact', personTimeOfBirth: '09:30' }),
      null,
      'wealth',
    );
    expect(JSON.stringify(lines(exact))).not.toMatch(/BIRTH TIME/);

    const unknown = computeScoresWithCondition(
      generator,
      ctx({ personBirthTimeAccuracy: 'unknown', personTimeOfBirth: '09:00' }),
      null,
      'wealth',
    );
    expect(lines(unknown).some((l) => l.startsWith('BIRTH TIME NOT KNOWN'))).toBe(true);
    expect(JSON.stringify(lines(unknown))).not.toMatch(/BIRTH TIME CONFIDENCE/);
  });

  it('is the same wording chat uses (one definition, so chat and reports cannot drift)', () => {
    const chat = buildProfileFacts({ birthTimeAccuracy: 'approximate' }, {}).find((l) =>
      l.startsWith('BIRTH TIME CONFIDENCE'),
    );
    expect(chat).toBe(approximateBirthTimeGuidance());
  });
});
