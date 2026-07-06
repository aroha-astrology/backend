import { describe, it, expect } from 'vitest';
import {
  domainNudge,
  domainQuality,
  buildDomainHook,
  DOMAIN_HOUSE_OFFSET,
  DOMAIN_THEME,
  moonSignPrediction,
  moonSignWeeklyPrediction,
  moonSignMonthlyPrediction,
} from '../src/lib/astro-tools/daily-synthesis.js';

describe('daily-synthesis: domain category helpers', () => {
  it('maps domains to the correct house offsets (0-indexed from the sign)', () => {
    expect(DOMAIN_HOUSE_OFFSET.health).toBe(5); // 6th house
    expect(DOMAIN_HOUSE_OFFSET.marriage).toBe(6); // 7th house
    expect(DOMAIN_HOUSE_OFFSET.career).toBe(9); // 10th house
  });

  it('has a theme phrase for every domain', () => {
    expect(DOMAIN_THEME.health).toBeTruthy();
    expect(DOMAIN_THEME.career).toBeTruthy();
    expect(DOMAIN_THEME.marriage).toBeTruthy();
  });

  it('nudges +1 when a benefic tenants the domain house', () => {
    // Aries (signIndex 0), 10th house from Aries = Capricorn (signIndex 9).
    const transitSigns = { Jupiter: 9 };
    expect(domainNudge('career', 0, transitSigns)).toBe(1);
  });

  it('nudges -1 when a malefic tenants the domain house', () => {
    const transitSigns = { Saturn: 9 };
    expect(domainNudge('career', 0, transitSigns)).toBe(-1);
  });

  it('treats Sun as neutral (no nudge)', () => {
    const transitSigns = { Sun: 9 };
    expect(domainNudge('career', 0, transitSigns)).toBe(0);
  });

  it('sums nudges when multiple tracked planets share the domain house', () => {
    const transitSigns = { Jupiter: 9, Venus: 9 };
    expect(domainNudge('career', 0, transitSigns)).toBe(2);
  });

  it('returns 0 when nothing tenants the domain house', () => {
    const transitSigns = { Jupiter: 3 };
    expect(domainNudge('career', 0, transitSigns)).toBe(0);
  });

  it('buckets scores into the 4 quality levels', () => {
    expect(domainQuality(5)).toBe('good');
    expect(domainQuality(4)).toBe('good');
    expect(domainQuality(3)).toBe('moderate');
    expect(domainQuality(2)).toBe('challenging');
    expect(domainQuality(1)).toBe('avoid');
  });

  it('builds a deterministic hook that mentions the theme', () => {
    const hook = buildDomainHook('good', DOMAIN_THEME.health, 7);
    expect(hook).toContain(DOMAIN_THEME.health);
    // Same inputs always produce the same hook (traceable/cacheable).
    expect(buildDomainHook('good', DOMAIN_THEME.health, 7)).toBe(hook);
  });
});

describe('daily-synthesis: moonSignPrediction categories', () => {
  it('includes all 4 categories, each with a valid score/quality/hook/advice', async () => {
    const result = await moonSignPrediction(0, '2026-07-03T12:00:00Z');
    for (const key of ['overall', 'health', 'career', 'marriage'] as const) {
      const c = result.categories[key];
      expect(c.score).toBeGreaterThanOrEqual(1);
      expect(c.score).toBeLessThanOrEqual(5);
      expect(['good', 'moderate', 'challenging', 'avoid']).toContain(c.quality);
      expect(c.hook.length).toBeGreaterThan(0);
      expect(c.advice.length).toBeGreaterThan(0);
    }
  });

  it('derives overall.score as the average of health/career/marriage', async () => {
    const result = await moonSignPrediction(0, '2026-07-03T12:00:00Z');
    const { health, career, marriage, overall } = result.categories;
    const expected = Math.max(
      1,
      Math.min(5, Math.round((health.score + career.score + marriage.score) / 3)),
    );
    expect(overall.score).toBe(expected);
  });
});

describe('daily-synthesis: periodic categories', () => {
  it('weekly includes all 4 categories with non-empty descriptions', async () => {
    const result = await moonSignWeeklyPrediction(0);
    for (const key of ['overall', 'health', 'career', 'marriage'] as const) {
      const c = result.categories[key];
      expect(c.score).toBeGreaterThanOrEqual(1);
      expect(c.score).toBeLessThanOrEqual(5);
      expect(c.description.length).toBeGreaterThan(0);
    }
  });

  it('monthly descriptions are richer (longer) than weekly ones', async () => {
    const weekly = await moonSignWeeklyPrediction(0);
    const monthly = await moonSignMonthlyPrediction(0);
    expect(monthly.categories.career.description.length).toBeGreaterThan(
      weekly.categories.career.description.length,
    );
  }, 20_000);
});
