// =============================================================================
// The natal-promise cap: the annual chart cannot give what the birth chart does not promise
// =============================================================================
// Rule (M.S. Mehta, Annual Horoscope (Varshaphala), ch. XI): "The annual chart cannot give what is
// not promised in the birth chart." The promise of a house is read from the natal chart: how well
// its lord stands (sign dignity), whether that lord sits in a dusthana, and which benefics or
// malefics occupy or look at the house. All the numbers are in NATAL_PROMISE (uncalibrated).
// Pure functions; scoring (C3) calls capByPromise on the good side of an area's annual signal.
// =============================================================================

import type { ChartData, Planet } from '@aroha-astrology/shared';
import { SIGN_LORDS, ZODIAC_SIGNS } from '@aroha-astrology/shared';
import { getAspectedSigns } from '../../astro-tools/transit.js';
import { SIGN_DIGNITY_SCORE, signDignity } from '../rules/dignity.js';
import { NATAL_PROMISE as N } from '../../../config/varshik-weights.js';

const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));

export interface NatalPromise {
  house: number;
  score: number;
  parts: { lordDignity: number; lordInDusthana: number; benefics: number; malefics: number };
}

/** The promise of `house` (1-12 from the natal Lagna), -1 to +1. */
export function natalPromise(natal: ChartData, house: number): NatalPromise {
  const lagna = natal.ascendant.signIndex;
  const sign = (lagna + house - 1) % 12;
  const lordName = SIGN_LORDS[ZODIAC_SIGNS[sign]!] as Planet;
  const lord = natal.planets.find((p) => p.planet === lordName);

  let lordDignity = 0;
  let lordInDusthana = 0;
  if (lord) {
    lordDignity = N.lordDignity * ((SIGN_DIGNITY_SCORE[signDignity(lordName, lord.signIndex)] - 2.5) / 2.5);
    const lordHouse = ((lord.signIndex - lagna + 12) % 12) + 1;
    if (N.dusthana.includes(lordHouse) && lordHouse !== house) lordInDusthana = N.lordInDusthana;
  }

  const looks = (name: string) => {
    const p = natal.planets.find((x) => x.planet === name);
    return !!p && (p.signIndex === sign || getAspectedSigns(name, p.signIndex).includes(sign));
  };
  const benefics = N.benefics.filter(looks).length * N.beneficPresence;
  const malefics = N.malefics.filter((m) => natal.planets.some((p) => p.planet === m && p.signIndex === sign)).length * N.maleficPresence;

  return {
    house,
    score: clamp(lordDignity + lordInDusthana + benefics + malefics),
    parts: { lordDignity, lordInDusthana, benefics, malefics },
  };
}

/** The most a good annual signal for an area may reach, given the natal promise (-1..+1). */
export function promiseCeiling(promise: number): number {
  if (promise >= N.fullAt) return 1;
  return N.floorCeiling + ((1 - N.floorCeiling) * (promise + 1)) / (N.fullAt + 1);
}

/** Holds a good annual signal under the ceiling; a bad one is left as it is. */
export function capByPromise(annualSignal: number, promise: number): number {
  return annualSignal > 0 ? Math.min(annualSignal, promiseCeiling(promise)) : annualSignal;
}
