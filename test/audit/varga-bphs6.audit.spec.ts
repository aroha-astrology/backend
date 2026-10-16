import { describe, it, expect } from 'vitest';
import {
  calculateD4,
  calculateD7,
  calculateD9,
  calculateD10,
  calculateD12,
  calculateD16,
  calculateD20,
  calculateD24,
  calculateD27,
  calculateD40,
  calculateD45,
  calculateD60,
} from '../../src/lib/astro-engine/charts/divisionalCharts.js';

// =============================================================================
// Audit items VCH-D4 to VCH-D60 (register BPHS-6.9-33)
// =============================================================================
// Brihat Parashara Hora Shastra, chapter 6 (Santhanam translation, Sanskrit read at
// enjoylearningsanskrit.com/scriptures/parashara/chapter-6), gives where each division starts.
// The engine already matches every one of them; these tests pin it so a later edit cannot move
// a start sign unseen. Sign index: 0 Aries ... 11 Pisces. Longitude = sign * 30 + degrees.
//
//   6.9  D4:  the sign itself and its 4th, 7th and 10th
//   6.10 D7:  odd signs from the sign itself, even signs from the 7th
//   6.12 D9:  movable from the sign itself, fixed from the 9th, dual from the 5th
//   6.13 D10: odd from the sign itself, even from the 9th
//   6.15 D12: from the sign itself
//   6.16 D16: movable from Aries, fixed from Leo, dual from the third start (read as Sagittarius)
//   6.17 D20: movable from Aries, fixed from Sagittarius (capa), dual from Leo (mrgendra)
//   6.22 D24: odd from Leo, even from Cancer
//   6.26 D27: the 27 nakshatra lords from the movable sign (the usual reading by element below)
//   6.29 D40: odd from Aries, even from Libra
//   6.31 D45: movable from Aries, fixed from Leo, dual from Sagittarius
//   6.33 D60: double the degrees, divide by 12, remainder counts from the sign
// =============================================================================

const at = (sign: number, deg: number) => sign * 30 + deg;
const ARIES = 0;
const TAURUS = 1;
const GEMINI = 2;
const CANCER = 3;
const LEO = 4;
const LIBRA = 6;
const SCORPIO = 7;
const SAGITTARIUS = 8;
const CAPRICORN = 9;
const AQUARIUS = 10;

describe('[BPHS 6] where each division starts', () => {
  it('D4: the sign itself, then the 4th, 7th and 10th', () => {
    expect(calculateD4(at(ARIES, 1))).toBe(ARIES);
    expect(calculateD4(at(ARIES, 10))).toBe(CANCER);
    expect(calculateD4(at(TAURUS, 20))).toBe(SCORPIO);
    expect(calculateD4(at(ARIES, 29))).toBe(CAPRICORN);
  });

  it('D7: odd sign from itself, even sign from the 7th', () => {
    expect(calculateD7(at(ARIES, 1))).toBe(ARIES);
    expect(calculateD7(at(TAURUS, 1))).toBe(SCORPIO);
    expect(calculateD7(at(TAURUS, 10))).toBe(CAPRICORN);
  });

  it('D9: movable from itself, fixed from the 9th, dual from the 5th', () => {
    expect(calculateD9(at(CANCER, 0.5))).toBe(CANCER);
    expect(calculateD9(at(TAURUS, 0.5))).toBe(CAPRICORN);
    expect(calculateD9(at(GEMINI, 0.5))).toBe(LIBRA);
    expect(calculateD9(at(LEO, 0.5))).toBe(ARIES);
  });

  it('D10: odd from itself, even from the 9th', () => {
    expect(calculateD10(at(ARIES, 1))).toBe(ARIES);
    expect(calculateD10(at(TAURUS, 1))).toBe(CAPRICORN);
    expect(calculateD10(at(TAURUS, 3.5))).toBe(AQUARIUS);
  });

  it('D12: from the sign itself', () => {
    expect(calculateD12(at(LEO, 1))).toBe(LEO);
    expect(calculateD12(at(LEO, 7.6))).toBe(SCORPIO);
  });

  it('D16: movable from Aries, fixed from Leo, dual from Sagittarius', () => {
    expect(calculateD16(at(ARIES, 0.5))).toBe(ARIES);
    expect(calculateD16(at(TAURUS, 0.5))).toBe(LEO);
    expect(calculateD16(at(GEMINI, 0.5))).toBe(SAGITTARIUS);
  });

  it('D20: movable from Aries, fixed from Sagittarius, dual from Leo', () => {
    expect(calculateD20(at(ARIES, 0.5))).toBe(ARIES);
    expect(calculateD20(at(TAURUS, 0.5))).toBe(SAGITTARIUS);
    expect(calculateD20(at(GEMINI, 0.5))).toBe(LEO);
  });

  it('D24: odd from Leo, even from Cancer', () => {
    expect(calculateD24(at(ARIES, 0.5))).toBe(LEO);
    expect(calculateD24(at(TAURUS, 0.5))).toBe(CANCER);
  });

  it('D27: Aries, Cancer, Libra and Capricorn by element (the usual reading of 6.26)', () => {
    expect(calculateD27(at(ARIES, 0.5))).toBe(ARIES);
    expect(calculateD27(at(TAURUS, 0.5))).toBe(CANCER);
    expect(calculateD27(at(GEMINI, 0.5))).toBe(LIBRA);
    expect(calculateD27(at(CANCER, 0.5))).toBe(CAPRICORN);
  });

  it('D40: odd from Aries, even from Libra', () => {
    expect(calculateD40(at(ARIES, 0.3))).toBe(ARIES);
    expect(calculateD40(at(TAURUS, 0.3))).toBe(LIBRA);
    expect(calculateD40(at(TAURUS, 0.8))).toBe(SCORPIO);
  });

  it('D45: movable from Aries, fixed from Leo, dual from Sagittarius', () => {
    expect(calculateD45(at(ARIES, 0.3))).toBe(ARIES);
    expect(calculateD45(at(TAURUS, 0.3))).toBe(LEO);
    expect(calculateD45(at(GEMINI, 0.3))).toBe(SAGITTARIUS);
  });

  it('D60: the doubled degrees divided by 12, the remainder counted from the sign', () => {
    // Aries 10 deg 15 min: 2 x 10.25 = 20.5; 20.5 / 12 leaves 8.5; the 9th sign from Aries.
    expect(calculateD60(at(ARIES, 10.25))).toBe(SAGITTARIUS);
    // Taurus 3 deg: 2 x 3 = 6; the remainder 6, plus one, is the 7th sign from Taurus: Scorpio.
    expect(calculateD60(at(TAURUS, 3))).toBe(SCORPIO);
  });
});
