import { describe, expect, it } from 'vitest';
import { getReportDef, monthlyBundlePricePaise, REPORT_CATALOGUE } from '../src/config/reports.js';

describe('REPORT_CATALOGUE', () => {
  it('has exactly the 15 documented report keys', () => {
    const keys = REPORT_CATALOGUE.map((r) => r.key).sort();
    expect(keys).toEqual(
      [
        'baby_name',
        'career_monthly',
        'finance_monthly',
        'health_monthly',
        'kundli_milan',
        'marriage',
        'match_report',
        'name_change',
        'numerology',
        'past_life',
        'progeny',
        'relationship_monthly',
        'remedies',
        'true_love',
        'wealth',
      ].sort(),
    );
  });

  it('only kundli_milan, match_report and progeny require a partner', () => {
    for (const def of REPORT_CATALOGUE) {
      expect(def.requiresPartner).toBe(
        def.key === 'kundli_milan' || def.key === 'match_report' || def.key === 'progeny',
      );
    }
  });

  it('marks exactly the 4 documented keys as monthly', () => {
    const monthly = REPORT_CATALOGUE.filter((r) => r.isMonthly)
      .map((r) => r.key)
      .sort();
    expect(monthly).toEqual(
      ['career_monthly', 'finance_monthly', 'health_monthly', 'relationship_monthly'].sort(),
    );
  });

  it('every featureFlagKey matches the "reports.<key>" convention', () => {
    for (const def of REPORT_CATALOGUE) {
      expect(def.featureFlagKey).toBe(`reports.${def.key}`);
    }
  });
});

describe('getReportDef', () => {
  it('returns the def for a known key', () => {
    const def = getReportDef('kundli_milan');
    expect(def?.key).toBe('kundli_milan');
    expect(def?.requiresPartner).toBe(true);
  });

  it('returns undefined for an unknown key', () => {
    expect(getReportDef('not_a_real_report')).toBeUndefined();
  });
});

describe('monthlyBundlePricePaise', () => {
  it('prices exactly as documented for representative month counts', () => {
    expect(monthlyBundlePricePaise(1)).toBe(2500);
    expect(monthlyBundlePricePaise(2)).toBe(4500);
    expect(monthlyBundlePricePaise(3)).toBe(6500);
    expect(monthlyBundlePricePaise(10)).toBe(19900);
    expect(monthlyBundlePricePaise(11)).toBe(19900);
    expect(monthlyBundlePricePaise(12)).toBe(19900);
  });

  it('throws for months < 1', () => {
    expect(() => monthlyBundlePricePaise(0)).toThrow();
    expect(() => monthlyBundlePricePaise(-1)).toThrow();
  });

  it('is monotonically non-decreasing through the cap — more months is never cheaper', () => {
    for (let n = 1; n <= 15; n++) {
      expect(monthlyBundlePricePaise(n + 1)).toBeGreaterThanOrEqual(monthlyBundlePricePaise(n));
    }
  });
});
