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
    const scores = computeRelationshipMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(scores.keyHouses).toEqual([7, 5]);
  });

  it('echoes back the given periodMonth', () => {
    const scores = computeRelationshipMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(scores.periodMonth).toBe('2027-01');
  });

  it('resolves activeMahadashaLord/activeAntardashaLord from the dasha tree', () => {
    const scores = computeRelationshipMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(scores.activeMahadashaLord).not.toBe('Unknown');
    expect(typeof scores.activeAntardashaLord).toBe('string');
  });

  it('derives tone from monthScore via the shared threshold rule', () => {
    const scores = computeRelationshipMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(['challenging', 'mixed', 'favorable']).toContain(scores.tone);
  });

  it('never throws and degrades gracefully when periodMonth is null', () => {
    expect(() =>
      computeRelationshipMonthlyScores({ chart: makeChart(), partnerChart: null }, null),
    ).not.toThrow();
    const scores = computeRelationshipMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      null,
    );
    expect(scores.activeMahadashaLord).toBe('Unknown');
    expect(scores.monthScore).toBe(50);
  });

  it('never throws on a null chart', () => {
    expect(() =>
      computeRelationshipMonthlyScores({ chart: null, partnerChart: null }, '2027-01'),
    ).not.toThrow();
  });
});

describe('computeRelationshipMonthlyScores — doshaYoga', () => {
  it('flags Mangal Dosha as a caution when present in doshaData (previously-missing gap-fill)', () => {
    const doshaData = { mangal: { present: true, severity: 'high', type: 'uncancelled' } };

    const scores = computeRelationshipMonthlyScores(
      { chart: makeChart(), partnerChart: null, doshaData },
      '2027-01',
    );

    expect(scores.doshaYoga.cautions).toHaveLength(1);
    expect(scores.doshaYoga.cautions[0]?.label).toBe('Mangal Dosha');
  });

  it('never surfaces any positives — this monthly report uses an empty yoga-type scope by design', () => {
    const yogaData = {
      yogas: [{ type: 'dhana', name: 'Some Yoga', present: true, strength: 50, description: 'd' }],
    };

    const scores = computeRelationshipMonthlyScores(
      { chart: makeChart(), partnerChart: null, yogaData },
      '2027-01',
    );

    expect(scores.doshaYoga.positives).toHaveLength(0);
  });

  it('never throws and degrades to empty cautions/positives when doshaData/yogaData are missing', () => {
    expect(() =>
      computeRelationshipMonthlyScores({ chart: makeChart(), partnerChart: null }, '2027-01'),
    ).not.toThrow();
    const scores = computeRelationshipMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(scores.doshaYoga).toEqual({ positives: [], cautions: [] });
  });

  it('never throws when doshaData/yogaData are explicitly null', () => {
    expect(() =>
      computeRelationshipMonthlyScores(
        { chart: makeChart(), partnerChart: null, doshaData: null, yogaData: null },
        '2027-01',
      ),
    ).not.toThrow();
  });

  it('never throws on a null chart even with doshaData present', () => {
    const doshaData = { mangal: { present: true, severity: 'high', type: 'uncancelled' } };
    expect(() =>
      computeRelationshipMonthlyScores({ chart: null, partnerChart: null, doshaData }, '2027-01'),
    ).not.toThrow();
  });

  it('includes at least one within-month sub-period, each scored — answers "specific days this month best for important relationship talks"', () => {
    const scores = computeRelationshipMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(scores.subPeriods.length).toBeGreaterThan(0);
    for (const slice of scores.subPeriods) {
      expect(typeof slice.lord).toBe('string');
      expect(slice.score).toBeGreaterThanOrEqual(0);
      expect(slice.score).toBeLessThanOrEqual(100);
    }
  });

  it('returns an empty subPeriods array (never throws) when periodMonth is null', () => {
    const scores = computeRelationshipMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      null,
    );
    expect(scores.subPeriods).toEqual([]);
  });
});
