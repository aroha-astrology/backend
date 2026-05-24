import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getAgeDemographic, buildToneRules } from '../toneRouting';

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY);
}

function yearsAgo(y: number, offsetDays = 0): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - y);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

describe('getAgeDemographic', () => {
  it('returns null for null', () => expect(getAgeDemographic(null)).toBeNull());
  it('returns null for undefined', () => expect(getAgeDemographic(undefined)).toBeNull());
  it('returns null for empty string', () => expect(getAgeDemographic('')).toBeNull());
  it('returns null for an invalid date string', () => expect(getAgeDemographic('not-a-date')).toBeNull());
  it('returns null for a future date', () => {
    const tomorrow = new Date(Date.now() + DAY).toISOString().split('T')[0];
    expect(getAgeDemographic(tomorrow)).toBeNull();
  });

  it('returns null for age 17 (one day before 18th birthday)', () => {
    expect(getAgeDemographic(yearsAgo(18, 1))).toBeNull();
  });

  it('returns gen_z on the exact 18th birthday', () => {
    expect(getAgeDemographic(yearsAgo(18, 0))).toBe('gen_z');
  });

  it('returns gen_z for age 22', () => {
    expect(getAgeDemographic(yearsAgo(22))).toBe('gen_z');
  });

  it('returns gen_z for age 27', () => {
    expect(getAgeDemographic(yearsAgo(27, 0))).toBe('gen_z');
  });

  it('returns millennial one day after 28th birthday (age just became 28)', () => {
    // yearsAgo(28, 0) = exactly 28 today
    expect(getAgeDemographic(yearsAgo(28, 0))).toBe('millennial');
  });

  it('returns millennial for age 36', () => {
    expect(getAgeDemographic(yearsAgo(36))).toBe('millennial');
  });

  it('returns millennial for age 43', () => {
    expect(getAgeDemographic(yearsAgo(43, 0))).toBe('millennial');
  });

  it('returns gen_x_boomer on the exact 44th birthday', () => {
    expect(getAgeDemographic(yearsAgo(44, 0))).toBe('gen_x_boomer');
  });

  it('returns gen_x_boomer for age 60', () => {
    expect(getAgeDemographic(yearsAgo(60))).toBe('gen_x_boomer');
  });

  it('returns gen_x_boomer for age 100', () => {
    expect(getAgeDemographic(yearsAgo(100))).toBe('gen_x_boomer');
  });

  it('accepts a Date object', () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 30);
    expect(getAgeDemographic(d)).toBe('millennial');
  });

  it('handles leap-year DOB 2000-02-29 without throwing', () => {
    expect(() => getAgeDemographic('2000-02-29')).not.toThrow();
  });
});

describe('buildToneRules', () => {
  it('returns empty string for null demographic', () => {
    expect(buildToneRules(null)).toBe('');
  });

  it('includes "main character energy" for gen_z', () => {
    expect(buildToneRules('gen_z')).toContain('main character energy');
  });

  it('includes "supportive peer or life coach" for millennial', () => {
    expect(buildToneRules('millennial')).toContain('supportive peer or life coach');
  });

  it('includes "respectful, clear, and wise" for gen_x_boomer', () => {
    expect(buildToneRules('gen_x_boomer')).toContain('respectful, clear, and wise');
  });

  it('includes H/N/A structural directive when demographic is set', () => {
    const result = buildToneRules('millennial');
    expect(result).toContain('HOOK');
    expect(result).toContain('NUANCE');
    expect(result).toContain('ACTION');
  });

  it('appends harsh-mode respectful reminder only for gen_x_boomer', () => {
    const boomer = buildToneRules('gen_x_boomer', { harshMode: true });
    expect(boomer).toContain('respectful');

    const genZ = buildToneRules('gen_z', { harshMode: true });
    expect(genZ).not.toContain('keep the register respectful');
  });
});
