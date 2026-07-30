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
  it('reports the correct key houses (6th ailments/obstacles + 1st vitality + 8th longevity/transformation)', () => {
    const scores = computeHealthMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(scores.keyHouses).toEqual([6, 1, 8]);
  });

  it('echoes back the given periodMonth', () => {
    const scores = computeHealthMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(scores.periodMonth).toBe('2027-01');
  });

  it('resolves activeMahadashaLord/activeAntardashaLord from the dasha tree', () => {
    const scores = computeHealthMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(typeof scores.activeMahadashaLord).toBe('string');
    expect(typeof scores.activeAntardashaLord).toBe('string');
    expect(scores.activeMahadashaLord).not.toBe('Unknown');
  });

  it('derives tone from monthScore via the shared threshold rule', () => {
    const scores = computeHealthMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(['challenging', 'mixed', 'favorable']).toContain(scores.tone);
  });

  it('never throws and degrades gracefully when periodMonth is null', () => {
    expect(() =>
      computeHealthMonthlyScores({ chart: makeChart(), partnerChart: null }, null),
    ).not.toThrow();
    const scores = computeHealthMonthlyScores({ chart: makeChart(), partnerChart: null }, null);
    expect(scores.activeMahadashaLord).toBe('Unknown');
    expect(scores.monthScore).toBe(50);
    expect(scores.tone).toBe('mixed');
  });

  it('never throws and degrades gracefully on a null chart', () => {
    expect(() =>
      computeHealthMonthlyScores({ chart: null, partnerChart: null }, '2027-01'),
    ).not.toThrow();
    const scores = computeHealthMonthlyScores({ chart: null, partnerChart: null }, '2027-01');
    expect(scores.activeMahadashaLord).toBe('Unknown');
  });

  it('degrades doshaYoga to empty positives/cautions when doshaData/yogaData are missing', () => {
    const scores = computeHealthMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    expect(scores.doshaYoga).toEqual({ positives: [], cautions: [] });
  });

  it('never throws when doshaData/yogaData are explicitly null', () => {
    expect(() =>
      computeHealthMonthlyScores(
        { chart: makeChart(), partnerChart: null, doshaData: null, yogaData: null },
        '2027-01',
      ),
    ).not.toThrow();
  });

  it('surfaces present Kemdruma/Sade Sati/Grahan doshas as doshaYoga cautions', () => {
    const scores = computeHealthMonthlyScores(
      {
        chart: makeChart(),
        partnerChart: null,
        doshaData: {
          kemDruma: { present: true, severity: 'moderate' },
          sadeSati: { active: true, phase: 'peak', severity: 'high' },
          grahan: { present: true, type: 'lunar', severity: 'low' },
          mangal: { present: true, severity: 'high', type: 'standard' }, // irrelevant to health, must be ignored
        },
      },
      '2027-01',
    );
    expect(scores.doshaYoga.cautions).toEqual([
      { label: 'Kemdruma Dosha', detail: 'moderate severity' },
      { label: 'Sade Sati', detail: 'peak phase, high severity' },
      { label: 'Grahan Dosha', detail: 'lunar, low severity' },
    ]);
  });

  it('never surfaces a positive dosha/yoga panel entry (health report checks no yoga types)', () => {
    const scores = computeHealthMonthlyScores(
      {
        chart: makeChart(),
        partnerChart: null,
        yogaData: { yogas: [{ type: 'raja', name: 'Raja Yoga', present: true, description: 'x' }] },
      },
      '2027-01',
    );
    expect(scores.doshaYoga.positives).toEqual([]);
  });
});

describe('computeHealthMonthlyScores — subPeriods & connectedHouses (which specific weeks/areas)', () => {
  it('includes at least one within-month sub-period, each scored', () => {
    const scores = computeHealthMonthlyScores(
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
    const scores = computeHealthMonthlyScores({ chart: makeChart(), partnerChart: null }, null);
    expect(scores.subPeriods).toEqual([]);
  });

  it("reports connectedHouses as a subset of the report's own keyHouses", () => {
    const scores = computeHealthMonthlyScores(
      { chart: makeChart(), partnerChart: null },
      '2027-01',
    );
    for (const h of scores.connectedHouses) {
      expect(scores.keyHouses).toContain(h);
    }
  });
});
