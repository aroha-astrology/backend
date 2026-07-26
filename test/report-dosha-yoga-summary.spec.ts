import { describe, expect, it } from 'vitest';
import { computeDoshaYogaSummary } from '../src/lib/astro-engine/reports/report-dosha-yoga-summary.js';

describe('computeDoshaYogaSummary — cautions (doshas)', () => {
  it('pushes a caution for a present dosha (standard `.present` field)', () => {
    const doshaData = { mangal: { present: true, severity: 'high', type: 'uncancelled' } };
    const result = computeDoshaYogaSummary(doshaData, null, ['mangal'], []);
    expect(result.cautions).toEqual([
      { label: 'Mangal Dosha', detail: 'high severity, uncancelled type' },
    ]);
  });

  it('does not push a caution for a dosha that is present: false', () => {
    const doshaData = { mangal: { present: false } };
    const result = computeDoshaYogaSummary(doshaData, null, ['mangal'], []);
    expect(result.cautions).toEqual([]);
  });

  it('reads sadeSati presence via `.active`, not `.present` (the one dosha with a different field)', () => {
    const doshaData = { sadeSati: { active: true, phase: 'peak', severity: 'moderate' } };
    const result = computeDoshaYogaSummary(doshaData, null, ['sadeSati'], []);
    expect(result.cautions).toEqual([
      { label: 'Sade Sati', detail: 'peak phase, moderate severity' },
    ]);
  });

  it('does not push a caution for sadeSati when only `.present` (not `.active`) happens to be true', () => {
    const doshaData = {
      sadeSati: { present: true, active: false, phase: 'peak', severity: 'moderate' },
    };
    const result = computeDoshaYogaSummary(doshaData, null, ['sadeSati'], []);
    expect(result.cautions).toEqual([]);
  });

  it('includes the isPartial qualifier for a present Kaal Sarp Dosha', () => {
    const doshaData = {
      kaalSarp: { present: true, name: 'Anant Kaal Sarp', severity: 'high', isPartial: true },
    };
    const result = computeDoshaYogaSummary(doshaData, null, ['kaalSarp'], []);
    expect(result.cautions).toEqual([
      { label: 'Kaal Sarp Dosha', detail: 'Anant Kaal Sarp, high severity, partial' },
    ]);
  });

  it('only surfaces doshas listed in relevantDoshaKeys, ignoring others present in doshaData', () => {
    const doshaData = {
      mangal: { present: true, severity: 'low', type: 'cancelled' },
      pitra: { present: true, severity: 'high' },
    };
    const result = computeDoshaYogaSummary(doshaData, null, ['mangal'], []);
    expect(result.cautions).toHaveLength(1);
    expect(result.cautions[0]!.label).toBe('Mangal Dosha');
  });

  it('ignores an unrecognized dosha key rather than throwing', () => {
    const doshaData = { mangal: { present: true, severity: 'low', type: 'cancelled' } };
    expect(() =>
      computeDoshaYogaSummary(doshaData, null, ['notARealDosha', 'mangal'], []),
    ).not.toThrow();
    const result = computeDoshaYogaSummary(doshaData, null, ['notARealDosha', 'mangal'], []);
    expect(result.cautions).toHaveLength(1);
  });

  it('handles all 7 traditional doshas present, each with correct field mapping', () => {
    const doshaData = {
      mangal: { present: true, severity: 'high', type: 'uncancelled' },
      kaalSarp: { present: true, name: 'Vasuki', severity: 'medium', isPartial: false },
      sadeSati: { active: true, phase: 'rising', severity: 'low' },
      pitra: { present: true, severity: 'high', indicators: ['x'] },
      kemDruma: { present: true, severity: 'low', cancellations: [] },
      grahan: { present: true, type: 'solar', severity: 'medium' },
      guruChandal: { present: true, house: 5, severity: 'high' },
    };
    const keys = ['mangal', 'kaalSarp', 'sadeSati', 'pitra', 'kemDruma', 'grahan', 'guruChandal'];
    const result = computeDoshaYogaSummary(doshaData, null, keys, []);
    expect(result.cautions).toHaveLength(7);
    expect(result.cautions.map((c) => c.label)).toEqual([
      'Mangal Dosha',
      'Kaal Sarp Dosha',
      'Sade Sati',
      'Pitra Dosha',
      'Kemdruma Dosha',
      'Grahan Dosha',
      'Guru Chandal Dosha',
    ]);
  });
});

describe('computeDoshaYogaSummary — positives (yogas)', () => {
  it('pushes a present yoga of a relevant type', () => {
    const yogaData = {
      yogas: [
        {
          type: 'raja',
          name: 'Raja Yoga',
          present: true,
          strength: 80,
          description: 'Powerful raja yoga',
        },
      ],
    };
    const result = computeDoshaYogaSummary(null, yogaData, [], ['raja']);
    expect(result.positives).toEqual([{ label: 'Raja Yoga', detail: 'Powerful raja yoga' }]);
  });

  it('excludes a present yoga whose type is not in relevantYogaTypes', () => {
    const yogaData = {
      yogas: [{ type: 'dosha', name: 'Some Dosha Yoga', present: true, description: 'x' }],
    };
    const result = computeDoshaYogaSummary(null, yogaData, [], ['raja', 'dhana']);
    expect(result.positives).toEqual([]);
  });

  it('excludes a yoga of a relevant type that is not present', () => {
    const yogaData = {
      yogas: [{ type: 'raja', name: 'Raja Yoga', present: false, description: 'x' }],
    };
    const result = computeDoshaYogaSummary(null, yogaData, [], ['raja']);
    expect(result.positives).toEqual([]);
  });

  it('includes multiple present yogas of different relevant types', () => {
    const yogaData = {
      yogas: [
        { type: 'raja', name: 'Raja Yoga', present: true, description: 'a' },
        { type: 'dhana', name: 'Dhana Yoga', present: true, description: 'b' },
        { type: 'mahapurusha', name: 'Ruchaka Yoga', present: true, description: 'c' },
      ],
    };
    const result = computeDoshaYogaSummary(null, yogaData, [], ['raja', 'dhana']);
    expect(result.positives).toEqual([
      { label: 'Raja Yoga', detail: 'a' },
      { label: 'Dhana Yoga', detail: 'b' },
    ]);
  });
});

describe('computeDoshaYogaSummary — defensive handling', () => {
  it('returns empty arrays for null doshaData and null yogaData', () => {
    const result = computeDoshaYogaSummary(null, null, ['mangal'], ['raja']);
    expect(result).toEqual({ positives: [], cautions: [] });
  });

  it('does not throw when yogaData.yogas is missing or malformed', () => {
    expect(() => computeDoshaYogaSummary(null, {}, [], ['raja'])).not.toThrow();
    expect(() =>
      computeDoshaYogaSummary(null, { yogas: 'not-an-array' }, [], ['raja']),
    ).not.toThrow();
    expect(
      computeDoshaYogaSummary(null, { yogas: 'not-an-array' }, [], ['raja']).positives,
    ).toEqual([]);
  });

  it('does not throw when a relevant dosha key maps to a non-object value', () => {
    expect(() =>
      computeDoshaYogaSummary({ mangal: 'not-an-object' }, null, ['mangal'], []),
    ).not.toThrow();
    expect(
      computeDoshaYogaSummary({ mangal: 'not-an-object' }, null, ['mangal'], []).cautions,
    ).toEqual([]);
  });

  it('does not throw when a relevant dosha key is entirely absent from doshaData', () => {
    expect(() => computeDoshaYogaSummary({}, null, ['mangal'], [])).not.toThrow();
    expect(computeDoshaYogaSummary({}, null, ['mangal'], []).cautions).toEqual([]);
  });
});
