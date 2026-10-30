import { describe, it, expect } from 'vitest';
import { FEATURE_REGISTRY } from '../src/config/features.js';

describe('home.birthTimeAsk (audit M7)', () => {
  it('is registered, on the Home group, and ships OFF for the owner to switch on', () => {
    const def = FEATURE_REGISTRY.find((f) => f.key === 'home.birthTimeAsk');
    expect(def).toBeDefined();
    expect(def?.defaultEnabled).toBe(false);
    expect(def?.group).toBe('home');
  });
});
