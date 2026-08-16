import { describe, it, expect } from 'vitest';
import { CLAIM_CAMPAIGNS } from '../src/config/campaigns';
import { isKnownFeatureKey } from '../src/config/features';

/**
 * A campaign is pure config, so the ways it breaks are all typos — and each
 * one fails silently in production: an unknown featureKey means payoutOf()
 * always falls back and the kill switch does nothing, a ':' in the key
 * corrupts the admin spend breakdown (admin.repo.ts splits reasons on ':'),
 * and a duplicate key would let one claim block another's ledger idempotency.
 */
describe('claim campaigns config', () => {
  for (const c of CLAIM_CAMPAIGNS) {
    it(`${c.key} is well formed`, () => {
      expect(c.key).not.toContain(':');
      expect(isKnownFeatureKey(c.featureKey)).toBe(true);
      expect(c.istDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.fallbackPaise).toBeGreaterThan(0);
      if (c.maxBalancePaise !== undefined) {
        expect(c.maxBalancePaise).toBeGreaterThan(0);
      }
    });
  }

  it('has no duplicate keys', () => {
    const keys = CLAIM_CAMPAIGNS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
