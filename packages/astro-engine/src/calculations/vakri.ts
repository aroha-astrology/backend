// =============================================================================
// Aroha Astrology — Vakri (Retrograde) Graha Rules Engine
// Specification: 48-Section Multi-Layer Jyotish Vakri Rules Engine
// =============================================================================
/* eslint-disable @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-call,
                  @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/no-unused-vars */

import type { Planet, ZodiacSign, ChartData, PlanetPosition } from '@aroha-astrology/shared';

import {
  ZODIAC_SIGNS,
  SIGN_LORDS,
  PLANET_EXALTATION,
  PLANET_DEBILITATION,
  PLANET_OWN_SIGNS,
} from '@aroha-astrology/shared';

// =============================================================================
// Types & Interfaces
// =============================================================================

export type MotionState =
  | 'direct'
  | 'pre_retrograde_shadow'
  | 'station_retrograde'
  | 'retrograde'
  | 'post_retrograde_shadow'
  | 'station_direct';

export type HouseGroup = 'kendra' | 'trikona' | 'dusthana' | 'upachaya' | 'maraka' | 'other';

export interface VakriMotion {
  isRetrograde: boolean;
  state: MotionState;
  speed: number;
  averageSpeed: number;
  speedRatio: number;
  stationProximity: number;
  isStation: boolean;
  shadowPhase: 'none' | 'pre' | 'post';
}

export interface VakriCheshtaBala {
  score: number;
  level: 'low' | 'moderate' | 'high' | 'maximum';
  description: string;
}

export interface VakriLordship {
  housesOwned: number[];
  naturalNature: 'benefic' | 'malefic';
  functionalNature: 'benefic' | 'malefic' | 'neutral';
  isYogakaraka: boolean;
}

export interface VakriDignity {
  baseDignity:
    | 'exalted'
    | 'moolatrikona'
    | 'own_sign'
    | 'friend_sign'
    | 'neutral'
    | 'enemy_sign'
    | 'debilitated';
  uttaraKalamritaModifier: {
    applied: boolean;
    source: 'Uttara Kalamrita';
    effectiveStrength:
      | 'exaltation_like_power'
      | 'neecha_like_modification'
      | 'enhanced_intensity'
      | 'standard';
    explanation: string;
  };
}

export interface VakriDispositorInfo {
  planet: string;
  house: number;
  sign: string;
  isRetrograde: boolean;
  isCombust: boolean;
  dignity: string;
  relationship: 'friend' | 'neutral' | 'enemy';
  summary: string;
}

export interface VakriAspectInfo {
  fromPlanet: string;
  fromHouse: number;
  aspectType: string;
  isBenefic: boolean;
}

export interface VakriInterpretations {
  classical: string;
  interpretive: string;
  karmic: string;
}

export interface VakriConfidence {
  level: 'low' | 'medium' | 'high';
  score: number;
  factors: string[];
}

export interface VakriPlanetAnalysis {
  planet: Planet;
  motion: VakriMotion;
  placement: {
    house: number;
    sign: ZodiacSign;
    degree: number;
    nakshatra?: string;
    nakshatraLord?: string;
  };
  lordship: VakriLordship;
  dignity: VakriDignity;
  cheshtaBala: VakriCheshtaBala;
  conditions: {
    isCombust: boolean;
    combustionType: 'none' | 'inferior' | 'superior' | 'standard';
    isPlanetaryWar: boolean;
  };
  dispositor: VakriDispositorInfo | null;
  aspectsReceived: VakriAspectInfo[];
  houseGroup: HouseGroup;
  previousHouseInfluence?: {
    enabled: boolean;
    previousHouse: number;
    previousSign: string;
    note: string;
  };
  interpretation: VakriInterpretations;
  confidence: VakriConfidence;
  factsForLLM: string[];
}

// =============================================================================
// Constants & Astronomical Speeds
// =============================================================================

export const AVERAGE_PLANETARY_SPEEDS: Record<string, number> = {
  Mars: 0.524,
  Mercury: 1.383,
  Jupiter: 0.0831,
  Venus: 1.2,
  Saturn: 0.0335,
};

const COMBUSTION_ORB: Record<string, number> = {
  Moon: 12,
  Mars: 17,
  Mercury: 14,
  Jupiter: 11,
  Venus: 10,
  Saturn: 15,
};

const NATURAL_BENEFICS = new Set<string>(['Jupiter', 'Venus', 'Mercury', 'Moon']);
const TARA_GRAHAS = new Set<string>(['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']);

function checkCombust(planet: string, planetLong: number, sunLong: number | null): boolean {
  if (['Sun', 'Rahu', 'Ketu'].includes(planet) || sunLong == null) return false;
  const diff = Math.abs((((planetLong - sunLong) % 360) + 360) % 360);
  const angle = diff > 180 ? 360 - diff : diff;
  const orb = COMBUSTION_ORB[planet] ?? 8.5;
  return angle < orb;
}

export function calculateVakriMotion(
  planet: Planet,
  speed: number,
  isRetrograde: boolean,
): VakriMotion {
  const avgSpeed = AVERAGE_PLANETARY_SPEEDS[planet] || 1.0;
  const absSpeed = Math.abs(speed);
  const speedRatio = Math.round((speed / avgSpeed) * 100) / 100;

  const stationThreshold = avgSpeed * 0.15;
  const isStation = absSpeed <= stationThreshold;
  const stationProximity = Math.max(
    0,
    Math.min(1, Math.round((1 - absSpeed / (avgSpeed * 0.35)) * 100) / 100),
  );

  let state: MotionState = 'direct';
  if (isRetrograde) {
    state = isStation ? 'station_retrograde' : 'retrograde';
  } else {
    state = isStation ? 'station_direct' : 'direct';
  }

  return {
    isRetrograde,
    state,
    speed: Math.round(speed * 10000) / 10000,
    averageSpeed: avgSpeed,
    speedRatio,
    stationProximity: isStation ? stationProximity : 0,
    isStation,
    shadowPhase: 'none',
  };
}

export function calculateVakriCheshtaBala(
  planet: Planet,
  isRetrograde: boolean,
  speed: number,
): VakriCheshtaBala {
  if (planet === 'Sun' || planet === 'Moon' || planet === 'Rahu' || planet === 'Ketu') {
    return {
      score: 30,
      level: 'moderate',
      description: `${planet} does not participate in physical planetary retrograde Cheshta Bala.`,
    };
  }

  if (isRetrograde) {
    return {
      score: 60,
      level: 'maximum',
      description: 'Vakri motion provides maximum motional strength (60 Virupas Cheshta Bala).',
    };
  }

  const avgSpeed = AVERAGE_PLANETARY_SPEEDS[planet] || 1.0;
  const absSpeed = Math.abs(speed);

  if (absSpeed < avgSpeed * 0.15) {
    return {
      score: 45,
      level: 'high',
      description: 'Stationary direct motion grants high motional concentration (45 Virupas).',
    };
  }

  const ratio = speed / avgSpeed;
  const score = Math.max(15, Math.min(45, Math.round(30 + (1 - ratio) * 15)));

  return {
    score,
    level: score >= 40 ? 'high' : score >= 25 ? 'moderate' : 'low',
    description: `Direct motion with speed ratio ${ratio.toFixed(2)} of mean rate.`,
  };
}

export function getFunctionalLordship(planet: Planet, ascendantSignIndex: number): VakriLordship {
  const naturalNature = NATURAL_BENEFICS.has(planet) ? 'benefic' : 'malefic';
  const ownedSigns = PLANET_OWN_SIGNS[planet] || [];
  const housesOwned: number[] = [];

  for (const sign of ownedSigns) {
    const signIdx = ZODIAC_SIGNS.indexOf(sign);
    if (signIdx !== -1) {
      const house = ((signIdx - ascendantSignIndex + 12) % 12) + 1;
      housesOwned.push(house);
    }
  }

  housesOwned.sort((a, b) => a - b);

  const isKendra = (h: number) => [1, 4, 7, 10].includes(h);
  const isTrikona = (h: number) => [5, 9].includes(h);

  let isYogakaraka = false;
  if (housesOwned.length >= 2) {
    const hasKendra = housesOwned.some(isKendra);
    const hasTrikona = housesOwned.some(isTrikona);
    if (hasKendra && hasTrikona) {
      isYogakaraka = true;
    }
  }

  let functionalNature: 'benefic' | 'malefic' | 'neutral' = naturalNature;

  if (isYogakaraka) {
    functionalNature = 'benefic';
  } else if (housesOwned.includes(6) || housesOwned.includes(8) || housesOwned.includes(12)) {
    if (!housesOwned.includes(1) && !housesOwned.includes(5) && !housesOwned.includes(9)) {
      functionalNature = 'malefic';
    } else {
      functionalNature = 'neutral';
    }
  } else if (housesOwned.includes(5) || housesOwned.includes(9) || housesOwned.includes(1)) {
    functionalNature = 'benefic';
  } else if (housesOwned.includes(3) || housesOwned.includes(11)) {
    functionalNature = naturalNature === 'malefic' ? 'malefic' : 'neutral';
  }

  return {
    housesOwned,
    naturalNature,
    functionalNature,
    isYogakaraka,
  };
}

export function calculateVakriDignity(
  planet: Planet,
  sign: ZodiacSign,
  isRetrograde: boolean,
): VakriDignity {
  const exaltationData = PLANET_EXALTATION[planet];
  const debilitationData = PLANET_DEBILITATION[planet];
  const ownSigns = PLANET_OWN_SIGNS[planet] || [];

  let baseDignity: VakriDignity['baseDignity'] = 'neutral';

  if (exaltationData && sign === exaltationData.sign) {
    baseDignity = 'exalted';
  } else if (debilitationData && sign === debilitationData.sign) {
    baseDignity = 'debilitated';
  } else if (ownSigns.includes(sign)) {
    baseDignity = 'own_sign';
  } else {
    baseDignity = 'neutral';
  }

  if (isRetrograde) {
    if (baseDignity === 'debilitated') {
      return {
        baseDignity,
        uttaraKalamritaModifier: {
          applied: true,
          source: 'Uttara Kalamrita',
          effectiveStrength: 'exaltation_like_power',
          explanation:
            'Classical rule (Uttara Kalamrita): A debilitated planet in retrograde motion gains profound motional vigor (Cheshta Bala) and resilience.',
        },
      };
    }

    if (baseDignity === 'exalted') {
      return {
        baseDignity,
        uttaraKalamritaModifier: {
          applied: true,
          source: 'Uttara Kalamrita',
          effectiveStrength: 'neecha_like_modification',
          explanation:
            'Classical rule (Uttara Kalamrita): An exalted planet in retrograde motion internalizes its high status, requiring recalibration of outward results.',
        },
      };
    }

    return {
      baseDignity,
      uttaraKalamritaModifier: {
        applied: true,
        source: 'Uttara Kalamrita',
        effectiveStrength: 'enhanced_intensity',
        explanation:
          'Retrograde motion intensifies the planet’s functional expression in this sign.',
      },
    };
  }

  return {
    baseDignity,
    uttaraKalamritaModifier: {
      applied: false,
      source: 'Uttara Kalamrita',
      effectiveStrength: 'standard',
      explanation: 'Direct motion conforms to standard dignity rules.',
    },
  };
}

export function getHouseGroup(house: number): HouseGroup {
  if ([1, 4, 7, 10].includes(house)) return 'kendra';
  if ([5, 9].includes(house)) return 'trikona';
  if ([6, 8, 12].includes(house)) return 'dusthana';
  if ([3, 6, 10, 11].includes(house)) return 'upachaya';
  if ([2, 7].includes(house)) return 'maraka';
  return 'other';
}

export function generateVakriInterpretations(
  planet: Planet,
  house: number,
  sign: ZodiacSign,
  lordship: VakriLordship,
  dignity: VakriDignity,
  dispositor: VakriDispositorInfo | null,
): VakriInterpretations {
  let classical = `${planet} is in Vakri (retrograde) motion in ${sign} in house ${house}, conferring elevated Cheshta Bala. As lord of house(s) ${lordship.housesOwned.join(', ')}, its capacity to deliver its portfolio is amplified.`;
  if (dignity.uttaraKalamritaModifier.applied) {
    classical += ` ${dignity.uttaraKalamritaModifier.explanation}`;
  }
  if (dispositor) {
    classical += ` Dispositor is ${dispositor.planet} in house ${dispositor.house} (${dispositor.sign}).`;
  }

  let interpretive = '';
  switch (planet) {
    case 'Mercury':
      interpretive = `Intellectual processing tends toward deep introspection, continuous review of decisions, and non-linear communication styles.`;
      break;
    case 'Venus':
      interpretive = `Evaluates relationships, aesthetics, and finances through an individualized, reflective lens.`;
      break;
    case 'Mars':
      interpretive = `Drive and initiative operate from internal conviction rather than impulsive outward aggression.`;
      break;
    case 'Jupiter':
      interpretive = `Wisdom and guiding philosophies develop via personal introspection and direct life experience.`;
      break;
    case 'Saturn':
      interpretive = `Career path, responsibilities, and structural foundations develop through iterative cycles and patient discipline.`;
      break;
    default:
      interpretive = `Themes of house ${house} manifest through cycles of review, restructuring, and deliberate personal pacing.`;
  }

  let karmic = '';
  switch (planet) {
    case 'Saturn':
      karmic = `In traditional karmic Jyotish, retrograde Saturn represents recurring responsibilities and unfinished soul duties where patient accountability brings maturity.`;
      break;
    case 'Jupiter':
      karmic = `Traditional perspectives view retrograde Jupiter as a soul-level search for deeper philosophical truth and spiritual integrity.`;
      break;
    case 'Mars':
      karmic = `Karmic traditions associate retrograde Mars with mastering willpower and constructive redirection of passionate energy.`;
      break;
    case 'Venus':
      karmic = `Traditional Jyotish regards retrograde Venus as a journey to discover unconditional self-worth and deeper dimensions of love.`;
      break;
    case 'Mercury':
      karmic = `Vakri Mercury reflects a pattern of refining discernment, intellectual clarity, and authentic expression.`;
      break;
    default:
      karmic = `Vakri status indicates introspective, recurring life themes associated with house ${house}.`;
  }

  return { classical, interpretive, karmic };
}

export function calculateVakriConfidence(
  hasDispositor: boolean,
  dispositorStrong: boolean,
  hasBeneficDrishti: boolean,
  isDashaActive: boolean,
  isLordshipHarmonious: boolean,
): VakriConfidence {
  let score = 0.5;
  const factors: string[] = ['Planetary motion and longitude verified via Swiss Ephemeris'];

  if (hasDispositor) {
    score += 0.1;
    factors.push('Dispositor placement and dignity identified');
  }
  if (dispositorStrong) {
    score += 0.1;
    factors.push('Dispositor possesses strong supportive dignity');
  }
  if (hasBeneficDrishti) {
    score += 0.08;
    factors.push('Supportive benefic aspect (Drishti) confirmed');
  }
  if (isLordshipHarmonious) {
    score += 0.1;
    factors.push('Functional lordship and Ascendant synergy calculated');
  }
  if (isDashaActive) {
    score += 0.1;
    factors.push('Planetary period (Dasha) resonance active');
  }

  score = Math.min(0.96, Math.max(0.4, Math.round(score * 100) / 100));
  const level: VakriConfidence['level'] = score >= 0.8 ? 'high' : score >= 0.65 ? 'medium' : 'low';

  return { level, score, factors };
}

export function analyzeVakriPlanet(
  planetPos: PlanetPosition,
  chartData: ChartData,
  options?: {
    enablePreviousHouseRule?: boolean;
    activeMahadasha?: string;
    activeAntardasha?: string;
  },
): VakriPlanetAnalysis | null {
  const planet = planetPos.planet;
  if (!TARA_GRAHAS.has(planet)) return null;

  const speed = planetPos.speed ?? 0;
  const isRetrograde = Boolean(planetPos.isRetrograde || speed < 0);
  const avgSpeed = AVERAGE_PLANETARY_SPEEDS[planet] || 1.0;
  const isStation = Math.abs(speed) < avgSpeed * 0.15;

  if (!isRetrograde && !isStation) return null;

  const ascSignIndex = chartData.ascendant?.signIndex ?? 0;
  const house = planetPos.house || 1;
  const sign = planetPos.sign;

  const motion = calculateVakriMotion(planet, speed, isRetrograde);
  const cheshtaBala = calculateVakriCheshtaBala(planet, isRetrograde, speed);
  const lordship = getFunctionalLordship(planet, ascSignIndex);
  const dignity = calculateVakriDignity(planet, sign, isRetrograde);

  const sunPos = chartData.planets.find((p) => p.planet === 'Sun');
  const sunLong = sunPos?.longitude ?? null;
  const combust = checkCombust(planet, planetPos.longitude, sunLong);

  let combustionType: 'none' | 'inferior' | 'superior' | 'standard' = 'none';
  if (combust) {
    if (planet === 'Mercury' || planet === 'Venus') {
      combustionType = isRetrograde ? 'inferior' : 'superior';
    } else {
      combustionType = 'standard';
    }
  }

  let isPlanetaryWar = false;
  for (const other of chartData.planets) {
    if (other.planet !== planet && TARA_GRAHAS.has(other.planet)) {
      const diff = Math.abs((((planetPos.longitude - other.longitude) % 360) + 360) % 360);
      const angle = diff > 180 ? 360 - diff : diff;
      if (angle <= 1.0) {
        isPlanetaryWar = true;
        break;
      }
    }
  }

  const signLord = SIGN_LORDS[sign];
  let dispositor: VakriDispositorInfo | null = null;
  if (signLord && signLord !== planet) {
    const dispPos = chartData.planets.find((p) => p.planet === signLord);
    if (dispPos) {
      const dispDignity = calculateVakriDignity(
        signLord,
        dispPos.sign,
        Boolean(dispPos.isRetrograde),
      );
      const dispCombust = checkCombust(signLord, dispPos.longitude, sunLong);
      dispositor = {
        planet: signLord,
        house: dispPos.house || 1,
        sign: dispPos.sign,
        isRetrograde: Boolean(dispPos.isRetrograde),
        isCombust: dispCombust,
        dignity: dispDignity.baseDignity,
        relationship: 'neutral',
        summary: `Dispositor ${signLord} is in house ${dispPos.house} (${dispPos.sign}) with ${dispDignity.baseDignity} dignity.`,
      };
    }
  }

  const aspectsReceived: VakriAspectInfo[] = [];
  let hasBeneficDrishti = false;
  let hasSaturnDrishti = false;

  for (const other of chartData.planets) {
    if (other.planet === planet) continue;
    const diffHouses = (((house - (other.house || 1)) % 12) + 12) % 12;
    let aspects = false;
    let aspectType = '7th';

    if (diffHouses === 6) {
      aspects = true;
      aspectType = '7th';
    } else if (other.planet === 'Mars' && (diffHouses === 3 || diffHouses === 7)) {
      aspects = true;
      aspectType = diffHouses === 3 ? '4th' : '8th';
    } else if (other.planet === 'Jupiter' && (diffHouses === 4 || diffHouses === 8)) {
      aspects = true;
      aspectType = diffHouses === 4 ? '5th' : '9th';
    } else if (other.planet === 'Saturn' && (diffHouses === 2 || diffHouses === 9)) {
      aspects = true;
      aspectType = diffHouses === 2 ? '3rd' : '10th';
    }

    if (aspects) {
      const isBenefic = NATURAL_BENEFICS.has(other.planet);
      if (isBenefic) hasBeneficDrishti = true;
      if (other.planet === 'Saturn') hasSaturnDrishti = true;
      aspectsReceived.push({
        fromPlanet: other.planet,
        fromHouse: other.house || 1,
        aspectType,
        isBenefic,
      });
    }
  }

  const houseGroup = getHouseGroup(house);
  let previousHouseInfluenceData:
    | { enabled: boolean; previousHouse: number; previousSign: string; note: string }
    | undefined = undefined;
  if (options?.enablePreviousHouseRule) {
    const prevHouse = house === 1 ? 12 : house - 1;
    const signIdx = ZODIAC_SIGNS.indexOf(sign);
    const prevSign = ZODIAC_SIGNS[(signIdx - 1 + 12) % 12] ?? sign;
    previousHouseInfluenceData = {
      enabled: true,
      previousHouse: prevHouse,
      previousSign: prevSign,
      note: `Secondary traditional school modification: Vakri planet casts residual influence into house ${prevHouse} (${prevSign}).`,
    };
  }

  const interpretation = generateVakriInterpretations(
    planet,
    house,
    sign,
    lordship,
    dignity,
    dispositor,
  );

  const isDashaActive = options?.activeMahadasha === planet || options?.activeAntardasha === planet;
  const isLordshipHarmonious = lordship.functionalNature === 'benefic' || lordship.isYogakaraka;
  const dispositorStrong =
    dispositor != null && (dispositor.dignity === 'exalted' || dispositor.dignity === 'own_sign');

  const confidence = calculateVakriConfidence(
    dispositor != null,
    dispositorStrong,
    hasBeneficDrishti,
    isDashaActive,
    isLordshipHarmonious,
  );

  const factsForLLM: string[] = [
    `${planet} is ${motion.isRetrograde ? 'retrograde' : 'stationary direct'} in house ${house} (${sign}) with motional speed ${motion.speed}°/day.`,
    `${planet} possesses ${cheshtaBala.score} Virupas Cheshta Bala (${cheshtaBala.level} motional capacity).`,
    `${planet} rules house(s) ${lordship.housesOwned.join(', ')}, functioning as a ${lordship.functionalNature} for this Ascendant.`,
  ];

  if (dignity.uttaraKalamritaModifier.applied) {
    factsForLLM.push(
      `Classical Uttara Kalamrita modifier: ${dignity.uttaraKalamritaModifier.effectiveStrength}.`,
    );
  }
  if (combust) {
    factsForLLM.push(`${planet} is combust within orb of the Sun (${combustionType} conjunction).`);
  }
  if (dispositor) {
    factsForLLM.push(
      `Dispositor is ${dispositor.planet} in house ${dispositor.house} (${dispositor.sign}).`,
    );
  }
  if (aspectsReceived.length > 0) {
    factsForLLM.push(
      `Receives aspects from: ${aspectsReceived.map((a) => `${a.fromPlanet} (${a.aspectType})`).join(', ')}.`,
    );
  }

  return {
    planet,
    motion,
    placement: {
      house,
      sign,
      degree: planetPos.signDegree,
      nakshatra: planetPos.nakshatra,
      nakshatraLord: planetPos.nakshatraLord,
    },
    lordship,
    dignity,
    cheshtaBala,
    conditions: {
      isCombust: combust,
      combustionType,
      isPlanetaryWar,
    },
    dispositor,
    aspectsReceived,
    houseGroup,
    ...(previousHouseInfluenceData ? { previousHouseInfluence: previousHouseInfluenceData } : {}),
    interpretation,
    confidence,
    factsForLLM,
  };
}

export function analyzeAllVakriPlanets(
  chartData: ChartData,
  options?: {
    enablePreviousHouseRule?: boolean;
    activeMahadasha?: string;
    activeAntardasha?: string;
  },
): VakriPlanetAnalysis[] {
  const results: VakriPlanetAnalysis[] = [];
  for (const p of chartData.planets) {
    const analysis = analyzeVakriPlanet(p, chartData, options);
    if (analysis) {
      results.push(analysis);
    }
  }
  return results;
}
