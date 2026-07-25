import { describe, expect, it } from 'vitest';
import { computeHealthMonthlyScores } from '../src/lib/astro-engine/reports/health-monthly.js';

const MS_PER_DAY = 86_400_000;
const UNIX_EPOCH_JD = 2440587.5;
function dateToJd(date: Date): number {
  return date.getTime() / MS_PER_DAY + UNIX_EPOCH_JD;
}

function makeChart(): Record<string, unknown> {
  return {
    julianDay: dateToJd(new Date(Date.now() - 5 * 365.25 * MS_PER_DAY)),
    planets: [{ planet: 'Moon', longitude: 80.5 }], // Punarvasu => Jupiter starting Mahadasha
    houses: [],
  };
}

describe('computeHealthMonthlyScores', () => {
  it('reports the correct key houses (6th ailments/obstacles + 1st vitality)', () => {
    const scores = computeHealthMonthlyScores({ chart: makeChart(), partnerChart: null }, '2027-01');
    expect(scores.keyHouses).toEqual([6, 1]);
  });

  it('echoes back the given periodMonth', () => {
    const scores = computeHealthMonthlyScores({ chart: makeChart(), partnerChart: null }, '2027-01');
    expect(scores.periodMonth).toBe('2027-01');
  });

  it('resolves activeMahadashaLord/activeAntardashaLord from the dasha tree', () => {
    const scores = computeHealthMonthlyScores({ chart: makeChart(), partnerChart: null }, '2027-01');
    expect(typeof scores.activeMahadashaLord).toBe('string');
    expect(typeof scores.activeAntardashaLord).toBe('string');
    expect(scores.activeMahadashaLord).not.toBe('Unknown');
  });

  it('derives tone from monthScore via the shared threshold rule', () => {
    const scores = computeHealthMonthlyScores({ chart: makeChart(), partnerChart: null }, '2027-01');
    expect(['challenging', 'mixed', 'favorable']).toContain(scores.tone);
  });

  it('never throws and degrades gracefully when periodMonth is null', () => {
    expect(() => computeHealthMonthlyScores({ chart: makeChart(), partnerChart: null }, null)).not.toThrow();
    const scores = computeHealthMonthlyScores({ chart: makeChart(), partnerChart: null }, null);
    expect(scores.activeMahadashaLord).toBe('Unknown');
    expect(scores.monthScore).toBe(50);
    expect(scores.tone).toBe('mixed');
  });

  it('never throws and degrades gracefully on a null chart', () => {
    expect(() => computeHealthMonthlyScores({ chart: null, partnerChart: null }, '2027-01')).not.toThrow();
    const scores = computeHealthMonthlyScores({ chart: null, partnerChart: null }, '2027-01');
    expect(scores.activeMahadashaLord).toBe('Unknown');
  });
});
