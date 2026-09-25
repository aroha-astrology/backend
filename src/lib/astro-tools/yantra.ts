// =============================================================================
// Digital Yantra design — built from the chart, not a name on a template
// =============================================================================
// Which planet: the running Mahadasha lord when it's a natural benefic (lean
// into the season you're in); otherwise the weakest benefic whose Shadbala is
// below what it needs (strengthen what's weak); otherwise the Mahadasha lord
// (steady the season's ruler).
//
// The yantra itself is that graha's classical Navagraha number square: the
// Surya yantra 6 1 8 / 7 5 3 / 2 9 4 (every row, column and diagonal sums to
// 15), each following graha adding one to every cell — Chandra 18, Mangal
// 21, Budha 24, Guru 27, Shukra 30, Shani 33, Rahu 36, Ketu 39. Its beej
// mantra, colours and the birth nakshatra complete the design. Pure: the
// service feeds it the chart's facts.
// =============================================================================

import type { Planet } from '@aroha-astrology/shared';
import { NAKSHATRAS } from '@aroha-astrology/shared';
import type { WhyFactor } from '../intelligence/types.js';

/** Navagraha order — also each yantra's offset from the Surya square. */
export const NAVAGRAHA: readonly Planet[] = [
  'Sun',
  'Moon',
  'Mars',
  'Mercury',
  'Jupiter',
  'Venus',
  'Saturn',
  'Rahu',
  'Ketu',
];

const SURYA_SQUARE = [
  [6, 1, 8],
  [7, 5, 3],
  [2, 9, 4],
] as const;

/** The graha's 3×3 yantra grid. */
export function navagrahaGrid(planet: Planet): number[][] {
  const k = NAVAGRAHA.indexOf(planet);
  return SURYA_SQUARE.map((row) => row.map((n) => n + Math.max(0, k)));
}

/** Each row, column and diagonal of the graha's grid adds up to this. */
export function magicSum(planet: Planet): number {
  return 15 + 3 * Math.max(0, NAVAGRAHA.indexOf(planet));
}

/** The graha's beej mantra — Devanagari (read in every app language) and IAST. */
export const BEEJ_MANTRA: Record<Planet, { devanagari: string; iast: string }> = {
  Sun: {
    devanagari: 'ॐ ह्रां ह्रीं ह्रौं सः सूर्याय नमः',
    iast: 'oṃ hrāṃ hrīṃ hrauṃ saḥ sūryāya namaḥ',
  },
  Moon: {
    devanagari: 'ॐ श्रां श्रीं श्रौं सः चन्द्रमसे नमः',
    iast: 'oṃ śrāṃ śrīṃ śrauṃ saḥ candramase namaḥ',
  },
  Mars: {
    devanagari: 'ॐ क्रां क्रीं क्रौं सः भौमाय नमः',
    iast: 'oṃ krāṃ krīṃ krauṃ saḥ bhaumāya namaḥ',
  },
  Mercury: {
    devanagari: 'ॐ ब्रां ब्रीं ब्रौं सः बुधाय नमः',
    iast: 'oṃ brāṃ brīṃ brauṃ saḥ budhāya namaḥ',
  },
  Jupiter: {
    devanagari: 'ॐ ग्रां ग्रीं ग्रौं सः गुरवे नमः',
    iast: 'oṃ grāṃ grīṃ grauṃ saḥ gurave namaḥ',
  },
  Venus: {
    devanagari: 'ॐ द्रां द्रीं द्रौं सः शुक्राय नमः',
    iast: 'oṃ drāṃ drīṃ drauṃ saḥ śukrāya namaḥ',
  },
  Saturn: {
    devanagari: 'ॐ प्रां प्रीं प्रौं सः शनैश्चराय नमः',
    iast: 'oṃ prāṃ prīṃ prauṃ saḥ śanaiścarāya namaḥ',
  },
  Rahu: {
    devanagari: 'ॐ भ्रां भ्रीं भ्रौं सः राहवे नमः',
    iast: 'oṃ bhrāṃ bhrīṃ bhrauṃ saḥ rāhave namaḥ',
  },
  Ketu: {
    devanagari: 'ॐ स्रां स्रीं स्रौं सः केतवे नमः',
    iast: 'oṃ srāṃ srīṃ srauṃ saḥ ketave namaḥ',
  },
};

/** Traditional graha colours: the field, the lines, and a soft background. */
export const GRAHA_COLOURS: Record<
  Planet,
  { primary: string; accent: string; background: string }
> = {
  Sun: { primary: '#E4572E', accent: '#F9C74F', background: '#2B0F08' },
  Moon: { primary: '#E9ECEF', accent: '#A9D6E5', background: '#10151F' },
  Mars: { primary: '#D62828', accent: '#F77F00', background: '#2A0707' },
  Mercury: { primary: '#2A9D8F', accent: '#8AC926', background: '#06201C' },
  Jupiter: { primary: '#F4C430', accent: '#FFE8A3', background: '#2A2106' },
  Venus: { primary: '#F8C8DC', accent: '#FFFFFF', background: '#24131B' },
  Saturn: { primary: '#3A5A9B', accent: '#9AB3E8', background: '#070B1A' },
  Rahu: { primary: '#6C757D', accent: '#B8C0C8', background: '#111315' },
  Ketu: { primary: '#8D6E63', accent: '#D7CCC8', background: '#150F0D' },
};

const NATURAL_BENEFICS: readonly Planet[] = ['Jupiter', 'Venus', 'Mercury', 'Moon'];

export interface ShadbalaEntry {
  planet: Planet;
  totalVirupas: number;
  requiredVirupas: number;
}

export interface YantraChoice {
  planet: Planet;
  why: WhyFactor[];
}

/** Picks the yantra's graha (see the module header). */
export function chooseYantraPlanet(opts: {
  mahadasha: { planet: Planet; until: string } | null;
  shadbala: readonly ShadbalaEntry[];
}): YantraChoice | null {
  const maha = opts.mahadasha;
  const dashaWhy = (planet: Planet, until: string): WhyFactor => ({
    kind: 'dasha',
    planet,
    level: 'mahadasha',
    effect: 0,
    textKey: 'yantra.why.dasha',
    params: { planet, until },
  });
  if (maha && NATURAL_BENEFICS.includes(maha.planet)) {
    return { planet: maha.planet, why: [dashaWhy(maha.planet, maha.until)] };
  }
  const weakBenefics = opts.shadbala
    .filter((s) => NATURAL_BENEFICS.includes(s.planet) && s.requiredVirupas > 0)
    .map((s) => ({ planet: s.planet, pct: Math.round((s.totalVirupas / s.requiredVirupas) * 100) }))
    .filter((s) => s.pct < 100)
    .sort((a, b) => a.pct - b.pct);
  const weakest = weakBenefics[0];
  if (weakest) {
    return {
      planet: weakest.planet,
      why: [
        {
          kind: 'yoga',
          planet: weakest.planet,
          effect: -1,
          textKey: 'yantra.why.weakBenefic',
          params: { planet: weakest.planet, pct: weakest.pct },
        },
        ...(maha ? [dashaWhy(maha.planet, maha.until)] : []),
      ],
    };
  }
  return maha ? { planet: maha.planet, why: [dashaWhy(maha.planet, maha.until)] } : null;
}

export interface YantraSpec {
  planet: Planet;
  grid: number[][];
  magicSum: number;
  mantra: { devanagari: string; iast: string };
  colours: { primary: string; accent: string; background: string };
  /** The birth nakshatra, engine spelling ("PurvaPhalguni"). */
  nakshatra: string;
  /** i18n key of the day's affirmation line for this graha. */
  affirmationKey: string;
  why: WhyFactor[];
}

export function buildYantraSpec(choice: YantraChoice, birthNakshatraIndex: number): YantraSpec {
  return {
    planet: choice.planet,
    grid: navagrahaGrid(choice.planet),
    magicSum: magicSum(choice.planet),
    mantra: BEEJ_MANTRA[choice.planet],
    colours: GRAHA_COLOURS[choice.planet],
    nakshatra: NAKSHATRAS[birthNakshatraIndex] ?? '',
    affirmationKey: `yantra.affirmation.${choice.planet.toLowerCase()}`,
    why: choice.why,
  };
}
