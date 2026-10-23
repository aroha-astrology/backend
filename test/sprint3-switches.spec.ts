import { describe, it, expect } from 'vitest';
import { FEATURE_REGISTRY } from '../src/config/features';

const SWITCHES = [
  'live.nowBar',
  'live.widget',
  'ritual.morning',
  'circles.circles',
  'circles.invite',
  'circles.pulse',
];

describe('Sprint 3 switches ship off', () => {
  it.each(SWITCHES)('%s is off by default and tagged new', (key) => {
    const def = FEATURE_REGISTRY.find((f) => f.key === key);
    expect(def, key).toBeDefined();
    expect(def!.defaultEnabled).toBe(false);
    expect(def!.tag).toBe('new');
    expect(def!.key.startsWith(`${def!.group}.`)).toBe(true);
  });

  it('the Cosmic Key amount is a price-only key worth 10 coins', () => {
    const def = FEATURE_REGISTRY.find((f) => f.key === 'ritual.keyCoins');
    expect(def?.defaultPricePaise).toBe(1000);
    expect(def?.group).toBe('ritual');
  });
});
