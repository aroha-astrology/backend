// =============================================================================
// Varsheshwara — Lord of the Year, selected from the 5 Panchadhikaris
// =============================================================================
// Tajika Neelakanthi chapter 1 (register TN-1.60-67, audit items T2 and TJ5). The five
// officers are the lords of the birth lagna, the Varsha lagna and the Muntha sign, the
// Tri-Rashi lord, and the lord of the Sun's sign by day or the Moon's sign by night. They
// are weighed by their Panchavargi Bala and by whether they look at the Varsha lagna
// (Tajika aspects); the rules are in tajika.ts. This module used to rank them by Shadbala
// and to read aspects the Parashari way, neither of which the text does.
//
// The Tri-Rashi table below is verse 60 and was checked against it (2026-10-11): by day
// Aries to Cancer have the Sun, Venus, Saturn, Venus; by night Jupiter, the Moon, Mercury,
// Mars; Leo to Scorpio take the other time's planets; Sagittarius to Pisces always Saturn,
// Mars, Jupiter, the Moon.
// =============================================================================

import { SIGN_LORDS, ZODIAC_SIGNS } from '@aroha-astrology/shared';
import type { ChartData, Planet } from '@aroha-astrology/shared';
import type { DayContext } from '../rules/day.js';
import { chooseVarsheshwara, panchavargiBala, tajikaAspectKala, type Contender } from './tajika.js';

function signLordByIndex(signIndex: number): string {
  const signName = ZODIAC_SIGNS[signIndex];
  return (signName && SIGN_LORDS[signName]) || 'Sun';
}

/**
 * Tri-Rashi Pati — the third of the year-lord candidates, looked up by the
 * annual Ascendant's sign and whether the solar return is a day or night
 * return. Tajika Neelakanthi 1.60 (verified against the verse).
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
  /** The Panchavargi Bala out of 20 on the Varsha Kundali (Tajika Neelakanthi 1.39-40). */
  strength: number;
  aspectsVarshaAscendant: boolean;
  /** How hard it looks at the Varsha lagna, in kalas out of 60 (0 = not at all). */
  aspectKala?: number;
}

export interface VarsheshwaraResult {
  varsheshwara: string;
  candidates: PanchadhikariCandidate[];
  /** True when the Muntha lord wins by the rule (equal strength and aspect, or all five weak). */
  wonByMunthaTiebreak: boolean;
}

/**
 * Selects the Varsheshwara (Lord of the Year) from the 5 Panchadhikaris.
 *
 * @param natalAscSignIndex natal Ascendant sign index (0-11)
 * @param munthaSignIndex the Muntha's sign index (0-11) -- see muntha.ts
 * @param varshaChart the cast Varsha Kundali (see solarReturn.ts)
 * @param isDayReturn whether the solar return is a day or night return (see solarReturn.ts)
 * @param _dayContext no longer used: the Panchavargi Bala does not need the hour (it was needed by Shadbala)
 */
export function selectVarsheshwara(
  natalAscSignIndex: number,
  munthaSignIndex: number,
  varshaChart: ChartData,
  isDayReturn: boolean,
  _dayContext?: DayContext | null,
): VarsheshwaraResult {
  const varshaAscSignIndex = varshaChart.ascendant.signIndex;

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
    // The Varsha lagna counted from the planet: Tajika aspects go to the 1st, 3rd, 4th, 5th,
    // 7th, 9th, 10th and 11th place from it (Tajika Neelakanthi 1.77-78).
    const aspectKala =
      planetSignIndex === undefined
        ? 0
        : tajikaAspectKala(((varshaAscSignIndex - planetSignIndex + 12) % 12) + 1);
    return {
      role,
      planet,
      strength: panchavargiBala(planet as Planet, varshaChart).vimsopaka,
      aspectsVarshaAscendant: aspectKala > 0,
      aspectKala,
    };
  });

  const contenders: Contender[] = candidates.map((c) => ({
    role: c.role,
    planet: c.planet as Planet,
    strength: c.strength,
    aspectKala: c.aspectKala ?? 0,
  }));
  const chosen = chooseVarsheshwara(contenders);

  return {
    varsheshwara: chosen.planet,
    candidates,
    wonByMunthaTiebreak: chosen.wonByMunthaTiebreak,
  };
}
