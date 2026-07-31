// =============================================================================
// Tajik Varshphal — composed entry point
// =============================================================================
// Ties solarReturn.ts + muntha.ts + varsheshwara.ts + sahams.ts into one
// yearly result. See each module's own header for the specific classical
// sources/scope notes (in particular: varsheshwara.ts substitutes classical
// Shadbala for the unverified Panchavargiya Bala, and Pancha Pakshi-style,
// birds.ts's sibling gap note applies here too for anything NOT covered by
// these four modules).
//
// SCOPE NOTE: this module computes the deterministic Varshphal data. It is
// NOT wired into a paid report route (pricing, LLM narrative generation, DB
// storage) — that is comparable in size to the Saturn-phase persistence
// feature built earlier in this same effort and is left as a follow-up.
// =============================================================================

import { computeSolarReturn, type SolarReturnResult } from './solarReturn.js';
import { computeMuntha, type MunthaResult } from './muntha.js';
import { selectVarsheshwara, type VarsheshwaraResult } from './varsheshwara.js';
import { computeAllSahams, type SahamResult } from './sahams.js';
import type { Ayanamsa, HouseSystem } from '@aroha-astrology/shared';

export interface VarshphalResult {
  targetYear: number;
  completedYearsOfAge: number;
  solarReturn: SolarReturnResult;
  muntha: MunthaResult;
  varsheshwara: VarsheshwaraResult;
  sahams: SahamResult[];
}

export interface VarshphalInputs {
  natalSunLongitude: number;
  natalAscSignIndex: number;
  birthDate: Date;
  targetYear: number;
  latitude: number;
  longitude: number;
  ayanamsa?: Ayanamsa;
  houseSystem?: HouseSystem;
}

/** Completed years of age AT the solar return instant for `targetYear`. */
function completedYearsOfAgeAt(birthDate: Date, targetYear: number): number {
  return targetYear - birthDate.getUTCFullYear();
}

export async function computeVarshphal(inputs: VarshphalInputs): Promise<VarshphalResult> {
  const {
    natalSunLongitude,
    natalAscSignIndex,
    birthDate,
    targetYear,
    latitude,
    longitude,
    ayanamsa,
    houseSystem,
  } = inputs;

  const solarReturn = await computeSolarReturn(
    natalSunLongitude,
    birthDate,
    targetYear,
    latitude,
    longitude,
    ayanamsa,
    houseSystem,
  );

  const completedYearsOfAge = completedYearsOfAgeAt(birthDate, targetYear);
  const varshaAscSignIndex = solarReturn.chart.ascendant.signIndex;
  const muntha = computeMuntha(completedYearsOfAge, natalAscSignIndex, varshaAscSignIndex);
  const varsheshwara = selectVarsheshwara(
    natalAscSignIndex,
    muntha.signIndex,
    solarReturn.chart,
    solarReturn.isDayReturn,
  );
  const sahams = computeAllSahams(solarReturn.chart, solarReturn.isDayReturn);

  return { targetYear, completedYearsOfAge, solarReturn, muntha, varsheshwara, sahams };
}

export * from './solarReturn.js';
export * from './muntha.js';
export * from './varsheshwara.js';
export * from './sahams.js';
