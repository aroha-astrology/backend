// =============================================================================
// Chart context — everything Aroha knows about one chart at one moment
// =============================================================================
// One structured object built from the stored kundli, the profile it belongs
// to, and the live sky at `asOf`. The "Why?" layer (why.ts) and every roadmap
// feature read their evidence from here instead of re-deriving houses, lords,
// dashas and transits on their own — so the Weather card, the Calendar and
// Ask Aroha can never disagree about which house Saturn is in today.
// =============================================================================

import type { Ayanamsa, Planet, ZodiacSign } from '@aroha-astrology/shared';
import { SIGN_LORDS, ZODIAC_SIGNS } from '@aroha-astrology/shared';
import type { KundliRow } from '../../db/schema.js';
import type { ProfileContext } from '../../modules/birth-profiles/profile-context.js';
import { calculatePlanetPositions } from '../astro-engine/calculations/planetPositions.js';
import { dashaPeriodsInRange, type StoredMahadasha } from '../astro-engine/dashas/dasha-range.js';
import { jdFromDate } from '../astro-tools/transit-events.js';

export interface NatalPlacement {
  planet: Planet;
  signIndex: number;
  /** 1-12 from the Ascendant. */
  house: number;
  nakshatraIndex: number;
}

export interface TransitPlacement {
  planet: Planet;
  signIndex: number;
  sign: ZodiacSign;
  nakshatraIndex: number;
  isRetrograde: boolean;
  /** 1-12 counted from the natal Ascendant sign. */
  houseFromLagna: number;
  /** 1-12 counted from the natal Moon sign — classical gochara reckoning. */
  houseFromMoon: number;
}

export interface DashaNow {
  planet: Planet;
  startDate: string;
  endDate: string;
}

export interface ChartContext {
  asOf: string;
  birth: {
    placeName: string | null;
    lat: number | null;
    lon: number | null;
    timezone: string | null;
    timeAccuracy: ProfileContext['birthTimeAccuracy'];
    timeSource: ProfileContext['birthTimeSource'];
  };
  calculation: {
    ayanamsa: string | null;
    houseSystem: string | null;
    nodeType: string | null;
    calculationVersion: string | null;
    calculatedAt: string | null;
  };
  ascendantSignIndex: number;
  moonSignIndex: number;
  moonNakshatraIndex: number;
  natal: NatalPlacement[];
  /** House number (1-12) → the planet that rules it. */
  houseLords: Record<number, Planet>;
  dasha: {
    mahadasha: DashaNow | null;
    antardasha: DashaNow | null;
    pratyantardasha: DashaNow | null;
  };
  transits: TransitPlacement[];
}

const SUPPORTED_AYANAMSAS: readonly string[] = [
  'lahiri',
  'krishnamurti',
  'raman',
  'true_chitra',
  'fagan_bradley',
  'yukteshwar',
];

export function houseFrom(fromSignIndex: number, toSignIndex: number): number {
  return ((toSignIndex - fromSignIndex + 12) % 12) + 1;
}

interface StoredChart {
  planets?: Array<{
    planet: Planet;
    signIndex: number;
    house: number;
    nakshatraIndex: number;
  }>;
  houses?: Array<{ house: number; lord: Planet }>;
  ascendant?: { signIndex: number };
}

function toDashaNow(
  span: { planet: Planet; startDate: Date; endDate: Date } | undefined,
): DashaNow | null {
  if (!span) return null;
  return {
    planet: span.planet,
    startDate: span.startDate.toISOString(),
    endDate: span.endDate.toISOString(),
  };
}

/**
 * Returns null when the kundli isn't ready or its chart blob is missing the
 * pieces every factor needs (Ascendant, Moon).
 */
export async function buildChartContext(
  kundli: KundliRow,
  profile: ProfileContext,
  asOf: Date = new Date(),
): Promise<ChartContext | null> {
  if (kundli.status !== 'ready' || !kundli.chartData) return null;
  const chart = kundli.chartData as StoredChart;
  const ascendantSignIndex = chart.ascendant?.signIndex;
  const moon = chart.planets?.find((p) => p.planet === 'Moon');
  if (ascendantSignIndex == null || !moon || !chart.planets) return null;

  const natal: NatalPlacement[] = chart.planets.map((p) => ({
    planet: p.planet,
    signIndex: p.signIndex,
    house: p.house,
    nakshatraIndex: p.nakshatraIndex,
  }));

  // Prefer the stored house lords (they follow the user's house system); fall
  // back to whole-sign lords from the Ascendant.
  const houseLords: Record<number, Planet> = {};
  for (let h = 1; h <= 12; h++) {
    const stored = chart.houses?.find((x) => x.house === h)?.lord;
    houseLords[h] = stored ?? SIGN_LORDS[ZODIAC_SIGNS[(ascendantSignIndex + h - 1) % 12]!];
  }

  const mahadashas =
    (kundli.dashaData as { vimshottari?: { mahadashas?: StoredMahadasha[] } } | null)?.vimshottari
      ?.mahadashas ?? [];
  const instantEnd = new Date(asOf.getTime() + 1);
  const dasha = {
    mahadasha: toDashaNow(dashaPeriodsInRange(mahadashas, asOf, instantEnd, 0)[0]),
    antardasha: toDashaNow(dashaPeriodsInRange(mahadashas, asOf, instantEnd, 1)[0]),
    pratyantardasha: toDashaNow(dashaPeriodsInRange(mahadashas, asOf, instantEnd, 2)[0]),
  };

  const ayanamsa = (
    kundli.ayanamsa && SUPPORTED_AYANAMSAS.includes(kundli.ayanamsa) ? kundli.ayanamsa : 'lahiri'
  ) as Ayanamsa;
  const sky = await calculatePlanetPositions(jdFromDate(asOf), ayanamsa);
  const transits: TransitPlacement[] = sky.map((p) => ({
    planet: p.planet,
    signIndex: p.signIndex,
    sign: p.sign,
    nakshatraIndex: p.nakshatraIndex,
    isRetrograde: p.isRetrograde,
    houseFromLagna: houseFrom(ascendantSignIndex, p.signIndex),
    houseFromMoon: houseFrom(moon.signIndex, p.signIndex),
  }));

  const place = profile.placeOfBirth;
  return {
    asOf: asOf.toISOString(),
    birth: {
      placeName: place?.name ?? null,
      lat: place?.lat ?? null,
      lon: place?.lon ?? null,
      timezone: place?.tz ?? null,
      timeAccuracy: profile.birthTimeAccuracy,
      timeSource: profile.birthTimeSource,
    },
    calculation: {
      ayanamsa: kundli.ayanamsa,
      houseSystem: kundli.houseSystem,
      nodeType: kundli.nodeType,
      calculationVersion: kundli.calculationVersion,
      calculatedAt: kundli.generatedAt ? kundli.generatedAt.toISOString() : null,
    },
    ascendantSignIndex,
    moonSignIndex: moon.signIndex,
    moonNakshatraIndex: moon.nakshatraIndex,
    natal,
    houseLords,
    dasha,
    transits,
  };
}
