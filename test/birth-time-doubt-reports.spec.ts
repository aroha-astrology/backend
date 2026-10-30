import { describe, it, expect } from 'vitest';
import { computeScoresWithCondition } from '../src/modules/reports/reports.service.js';
import type { ReportScoreContext } from '../src/modules/reports/report-generator.types.js';

/**
 * Sprint 3 / H3: every report type goes through computeScoresWithCondition (reports.service.ts), so
 * the Moon-doubt and dasha-margin lines are added there once and reach all of them, the same
 * lines chat, voice and the horoscope get from birthTimeDoubtFacts.
 */
const generator = { computeScores: () => ({ marker: 1 }) } as never;

function ctxWith(extra: Partial<ReportScoreContext>): ReportScoreContext {
  return { chart: null, ...extra };
}

describe('reports: unknown birth time carries the Moon doubt and the dasha margin', () => {
  it('adds the reader lines to planetCondition and as their own score key', () => {
    const scores = computeScoresWithCondition(
      generator,
      ctxWith({
        personBirthTimeAccuracy: 'unknown',
        personTimeOfBirth: '09:00',
        personBirthTimeDoubt: ['BIRTH TIME DOUBT (Moon): x', 'DASHA MARGIN: y'],
      }),
      null,
      'wealth',
    ) as Record<string, unknown>;
    const lines = scores.planetCondition as string[];
    expect(lines.some((l) => l.startsWith('BIRTH TIME DOUBT (Moon)'))).toBe(true);
    expect(lines.some((l) => l.startsWith('DASHA MARGIN'))).toBe(true);
    expect(scores.birthTimeDoubt).toEqual(['BIRTH TIME DOUBT (Moon): x', 'DASHA MARGIN: y']);
  });

  it('labels the partner lines PARTNER on a compatibility purchase', () => {
    const scores = computeScoresWithCondition(
      generator,
      ctxWith({
        partnerBirthTimeAccuracy: 'unknown',
        partnerTimeOfBirth: '14:00',
        partnerBirthTimeDoubt: ['BIRTH TIME DOUBT (Moon): p'],
      }),
      null,
      'match_report',
    ) as Record<string, unknown>;
    const lines = scores.planetCondition as string[];
    expect(lines).toContain('PARTNER — BIRTH TIME DOUBT (Moon): p');
  });

  it('adds nothing for an exact-time reader', () => {
    const scores = computeScoresWithCondition(
      generator,
      ctxWith({ personBirthTimeAccuracy: 'exact', personTimeOfBirth: '09:00' }),
      null,
      'wealth',
    ) as Record<string, unknown>;
    expect(scores.birthTimeDoubt).toBeUndefined();
    expect(JSON.stringify(scores.planetCondition ?? [])).not.toMatch(/BIRTH TIME DOUBT/);
  });
});
