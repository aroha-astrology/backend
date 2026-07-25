// @ts-nocheck
// =============================================================================
// Planet Position Calculations using Swiss Ephemeris (swisseph-wasm)
// Raw, uncached compute — do not call directly from route/service code.
// Wrapped by planetPositions.ts (cache + optional worker-pool dispatch).
// =============================================================================

import type {
  Planet,
  ZodiacSign,
  Nakshatra,
  Ayanamsa,
  HouseSystem,
  PlanetPosition,
  HouseData,
  AscendantData,
} from '@aroha-astrology/shared';

import {
  ZODIAC_SIGNS,
  NAKSHATRAS,
  NAKSHATRA_LORDS,
  SIGN_LORDS,
  NAKSHATRA_SPAN,
} from '@aroha-astrology/shared';

// =============================================================================
// SwissEph WASM Singleton
// =============================================================================

// Dynamic import to support both ESM and CommonJS contexts

let sweInstance: any = null;
let initPromise: Promise<void> | null = null;

export async function getSwe() {
  if (sweInstance) return sweInstance;
  if (initPromise) {
    await initPromise;
    return sweInstance;
  }

  initPromise = (async () => {
    const { default: SwissEph } = await import('swisseph-wasm');
    const swe = new SwissEph();
    await swe.initSwissEph();
    sweInstance = swe;
  })();

  await initPromise;
  return sweInstance;
}

// =============================================================================
// Swiss Ephemeris Constants (matching swisseph-wasm constants)
// =============================================================================

const SE_SUN = 0;
const SE_MOON = 1;
const SE_MERCURY = 2;
const SE_VENUS = 3;
const SE_MARS = 4;
const SE_JUPITER = 5;
const SE_SATURN = 6;
const SE_MEAN_NODE = 10; // Rahu (Mean Node)

const SEFLG_SWIEPH = 2;
const SEFLG_SIDEREAL = 65536;
const SEFLG_SPEED = 256;

const SE_SIDM_LAHIRI = 1;
const SE_SIDM_KRISHNAMURTI = 5;
const SE_SIDM_B_V_RAMAN = 3;

// =============================================================================
// Ayanamsa Mapping
// =============================================================================

export const AYANAMSA_MAP: Record<Ayanamsa, number> = {
  lahiri: SE_SIDM_LAHIRI,
  krishnamurti: SE_SIDM_KRISHNAMURTI,
  raman: SE_SIDM_B_V_RAMAN,
};

// Planet list for calculation (Ketu is derived from Rahu)
const PLANET_SE_IDS: { planet: Planet; seId: number }[] = [
  { planet: 'Sun', seId: SE_SUN },
  { planet: 'Moon', seId: SE_MOON },
  { planet: 'Mars', seId: SE_MARS },
  { planet: 'Mercury', seId: SE_MERCURY },
  { planet: 'Jupiter', seId: SE_JUPITER },
  { planet: 'Venus', seId: SE_VENUS },
  { planet: 'Saturn', seId: SE_SATURN },
  { planet: 'Rahu', seId: SE_MEAN_NODE },
];

// =============================================================================
// Helper Functions
// =============================================================================

function normalizeDegree(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

function getSignIndex(longitude: number): number {
  return Math.floor(normalizeDegree(longitude) / 30);
}

function getSignDegree(longitude: number): number {
  return normalizeDegree(longitude) % 30;
}

function getNakshatraInfo(longitude: number): {
  index: number;
  pada: number;
  lord: Planet;
  name: Nakshatra;
} {
  const normalizedLong = normalizeDegree(longitude);
  const nakshatraIndex = Math.floor(normalizedLong / NAKSHATRA_SPAN);
  const clampedIndex = Math.min(nakshatraIndex, 26);
  const positionInNakshatra = normalizedLong - clampedIndex * NAKSHATRA_SPAN;
  const padaSpan = NAKSHATRA_SPAN / 4;
  const pada = Math.min(Math.floor(positionInNakshatra / padaSpan) + 1, 4);

  return {
    index: clampedIndex,
    pada,
    lord: NAKSHATRA_LORDS[clampedIndex],
    name: NAKSHATRAS[clampedIndex],
  };
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Convert a date/time with timezone offset to a Julian Day number.
 */
export async function dateToJulianDay(
  year: number,
  month: number,
  day: number,
  hour: number,
  min: number,
  timezone: number,
): Promise<number> {
  const swe = await getSwe();
  const utHour = hour + min / 60 - timezone;
  return swe.julday(year, month, day, utHour);
}

/**
 * Calculate sidereal positions of all 9 Vedic planets.
 */
export async function calculatePlanetPositions(
  jd: number,
  ayanamsa: Ayanamsa = 'lahiri',
): Promise<PlanetPosition[]> {
  const swe = await getSwe();

  // Set the sidereal mode
  const sidMode = AYANAMSA_MAP[ayanamsa];
  swe.set_sid_mode(sidMode, 0, 0);

  const calcFlags = SEFLG_SWIEPH | SEFLG_SIDEREAL | SEFLG_SPEED;

  const positions: PlanetPosition[] = [];
  let rahuLongitude = 0;
  let rahuLatitude = 0;
  let rahuSpeed = 0;

  for (const { planet, seId } of PLANET_SE_IDS) {
    // Use calc() which returns an object with named fields
    const result = swe.calc(jd, seId, calcFlags);

    const longitude = normalizeDegree(result.longitude);
    const latitude = result.latitude;
    const speed = result.longitudeSpeed;
    const isRetrograde = speed < 0;

    const signIndex = getSignIndex(longitude);
    const signDegree = getSignDegree(longitude);
    const nakshatraInfo = getNakshatraInfo(longitude);

    if (planet === 'Rahu') {
      rahuLongitude = longitude;
      rahuLatitude = latitude;
      rahuSpeed = speed;
    }

    positions.push({
      planet,
      longitude,
      latitude,
      speed,
      sign: ZODIAC_SIGNS[signIndex],
      signIndex,
      signDegree,
      nakshatra: nakshatraInfo.name,
      nakshatraIndex: nakshatraInfo.index,
      nakshatraPada: nakshatraInfo.pada,
      nakshatraLord: nakshatraInfo.lord,
      isRetrograde,
      house: 0,
    });
  }

  // Calculate Ketu as Rahu + 180°
  const ketuLongitude = normalizeDegree(rahuLongitude + 180);
  const ketuSignIndex = getSignIndex(ketuLongitude);
  const ketuSignDegree = getSignDegree(ketuLongitude);
  const ketuNakshatraInfo = getNakshatraInfo(ketuLongitude);

  positions.push({
    planet: 'Ketu',
    longitude: ketuLongitude,
    latitude: -rahuLatitude,
    speed: rahuSpeed,
    sign: ZODIAC_SIGNS[ketuSignIndex],
    signIndex: ketuSignIndex,
    signDegree: ketuSignDegree,
    nakshatra: ketuNakshatraInfo.name,
    nakshatraIndex: ketuNakshatraInfo.index,
    nakshatraPada: ketuNakshatraInfo.pada,
    nakshatraLord: ketuNakshatraInfo.lord,
    isRetrograde: true,
    house: 0,
  });

  return positions;
}

/**
 * Calculate house cusps for a given time and geographic location.
 */
export async function calculateHouses(
  jd: number,
  lat: number,
  lng: number,
  system: HouseSystem = 'W',
  ayanamsa: Ayanamsa = 'lahiri',
): Promise<HouseData[]> {
  const swe = await getSwe();

  // Set sidereal mode before calling houses_ex
  const sidMode = AYANAMSA_MAP[ayanamsa];
  swe.set_sid_mode(sidMode, 0, 0);

  // houses_ex with SEFLG_SIDEREAL returns sidereal cusps directly
  const result = swe.houses_ex(jd, SEFLG_SIDEREAL, lat, lng, system);
  // result = { cusps: Float64Array[0..12], ascmc: Float64Array[0..9] }
  // ascmc[0] = Ascendant (sidereal when SEFLG_SIDEREAL is used)
  const siderealAsc = normalizeDegree(result.ascmc[0]);
  const ascSignIndex = getSignIndex(siderealAsc);

  const houses: HouseData[] = [];

  for (let i = 1; i <= 12; i++) {
    let cusp: number;

    if (system === 'W') {
      // Whole sign: each house is one full sign starting from ascendant sign
      const houseSignIndex = (ascSignIndex + i - 1) % 12;
      cusp = houseSignIndex * 30;
    } else {
      // Other systems: use the computed sidereal cusps
      cusp = normalizeDegree(result.cusps[i]);
    }

    const signIndex = getSignIndex(cusp);

    houses.push({
      house: i,
      cusp,
      sign: ZODIAC_SIGNS[signIndex],
      signIndex,
      lord: SIGN_LORDS[ZODIAC_SIGNS[signIndex] as ZodiacSign],
      planets: [],
    });
  }

  return houses;
}

/**
 * Calculate the ascendant (lagna) position.
 */
export async function calculateAscendant(
  jd: number,
  lat: number,
  lng: number,
  ayanamsa: Ayanamsa = 'lahiri',
): Promise<AscendantData> {
  const swe = await getSwe();

  const sidMode = AYANAMSA_MAP[ayanamsa];
  swe.set_sid_mode(sidMode, 0, 0);

  const result = swe.houses_ex(jd, SEFLG_SIDEREAL, lat, lng, 'W');
  const siderealAsc = normalizeDegree(result.ascmc[0]);
  const signIndex = getSignIndex(siderealAsc);
  const signDegree = getSignDegree(siderealAsc);
  const nakshatraInfo = getNakshatraInfo(siderealAsc);

  return {
    sign: ZODIAC_SIGNS[signIndex],
    signIndex,
    degree: signDegree,
    nakshatra: nakshatraInfo.name,
    nakshatraPada: nakshatraInfo.pada,
  };
}

/**
 * Assign planets to houses by longitude within each house's cusp interval.
 * Correct for ALL house systems (whole-sign and quadrant alike) — a sign-based
 * map breaks whenever a sign is intercepted (two cusps in one sign), silently
 * leaving planets in house 0.
 */
export function assignPlanetsToHouses(planets: PlanetPosition[], houses: HouseData[]): void {
  for (const planet of planets) {
    const lon = normalizeDegree(planet.longitude);
    let assignedHouse = houses[0].house; // sane fallback (house 1)

    for (let i = 0; i < houses.length; i++) {
      const start = normalizeDegree(houses[i].cusp);
      const end = normalizeDegree(houses[(i + 1) % houses.length].cusp);
      // A house spans [start, end); handle the 360°→0° wrap-around.
      const inHouse = start <= end ? lon >= start && lon < end : lon >= start || lon < end;
      if (inHouse) {
        assignedHouse = houses[i].house;
        break;
      }
    }

    planet.house = assignedHouse;
    houses[assignedHouse - 1].planets.push(planet.planet);
  }
}
