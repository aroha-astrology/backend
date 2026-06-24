import { describe, it, expect } from 'vitest';
import { cn, formatDate, formatTime, getTimeConfidenceIndicator, truncate } from '@/lib/utils';

describe('cn (class merging)', () => {
  it('joins class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('handles conditional classes', () => {
    expect(cn('a', false && 'b', 'c')).toBe('a c');
  });

  it('deduplicates conflicting Tailwind classes', () => {
    const result = cn('p-2', 'p-4');
    expect(result).toBe('p-4');
  });

  it('ignores undefined and null', () => {
    expect(cn('a', undefined, null, 'b')).toBe('a b');
  });
});

describe('formatDate', () => {
  it('formats a Date object', () => {
    const d = new Date('2024-01-15');
    const result = formatDate(d);
    expect(result).toContain('2024');
    expect(result).toContain('15');
  });

  it('accepts an ISO string', () => {
    const result = formatDate('2024-06-21');
    expect(result).toContain('2024');
  });

  it('returns a string', () => {
    expect(typeof formatDate(new Date())).toBe('string');
  });
});

describe('formatTime', () => {
  it('converts midnight to 12:00 AM', () => {
    expect(formatTime('00:00')).toBe('12:00 AM');
  });

  it('converts noon to 12:00 PM', () => {
    expect(formatTime('12:00')).toBe('12:00 PM');
  });

  it('converts 09:05 to 9:05 AM', () => {
    expect(formatTime('09:05')).toBe('9:05 AM');
  });

  it('converts 13:30 to 1:30 PM', () => {
    expect(formatTime('13:30')).toBe('1:30 PM');
  });

  it('converts 23:59 to 11:59 PM', () => {
    expect(formatTime('23:59')).toBe('11:59 PM');
  });

  it('pads single-digit minutes', () => {
    expect(formatTime('09:07')).toBe('9:07 AM');
  });
});

describe('getTimeConfidenceIndicator', () => {
  it('hospital → high confidence', () => {
    const r = getTimeConfidenceIndicator('hospital');
    expect(r.label).toBe('High confidence');
  });

  it('certificate → high confidence', () => {
    const r = getTimeConfidenceIndicator('certificate');
    expect(r.label).toBe('High confidence');
  });

  it('family → medium confidence', () => {
    const r = getTimeConfidenceIndicator('family');
    expect(r.label).toBe('Medium confidence');
  });

  it('approximate → low confidence', () => {
    const r = getTimeConfidenceIndicator('approximate');
    expect(r.label).toBe('Low confidence');
  });

  it('unknown → low confidence', () => {
    const r = getTimeConfidenceIndicator('unknown');
    expect(r.label).toBe('Low confidence');
  });

  it('unrecognised source → medium confidence (default)', () => {
    const r = getTimeConfidenceIndicator('something_else');
    expect(r.label).toBe('Medium confidence');
  });

  it('returns an emoji field', () => {
    const r = getTimeConfidenceIndicator('hospital');
    expect(typeof r.emoji).toBe('string');
    expect(r.emoji.length).toBeGreaterThan(0);
  });
});

describe('truncate', () => {
  it('does not truncate strings within limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates strings over the limit', () => {
    expect(truncate('hello world', 5)).toBe('hello...');
  });

  it('truncates at the exact boundary', () => {
    expect(truncate('abcde', 5)).toBe('abcde');
  });

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
  });

  it('adds ellipsis when truncated', () => {
    const result = truncate('a very long string', 6);
    expect(result.endsWith('...')).toBe(true);
    expect(result).toBe('a very...');
  });
});
