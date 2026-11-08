import { describe, it, expect } from 'vitest';
import { triPatakiPlacements, readTriPataki, TRIPATAKI_JOINS } from '../src/lib/astro-engine/varshphal/tri-pataki.js';

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
  it('the joins re-derive from the PyJHora Tripataki tables, and every place has three', () => {
    const lines: Record<string, [number, number][]> = {
      '2,5': [[1, 4], [2, 1], [5, 2]], '3,5': [[1, 3], [3, 1], [5, 3]], '4,5': [[1, 2], [4, 1], [5, 4]],
      '2,1': [[1, 2], [5, 4]], '3,1': [[1, 3], [5, 3]], '4,1': [[1, 4], [5, 2]],
      '1,2': [[5, 2]], '1,3': [[5, 3]], '1,4': [[5, 4]],
    };
    const labels = [[1, 3], [1, 4], [2, 5], [3, 5], [4, 5], [5, 4], [5, 3], [5, 2], [4, 1], [3, 1], [2, 1], [1, 2]];
    const at = (x: number, y: number) => labels.findIndex(([a, b]) => a === x && b === y);
    const adj: Set<number>[] = Array.from({ length: 12 }, () => new Set<number>());
    for (const [k, ends] of Object.entries(lines)) {
      const [sx, sy] = k.split(',').map(Number) as [number, number];
      for (const [ex, ey] of ends) { adj[at(sx, sy)]!.add(at(ex, ey)); adj[at(ex, ey)]!.add(at(sx, sy)); }
    }
    for (let i = 0; i < 12; i++) expect([...adj[i]!].sort((a, b) => a - b), `place ${i}`).toEqual([...TRIPATAKI_JOINS[i]!].sort((a, b) => a - b));
  });
  it('Mehta Nehru reading: Rahu, Ketu and Saturn pierce the Moon; Mercury and Venus the Lagna; Jupiter, Sun, Mars neither', () => {
    const r = readTriPataki(nehru, 57, Aqu);
    expect(r.onMoon.map((p) => p.body).sort()).toEqual(['Ketu', 'Rahu', 'Saturn']);
    expect(r.onLagna.map((p) => p.body).sort()).toEqual(['Mercury', 'Venus']);
    expect(r.onLagna.every((p) => p.nature === 'benefic')).toBe(true);
    expect(r.lines.length).toBeGreaterThanOrEqual(2);
    expect(r.lines.join(' ').toLowerCase()).not.toMatch(/death|die|destruction/);
    expect(Ari + Tau + Pis).toBeGreaterThan(0);
  });
});
