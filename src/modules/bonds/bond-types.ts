import type { BirthProfileRow } from '../../db/schema.js';

export type Relationship = NonNullable<BirthProfileRow['relationship']>;

/** The group a bond is listed under on the Bonds page. */
export type BondCategory = 'romantic' | 'professional' | 'family' | 'social' | 'other';

/** Every relationship has a group. A Record, so a new enum value can't be left out. */
export const BOND_CATEGORY: Record<Relationship, BondCategory> = {
  partner: 'romantic',
  fiance: 'romantic',
  spouse: 'romantic',
  prospective_match: 'romantic',
  situationship: 'romantic',
  crush: 'romantic',
  first_love: 'romantic',
  fwb: 'romantic',
  soulmate: 'romantic',
  ex: 'romantic',
  business_partner: 'professional',
  manager: 'professional',
  employee: 'professional',
  colleague: 'professional',
  investor: 'professional',
  competitor: 'professional',
  parent: 'family',
  child: 'family',
  sibling: 'family',
  cousin: 'family',
  mother_in_law: 'family',
  father_in_law: 'family',
  friend: 'social',
  roommate: 'social',
  travel_buddy: 'social',
  creative_partner: 'social',
  gym_partner: 'social',
  other: 'other',
};

export function bondCategory(relationship: Relationship | null): BondCategory {
  return relationship ? BOND_CATEGORY[relationship] : 'other';
}

export function isRomantic(relationship: Relationship | null): boolean {
  return bondCategory(relationship) === 'romantic';
}

/**
 * Guna Milan and Mangal Dosha are marriage-matching rules, so they are kept
 * for the bonds that are a marriage or may become one. The other romantic
 * bonds (a crush, a situationship, an ex ...) get the general harmony score.
 */
const MARRIAGE_TRACK: ReadonlySet<Relationship> = new Set([
  'partner',
  'fiance',
  'spouse',
  'prospective_match',
]);

export function isMarriageTrack(relationship: Relationship | null): boolean {
  return relationship !== null && MARRIAGE_TRACK.has(relationship);
}
