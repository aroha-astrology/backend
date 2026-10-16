import { describe, it, expect, afterEach } from 'vitest';
import { isCombust } from '../../src/lib/astro-engine/calculations/planet-state.js';
import {
  DEFAULT_PROFILE,
  getActiveProfile,
  setActiveProfile,
} from '../../src/lib/astro-engine/rules/profile.js';
import { analyzePlanetStrengths } from '../../src/lib/astro-engine/gemstones.js';

// =============================================================================
// Audit item ST1 (combustion orbs), register BPHS-7-combustion
// =============================================================================
// The table printed in R. Santhanam's notes to BPHS ch. 7 (the translator's table,
// not a verse): Moon 12 degrees; Mars 17 direct, 8 retrograde; Mercury 14 direct,
// 12 retrograde; Jupiter 11; Venus 10 direct, 8 retrograde; Saturn 15 (the OCR reads
// 16, which is not relied on; 15 is kept). Rahu and Ketu are never combust.
// The engine used the direct orbs for a retrograde planet too and its comment said
// the retrograde orbs were the wider ones; in this table they are the narrower.
// =============================================================================

afterEach(() => setActiveProfile(DEFAULT_PROFILE));

const SUN = 100;

describe('[ST1] combustion orbs by motion', () => {
  it('Mercury: 14 degrees direct, 12 retrograde', () => {
    expect(isCombust('Mercury', SUN + 13, SUN, false)).toBe(true);
    expect(isCombust('Mercury', SUN + 13, SUN, true)).toBe(false);
    expect(isCombust('Mercury', SUN + 11, SUN, true)).toBe(true);
  });

  it('Venus: 10 degrees direct, 8 retrograde', () => {
    expect(isCombust('Venus', SUN - 9, SUN, false)).toBe(true);
    expect(isCombust('Venus', SUN - 9, SUN, true)).toBe(false);
    expect(isCombust('Venus', SUN - 7, SUN, true)).toBe(true);
  });

  it('Mars: 17 degrees direct, 8 retrograde', () => {
    expect(isCombust('Mars', SUN + 12, SUN, false)).toBe(true);
    expect(isCombust('Mars', SUN + 12, SUN, true)).toBe(false);
  });

  it('Moon, Jupiter and Saturn do not change with motion', () => {
    for (const retro of [false, true]) {
      expect(isCombust('Moon', SUN + 11, SUN, retro)).toBe(true);
      expect(isCombust('Moon', SUN + 13, SUN, retro)).toBe(false);
      expect(isCombust('Jupiter', SUN + 10, SUN, retro)).toBe(true);
      expect(isCombust('Saturn', SUN + 14, SUN, retro)).toBe(true);
    }
  });

  it('without a motion flag the direct orb applies, as before', () => {
    expect(isCombust('Mercury', SUN + 13, SUN)).toBe(true);
  });

  it('Rahu, Ketu and the Sun are never combust', () => {
    for (const p of ['Rahu', 'Ketu', 'Sun']) expect(isCombust(p, SUN + 1, SUN, true)).toBe(false);
  });

  it('the earlier single orb is a named profile value', () => {
    setActiveProfile({ ...getActiveProfile(), combustionOrbs: 'single' });
    expect(isCombust('Mercury', SUN + 13, SUN, true)).toBe(true);
    expect(DEFAULT_PROFILE.combustionOrbs).toBe('by-motion');
  });
});

describe('[ST1] the gemstone analysis reads the same orbs', () => {
  const chart = (retro: boolean) => ({
    planets: [
      { planet: 'Sun', longitude: SUN, sign: 'Cancer', house: 1, isRetrograde: false },
      { planet: 'Mercury', longitude: SUN + 13, sign: 'Cancer', house: 1, isRetrograde: retro },
    ],
  });
  const mercury = (retro: boolean) =>
    analyzePlanetStrengths(chart(retro)).find((p) => p.planet === 'Mercury')!.reason;

  it('a Mercury 13 degrees from the Sun is combust when direct and not when retrograde', () => {
    expect(mercury(false)).toContain('Combust');
    expect(mercury(true)).not.toContain('Combust');
  });
});
