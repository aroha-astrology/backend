// =============================================================================
// Palm reading — who the reader is (and nothing from their chart)
// =============================================================================
// Palmistry stands on its own (owner, 2026-10-24): no kundli, planet or dasha reaches a palm
// prompt. What the model DOES get is what the reader told us about themselves — name, gender,
// age, birth place and whether they are married — so a reading never says "you married at 28"
// to someone who is 33 and single.
//
// Relationship status is an account-level answer: it describes the account owner, so it is
// left out ('unknown') when the palm being read belongs to a saved family profile.
// =============================================================================

import type { PlaceOfBirth, UserRow } from '../../db/schema.js';
import { resolveProfileContext } from '../birth-profiles/profile-context.js';
import type { MaritalState } from '../../lib/astro-engine/palm/palm-timing.js';

export interface PalmPerson {
  name: string | null;
  gender: 'male' | 'female' | 'other' | null;
  /** Whole years today, or null when the date of birth is not on file. */
  age: number | null;
  /** City / region as the reader entered it, or null. */
  birthPlace: string | null;
  marital: MaritalState;
  /** The reader's own words for it, for the prompt ("single", "engaged", ...), or null. */
  maritalLabel: string | null;
}

const MS_PER_YEAR = 365.25 * 86_400_000;

export function ageFromDateOfBirth(
  dateOfBirth: string | null | undefined,
  now: Date,
): number | null {
  if (!dateOfBirth) return null;
  const born = new Date(`${dateOfBirth.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return null;
  const years = (now.getTime() - born.getTime()) / MS_PER_YEAR;
  return years >= 0 && years < 120 ? Math.floor(years) : null;
}

/** Maps the stored relationship status onto the three states palm timing needs. */
export function maritalState(status: string | null | undefined): MaritalState {
  switch (status) {
    case 'single':
    case 'in_relationship':
    case 'engaged':
      return 'unmarried';
    case 'married':
      return 'married';
    case 'divorced':
    case 'widowed':
    case 'separated':
      return 'previously_married';
    default:
      return 'unknown'; // complicated, prefer_not_to_say, not answered
  }
}

/** "Pune, Maharashtra" — the place's name and state; coordinates and timezone never leave. */
function placeText(place: PlaceOfBirth | null | undefined): string | null {
  if (!place?.name) return null;
  const parts = [place.name, place.admin1].filter(
    (x): x is string => typeof x === 'string' && x.trim().length > 0,
  );
  return [...new Set(parts)].join(', ');
}

export async function loadPalmPerson(
  user: UserRow,
  birthProfileId: string | null,
  now: Date = new Date(),
): Promise<PalmPerson> {
  const profile = await resolveProfileContext(user, birthProfileId);
  const own = profile.birthProfileId === null;
  const status = own ? user.relationshipStatus : null;
  return {
    name: profile.displayName?.trim() || null,
    gender: profile.gender,
    age: ageFromDateOfBirth(profile.dateOfBirth, now),
    birthPlace: placeText(profile.placeOfBirth),
    marital: maritalState(status),
    maritalLabel: status && status !== 'prefer_not_to_say' ? status.replace(/_/g, ' ') : null,
  };
}

/** The reader's facts as lines for a prompt's data block; empty when nothing is known. */
export function personFactsBlock(person: PalmPerson): string {
  const lines: string[] = [];
  if (person.name) lines.push(`Name: ${person.name}`);
  if (person.gender) lines.push(`Gender: ${person.gender}`);
  if (person.age !== null) lines.push(`Age today: ${person.age}`);
  if (person.birthPlace) lines.push(`Born in: ${person.birthPlace}`);
  if (person.maritalLabel)
    lines.push(`Relationship status (their own answer): ${person.maritalLabel}`);
  return lines.join('\n');
}
