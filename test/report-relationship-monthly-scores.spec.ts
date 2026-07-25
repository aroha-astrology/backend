import { describe, expect, it } from 'vitest';
import { computeRelationshipMonthlyScores } from '../src/lib/astro-engine/reports/relationship-monthly.js';

const MS_PER_DAY = 86_400_000;
const UNIX_EPOCH_JD = 2440587.5;
function dateToJd(date: Date): number {
  return date.getTime() / MS_PER_DAY + UNIX_EPOCH_JD;
}

function makeChart(): Record<string, unknown> {
  return {
    julianDay: dateToJd(new Date(Date.now() - 5 * 365.25 * MS_PER_DAY)),
    planets: [{ planet: 'Moon', longitude: 80.5 }],
    houses: [],
  };
}

describe('computeRelationshipMonthlyScores', () => {
  it('reports the correct key houses (7th partnership + 5th romance/harmony)', () => {
    const scores = computeRelationshipMonthlyScores({ chart: makeChart(), partnerChart: null }, '2027-01');
    expect(scores.keyHouses).toEqual([7, 5]);
  });

  it('echoes back the given periodMonth', () => {
    const scores = computeRelationshipMonthlyScores({ chart: makeChart(), partnerChart: null }, '2027-01');
    expect(scores.periodMonth).toBe('2027-01');
  });

  it('resolves activeMahadashaLord/activeAntardashaLord from the dasha tree', () => {
    const scores = computeRelationshipMonthlyScores({ chart: makeChart(), partnerChart: null }, '2027-01');
    expect(scores.activeMahadashaLord).not.toBe('Unknown');
    expect(typeof scores.activeAntardashaLord).toBe('string');
  });

  it('derives tone from monthScore via the shared threshold rule', () => {
    const scores = computeRelationshipMonthlyScores({ chart: makeChart(), partnerChart: null }, '2027-01');
    expect(['challenging', 'mixed', 'favorable']).toContain(scores.tone);
  });

  it('never throws and degrades gracefully when periodMonth is null', () => {
    expect(() =>
      computeRelationshipMonthlyScores({ chart: makeChart(), partnerChart: null }, null),
    ).not.toThrow();
    const scores = computeRelationshipMonthlyScores({ chart: makeChart(), partnerChart: null }, null);
    expect(scores.activeMahadashaLord).toBe('Unknown');
    expect(scores.monthScore).toBe(50);
  });

  it('never throws on a null chart', () => {
    expect(() =>
      computeRelationshipMonthlyScores({ chart: null, partnerChart: null }, '2027-01'),
    ).not.toThrow();
  });
});
