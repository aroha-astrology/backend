// =============================================================================
// Astrocartography (relocation) — curated candidate-city MVP
// =============================================================================
// True continuous ACG world-lines (great-circle lines tracing every longitude
// where a planet is exactly angular) are out of scope for a chat-grounding
// fact — this instead recomputes the relocated Ascendant for the SAME birth
// instant across a curated list of well-known candidate cities, using the
// existing calculateAscendant() the rest of the app already uses for real
// charts. The natal planets themselves don't move (they're geocentric
// ecliptic longitudes, location-independent) — only which house each one
// falls into relative to the RELOCATED ascendant changes with location,
// which is the real astrological substance of astrocartography ("where do my
// planets become angular").
//
// Kept as a small, well-known list rather than an exhaustive gazetteer: a
// chat reply can only usefully discuss a handful of concrete places anyway,
// and every additional city is one more calculateAscendant() call per
// question.

import { calculateAscendant } from '../calculations/planetPositions.js';
import { NATURAL_BENEFICS, NATURAL_MALEFICS } from '@aroha-astrology/shared';

export interface RelocationCity {
  name: string;
  country: string;
  lat: number;
  lon: number;
}

export const CANDIDATE_CITIES: RelocationCity[] = [
  { name: 'Mumbai', country: 'India', lat: 19.076, lon: 72.8777 },
  { name: 'Delhi', country: 'India', lat: 28.6139, lon: 77.209 },
  { name: 'Bengaluru', country: 'India', lat: 12.9716, lon: 77.5946 },
  { name: 'Dubai', country: 'UAE', lat: 25.2048, lon: 55.2708 },
  { name: 'Singapore', country: 'Singapore', lat: 1.3521, lon: 103.8198 },
  { name: 'London', country: 'UK', lat: 51.5074, lon: -0.1278 },
  { name: 'New York', country: 'USA', lat: 40.7128, lon: -74.006 },
  { name: 'San Francisco', country: 'USA', lat: 37.7749, lon: -122.4194 },
  { name: 'Toronto', country: 'Canada', lat: 43.6532, lon: -79.3832 },
  { name: 'Sydney', country: 'Australia', lat: -33.8688, lon: 151.2093 },
  { name: 'Melbourne', country: 'Australia', lat: -37.8136, lon: 144.9631 },
  { name: 'Auckland', country: 'New Zealand', lat: -36.8485, lon: 174.7633 },
];

/** Kendra houses (from the Ascendant) — traditionally where a planet's
 * influence is strongest, for better or worse depending on its nature. */
const ANGULAR_HOUSES = new Set([1, 4, 7, 10]);

export interface RelocationScore {
  city: RelocationCity;
  ascendantSign: string;
  angularBenefics: string[];
  angularMalefics: string[];
  /** angularBenefics.length - angularMalefics.length; higher = more favorable. */
  score: number;
}

/**
 * Score every candidate city for a birth record: relocate the SAME birth
 * instant to each city's coordinates (the `julianDay` — and so the
 * underlying UTC moment — is computed once from the real birth date/time/
 * timezone and reused for every city; only lat/lng change) and check which
 * of the user's already-known natal planets land in an angular house
 * (1/4/7/10) from the relocated ascendant. Sorted best-first.
 *
 * `natalPlanetSignIndices` comes from the user's OWN already-computed chart
 * (chat-grounding's groundingSource, or a fresh computeMetrology) — passed in
 * rather than recomputed here, since planet longitudes are location-
 * independent and the caller already has them.
 */
export async function scoreRelocationCities(
  julianDay: number,
  natalPlanetSignIndices: Array<{ planet: string; signIndex: number }>,
  cities: RelocationCity[] = CANDIDATE_CITIES,
): Promise<RelocationScore[]> {
  const scores = await Promise.all(
    cities.map(async (city) => {
      const ascendant = await calculateAscendant(julianDay, city.lat, city.lon);
      const ascSignIndex = ascendant.signIndex;

      const angularBenefics: string[] = [];
      const angularMalefics: string[] = [];

      for (const { planet, signIndex } of natalPlanetSignIndices) {
        const houseFromAsc = ((signIndex - ascSignIndex + 12) % 12) + 1;
        if (!ANGULAR_HOUSES.has(houseFromAsc)) continue;
        if ((NATURAL_BENEFICS as string[]).includes(planet)) angularBenefics.push(planet);
        else if ((NATURAL_MALEFICS as string[]).includes(planet)) angularMalefics.push(planet);
      }

      const result: RelocationScore = {
        city,
        ascendantSign: ascendant.sign,
        angularBenefics,
        angularMalefics,
        score: angularBenefics.length - angularMalefics.length,
      };
      return result;
    }),
  );

  return scores.sort((a, b) => b.score - a.score);
}
