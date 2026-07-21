import { describe, expect, it } from 'vitest';
import {
  getDailyCopy,
  getPeriodicCopy,
  normalizeLang,
  SUPPORTED_LANGS,
} from '../src/modules/cron/broadcast-copy.js';

describe('normalizeLang', () => {
  it('passes through a bare supported code', () => {
    expect(normalizeLang('hi')).toBe('hi');
  });

  it('strips a region suffix (hi-IN -> hi)', () => {
    expect(normalizeLang('hi-IN')).toBe('hi');
  });

  it('falls back to en for null/undefined', () => {
    expect(normalizeLang(null)).toBe('en');
    expect(normalizeLang(undefined)).toBe('en');
  });

  it('falls back to en for an unsupported language', () => {
    expect(normalizeLang('fr')).toBe('en');
    expect(normalizeLang('fr-FR')).toBe('en');
  });

  it('is case-insensitive', () => {
    expect(normalizeLang('HI-in')).toBe('hi');
  });
});

describe('getDailyCopy', () => {
  it('returns a distinct hook for every day of the week, per language', () => {
    for (const lang of SUPPORTED_LANGS) {
      const titles = new Set(Array.from({ length: 7 }, (_, d) => getDailyCopy(lang, d).title));
      expect(titles.size).toBe(7);
    }
  });

  it('has non-empty title and body for every supported language', () => {
    for (const lang of SUPPORTED_LANGS) {
      for (let d = 0; d < 7; d++) {
        const copy = getDailyCopy(lang, d);
        expect(copy.title.length).toBeGreaterThan(0);
        expect(copy.body.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('getPeriodicCopy', () => {
  it('returns localized copy for weekly/monthly/yearly in every supported language', () => {
    for (const period of ['weekly', 'monthly', 'yearly'] as const) {
      for (const lang of SUPPORTED_LANGS) {
        const copy = getPeriodicCopy(period, lang);
        expect(copy.title.length).toBeGreaterThan(0);
        expect(copy.body.length).toBeGreaterThan(0);
      }
    }
  });

  it('weekly, monthly and yearly copy are all distinct from each other (same language)', () => {
    const weekly = getPeriodicCopy('weekly', 'en').title;
    const monthly = getPeriodicCopy('monthly', 'en').title;
    const yearly = getPeriodicCopy('yearly', 'en').title;
    expect(new Set([weekly, monthly, yearly]).size).toBe(3);
  });
});
