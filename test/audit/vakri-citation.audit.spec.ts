import { describe, it, expect } from 'vitest';
import { calculateVakriDignity } from '../../src/lib/astro-engine/calculations/vakri.js';
import { readFileSync } from 'node:fs';

// =============================================================================
// Audit item VK1, register UK-1.2
// =============================================================================
// Uttara Kalamrita (Kalidasa, tr. P. S. Sastri), First Kanda, chapter 2, "Determination
// of the Strength": "When a planet is retrograde, his strength is equal to that of
// exaltation. ... A planet exalted in the Rasi while retrograde is similar to a
// debilitated one and it has no strength. A retrograde planet in his debilitation has
// the strength of exaltation."
// The code cited this as "Khanda II, Sloka 6" and quoted a Sanskrit line that is not in
// the text. The rule itself is right; the citation and the explanations were not.
// =============================================================================

const dignity = (planet: string, sign: string, retro: boolean) =>
  calculateVakriDignity(planet as never, sign as never, retro).uttaraKalamritaModifier;

describe('[VK1] the retrograde dignity rule, as the text states it', () => {
  it('a debilitated retrograde planet has the strength of exaltation', () => {
    const m = dignity('Mars', 'Cancer', true);
    expect(m.effectiveStrength).toBe('exaltation_like_power');
    expect(m.explanation).toMatch(/strength of exaltation/);
    expect(m.explanation).toMatch(/First Kanda, chapter 2/);
  });

  it('an exalted retrograde planet is like a debilitated one', () => {
    const m = dignity('Mars', 'Capricorn', true);
    expect(m.effectiveStrength).toBe('neecha_like_modification');
    expect(m.explanation).toMatch(/like a debilitated one/);
    expect(m.explanation).toMatch(/First Kanda, chapter 2/);
  });

  it('the source file no longer cites Khanda II, Sloka 6 or quotes an unverified Sanskrit line', () => {
    const src = readFileSync(
      new URL('../../src/lib/astro-engine/calculations/vakri.ts', import.meta.url),
      'utf8',
    );
    expect(src).not.toMatch(/Khanda II, Sloka 6/);
    expect(src).not.toMatch(/Vakri swoccagato/);
  });
});
