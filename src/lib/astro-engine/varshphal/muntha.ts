// =============================================================================
// Muntha — the progressed ascendant
// =============================================================================
// Advances one sign per completed year of age from the natal Ascendant,
// establishing the year's primary point of engagement/focus.
// =============================================================================

export interface MunthaResult {
  signIndex: number;
  /** House from the ANNUAL chart's own Ascendant (not the natal one — the Varsha Kundali has its own Lagna). */
  houseFromVarshaAsc: number;
  isAuspicious: boolean;
}

const AUSPICIOUS_HOUSES = new Set([1, 2, 3, 5, 9, 10, 11]);

/**
 * @param completedYearsOfAge age in whole completed years AT the solar return
 *   instant (i.e. the age this birthday makes them turn).
 * @param natalAscSignIndex natal Ascendant sign index (0-11).
 * @param varshaAscSignIndex the annual (Varsha Kundali) chart's own Ascendant sign index (0-11).
 */
export function computeMuntha(
  completedYearsOfAge: number,
  natalAscSignIndex: number,
  varshaAscSignIndex: number,
): MunthaResult {
  const signIndex = (completedYearsOfAge + natalAscSignIndex) % 12;
  const houseFromVarshaAsc = ((signIndex - varshaAscSignIndex + 12) % 12) + 1;
  return {
    signIndex,
    houseFromVarshaAsc,
    isAuspicious: AUSPICIOUS_HOUSES.has(houseFromVarshaAsc),
  };
}
