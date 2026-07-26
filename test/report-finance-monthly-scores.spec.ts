import { describe, expect, it } from 'vitest';
import { computeFinanceMonthlyScores } from '../src/lib/astro-engine/reports/finance-monthly.js';

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

describe('computeFinanceMonthlyScores', () => {
  it('reports the correct key houses (2nd accumulated wealth + 11th monthly gains)', () => {
    const scores = computeFinanceMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(scores.keyHouses).toEqual([2, 11]);
  });

  it('echoes back the given periodMonth', () => {
    const scores = computeFinanceMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(scores.periodMonth).toBe('2027-01');
  });

  it('resolves activeMahadashaLord/activeAntardashaLord from the dasha tree', () => {
    const scores = computeFinanceMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(scores.activeMahadashaLord).not.toBe('Unknown');
    expect(typeof scores.activeAntardashaLord).toBe('string');
  });

  it('derives tone from monthScore via the shared threshold rule', () => {
    const scores = computeFinanceMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(['challenging', 'mixed', 'favorable']).toContain(scores.tone);
  });

  it('never throws and degrades gracefully when periodMonth is null', () => {
    expect(() =>
      computeFinanceMonthlyScores({ chart: makeChart(), partnerChart: null }, null),
    ).not.toThrow();
    const scores = computeFinanceMonthlyScores({ chart: makeChart(), partnerChart: null }, null);
    expect(scores.activeMahadashaLord).toBe('Unknown');
    expect(scores.monthScore).toBe(50);
  });

  it('never throws on a null chart', () => {
    expect(() =>
      computeFinanceMonthlyScores({ chart: null, partnerChart: null }, '2027-01'),
    ).not.toThrow();
  });
});

describe('computeFinanceMonthlyScores — doshaYoga', () => {
  it('surfaces a present Dhana yoga positive', () => {
    const yogaData = {
      yogas: [
        {
          type: 'dhana',
          name: 'Dhana Yoga',
          present: true,
          description: 'Wealth-giving combination.',
        },
      ],
    };
    const scores = computeFinanceMonthlyScores(
      { chart: makeChart(), partnerChart: null, yogaData },
      '2027-01',
    );
    expect(scores.doshaYoga).toEqual({
      positives: [{ label: 'Dhana Yoga', detail: 'Wealth-giving combination.' }],
      cautions: [],
    });
  });

  it('ignores a present yoga that is not dhana', () => {
    const yogaData = {
      yogas: [{ type: 'raja', name: 'Raja Yoga', present: true, description: 'x' }],
    };
    const scores = computeFinanceMonthlyScores(
      { chart: makeChart(), partnerChart: null, yogaData },
      '2027-01',
    );
    expect(scores.doshaYoga).toEqual({ positives: [], cautions: [] });
  });

  it('never surfaces a caution — no dosha keys are configured at monthly scope', () => {
    const doshaData = { mangal: { present: true, severity: 'high', type: 'uncancelled' } };
    const scores = computeFinanceMonthlyScores(
      { chart: makeChart(), partnerChart: null, doshaData },
      '2027-01',
    );
    expect(scores.doshaYoga.cautions).toEqual([]);
  });

  it('degrades to empty positives/cautions when doshaData/yogaData are missing or null (never throws)', () => {
    expect(() =>
      computeFinanceMonthlyScores({ chart: makeChart(), partnerChart: null }, '2027-01'),
    ).not.toThrow();
    const scores = computeFinanceMonthlyScores(
      { chart: makeChart(), partnerChart: null, doshaData: null, yogaData: null },
      '2027-01',
    );
    expect(scores.doshaYoga).toEqual({ positives: [], cautions: [] });
  });

  it('never throws on a null chart, even with doshaData/yogaData present', () => {
    const doshaData = { mangal: { present: true } };
    const yogaData = {
      yogas: [{ type: 'dhana', name: 'Dhana Yoga', present: true, description: 'x' }],
    };
    expect(() =>
      computeFinanceMonthlyScores(
        { chart: null, partnerChart: null, doshaData, yogaData },
        '2027-01',
      ),
    ).not.toThrow();
  });
});
