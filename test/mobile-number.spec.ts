import { describe, expect, it } from 'vitest';
import {
  analyzeMobileNumber,
  suggestPhoneNumbers,
} from '../src/lib/astro-engine/numerology/mobileNumber.js';

const DOB = new Date('1990-05-15');

describe('analyzeMobileNumber', () => {
  it('matches the worked example: 9876543210 -> total 45 -> vibration 9', () => {
    const a = analyzeMobileNumber('9876543210', DOB);
    expect(a.total).toBe(45);
    expect(a.vibration).toBe(9);
  });

  it('never carries the raw number — only a masked form', () => {
    const a = analyzeMobileNumber('9876543210', DOB);
    expect(a.maskedNumber).not.toContain('9876543210');
    expect(a.maskedNumber).toBe('98••••3210');
    // Every value in the returned object, stringified, must never contain the raw digits.
    expect(JSON.stringify(a)).not.toContain('9876543210');
  });

  it('throws on fewer than 10 digits', () => {
    expect(() => analyzeMobileNumber('12345', DOB)).toThrow();
  });

  it('strips non-digit characters and uses the last 10 digits (country code tolerant)', () => {
    const withCountryCode = analyzeMobileNumber('+91 98765 43210', DOB);
    const bare = analyzeMobileNumber('9876543210', DOB);
    expect(withCountryCode.total).toBe(bare.total);
    expect(withCountryCode.vibration).toBe(bare.vibration);
  });

  it('detects a trailing zero as the worst zero case', () => {
    const a = analyzeMobileNumber('9876543210', DOB);
    expect(a.endsWithZero).toBe(true);
    expect(a.zeroCount).toBeGreaterThanOrEqual(1);
  });

  it('reports missing digits (1-9 absent from the number)', () => {
    // 1111111111 -> only digit 1 appears; 2-9 are all missing.
    const a = analyzeMobileNumber('1111111111', DOB);
    expect(a.missingDigits).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('flags a digit repeating 3+ times', () => {
    const a = analyzeMobileNumber('1111234567', DOB);
    expect(a.repeatedDigits).toEqual(expect.arrayContaining([{ digit: 1, count: 4 }]));
  });

  it('finds classically favorable and unfavorable consecutive digit pairs', () => {
    // "11" is favorable, "44" is unfavorable — both present in this number.
    const a = analyzeMobileNumber('9811144210', DOB);
    expect(a.digitPairs.some((p) => p.pair === '11' && p.favorable)).toBe(true);
    expect(a.digitPairs.some((p) => p.pair === '44' && !p.favorable)).toBe(true);
  });

  it('always returns at least one positive or caution — never an empty read', () => {
    const a = analyzeMobileNumber('9876543210', DOB);
    expect(a.positives.length + a.cautions.length).toBeGreaterThan(0);
  });

  it('positives/cautions are in the {label, detail} shape StrengthsCautions.tsx expects', () => {
    const a = analyzeMobileNumber('9876543210', DOB);
    for (const p of [...a.positives, ...a.cautions]) {
      expect(typeof p.label).toBe('string');
      expect(typeof p.detail).toBe('string');
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.detail.length).toBeGreaterThan(0);
    }
  });

  it('harmony is clamped to 1-10 and verdict matches the score band', () => {
    const a = analyzeMobileNumber('9876543210', DOB);
    expect(a.harmony).toBeGreaterThanOrEqual(1);
    expect(a.harmony).toBeLessThanOrEqual(10);
    expect(['powerful', 'supportive', 'neutral', 'draining']).toContain(a.verdict);
  });
});

describe('suggestPhoneNumbers', () => {
  it('returns 5 suggestions by default, all sharing the real 6-digit prefix', () => {
    const suggestions = suggestPhoneNumbers('9876543210', DOB);
    expect(suggestions).toHaveLength(5);
    for (const s of suggestions) {
      expect(s.example.startsWith('987654')).toBe(true);
      expect(s.example).toHaveLength(10);
    }
  });

  it('every suggestion is scored within [40, 99]', () => {
    const suggestions = suggestPhoneNumbers('9876543210', DOB);
    for (const s of suggestions) {
      expect(s.score).toBeGreaterThanOrEqual(40);
      expect(s.score).toBeLessThanOrEqual(99);
    }
  });

  it('is sorted best-first (descending score)', () => {
    const suggestions = suggestPhoneNumbers('9876543210', DOB);
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1]!.score).toBeGreaterThanOrEqual(suggestions[i]!.score);
    }
  });

  it('flags exactly the top 2 as recommended', () => {
    const suggestions = suggestPhoneNumbers('9876543210', DOB);
    expect(suggestions.filter((s) => s.recommended)).toHaveLength(2);
    expect(suggestions[0]!.recommended).toBe(true);
    expect(suggestions[1]!.recommended).toBe(true);
  });

  it('never suggests a number ending in zero', () => {
    const suggestions = suggestPhoneNumbers('9876543210', DOB);
    for (const s of suggestions) {
      expect(s.example.endsWith('0')).toBe(false);
    }
  });

  it('never suggests the vibration the reader already has', () => {
    const current = analyzeMobileNumber('9876543210', DOB);
    const suggestions = suggestPhoneNumbers('9876543210', DOB);
    for (const s of suggestions) {
      expect(s.vibration).not.toBe(current.vibration);
    }
  });

  it('prefers a non-enemy vibration when the friendly pool alone can satisfy the request', () => {
    // limit:1 stays within this DOB's tier-1 friendly pool (see candidateVibrations' 3-tier
    // doc comment) — the fallback-to-enemies tier only needs to fire for a LARGER limit than
    // the clean pool can satisfy, tested separately below.
    const current = analyzeMobileNumber('9876543210', DOB);
    const [top] = suggestPhoneNumbers('9876543210', DOB, 1);
    expect(current.enemyDigits).not.toContain(top!.vibration);
  });

  it('still returns exactly `limit` suggestions even when every 1-9 vibration is an enemy of Mulank or Bhagyank for SOME of them', () => {
    // This DOB's Mulank(6)/Bhagyank(3) combined enemy lists leave only ONE genuinely
    // non-enemy, non-current vibration available — asking for 5 forces the tier-3 fallback
    // (see candidateVibrations) to surface enemy vibrations rather than silently returning
    // fewer than requested. A low score (not a missing suggestion) is how that shows up.
    const suggestions = suggestPhoneNumbers('9876543210', DOB, 5);
    expect(suggestions).toHaveLength(5);
    expect(new Set(suggestions.map((s) => s.vibration)).size).toBe(5); // no duplicate vibrations
  });

  it('masks the example the same way analyzeMobileNumber masks the current number', () => {
    const suggestions = suggestPhoneNumbers('9876543210', DOB);
    for (const s of suggestions) {
      expect(s.maskedExample).not.toBe(s.example);
      expect(s.maskedExample.endsWith(s.example.slice(-4))).toBe(true);
    }
  });

  it('returns an empty list for a too-short number rather than throwing', () => {
    expect(suggestPhoneNumbers('123', DOB)).toEqual([]);
  });

  it('respects a custom limit', () => {
    expect(suggestPhoneNumbers('9876543210', DOB, 3)).toHaveLength(3);
  });
});
