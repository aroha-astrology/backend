import { describe, it, expect } from 'vitest';
import { matchPalmRules } from '../src/lib/astro-engine/palm/palm-rules';
import type { PalmHandObservations } from '../src/lib/astro-engine/palm/palm-types';

function baseHand(overrides: Partial<PalmHandObservations> = {}): PalmHandObservations {
  return {
    hand: 'right',
    imageQuality: { score: 8, lineVisibility: 8, lighting: 8, focus: 8, framing: 8 },
    handType: { element: 'Water', palmShape: 'rectangular', skinTexture: 'fine' },
    mounts: {
      jupiter: 'normal',
      saturn: 'normal',
      apollo: 'normal',
      mercury: 'normal',
      venus: 'normal',
      luna: 'normal',
      marsUpper: 'normal',
      marsLower: 'normal',
      rahuPlain: 'normal',
    },
    majorLines: {
      lifeLine: { present: true, length: 'medium', depth: 'medium' },
      heartLine: { present: true, length: 'medium', depth: 'medium' },
      headLine: { present: true, length: 'medium', depth: 'medium' },
      fateLine: { present: true, length: 'medium', depth: 'medium' },
    },
    minorLines: {
      marriageLines: { count: 1 },
      childrenLines: { count: 0 },
      intuitionLine: { present: false },
      travelLines: { count: 0 },
    },
    thumb: { flexibility: 'normal', setAngle: 'medium' },
    fingerprints: [],
    specialMarkings: [],
    ...overrides,
  };
}

describe('matchPalmRules', () => {
  it('flags a prominent Jupiter mount as a leadership/dharmic-pull signal', () => {
    const hand = baseHand({
      mounts: { ...baseHand().mounts, jupiter: 'prominent' },
    });
    const facts = matchPalmRules(hand);
    expect(facts.some((f) => f.key === 'mount.jupiter.prominent')).toBe(true);
  });

  it('reads heart line ending under Jupiter as idealistic-romantic, not literal geometry', () => {
    const hand = baseHand({
      majorLines: {
        ...baseHand().majorLines,
        heartLine: { present: true, length: 'medium', depth: 'medium', endingPosition: 'jupiter' },
      },
    });
    const facts = matchPalmRules(hand);
    const fact = facts.find((f) => f.key === 'heartLine.endingPosition.jupiter');
    expect(fact).toBeDefined();
    expect(fact!.meaning.toLowerCase()).toContain('idealistic');
  });

  it('never derives lifespan from life line length — anti-myth rule', () => {
    const longLife = baseHand({
      majorLines: {
        ...baseHand().majorLines,
        lifeLine: { present: true, length: 'long', depth: 'faint' },
      },
    });
    const shortLife = baseHand({
      majorLines: {
        ...baseHand().majorLines,
        lifeLine: { present: true, length: 'short', depth: 'deep' },
      },
    });
    // A DISCLAIMER that mentions "lifespan" while explicitly denying it's the
    // subject is fine and expected; an affirmative CLAIM about lifespan is not.
    const claimsLifespan =
      /\b(will|shall|expect to) live|years (left|remaining|to live)|lifespan (is|of|will)/;
    for (const facts of [matchPalmRules(longLife), matchPalmRules(shortLife)]) {
      for (const fact of facts) {
        expect(fact.meaning.toLowerCase()).not.toMatch(claimsLifespan);
      }
    }
  });

  it('derives life line vitality from depth, not length', () => {
    const deep = baseHand({
      majorLines: {
        ...baseHand().majorLines,
        lifeLine: { present: true, length: 'short', depth: 'deep' },
      },
    });
    const faint = baseHand({
      majorLines: {
        ...baseHand().majorLines,
        lifeLine: { present: true, length: 'long', depth: 'faint' },
      },
    });
    const deepFact = matchPalmRules(deep).find((f) => f.key === 'lifeLine.depth.deep');
    const faintFact = matchPalmRules(faint).find((f) => f.key === 'lifeLine.depth.faint');
    expect(deepFact?.meaning.toLowerCase()).toContain('vital');
    expect(faintFact).toBeDefined();
  });

  it('flags marriage-line count on the percussion edge only when captured', () => {
    const hand = baseHand({
      minorLines: {
        ...baseHand().minorLines,
        marriageLines: { count: 2, forked: true },
      },
    });
    const facts = matchPalmRules(hand);
    expect(facts.some((f) => f.key === 'marriageLines.forked')).toBe(true);
  });

  it('every fact carries a source citation for the LLM grounding prompt', () => {
    const hand = baseHand({ mounts: { ...baseHand().mounts, luna: 'prominent' } });
    const facts = matchPalmRules(hand);
    expect(facts.length).toBeGreaterThan(0);
    for (const fact of facts) {
      expect(fact.source).toBeTruthy();
      expect(fact.evidence).toBeTruthy();
    }
  });

  it('produces no facts for an all-normal, featureless hand beyond baseline element/shape', () => {
    const hand = baseHand();
    const facts = matchPalmRules(hand);
    // Nothing "prominent"/"flat"/forked/etc — should not hallucinate signal from nothing.
    expect(facts.some((f) => f.key.startsWith('mount.'))).toBe(false);
  });

  describe('CV mount-relief cross-validation (optional third argument)', () => {
    it('adds a corroboration fact when the CV relief score agrees with a prominent vision rating', () => {
      const hand = baseHand({ mounts: { ...baseHand().mounts, jupiter: 'prominent' } });
      const facts = matchPalmRules(hand, { jupiter: 0.9 });
      const fact = facts.find((f) => f.key === 'mount.jupiter.corroborated');
      expect(fact).toBeDefined();
      expect(fact!.meaning.toLowerCase()).toMatch(/independently|confirm|corrobor/);
    });

    it('adds a corroboration fact when the CV relief score agrees with a flat vision rating', () => {
      const hand = baseHand({ mounts: { ...baseHand().mounts, venus: 'flat' } });
      const facts = matchPalmRules(hand, { venus: 0.05 });
      expect(facts.some((f) => f.key === 'mount.venus.corroborated')).toBe(true);
    });

    it('adds a disagreement fact when CV relief contradicts a prominent vision rating', () => {
      const hand = baseHand({ mounts: { ...baseHand().mounts, jupiter: 'prominent' } });
      const facts = matchPalmRules(hand, { jupiter: 0.05 });
      const fact = facts.find((f) => f.key === 'mount.jupiter.disagreement');
      expect(fact).toBeDefined();
      expect(fact!.meaning.toLowerCase()).toMatch(/uncertain|caution|mixed|disagree/);
    });

    it('adds a disagreement fact when CV relief contradicts a flat vision rating', () => {
      const hand = baseHand({ mounts: { ...baseHand().mounts, venus: 'flat' } });
      const facts = matchPalmRules(hand, { venus: 0.95 });
      expect(facts.some((f) => f.key === 'mount.venus.disagreement')).toBe(true);
    });

    it('does not flag disagreement when CV relief is in the neutral middle band', () => {
      const hand = baseHand({ mounts: { ...baseHand().mounts, jupiter: 'prominent' } });
      const facts = matchPalmRules(hand, { jupiter: 0.5 });
      expect(facts.some((f) => f.key === 'mount.jupiter.disagreement')).toBe(false);
      expect(facts.some((f) => f.key === 'mount.jupiter.corroborated')).toBe(false);
    });

    it('is a no-op when no relief scores are passed at all (backward compatible, existing callers unaffected)', () => {
      const hand = baseHand({ mounts: { ...baseHand().mounts, jupiter: 'prominent' } });
      const facts = matchPalmRules(hand);
      expect(
        facts.some((f) => f.key.includes('corroborated') || f.key.includes('disagreement')),
      ).toBe(false);
    });

    it('ignores a relief score for a mount the vision model rated "normal" (nothing to cross-check against)', () => {
      const hand = baseHand(); // all mounts 'normal'
      const facts = matchPalmRules(hand, { jupiter: 0.95 });
      expect(facts.some((f) => f.key.startsWith('mount.jupiter.'))).toBe(false);
    });
  });
});
