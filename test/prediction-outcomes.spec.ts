import { describe, it, expect } from 'vitest';
import { hashFacts } from '../src/modules/astro/prediction-outcomes.repo.js';

describe('prediction-outcomes: hashFacts', () => {
  it('is stable for the same facts in the same order', () => {
    const a = hashFacts(['Retrograde at birth: Mercury.', 'STRENGTH RULE: Saturn below par.']);
    const b = hashFacts(['Retrograde at birth: Mercury.', 'STRENGTH RULE: Saturn below par.']);
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
  });

  it('changes when the facts change — that is the whole point', () => {
    const a = hashFacts(['Saturn below par']);
    const b = hashFacts(['Saturn strong']);
    expect(a).not.toBe(b);
  });

  it('distinguishes a different ORDER of the same facts', () => {
    // Order matters: the grounding block is ordered deliberately (strength
    // before promises), so a reordering is a different prompt.
    expect(hashFacts(['a', 'b'])).not.toBe(hashFacts(['b', 'a']));
  });

  it('returns null for nothing to hash rather than a hash of empty string', () => {
    expect(hashFacts(null)).toBeNull();
    expect(hashFacts(undefined)).toBeNull();
    expect(hashFacts([])).toBeNull();
  });

  it('never returns the facts themselves — this table must not copy chart data', () => {
    const secret = 'Moon Sign (Rashi) is natally in Pisces (house 11)';
    const h = hashFacts([secret]);
    expect(h).not.toContain('Pisces');
    expect(h).toMatch(/^[0-9a-f]{32}$/);
  });
});
