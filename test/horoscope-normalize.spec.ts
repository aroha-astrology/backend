import { describe, it, expect } from 'vitest';
import { toHoroscopeDto } from '../src/modules/horoscope/horoscope.service.js';
import type { DailyHoroscopeRow, StructuredHoroscope } from '../src/db/schema.js';

function rowWith(structured: StructuredHoroscope | null): DailyHoroscopeRow {
  return {
    id: 'row-1',
    userId: 'user-1',
    forDate: '2026-07-06',
    period: 'daily',
    periodKey: '2026-07-06',
    status: 'ready',
    summary: 'Legacy summary',
    monthlyBreakdown: null,
    structured,
    model: 'stub',
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as DailyHoroscopeRow;
}

describe('toHoroscopeDto: backward-compat normalization', () => {
  it('backfills categories for a pre-category-ratings row (no categories field at all)', () => {
    const legacy = {
      hook: 'Old hook',
      description: 'Old description',
      advice: 'Old advice',
      quality: 'good',
      score: 4,
      luckyColor: 'blue',
      luckyNumber: 3,
    } as unknown as StructuredHoroscope; // simulates a DB row from before categories existed

    const dto = toHoroscopeDto(rowWith(legacy));
    expect(dto.structured).toBeDefined();
    expect(dto.structured!.categories.overall.hook).toBe('Old hook');
    expect(dto.structured!.categories.finance.hook).toBe('Old hook');
    expect(dto.structured!.categories.education.score).toBe(4);
  });

  it('backfills only finance/education for a row from the first category rollout (4 categories only)', () => {
    const fourCategoryRow = {
      hook: 'h',
      description: 'd',
      advice: 'a',
      quality: 'moderate',
      score: 3,
      luckyColor: 'green',
      luckyNumber: 5,
      categories: {
        overall: {
          hook: 'Overall hook',
          description: 'd',
          advice: 'a',
          quality: 'moderate',
          score: 3,
        },
        health: { hook: 'Health hook', description: 'd', advice: 'a', quality: 'good', score: 4 },
        career: { hook: 'Career hook', description: 'd', advice: 'a', quality: 'good', score: 4 },
        marriage: {
          hook: 'Marriage hook',
          description: 'd',
          advice: 'a',
          quality: 'moderate',
          score: 3,
        },
      },
    } as unknown as StructuredHoroscope;

    const dto = toHoroscopeDto(rowWith(fourCategoryRow));
    expect(dto.structured!.categories.health.hook).toBe('Health hook');
    // finance/education are missing on this row — backfilled from the legacy top-level fields.
    expect(dto.structured!.categories.finance.hook).toBe('h');
    expect(dto.structured!.categories.education.hook).toBe('h');
  });

  it('passes a fully-populated 6-category row through unchanged', () => {
    const reading = { hook: 'x', description: 'd', advice: 'a', quality: 'good', score: 4 };
    const full = {
      hook: 'x',
      description: 'd',
      advice: 'a',
      quality: 'good',
      score: 4,
      luckyColor: 'red',
      luckyNumber: 1,
      categories: {
        overall: reading,
        health: reading,
        career: reading,
        marriage: reading,
        finance: { ...reading, hook: 'Finance-specific hook' },
        education: reading,
      },
    } as unknown as StructuredHoroscope;

    const dto = toHoroscopeDto(rowWith(full));
    expect(dto.structured!.categories.finance.hook).toBe('Finance-specific hook');
  });

  it('leaves structured undefined when the row has none (still-generating/never-run row)', () => {
    const dto = toHoroscopeDto(rowWith(null));
    expect(dto.structured).toBeUndefined();
  });
});
