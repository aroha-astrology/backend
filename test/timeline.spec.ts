import { describe, expect, it } from 'vitest';
import type { Planet } from '@aroha-astrology/shared';
import { calculateVimshottariDasha } from '../src/lib/astro-engine/dashas/vimshottari.js';
import type { ChartContext } from '../src/lib/intelligence/chart-context.js';
import {
  laneBands,
  levelOf,
  lordScore,
  periodScore,
} from '../src/modules/insights/timeline.service.js';

/** Ascendant Aries; whole-sign lords from Aries. Saturn (10th & 11th lord) sits in the 10th. */
const LORDS: Planet[] = [
  'Mars',
  'Venus',
  'Mercury',
  'Moon',
  'Sun',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
  'Saturn',
  'Jupiter',
];
const ctx = {
  ascendantSignIndex: 0,
  moonSignIndex: 3,
  natal: [
    // Saturn in Capricorn (10th) in Shravana (21, lord Moon).
    { planet: 'Saturn', signIndex: 9, house: 10, nakshatraIndex: 21 },
    // Venus in Libra (7th) in Swati (14, lord Rahu).
    { planet: 'Venus', signIndex: 6, house: 7, nakshatraIndex: 14 },
    // Mars in Scorpio (8th).
    { planet: 'Mars', signIndex: 7, house: 8, nakshatraIndex: 16 },
    { planet: 'Jupiter', signIndex: 8, house: 9, nakshatraIndex: 19 },
    { planet: 'Mercury', signIndex: 2, house: 3, nakshatraIndex: 6 },
    { planet: 'Sun', signIndex: 4, house: 5, nakshatraIndex: 10 },
    { planet: 'Moon', signIndex: 3, house: 4, nakshatraIndex: 7 },
    { planet: 'Rahu', signIndex: 11, house: 12, nakshatraIndex: 25 },
    { planet: 'Ketu', signIndex: 5, house: 6, nakshatraIndex: 12 },
  ],
  houseLords: Object.fromEntries(LORDS.map((p, i) => [i + 1, p])),
} as unknown as ChartContext;

describe('lordScore', () => {
  it('scores Saturn high for career: rules the 10th, sits in it, is its karaka, in a kendra', () => {
    const s = lordScore(ctx, 'Saturn', 'career', 'mahadasha');
    // rules primary 10th (+3) + sits in 10th (+2) + karaka (+1) + kendra (+1) = 7
    expect(s.score).toBe(7);
    expect(s.why.map((w) => w.textKey)).toEqual([
      'timeline.why.rules',
      'timeline.why.sits',
      'timeline.why.karaka',
      'timeline.why.strongPlace',
    ]);
  });

  it('scores Venus for relationships and gives Mars nothing for career (and never below zero)', () => {
    expect(lordScore(ctx, 'Venus', 'relationships', 'antardasha').score).toBeGreaterThanOrEqual(6);
    expect(lordScore(ctx, 'Mars', 'career', 'antardasha').score).toBe(0);
  });
});

describe('periodScore / levelOf', () => {
  it('weights the Antardasha lord more and caps at 100', () => {
    const strong = { score: 7, why: [] };
    const none = { score: 0, why: [] };
    expect(periodScore(none, strong)).toBeGreaterThan(periodScore(strong, none));
    expect(periodScore({ score: 9, why: [] }, { score: 9, why: [] })).toBe(100);
    expect([levelOf(80), levelOf(50), levelOf(20)]).toEqual(['high', 'medium', null]);
  });
});

describe('laneBands', () => {
  const tree = calculateVimshottariDasha(123.4, new Date('1990-05-15T09:00:00Z'));
  const stored = JSON.parse(JSON.stringify(tree.mahadashas)) as Parameters<typeof laneBands>[1];
  const from = new Date('1990-05-15T09:00:00Z');
  const to = new Date('2070-05-15T00:00:00Z');

  it('produces ordered, non-overlapping bands inside the range, merging same-level neighbours', () => {
    const bands = laneBands(ctx, stored, 'career', from, to);
    expect(bands.length).toBeGreaterThan(0);
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i]!;
      expect(b.start < b.end).toBe(true);
      expect(b.start >= '1990-05-15' && b.end <= '2070-05-15').toBe(true);
      if (i > 0) {
        const prev = bands[i - 1]!;
        expect(prev.end <= b.start).toBe(true);
        if (prev.end === b.start) expect(prev.level).not.toBe(b.level);
      }
    }
  });

  it("lights up Saturn's periods for career in this chart", () => {
    const bands = laneBands(ctx, stored, 'career', from, to);
    expect(bands.some((b) => b.lords.includes('Saturn') && b.level === 'high')).toBe(true);
  });

  it('clips to a narrow window', () => {
    const narrow = laneBands(
      ctx,
      stored,
      'money',
      new Date('2025-01-01T00:00:00Z'),
      new Date('2027-01-01T00:00:00Z'),
    );
    expect(narrow.every((b) => b.start >= '2025-01-01' && b.end <= '2027-01-01')).toBe(true);
  });
});
