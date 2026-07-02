// @ts-nocheck
// =============================================================================
// Divisional Chart (Varga) Calculations - Shodashvarga (16 Divisions)
// =============================================================================
//
// Each function takes a planet's sidereal longitude (0-360) and returns
// the sign index (0-11) in the respective divisional chart.
// All math is fully deterministic with no external dependencies.
// =============================================================================

import type {
  Planet,
  ZodiacSign,
  DivisionalChart,
  ChartData,
  HouseData,
} from '@aroha-astrology/shared';

import { ZODIAC_SIGNS } from '@aroha-astrology/shared';

// =============================================================================
// Helpers
// =============================================================================

/** Normalize sign index into 0-11 range. */
function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

/** Get 0-based sign index from longitude. */
function signIndex(longitude: number): number {
  return Math.floor((((longitude % 360) + 360) % 360) / 30);
}

/** Get degree within the sign (0-30). */
function signDegree(longitude: number): number {
  let n = longitude % 360;
  if (n < 0) n += 360;
  return n % 30;
}

/** Whether a sign index (0-11) is odd (1-indexed: Aries=1 is odd). */
function isOddSign(idx: number): boolean {
  return idx % 2 === 0; // Aries(0)=odd(1st), Taurus(1)=even(2nd), etc.
}

/** Sign element: 0=Fire, 1=Earth, 2=Air, 3=Water */
function signElement(idx: number): number {
  return idx % 4;
}

/** Sign modality: 0=Movable(Cardinal), 1=Fixed, 2=Dual(Mutable) */
function signModality(idx: number): number {
  return idx % 3;
}

// =============================================================================
// D1 - Rashi
// =============================================================================

export function calculateD1(longitude: number): number {
  return signIndex(longitude);
}

// =============================================================================
// D2 - Hora
// =============================================================================
// Each sign is split into two halves of 15 degrees.
// Odd signs: 0-15 = Sun (Leo=4), 15-30 = Moon (Cancer=3)
// Even signs: 0-15 = Moon (Cancer=3), 15-30 = Sun (Leo=4)

export function calculateD2(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const firstHalf = deg < 15;

  if (isOddSign(si)) {
    // Odd sign: first half Sun(Leo), second half Moon(Cancer)
    return firstHalf ? 4 : 3; // Leo=4, Cancer=3
  } else {
    // Even sign: first half Moon(Cancer), second half Sun(Leo)
    return firstHalf ? 3 : 4;
  }
}

// =============================================================================
// D3 - Drekkana
// =============================================================================
// Each sign divided into 3 parts of 10 degrees each.
// Part 1 (0-10): same sign
// Part 2 (10-20): 5th from sign
// Part 3 (20-30): 9th from sign

export function calculateD3(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const part = Math.floor(deg / 10); // 0, 1, or 2

  const offsets = [0, 4, 8]; // same, 5th, 9th (0-indexed offsets)
  return mod12(si + offsets[part]);
}

// =============================================================================
// D4 - Chaturthamsa
// =============================================================================
// Each sign divided into 4 parts of 7.5 degrees.
// Part 1 (0-7.5): same sign
// Part 2 (7.5-15): 4th from sign
// Part 3 (15-22.5): 7th from sign
// Part 4 (22.5-30): 10th from sign

export function calculateD4(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const part = Math.floor(deg / 7.5); // 0, 1, 2, or 3

  const offsets = [0, 3, 6, 9]; // same, 4th, 7th, 10th
  return mod12(si + offsets[part]);
}

// =============================================================================
// D5 - Panchamsa (Awards, Fame)
// =============================================================================
// Each sign divided into 5 parts of 6 degrees.

export function calculateD5(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const part = Math.floor(deg / 6); // 5 parts of 6 degrees
  return mod12(si + part);
}

// =============================================================================
// D6 - Shashtamsa (Health, Litigation)
// =============================================================================
// Each sign divided into 6 parts of 5 degrees.

export function calculateD6(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const part = Math.floor(deg / 5); // 6 parts of 5 degrees
  return mod12(si + part);
}

// =============================================================================
// D7 - Saptamsha
// =============================================================================
// Each sign divided into 7 equal parts of 4 17/7 degrees (30/7).
// Odd signs: count from same sign forward.
// Even signs: count from 7th sign forward.

export function calculateD7(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const partSize = 30 / 7; // ~4.285714 degrees
  const part = Math.floor(deg / partSize); // 0-6

  const startSign = isOddSign(si) ? si : mod12(si + 6); // same or 7th
  return mod12(startSign + part);
}

// =============================================================================
// D8 - Ashtamsa (Sudden Events, Troubles)
// =============================================================================
// Each sign divided into 8 parts of 3.75 degrees.

export function calculateD8(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const part = Math.floor(deg / 3.75); // 8 parts of 3.75 degrees
  return mod12(si + part);
}

// =============================================================================
// D9 - Navamsa
// =============================================================================
// Each sign divided into 9 parts of 3 20' (10/3 degrees).
// Starting sign based on element of natal sign:
// Fire (Aries, Leo, Sag) -> start from Aries (0)
// Earth (Taurus, Virgo, Cap) -> start from Capricorn (9)
// Air (Gemini, Libra, Aqua) -> start from Libra (6)
// Water (Cancer, Scorpio, Pisces) -> start from Cancer (3)

export function calculateD9(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const partSize = 30 / 9; // 3.333... degrees
  const part = Math.floor(deg / partSize); // 0-8

  // Element: Fire=0, Earth=1, Air=2, Water=3
  const element = signElement(si);
  const startSigns = [0, 9, 6, 3]; // Aries, Cap, Libra, Cancer
  return mod12(startSigns[element] + part);
}

// =============================================================================
// D10 - Dashamsha
// =============================================================================
// Each sign divided into 10 parts of 3 degrees.
// Odd signs: count from same sign.
// Even signs: count from 9th sign (offset 8).

export function calculateD10(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const part = Math.floor(deg / 3); // 0-9

  const startSign = isOddSign(si) ? si : mod12(si + 8); // same or 9th
  return mod12(startSign + part);
}

// =============================================================================
// D11 - Rudramsa (Death, Destruction, Sudden Changes)
// =============================================================================
// Each sign divided into 11 parts.

export function calculateD11(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const partSize = 30 / 11;
  const part = Math.floor(deg / partSize);
  return mod12(si + part);
}

// =============================================================================
// D12 - Dwadashamsha
// =============================================================================
// Each sign divided into 12 parts of 2.5 degrees.
// Always start from same sign and count forward.

export function calculateD12(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const part = Math.floor(deg / 2.5); // 0-11

  return mod12(si + part);
}

// =============================================================================
// D14 - Chaturdamsa (Death of family members, deeper karmic analysis)
// =============================================================================
// Each sign divided into 14 parts.

export function calculateD14(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const partSize = 30 / 14;
  const part = Math.floor(deg / partSize);
  return mod12(si + part);
}

// =============================================================================
// D16 - Shodashamsha
// =============================================================================
// Each sign divided into 16 parts of 1.875 degrees (1 52'30").
// Movable signs (Cardinal): start from Aries (0)
// Fixed signs: start from Leo (4)
// Dual signs (Mutable): start from Sagittarius (8)

export function calculateD16(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const partSize = 30 / 16; // 1.875
  const part = Math.floor(deg / partSize); // 0-15

  const modality = signModality(si);
  const startSigns = [0, 4, 8]; // Aries, Leo, Sag
  return mod12(startSigns[modality] + part);
}

// =============================================================================
// D20 - Vimshamsha
// =============================================================================
// Each sign divided into 20 parts of 1.5 degrees.
// Movable signs: start from Aries (0)
// Fixed signs: start from Sagittarius (8)
// Dual signs: start from Leo (4)

export function calculateD20(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const partSize = 30 / 20; // 1.5
  const part = Math.floor(deg / partSize); // 0-19

  const modality = signModality(si);
  const startSigns = [0, 8, 4]; // Aries, Sag, Leo
  return mod12(startSigns[modality] + part);
}

// =============================================================================
// D21 - Ekavimsamsa (Extended spiritual analysis)
// =============================================================================
// Each sign divided into 21 parts.

export function calculateD21(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const partSize = 30 / 21;
  const part = Math.floor(deg / partSize);
  return mod12(si + part);
}

// =============================================================================
// D24 - Chaturvimshamsha (Siddhamsa)
// =============================================================================
// Each sign divided into 24 parts of 1.25 degrees.
// Odd signs: start from Leo (4)
// Even signs: start from Cancer (3)

export function calculateD24(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const partSize = 30 / 24; // 1.25
  const part = Math.floor(deg / partSize); // 0-23

  const startSign = isOddSign(si) ? 4 : 3; // Leo or Cancer
  return mod12(startSign + part);
}

// =============================================================================
// D27 - Saptavimshamsha (Nakshatramsha / Bhamsha)
// =============================================================================
// Each sign divided into 27 parts of 1 6'40" (30/27 degrees).
// Fire signs (Aries, Leo, Sag): start from Aries (0)
// Earth signs (Taurus, Virgo, Cap): start from Cancer (3)
// Air signs (Gemini, Libra, Aqua): start from Libra (6)
// Water signs (Cancer, Scorpio, Pisces): start from Capricorn (9)

export function calculateD27(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const partSize = 30 / 27; // ~1.1111
  const part = Math.floor(deg / partSize); // 0-26

  const element = signElement(si);
  const startSigns = [0, 3, 6, 9]; // Aries, Cancer, Libra, Capricorn
  return mod12(startSigns[element] + part);
}

// =============================================================================
// D30 - Trimshamsha
// =============================================================================
// Classical 5-part unequal division (NOT equal 30 parts).
// For ODD signs: Mars 0-5, Saturn 5-10, Jupiter 10-18, Mercury 18-25, Venus 25-30
// For EVEN signs: Venus 0-5, Mercury 5-12, Jupiter 12-20, Saturn 20-25, Mars 25-30
//
// The sign assigned corresponds to the sign owned by the ruling planet:
// Mars -> Aries(0), Saturn -> Aquarius(10), Jupiter -> Sagittarius(8),
// Mercury -> Gemini(2), Venus -> Libra(6)
// (Using standard Trimshamsha sign mappings per Parashara)

export function calculateD30(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);

  // Trimshamsha ruler -> sign mapping (Parashara)
  // Mars=Aries, Saturn=Aquarius, Jupiter=Sagittarius, Mercury=Gemini, Venus=Libra
  const planetToSign: Record<string, number> = {
    Mars: 0, // Aries
    Saturn: 10, // Aquarius
    Jupiter: 8, // Sagittarius
    Mercury: 2, // Gemini
    Venus: 6, // Libra
  };

  let ruler: string;

  if (isOddSign(si)) {
    // Odd sign division
    if (deg < 5) ruler = 'Mars';
    else if (deg < 10) ruler = 'Saturn';
    else if (deg < 18) ruler = 'Jupiter';
    else if (deg < 25) ruler = 'Mercury';
    else ruler = 'Venus';
  } else {
    // Even sign division (reversed)
    if (deg < 5) ruler = 'Venus';
    else if (deg < 12) ruler = 'Mercury';
    else if (deg < 20) ruler = 'Jupiter';
    else if (deg < 25) ruler = 'Saturn';
    else ruler = 'Mars';
  }

  return planetToSign[ruler];
}

// =============================================================================
// D40 - Khavedamsha
// =============================================================================
// Each sign divided into 40 parts of 0.75 degrees (45').
// Odd signs: start from Aries (0)
// Even signs: start from Libra (6)

export function calculateD40(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const partSize = 30 / 40; // 0.75
  const part = Math.floor(deg / partSize); // 0-39

  const startSign = isOddSign(si) ? 0 : 6; // Aries or Libra
  return mod12(startSign + part);
}

// =============================================================================
// D45 - Akshavedamsha
// =============================================================================
// Each sign divided into 45 parts of 0 40' (30/45 = 2/3 degree).
// Movable signs: start from Aries (0)
// Fixed signs: start from Leo (4)
// Dual signs: start from Sagittarius (8)

export function calculateD45(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const partSize = 30 / 45; // 0.6667
  const part = Math.floor(deg / partSize); // 0-44

  const modality = signModality(si);
  const startSigns = [0, 4, 8]; // Aries, Leo, Sag
  return mod12(startSigns[modality] + part);
}

// =============================================================================
// D60 - Shashtiamsha
// =============================================================================
// Each sign divided into 60 parts of 0.5 degrees (30').
// Classical 60-part mapping: the 60 deities cycle through the zodiac.
// Each part maps to a sign: part 0 = same sign, counting forward.
// (Standard Parashara: start from same sign, count forward through 60 parts)

export function calculateD60(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const partSize = 30 / 60; // 0.5 degrees
  const part = Math.floor(deg / partSize); // 0-59

  // Classical D60: start from same sign, each successive part advances
  // one sign. Since 60 parts cycle through 12 signs exactly 5 times,
  // the sign = (sign_of_planet + part) mod 12
  return mod12(si + part);
}

// =============================================================================
// D81 - Navanavamsa (Hidden Fortune)
// =============================================================================
// Each sign divided into 81 parts.

export function calculateD81(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const partSize = 30 / 81;
  const part = Math.floor(deg / partSize);
  return mod12(si + part);
}

// =============================================================================
// D108 - Ashtottaramsa (Final Fate of Life)
// =============================================================================
// Each sign divided into 108 parts.

export function calculateD108(longitude: number): number {
  const si = signIndex(longitude);
  const deg = signDegree(longitude);
  const partSize = 30 / 108;
  const part = Math.floor(deg / partSize);
  return mod12(si + part);
}

// =============================================================================
// D60 Classical Deity Names (for reference / display)
// =============================================================================

export const D60_DEITY_NAMES: string[] = [
  'Ghora',
  'Rakshasa',
  'Deva',
  'Kubera',
  'Yaksha',
  'Kinnara',
  'Bhrashta',
  'Kulaghna',
  'Garala',
  'Vahni',
  'Maya',
  'Purishaka',
  'Apampathi',
  'Marut',
  'Kaala',
  'Sarpa',
  'Amrita',
  'Indu',
  'Mridu',
  'Komala',
  'Heramba',
  'Brahma',
  'Vishnu',
  'Maheshwara',
  'Deva',
  'Ardra',
  'Kalinasha',
  'Kshitisha',
  'Kamalakara',
  'Gulika',
  'Mrityu',
  'Kaala',
  'Davagni',
  'Ghora',
  'Yama',
  'Kantaka',
  'Sudha',
  'Amrita',
  'PurnaChandra',
  'Vishagni',
  'Kulanasha',
  'Vamshakshaya',
  'Utpata',
  'Kaala',
  'Saumya',
  'Komala',
  'Sheetala',
  'Karala',
  'Chandramukhi',
  'Praveena',
  'Kalapavaka',
  'Dandayudha',
  'Nirmala',
  'Saumya',
  'Kroora',
  'Atisheetala',
  'Kalusha',
  'Chandramukhi',
  'Praveena',
  'Saumya',
];

// =============================================================================
// Lookup: chart type to calculator
// =============================================================================

export const DIVISIONAL_CALCULATORS: Record<DivisionalChart, (longitude: number) => number> = {
  D1: calculateD1,
  D2: calculateD2,
  D3: calculateD3,
  D4: calculateD4,
  D5: calculateD5,
  D6: calculateD6,
  D7: calculateD7,
  D8: calculateD8,
  D9: calculateD9,
  D10: calculateD10,
  D11: calculateD11,
  D12: calculateD12,
  D14: calculateD14,
  D16: calculateD16,
  D20: calculateD20,
  D21: calculateD21,
  D24: calculateD24,
  D27: calculateD27,
  D30: calculateD30,
  D40: calculateD40,
  D45: calculateD45,
  D60: calculateD60,
  D81: calculateD81,
  D108: calculateD108,
};

// =============================================================================
// Main: Calculate All Divisional Charts
// =============================================================================

export interface DivisionalChartEntry {
  planet: Planet;
  sign: ZodiacSign;
  signIndex: number;
}

/**
 * A divisional chart with its own Lagna (ascendant). The varga Lagna is the
 * sign that the natal ascendant longitude maps to in the varga's fractional
 * division — this is what's used to assign houses to each planet in that varga.
 */
export interface DivisionalChartWithLagna {
  planets: DivisionalChartEntry[];
  ascendantSignIndex: number;
}

/**
 * Computes all 24 divisional charts (Shodashvarga + advanced) for every planet in the chart.
 *
 * @param chartData - Full natal chart data with planet longitudes
 * @returns A record keyed by DivisionalChart type, each containing an array of
 *          planet positions (sign index + sign name) within that varga.
 */
export function calculateAllDivisionalCharts(
  chartData: ChartData,
): Record<DivisionalChart, DivisionalChartEntry[]> {
  const result = {} as Record<DivisionalChart, DivisionalChartEntry[]>;

  const chartTypes: DivisionalChart[] = [
    'D1',
    'D2',
    'D3',
    'D4',
    'D5',
    'D6',
    'D7',
    'D8',
    'D9',
    'D10',
    'D11',
    'D12',
    'D14',
    'D16',
    'D20',
    'D21',
    'D24',
    'D27',
    'D30',
    'D40',
    'D45',
    'D60',
    'D81',
    'D108',
  ];

  for (const chart of chartTypes) {
    const calc = DIVISIONAL_CALCULATORS[chart];
    const entries: DivisionalChartEntry[] = [];

    for (const planetPos of chartData.planets) {
      const si = calc(planetPos.longitude);
      entries.push({
        planet: planetPos.planet,
        sign: ZODIAC_SIGNS[si],
        signIndex: si,
      });
    }

    result[chart] = entries;
  }

  return result;
}

/**
 * Computes all 24 divisional charts WITH each varga's Lagna (ascendant) sign.
 * Use this when you need to render the varga as a full chart with houses —
 * the ascendant longitude is run through the same fractional rule as the planets.
 */
export function calculateAllDivisionalChartsWithLagna(
  chartData: ChartData,
): Record<DivisionalChart, DivisionalChartWithLagna> {
  const result = {} as Record<DivisionalChart, DivisionalChartWithLagna>;

  const ascLongitude = chartData.ascendant.signIndex * 30 + (chartData.ascendant.degree ?? 0);

  const chartTypes: DivisionalChart[] = [
    'D1',
    'D2',
    'D3',
    'D4',
    'D5',
    'D6',
    'D7',
    'D8',
    'D9',
    'D10',
    'D11',
    'D12',
    'D14',
    'D16',
    'D20',
    'D21',
    'D24',
    'D27',
    'D30',
    'D40',
    'D45',
    'D60',
    'D81',
    'D108',
  ];

  for (const chart of chartTypes) {
    const calc = DIVISIONAL_CALCULATORS[chart];
    const entries: DivisionalChartEntry[] = [];

    for (const planetPos of chartData.planets) {
      const si = calc(planetPos.longitude);
      entries.push({
        planet: planetPos.planet,
        sign: ZODIAC_SIGNS[si],
        signIndex: si,
      });
    }

    result[chart] = {
      planets: entries,
      ascendantSignIndex: calc(ascLongitude),
    };
  }

  return result;
}

/**
 * Storage-friendly shape for `kundli_charts.divisional_charts` JSONB.
 *
 * Backward compatible with the original `Record<DivisionalChart, DivisionalChartEntry[]>`
 * format — each chart type is still a plain array of planet entries. We add a
 * single reserved key `_lagna` that maps each chart type to its varga Lagna sign
 * index. Old consumers that read `divisional_charts.D9` see the same array shape
 * they always did; new consumers that need the Lagna read `divisional_charts._lagna.D9`.
 */
export type DivisionalChartsStorage = Record<DivisionalChart, DivisionalChartEntry[]> & {
  _lagna: Record<DivisionalChart, number>;
};

/**
 * Computes the storage-friendly shape: per-chart arrays + a `_lagna` companion.
 * This is what should be written to `kundli_charts.divisional_charts` going
 * forward — old code keeps working, new code can read the lagnas.
 */
export function calculateAllDivisionalChartsForStorage(
  chartData: ChartData,
): DivisionalChartsStorage {
  const withLagna = calculateAllDivisionalChartsWithLagna(chartData);
  const arrays = {} as Record<DivisionalChart, DivisionalChartEntry[]>;
  const lagnas = {} as Record<DivisionalChart, number>;
  for (const [key, value] of Object.entries(withLagna) as [
    DivisionalChart,
    DivisionalChartWithLagna,
  ][]) {
    arrays[key] = value.planets;
    lagnas[key] = value.ascendantSignIndex;
  }
  return { ...arrays, _lagna: lagnas };
}

/**
 * Normalizer for `divisional_charts` JSONB: returns the planets array + Lagna for
 * a given varga type, falling back to the natal ascendant sign index when the
 * stored row predates the `_lagna` companion (best-effort).
 */
export function getVargaWithLagna(
  storage: unknown,
  type: DivisionalChart,
  fallbackAscSignIndex: number,
): DivisionalChartWithLagna | null {
  if (!storage || typeof storage !== 'object') return null;
  const s = storage as Record<string, unknown>;
  const planets = s[type] as DivisionalChartEntry[] | undefined;
  if (!Array.isArray(planets)) return null;
  const lagnaMap = s._lagna as Record<string, number> | undefined;
  const ascendantSignIndex =
    typeof lagnaMap?.[type] === 'number' ? lagnaMap[type] : fallbackAscSignIndex;
  return { planets, ascendantSignIndex };
}

/**
 * Build a synthetic ChartData representing a varga as a full chart with houses.
 * Houses are assigned by counting forward from the varga Lagna (whole-sign houses).
 * Renders correctly through NorthIndianChart / SouthIndianChart.
 */
export function buildVargaChartData(source: ChartData, varga: DivisionalChartWithLagna): ChartData {
  const ascSign = varga.ascendantSignIndex;

  const houses = Array.from({ length: 12 }, (_, i): HouseData => {
    const signIdx = mod12(ascSign + i);
    return {
      house: i + 1,
      cusp: signIdx * 30,
      sign: ZODIAC_SIGNS[signIdx],
      signIndex: signIdx,
      lord: 'Sun', // placeholder — house lord isn't displayed in the card chart
      planets: varga.planets.filter((p) => p.signIndex === signIdx).map((p) => p.planet),
    };
  });

  const planets = source.planets.map((natal) => {
    const v = varga.planets.find((p) => p.planet === natal.planet);
    const sIdx = v?.signIndex ?? natal.signIndex;
    return {
      ...natal,
      sign: ZODIAC_SIGNS[sIdx],
      signIndex: sIdx,
      house: mod12(sIdx - ascSign) + 1,
    };
  });

  return {
    ...source,
    planets,
    houses,
    ascendant: {
      ...source.ascendant,
      sign: ZODIAC_SIGNS[ascSign],
      signIndex: ascSign,
    },
  };
}

/**
 * Chandra Lagna (Moon Sign Chart) — re-cast the D1 chart with the Moon's natal
 * sign as House 1. All planet signs stay the same; house numbers shift.
 *
 * Reference: classical Vedic Chandra Lagna; treats Moon's position as the
 * ascendant for emotional/mental life analysis.
 */
export function getMoonChart(source: ChartData): ChartData {
  const moon = source.planets.find((p) => p.planet === 'Moon');
  if (!moon) return source;

  const moonSign = moon.signIndex;

  const houses = Array.from({ length: 12 }, (_, i): HouseData => {
    const signIdx = mod12(moonSign + i);
    const existing = source.houses.find((h) => h.signIndex === signIdx);
    return {
      house: i + 1,
      cusp: signIdx * 30,
      sign: ZODIAC_SIGNS[signIdx],
      signIndex: signIdx,
      lord: existing?.lord ?? 'Sun',
      planets: source.planets.filter((p) => p.signIndex === signIdx).map((p) => p.planet),
    };
  });

  const planets = source.planets.map((p) => ({
    ...p,
    house: mod12(p.signIndex - moonSign) + 1,
  }));

  return {
    ...source,
    planets,
    houses,
    ascendant: {
      ...source.ascendant,
      sign: ZODIAC_SIGNS[moonSign],
      signIndex: moonSign,
    },
  };
}
