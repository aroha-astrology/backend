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
    const scores = computeCareerMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(scores.keyHouses).toEqual([10, 6]);
  });

  it('echoes back the given periodMonth', () => {
    const scores = computeCareerMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(scores.periodMonth).toBe('2027-01');
  });

  it('resolves activeMahadashaLord/activeAntardashaLord from the dasha tree', () => {
    const scores = computeCareerMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(scores.activeMahadashaLord).not.toBe('Unknown');
    expect(typeof scores.activeAntardashaLord).toBe('string');
  });

  it('derives tone from monthScore via the shared threshold rule', () => {
    const scores = computeCareerMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(['challenging', 'mixed', 'favorable']).toContain(scores.tone);
  });

  it('never throws and degrades gracefully when periodMonth is null', () => {
    expect(() =>
      computeCareerMonthlyScores({ chart: makeChart(), partnerChart: null }, null),
    ).not.toThrow();
    const scores = computeCareerMonthlyScores({ chart: makeChart(), partnerChart: null }, null);
    expect(scores.activeMahadashaLord).toBe('Unknown');
    expect(scores.monthScore).toBe(50);
  });

  it('never throws on a null chart', () => {
    expect(() =>
      computeCareerMonthlyScores({ chart: null, partnerChart: null }, '2027-01'),
    ).not.toThrow();
  });

  it('computes a workArchetype with 5 order-matched trait tilts', () => {
    const scores = computeCareerMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(scores.workArchetype.label).toBe('Work Style Archetype');
    expect(typeof scores.workArchetype.description).toBe('string');
    expect(scores.workArchetype.traits).toHaveLength(5);
    expect(scores.workArchetype.traits.map((t) => t.label)).toEqual([
      'Discipline',
      'Ambition',
      'Creativity',
      'Risk-tolerance',
      'Collaboration',
    ]);
    for (const trait of scores.workArchetype.traits) {
      expect(trait.score).toBeGreaterThanOrEqual(0);
      expect(trait.score).toBeLessThanOrEqual(10);
    }
  });

  it('degrades workArchetype gracefully when the chart has no 10th-house sign', () => {
    const scores = computeCareerMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(() => scores.workArchetype).not.toThrow();
    expect(typeof scores.workArchetype.description).toBe('string');
  });

  it('degrades doshaYoga to empty positives/cautions when doshaData/yogaData are missing', () => {
    const scores = computeCareerMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(scores.doshaYoga).toEqual({ positives: [], cautions: [] });
  });

  it('never throws when doshaData/yogaData are explicitly null', () => {
    expect(() =>
      computeCareerMonthlyScores(
        { chart: makeChart(), partnerChart: null, doshaData: null, yogaData: null },
        '2027-01',
      ),
    ).not.toThrow();
  });

  it('surfaces a present Raja Yoga as a doshaYoga positive', () => {
    const scores = computeCareerMonthlyScores(
      {
        chart: makeChart(),
        partnerChart: null,
        yogaData: {
          yogas: [
            {
              type: 'raja',
              name: 'Raja Yoga',
              present: true,
              strength: 'strong',
              description: 'Status-elevating combination.',
            },
            {
              type: 'dhana',
              name: 'Dhana Yoga',
              present: true,
              description: 'Wealth combination (irrelevant here).',
            },
          ],
        },
      },
      '2027-01',
    );
    expect(scores.doshaYoga.positives).toEqual([
      { label: 'Raja Yoga', detail: 'Status-elevating combination.' },
    ]);
  });

  it('degrades industryFit to an empty list with a note when the chart has no 10th-house lord', () => {
    const scores = computeCareerMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(scores.industryFit.likelyIndustries).toEqual([]);
    expect(scores.industryFit.note).toContain('10th-house lord is unavailable');
  });

  it('looks up industryFit from the 10th-house lord planet', () => {
    const chart = { ...makeChart(), houses: [{ house: 10, lord: 'Mercury', sign: 'Gemini' }] };
    const scores = computeCareerMonthlyScores({ chart, partnerChart: null }, '2027-01');
    expect(scores.industryFit.likelyIndustries).toEqual([
      'communication',
      'writing',
      'trade',
      'analytics',
    ]);
    expect(scores.industryFit.note).toContain('Mercury');
  });

  it('flags Rahu/Ketu 10th-house lords as an unconventional pairing', () => {
    const chart = { ...makeChart(), houses: [{ house: 10, lord: 'Rahu', sign: 'Aquarius' }] };
    const scores = computeCareerMonthlyScores({ chart, partnerChart: null }, '2027-01');
    expect(scores.industryFit.likelyIndustries.length).toBeGreaterThan(0);
    expect(scores.industryFit.note.toLowerCase()).toContain('unconventional');
  });

  it('includes at least one within-month sub-period, each scored — answers "specific dates this month best for career moves"', () => {
    const scores = computeCareerMonthlyScores(
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
    const scores = computeCareerMonthlyScores({ chart: makeChart(), partnerChart: null }, null);
    expect(scores.subPeriods).toEqual([]);
  });
});
