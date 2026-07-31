// =============================================================================
// Lal Kitab TRANSIT Remedies — remedy by house the Moon is CURRENTLY
// transiting from the natal Moon, distinct from remedies.ts's NATAL
// placement table (keyed ${planet}_${natalHouse}).
// =============================================================================
// The audit this responds to specifically named this gap: Aroha flags a
// challenging transit (e.g. Ashtama Chandra, Moon in the 8th house from
// natal Moon) but never pairs it with a mitigation. This table is the
// audit's own worked Moon-transit remedy text, used verbatim (not
// paraphrased or extended) rather than inventing entries for houses the
// source didn't provide -- houses 9-12 are intentionally absent rather than
// fabricated. Sourced content, not independently re-verified against a
// primary Lal Kitab text the way remedies.ts's 108-combination table was.
// =============================================================================

const MOON_TRANSIT_REMEDIES: Readonly<Record<number, string[]>> = {
  1: ['Avoid green colors and conflict with your sister-in-law', 'Keep a silver plate at home'],
  2: ['Offer green-colored clothes to children for 43 days', 'Avoid keeping a Shivling at home'],
  3: ['Worship Goddess Durga; perform Kanya Pujan', "Do not exploit a daughter's wealth"],
  4: ['Donate milk to reduce negativity', "Avoid unnecessary interference in others' matters"],
  5: ['Refrain from greed and selfishness', 'Do not harm others for personal gain'],
  6: [
    'Serve milk to your father directly',
    'Do not donate milk to the general public, only in temples',
  ],
  7: ['Perform Shiva Pujan', 'Avoid marriage in the 24th year of life'],
  8: [
    'Avoid large bodies of water; practice Pranayama (breath meditation)',
    'Keep the North-West corner of your home clean',
  ],
};

export interface TransitRemedyResult {
  house: number;
  remedies: string[];
  /** True for houses 9-12, which this table does not cover -- see module header. */
  covered: boolean;
}

/** Lal Kitab remedy for the Moon's CURRENT transit house from natal Moon (1-8 covered; see module header for why 9-12 are not). */
export function getMoonTransitRemedy(houseFromMoon: number): TransitRemedyResult {
  const remedies = MOON_TRANSIT_REMEDIES[houseFromMoon];
  return {
    house: houseFromMoon,
    remedies: remedies ? [...remedies] : [],
    covered: remedies !== undefined,
  };
}
