import { describe, expect, it } from 'vitest';
import { TAROT_DECK, drawThreeCardSpread } from '../src/lib/tarot/deck.js';

describe('TAROT_DECK', () => {
  it('has exactly 78 cards with unique names', () => {
    expect(TAROT_DECK).toHaveLength(78);
    expect(new Set(TAROT_DECK.map((c) => c.name)).size).toBe(78);
  });

  it('has exactly 22 major arcana and 56 minor arcana', () => {
    expect(TAROT_DECK.filter((c) => c.arcana === 'major')).toHaveLength(22);
    expect(TAROT_DECK.filter((c) => c.arcana === 'minor')).toHaveLength(56);
  });

  it('every card has a non-empty upright and reversed meaning', () => {
    for (const card of TAROT_DECK) {
      expect(card.uprightMeaning.length).toBeGreaterThan(0);
      expect(card.reversedMeaning.length).toBeGreaterThan(0);
    }
  });
});

describe('drawThreeCardSpread', () => {
  it('draws exactly 3 cards, one per position, all distinct', () => {
    const drawn = drawThreeCardSpread();
    expect(drawn).toHaveLength(3);
    expect(drawn.map((d) => d.position)).toEqual(['past', 'present', 'future']);
    const names = drawn.map((d) => d.card.name);
    expect(new Set(names).size).toBe(3);
  });

  it('every drawn card comes from the real deck', () => {
    const drawn = drawThreeCardSpread();
    const deckNames = new Set(TAROT_DECK.map((c) => c.name));
    for (const d of drawn) {
      expect(deckNames.has(d.card.name)).toBe(true);
      expect(typeof d.reversed).toBe('boolean');
    }
  });

  it('produces different draws across repeated calls (probabilistic sanity check)', () => {
    const draws = Array.from({ length: 20 }, () =>
      drawThreeCardSpread()
        .map((d) => d.card.name)
        .join(','),
    );
    // With 78 cards drawn 3-at-a-time, 20 draws being ALL identical is astronomically
    // unlikely if randomness is working — this guards against a broken/constant shuffle.
    expect(new Set(draws).size).toBeGreaterThan(1);
  });
});
