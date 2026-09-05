// =============================================================================
// Progeny sphutas — Beeja, Kshetra and Putra Tithi
// =============================================================================
// The only genuinely new math the Progeny report needs; everything else it
// reads (D7, dashas, 5th-house facts, Shadbala) already existed. Pure and
// synchronous like the rest of lib/astro-engine/reports/.
//
// PROVENANCE, deliberately explicit — this module is the reason the report can
// claim to be honest. Each fact carries where its rule comes from, and the
// narrative layer is required to surface it (see PROVENANCE_RULE in
// lib/llm/reports/progeny.ts). The classical attribution here is Phaladeepika's
// progeny section for all three formulas.
//
// WHAT THESE ARE NOT: Beeja and Kshetra are astrological reproductive-capacity
// indicators. They are NOT a measure of sperm quality, ovarian reserve, uterine
// health or any other clinical quantity, and no wording anywhere in this report
// may imply otherwise. Even B. V. Raman presents them as a symbolic
// representation of the reproductive principles rather than a measurement. The
// strength bands below are a traditional polarity test, not a diagnosis.
// =============================================================================

import { ZODIAC_SIGNS } from '@aroha-astrology/shared';
import { calculateD9 } from '../charts/divisionalCharts.js';
import { getPlanetPosition } from './chart-facts.js';

/**
 * Where a rule comes from, carried on every classical claim this report makes.
 * The review this report was built from asked for exactly this rather than
 * flattening every rule into one undifferentiated "classical" bucket.
 */
export type Provenance =
  | 'TEXTUAL'
  | 'COMMENTARY'
  | 'SCHOOL-SPECIFIC'
  | 'MODERN-PRACTICE'
  | 'UNVALIDATED';

export type SphutaStrength = 'strong' | 'moderate' | 'weak';

export type SphutaKind = 'beeja' | 'kshetra';

export interface SphutaFact {
  kind: SphutaKind;
  /** Composite longitude, 0-360. */
  longitude: number;
  rasi: string;
  navamsa: string;
  /** Whether the rasi sign matches the polarity this sphuta wants (odd for Beeja, even for Kshetra). */
  rasiPolarityOk: boolean;
  navamsaPolarityOk: boolean;
  /** Both polarities match -> strong; one -> moderate; neither -> weak. */
  strength: SphutaStrength;
  provenance: Provenance;
}

export type Paksha = 'shukla' | 'krishna';

export interface PutraTithiFact {
  /** 1-30 across both fortnights. */
  index: number;
  paksha: Paksha;
  /** 1-15 within the fortnight — the number a reader would recognise. */
  numberInPaksha: number;
  /** Chidra ("pierced") tithis, traditionally weak for progeny: 4, 6, 8, 9, 12, 14 and Amavasya. */
  isChidra: boolean;
  isAmavasya: boolean;
  isPurnima: boolean;
  provenance: Provenance;
}

/** Aries(0) is the 1st sign and therefore odd. Mirrors the private helper in divisionalCharts.ts. */
function isOddSign(signIdx: number): boolean {
  return signIdx % 2 === 0;
}

function norm360(n: number): number {
  return ((n % 360) + 360) % 360;
}

function signIndexOf(longitude: number): number {
  return Math.floor(norm360(longitude) / 30);
}

/**
 * Longitude of a natal planet, or null when the chart is degraded. Returning null (rather than
 * falling back to 0 / Aries, which baby-name.ts does for the Moon) is deliberate: a sphuta is a
 * SUM of three longitudes, so one silent zero shifts the composite into a different sign
 * entirely and produces a confident wrong reading. A missing sphuta is fine; an invented one is not.
 */
function longitudeOf(planet: string, chart: Record<string, unknown> | null): number | null {
  const p = getPlanetPosition(planet, chart) as { longitude?: unknown } | undefined;
  const lon = p?.longitude;
  return typeof lon === 'number' && Number.isFinite(lon) ? lon : null;
}

/** Which three grahas compose each sphuta (Phaladeepika). */
const SPHUTA_PARTS: Record<SphutaKind, readonly [string, string, string]> = {
  beeja: ['Sun', 'Venus', 'Jupiter'],
  kshetra: ['Moon', 'Mars', 'Jupiter'],
};

/**
 * Beeja Sphuta (Sun + Venus + Jupiter) or Kshetra Sphuta (Moon + Mars + Jupiter).
 *
 * The classical test is a polarity one: Beeja should fall in an ODD sign in both the rasi and the
 * navamsa, Kshetra in an EVEN sign in both. Both matching is the strong reading, one the middling,
 * neither the weak one.
 *
 * Returns null on any missing longitude — see `longitudeOf`.
 */
export function computeSphuta(
  chart: Record<string, unknown> | null,
  kind: SphutaKind,
): SphutaFact | null {
  const parts = SPHUTA_PARTS[kind];
  const longitudes = parts.map((p) => longitudeOf(p, chart));
  if (longitudes.some((l) => l == null)) return null;

  const longitude = norm360((longitudes as number[]).reduce((a, b) => a + b, 0));
  const rasiIdx = signIndexOf(longitude);
  const navamsaIdx = calculateD9(longitude);

  // Beeja wants odd signs, Kshetra even ones.
  const wantOdd = kind === 'beeja';
  const rasiPolarityOk = isOddSign(rasiIdx) === wantOdd;
  const navamsaPolarityOk = isOddSign(navamsaIdx) === wantOdd;

  const matches = Number(rasiPolarityOk) + Number(navamsaPolarityOk);
  const strength: SphutaStrength = matches === 2 ? 'strong' : matches === 1 ? 'moderate' : 'weak';

  return {
    kind,
    longitude,
    rasi: ZODIAC_SIGNS[rasiIdx]!,
    navamsa: ZODIAC_SIGNS[navamsaIdx]!,
    rasiPolarityOk,
    navamsaPolarityOk,
    strength,
    provenance: 'TEXTUAL',
  };
}

/** Chidra ("pierced") tithi numbers within a fortnight. Amavasya is handled separately. */
const CHIDRA_TITHIS: ReadonlySet<number> = new Set([4, 6, 8, 9, 12, 14]);

/**
 * Putra (progeny) Tithi — Phaladeepika's "five times the Moon's figures minus five times the
 * Sun's", i.e. 5 x (Moon - Sun), read as an ordinary tithi.
 *
 * Computed per-chart: each person has their own Sun and Moon, so each has their own Putra Tithi.
 * The couple engine reports both rather than picking one chart's.
 */
export function computePutraTithi(chart: Record<string, unknown> | null): PutraTithiFact | null {
  const moon = longitudeOf('Moon', chart);
  const sun = longitudeOf('Sun', chart);
  if (moon == null || sun == null) return null;

  const arc = norm360(5 * moon - 5 * sun);
  const index = Math.floor(arc / 12) + 1; // 1-30
  const numberInPaksha = ((index - 1) % 15) + 1;
  const isAmavasya = index === 30;
  const isPurnima = index === 15;

  return {
    index,
    paksha: index <= 15 ? 'shukla' : 'krishna',
    numberInPaksha,
    isChidra: CHIDRA_TITHIS.has(numberInPaksha) || isAmavasya,
    isAmavasya,
    isPurnima,
    provenance: 'TEXTUAL',
  };
}
