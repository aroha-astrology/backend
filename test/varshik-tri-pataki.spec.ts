import { describe, it, expect } from 'vitest';
import { triPatakiPlacements, readTriPataki, TRIPATAKI_VEDHA } from '../src/lib/astro-engine/varshphal/tri-pataki.js';

// Mehta ch. X, Nehru 1946-47, 58th year. Natal signs from the book's text; Mars is the sign the
// book's "fourth from Mars is Sagittarius" implies (Virgo).
const [Ari, Tau, Gem, Can, Leo, Vir, Lib, Sco, Sag, Cap, Aqu, Pis] = Array.from({ length: 12 }, (_, i) => i);
const nehru = { Sun: Sco, Moon: Can, Mars: Vir, Mercury: Lib, Jupiter: Sag, Venus: Lib, Saturn: Leo, Rahu: Gem, Ketu: Sag };

describe('Tri-Pataki placements (Mehta, Nehru 1947)', () => {
  it('Moon Libra, Sun Sagittarius, Mercury and Venus Scorpio, Jupiter Capricorn, Saturn Virgo, Rahu Pisces, Ketu Virgo, Mars Sagittarius', () => {
    const p = triPatakiPlacements(nehru, 57);
    expect(p).toEqual({ Moon: Lib, Sun: Sag, Mercury: Sco, Venus: Sco, Jupiter: Cap, Saturn: Vir, Rahu: Pis, Ketu: Vir, Mars: Sag });
  });
  it('a remainder of 0 counts as the full 9, 4 or 6, never 0', () => {
    expect(triPatakiPlacements(nehru, 8).Moon).toBe((Can + 8) % 12); // n = 9
    expect(triPatakiPlacements(nehru, 3).Sun).toBe((Sco + 3) % 12); // n = 4
    expect(triPatakiPlacements(nehru, 5).Ketu).toBe(((Sag - 5) + 12) % 12); // n = 6, backward
  });
  it('the verdict is withheld, not guessed, while the vedha table is unsourced', () => {
    expect(TRIPATAKI_VEDHA).toBeNull();
    const r = readTriPataki(nehru, 57, Aqu);
    expect(r.computed).toBe(false);
    expect(r.onMoon).toBeUndefined();
    expect(Ari + Tau + Pis).toBeGreaterThan(0);
  });
});
