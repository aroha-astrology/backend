// =============================================================================
// Varsheshwara — Lord of the Year, selected from the 5 Panchadhikaris
// =============================================================================
// Scoring note: classical Tajik selection weighs each candidate's
// Panchavargiya Bala (Kshetra + Uchcha + Hudda + Drekkana + Navamsha Bala,
// five Tajik-specific strength components). That exact five-fold system
// could not be sourced with confidence for this implementation. Candidates
// are instead ranked by classical Shadbala (astro-engine/calculations/
// shadbala.ts's calculateShadbala, already implemented and tested in this
// codebase) computed on the Varsha Kundali — a real, verified planetary-
// strength measure, substituted honestly rather than presenting a guessed
// Panchavargiya Bala as the genuine classical figure. Documented here so a
// future pass can swap in the real five-fold system without changing this
// module's shape.
// =============================================================================

import { SIGN_LORDS, ZODIAC_SIGNS } from '@aroha-astrology/shared';
import { getAspectedSigns } from '../../astro-tools/transit.js';
import { calculateShadbala } from '../calculations/shadbala.js';
import type { ChartData } from '@aroha-astrology/shared';

function signLordByIndex(signIndex: number): string {
  const signName = ZODIAC_SIGNS[signIndex];
  return (signName && SIGN_LORDS[signName]) || 'Sun';
}

/**
 * Tri-Rashi Pati — the third of the year-lord candidates, looked up by the
 * annual Ascendant's sign and whether the solar return is a day or night
 * return. Table as specified (audit-provided, treated as the verified
 * classical reference for this specific lookup).
 */
const TRI_RASHI_PATI: Readonly<Record<number, { day: string; night: string }>> = {
  0: { day: 'Sun', night: 'Jupiter' }, // Aries
  1: { day: 'Venus', night: 'Moon' }, // Taurus
  2: { day: 'Saturn', night: 'Mercury' }, // Gemini
  3: { day: 'Venus', night: 'Mars' }, // Cancer
  4: { day: 'Jupiter', night: 'Sun' }, // Leo
  5: { day: 'Moon', night: 'Venus' }, // Virgo
  6: { day: 'Mercury', night: 'Saturn' }, // Libra
  7: { day: 'Mars', night: 'Venus' }, // Scorpio
  8: { day: 'Saturn', night: 'Saturn' }, // Sagittarius
  9: { day: 'Mars', night: 'Mars' }, // Capricorn
  10: { day: 'Jupiter', night: 'Jupiter' }, // Aquarius
  11: { day: 'Moon', night: 'Moon' }, // Pisces
};

export type Panchadhikari =
  | 'Janma Lagnesha'
  | 'Munthesh'
  | 'Varsha Lagnesha'
  | 'Dina-Ratri Pati'
  | 'Tri-Rashi Pati';

export interface PanchadhikariCandidate {
  role: Panchadhikari;
  planet: string;
  strength: number; // total Shadbala virupas on the Varsha Kundali
  aspectsVarshaAscendant: boolean;
}

export interface VarsheshwaraResult {
  varsheshwara: string;
  candidates: PanchadhikariCandidate[];
  /** True only in the classical tie-break case: all candidates aspect the Ascendant with equal strength, so Munthesh wins by rule rather than by score. */
  wonByMunthaTiebreak: boolean;
}

/**
 * Selects the Varsheshwara (Lord of the Year) from the 5 Panchadhikaris.
 *
 * @param natalAscSignIndex natal Ascendant sign index (0-11)
 * @param munthaSignIndex the Muntha's sign index (0-11) -- see muntha.ts
 * @param varshaChart the cast Varsha Kundali (see solarReturn.ts)
 * @param isDayReturn whether the solar return is a day or night return (see solarReturn.ts)
 */
export function selectVarsheshwara(
  natalAscSignIndex: number,
  munthaSignIndex: number,
  varshaChart: ChartData,
  isDayReturn: boolean,
): VarsheshwaraResult {
  const varshaAscSignIndex = varshaChart.ascendant.signIndex;
  const shadbala = calculateShadbala(varshaChart);
  const strengthOf = (planet: string): number =>
    shadbala.find((s) => s.planet === planet)?.totalVirupas ?? 0;

  // Dina-Ratri Pati is the LORD of the Sun's (day return) or Moon's (night
  // return) sign in the annual chart -- not the Sun/Moon itself.
  const dinaRatriSignIndex =
    varshaChart.planets.find((p) => p.planet === (isDayReturn ? 'Sun' : 'Moon'))?.signIndex ?? 0;
  const dinaRatriLord = signLordByIndex(dinaRatriSignIndex);

  const triRashi = TRI_RASHI_PATI[varshaAscSignIndex];
  const triRashiPatiLord = isDayReturn ? (triRashi?.day ?? 'Sun') : (triRashi?.night ?? 'Moon');

  const roleAndPlanet: { role: Panchadhikari; planet: string }[] = [
    { role: 'Janma Lagnesha', planet: signLordByIndex(natalAscSignIndex) },
    { role: 'Munthesh', planet: signLordByIndex(munthaSignIndex) },
    { role: 'Varsha Lagnesha', planet: signLordByIndex(varshaAscSignIndex) },
    { role: 'Dina-Ratri Pati', planet: dinaRatriLord },
    { role: 'Tri-Rashi Pati', planet: triRashiPatiLord },
  ];

  const candidates: PanchadhikariCandidate[] = roleAndPlanet.map(({ role, planet }) => {
    const planetSignIndex = varshaChart.planets.find((p) => p.planet === planet)?.signIndex;
    const aspectsVarshaAscendant =
      planetSignIndex !== undefined &&
      (planetSignIndex === varshaAscSignIndex ||
        getAspectedSigns(planet, planetSignIndex).includes(varshaAscSignIndex));
    return { role, planet, strength: strengthOf(planet), aspectsVarshaAscendant };
  });

  const aspecting = candidates.filter((c) => c.aspectsVarshaAscendant);
  const pool = aspecting.length > 0 ? aspecting : candidates;

  const maxStrength = Math.max(...pool.map((c) => c.strength));
  const strongest = pool.filter((c) => c.strength === maxStrength);

  // All aspecting candidates tied on strength -> Munthesh wins by rule.
  if (aspecting.length === candidates.length && strongest.length > 1) {
    const munthesh = candidates.find((c) => c.role === 'Munthesh')!;
    return { varsheshwara: munthesh.planet, candidates, wonByMunthaTiebreak: true };
  }

  return { varsheshwara: strongest[0]!.planet, candidates, wonByMunthaTiebreak: false };
}
