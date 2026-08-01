import { describe, expect, it } from 'vitest';
import {
  scoreCandidateName,
  rankScoredNames,
} from '../src/lib/astro-engine/numerology/name-scoring.js';
import type { NameAlignmentResult } from '../src/lib/astro-engine/numerology/nameCorrection.js';

function makeAlignment(overrides: Partial<NameAlignmentResult> = {}): NameAlignmentResult {
  return {
    mulank: 6,
    bhagyank: 3,
    pythagorean: 22,
    chaldean: 27,
    soulUrge: 5,
    personality: 8,
    targets: [3, 6, 9],
    alignment: 'partially_aligned',
    friendly: [1, 3, 5, 9],
    enemy: [1, 2, 5, 7, 8],
    ...overrides,
  };
}

describe('scoreCandidateName', () => {
  it('stays within [40, 99] across a spread of best- and worst-case signal combinations', () => {
    const a = makeAlignment();
    const best = scoreCandidateName('Priyanshi', 3, 'Priya', a); // destiny + friendly + same initial
    const worst = scoreCandidateName('Zzzzzzzzzzzzzzzzzzzzz', 2, 'Priya', a); // no target/friendly hit, enemy-number penalty
    expect(best.score).toBeLessThanOrEqual(99);
    expect(worst.score).toBeGreaterThanOrEqual(40);
    expect(best.score).toBeGreaterThan(worst.score);
  });

  it('scores a destiny-number (targets[0]) match higher than a psychic-number (targets[1]) match', () => {
    const a = makeAlignment({ targets: [3, 6, 9] });
    const destiny = scoreCandidateName('Aarav', 3, 'Devansh', a);
    const psychic = scoreCandidateName('Bhavna', 6, 'Devansh', a);
    expect(destiny.score).toBeGreaterThan(psychic.score);
  });

  it('scores a third-tier target match lower than both destiny and psychic matches', () => {
    const a = makeAlignment({ targets: [3, 6, 9] });
    const destiny = scoreCandidateName('Aarav', 3, 'Devansh', a);
    const thirdTier = scoreCandidateName('Nitin', 9, 'Devansh', a);
    expect(destiny.score).toBeGreaterThan(thirdTier.score);
  });

  it('gives every score at least one non-empty reason', () => {
    const a = makeAlignment();
    const s = scoreCandidateName('Aarav', 3, 'Priya', a);
    expect(s.reasons.length).toBeGreaterThan(0);
    expect(s.reasons.every((r) => r.trim().length > 0)).toBe(true);
  });

  it('docks the score and names the caution when the chaldean number is also an enemy number', () => {
    const withoutEnemy = makeAlignment({ targets: [3, 6, 9], enemy: [] });
    const withEnemy = makeAlignment({ targets: [3, 6, 9], enemy: [3] });
    const clean = scoreCandidateName('Aarav', 3, 'Devansh', withoutEnemy);
    const cautioned = scoreCandidateName('Aarav', 3, 'Devansh', withEnemy);
    expect(cautioned.reasons.some((r) => r.toLowerCase().includes('caution'))).toBe(true);
    expect(cautioned.score).toBe(clean.score - 10);
  });

  it("never mutates recommended on the raw scored output — that is rankScoredNames' job", () => {
    const a = makeAlignment();
    const s = scoreCandidateName('Aarav', 3, 'Priya', a);
    expect(s.recommended).toBe(false);
  });
});

describe('rankScoredNames', () => {
  const a = makeAlignment({ targets: [3, 6, 9] });

  it('sorts descending by score', () => {
    const names = ['Aarav', 'Bhavna', 'Rohan', 'Zeeshan'];
    const chaldeans = [3, 9, 3, 1];
    const scored = names.map((n, i) => scoreCandidateName(n, chaldeans[i]!, 'Devansh', a));
    const ranked = rankScoredNames(scored);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score);
    }
  });

  it('flags exactly the top 2 by score as recommended, and no others', () => {
    const names = ['Aarav', 'Bhavna', 'Rohan', 'Zeeshan', 'Karan'];
    const chaldeans = [3, 6, 9, 1, 1];
    const scored = names.map((n, i) => scoreCandidateName(n, chaldeans[i]!, 'Devansh', a));
    const ranked = rankScoredNames(scored);
    expect(ranked.filter((r) => r.recommended)).toHaveLength(2);
    expect(ranked[0]!.recommended).toBe(true);
    expect(ranked[1]!.recommended).toBe(true);
    expect(ranked.slice(2).every((r) => !r.recommended)).toBe(true);
  });

  it('flags all of them recommended when there are fewer than 2 candidates', () => {
    const scored = [scoreCandidateName('Aarav', 3, 'Devansh', a)];
    const ranked = rankScoredNames(scored);
    expect(ranked[0]!.recommended).toBe(true);
  });

  it('does not mutate the input array', () => {
    const scored = [scoreCandidateName('Aarav', 3, 'Devansh', a)];
    rankScoredNames(scored);
    expect(scored[0]!.recommended).toBe(false);
  });
});
