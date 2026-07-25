import { describe, it, expect } from 'vitest';
import { FEATURE_REGISTRY, isKnownFeatureKey } from '../src/config/features.js';

// The registry is the single source of truth for every togglable feature/price
// in the system — the admin dashboard, the resolver service, and the
// enforcement middleware (all built on top of this file) trust its shape
// blindly, so its own invariants are worth locking down here.

describe('FEATURE_REGISTRY', () => {
  it('has no duplicate keys', () => {
    const keys = FEATURE_REGISTRY.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every key matches the "<group>.<name>" naming shape', () => {
    // Note: widened from the strictest possible shape (`^[a-z]+\.[a-zA-Z]+$`) to
    // also allow underscores in the name segment — several report keys are
    // intentionally snake_case (e.g. `reports.past_life`, `reports.health_monthly`)
    // to match their existing report-type identifiers used elsewhere.
    const KEY_SHAPE = /^[a-z]+\.[a-zA-Z_]+$/;
    for (const feature of FEATURE_REGISTRY) {
      expect(feature.key).toMatch(KEY_SHAPE);
    }
  });

  it('every key\'s group prefix matches its declared `group` field', () => {
    for (const feature of FEATURE_REGISTRY) {
      expect(feature.key.split('.')[0]).toBe(feature.group);
    }
  });

  it('is non-empty', () => {
    expect(FEATURE_REGISTRY.length).toBeGreaterThan(0);
  });
});

describe('isKnownFeatureKey', () => {
  it('returns true for every key actually in the registry', () => {
    for (const feature of FEATURE_REGISTRY) {
      expect(isKnownFeatureKey(feature.key)).toBe(true);
    }
  });

  it('returns false for a key not in the registry', () => {
    expect(isKnownFeatureKey('nav.doesNotExist')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isKnownFeatureKey('')).toBe(false);
  });
});
