import { describe, expect, it } from 'vitest';
import { computeCareerMonthlyScores } from '../src/lib/astro-engine/reports/career-monthly.js';

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

describe('computeCareerMonthlyScores', () => {
  it('reports the correct key houses (10th career/status + 6th daily work/service)', () => {
    const scores = computeCareerMonthlyScores({ chart: makeChart(), partnerChart: null }, '2027-01');
    expect(scores.keyHouses).toEqual([10, 6]);
  });

  it('echoes back the given periodMonth', () => {
    const scores = computeCareerMonthlyScores({ chart: makeChart(), partnerChart: null }, '2027-01');
    expect(scores.periodMonth).toBe('2027-01');
  });

  it('resolves activeMahadashaLord/activeAntardashaLord from the dasha tree', () => {
    const scores = computeCareerMonthlyScores({ chart: makeChart(), partnerChart: null }, '2027-01');
    expect(scores.activeMahadashaLord).not.toBe('Unknown');
    expect(typeof scores.activeAntardashaLord).toBe('string');
  });

  it('derives tone from monthScore via the shared threshold rule', () => {
    const scores = computeCareerMonthlyScores({ chart: makeChart(), partnerChart: null }, '2027-01');
    expect(['challenging', 'mixed', 'favorable']).toContain(scores.tone);
  });

  it('never throws and degrades gracefully when periodMonth is null', () => {
    expect(() => computeCareerMonthlyScores({ chart: makeChart(), partnerChart: null }, null)).not.toThrow();
    const scores = computeCareerMonthlyScores({ chart: makeChart(), partnerChart: null }, null);
    expect(scores.activeMahadashaLord).toBe('Unknown');
    expect(scores.monthScore).toBe(50);
  });

  it('never throws on a null chart', () => {
    expect(() => computeCareerMonthlyScores({ chart: null, partnerChart: null }, '2027-01')).not.toThrow();
  });
});
