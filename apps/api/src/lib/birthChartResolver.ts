// Shared chart-resolution logic used by the dashboard card AND the kundli
// detail page. Given a natal D1 chart + the stored divisional_charts JSONB,
// returns a ChartData ready to feed into NorthIndianChart / SouthIndianChart.

import type {
  ChartData,
  HouseData,
  PlanetPosition,
  ZodiacSign,
  Planet,
} from '@aroha-astrology/shared';

export type BirthChartType = 'lagna' | 'navamsa' | 'moon';

export const BIRTH_CHART_TABS: { key: BirthChartType; label: string; title: string }[] = [
  { key: 'lagna',   label: 'Lagna',          title: 'D1 - Lagna' },
  { key: 'navamsa', label: 'Navamsa',        title: 'D9 - Navamsa' },
  { key: 'moon',    label: 'Moon Sign',      title: 'Chandra Lagna' },
];

const ZODIAC_SIGNS: readonly ZodiacSign[] = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const;

const mod12 = (n: number) => ((n % 12) + 12) % 12;

function signIndexFromLongitude(longitude: number): number {
  return Math.floor((((longitude % 360) + 360) % 360) / 30);
}

function signDegreeFromLongitude(longitude: number): number {
  return (((longitude % 360) + 360) % 360) % 30;
}

// D9 Navamsa Lagna — element-based start sign + 30/9 division.
// Mirrors packages/astro-engine for old kundlis that lack the _lagna companion.
export function computeD9Sign(longitude: number): number {
  const si = signIndexFromLongitude(longitude);
  const deg = signDegreeFromLongitude(longitude);
  const part = Math.floor(deg / (30 / 9));
  const element = si % 4; // 0=Fire 1=Earth 2=Air 3=Water
  const starts = [0, 9, 6, 3]; // Aries, Capricorn, Libra, Cancer
  return mod12(starts[element] + part);
}

// Recast a ChartData so House 1 starts at the given sign index (whole-sign).
export function recastFromAscendantSign(source: ChartData, ascSignIdx: number): ChartData {
  const houses: HouseData[] = Array.from({ length: 12 }, (_, i) => {
    const signIdx = mod12(ascSignIdx + i);
    const inherited = source.houses.find((h) => h.signIndex === signIdx);
    return {
      house: i + 1,
      cusp: signIdx * 30,
      sign: ZODIAC_SIGNS[signIdx],
      signIndex: signIdx,
      lord: inherited?.lord ?? 'Sun',
      planets: source.planets.filter((p) => p.signIndex === signIdx).map((p) => p.planet),
    };
  });
  const planets: PlanetPosition[] = source.planets.map((p) => ({
    ...p,
    house: mod12(p.signIndex - ascSignIdx) + 1,
  }));
  return {
    ...source,
    planets,
    houses,
    ascendant: {
      ...source.ascendant,
      sign: ZODIAC_SIGNS[ascSignIdx],
      signIndex: ascSignIdx,
    },
  };
}

interface StoredVargaPlanet {
  planet: Planet;
  sign: ZodiacSign;
  signIndex: number;
}

// Build a ChartData for a varga from stored planet entries + lagna sign.
function buildVargaChartData(
  source: ChartData,
  vargaPlanets: StoredVargaPlanet[],
  ascSignIdx: number,
): ChartData {
  const houses: HouseData[] = Array.from({ length: 12 }, (_, i) => {
    const signIdx = mod12(ascSignIdx + i);
    return {
      house: i + 1,
      cusp: signIdx * 30,
      sign: ZODIAC_SIGNS[signIdx],
      signIndex: signIdx,
      lord: 'Sun',
      planets: vargaPlanets.filter((p) => p.signIndex === signIdx).map((p) => p.planet),
    };
  });
  const planets: PlanetPosition[] = source.planets.map((natal) => {
    const v = vargaPlanets.find((p) => p.planet === natal.planet);
    const sIdx = v?.signIndex ?? natal.signIndex;
    return {
      ...natal,
      sign: ZODIAC_SIGNS[sIdx],
      signIndex: sIdx,
      house: mod12(sIdx - ascSignIdx) + 1,
    };
  });
  return {
    ...source,
    planets,
    houses,
    ascendant: {
      ...source.ascendant,
      sign: ZODIAC_SIGNS[ascSignIdx],
      signIndex: ascSignIdx,
    },
  };
}

export interface ResolvedBirthChart {
  data: ChartData | null;
  ascHouse: number;
  title: string;
  ready: boolean;
}

export function resolveBirthChart(
  type: BirthChartType,
  chartData: ChartData,
  divisionalCharts: Record<string, unknown> | null | undefined,
): ResolvedBirthChart {
  const def = BIRTH_CHART_TABS.find((t) => t.key === type)!;
  if (type === 'lagna') {
    return { data: chartData, ascHouse: 1, title: def.title, ready: true };
  }
  if (type === 'moon') {
    const moon = chartData.planets.find((p) => p.planet === 'Moon');
    if (!moon) return { data: null, ascHouse: 1, title: def.title, ready: false };
    return {
      data: recastFromAscendantSign(chartData, moon.signIndex),
      ascHouse: 1,
      title: def.title,
      ready: true,
    };
  }
  // navamsa
  const storage = divisionalCharts as Record<string, unknown> | null | undefined;
  const stored = storage?.D9 as StoredVargaPlanet[] | undefined;
  if (!Array.isArray(stored) || stored.length === 0) {
    return { data: null, ascHouse: 1, title: def.title, ready: false };
  }
  const lagnaMap = storage?._lagna as Record<string, number> | undefined;
  const ascLongitude =
    (chartData.ascendant.signIndex ?? 0) * 30 + (chartData.ascendant.degree ?? 0);
  const ascSign =
    typeof lagnaMap?.D9 === 'number' ? lagnaMap.D9 : computeD9Sign(ascLongitude);
  return {
    data: buildVargaChartData(chartData, stored, ascSign),
    ascHouse: 1,
    title: def.title,
    ready: true,
  };
}
