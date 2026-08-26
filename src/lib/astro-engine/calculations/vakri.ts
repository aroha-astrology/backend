// =============================================================================
// Aroha Astrology — Vakri (Retrograde) Graha Rules Engine
// Specification: 48-Section Multi-Layer Jyotish Vakri Rules Engine
// =============================================================================

import type { Planet, ZodiacSign, ChartData, PlanetPosition } from '@aroha-astrology/shared';

import {
  ZODIAC_SIGNS,
  SIGN_LORDS,
  PLANET_EXALTATION,
  PLANET_DEBILITATION,
  PLANET_OWN_SIGNS,
} from '@aroha-astrology/shared';

import { isCombust } from './planet-state.js';

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
  stationProximity: number; // 0.0 to 1.0 (1.0 = exact stationary point)
  isStation: boolean;
  shadowPhase: 'none' | 'pre' | 'post';
}

export interface VakriCheshtaBala {
  score: number; // Virupas (0 - 60)
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
  score: number; // 0.00 to 1.00
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

/** Average mean daily velocities in degrees/day for the 5 visible planets */
export const AVERAGE_PLANETARY_SPEEDS: Record<string, number> = {
  Mars: 0.524,
  Mercury: 1.383,
  Jupiter: 0.0831,
  Venus: 1.2,
  Saturn: 0.0335,
};

/** Natural benefic/malefic classifications */
const NATURAL_BENEFICS = new Set<string>(['Jupiter', 'Venus', 'Mercury', 'Moon']);
const NATURAL_MALEFICS = new Set<string>(['Saturn', 'Mars', 'Sun', 'Rahu', 'Ketu']);

/** 5 Tara Grahas capable of traditional physical Grahayuddha (Planetary War) */
const TARA_GRAHAS = new Set<string>(['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']);

// =============================================================================
// Helper: Motion State & Station Proximity
// =============================================================================

export function calculateVakriMotion(
  planet: Planet,
  speed: number,
  isRetrograde: boolean,
): VakriMotion {
  const avgSpeed = AVERAGE_PLANETARY_SPEEDS[planet] || 1.0;
  const absSpeed = Math.abs(speed);
  const speedRatio = Math.round((speed / avgSpeed) * 100) / 100;

  // Station proximity: when |speed| drops below 15% of average speed, it approaches station
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
    if (isStation) {
      state = 'station_direct';
    } else {
      state = 'direct';
    }
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

// =============================================================================
// Helper: Motional Strength (Cheshta Bala)
// =============================================================================

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
      description:
        'Vakri motion provides maximum motional strength (60 Virupas Cheshta Bala), intensifying planetary capacity.',
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

// =============================================================================
// Helper: Functional Lordship & Nature
// =============================================================================

export function getFunctionalLordship(
  planet: Planet,
  ascendantSignIndex: number, // 0 = Aries, 1 = Taurus, etc.
): VakriLordship {
  const naturalNature = NATURAL_BENEFICS.has(planet) ? 'benefic' : 'malefic';

  // Determine signs owned by planet
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

  // Check Yogakaraka (Kendra + Trikona lord simultaneously)
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

// =============================================================================
// Helper: Dignity & Uttara Kalamrita Reversal
// =============================================================================

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

  // Uttara Kalamrita Khanda II, Sloka 6:
  // "Vakri swoccagato'pi neechaphalam... neecho'pi vakri sthita ucchaphalam dadati"
  if (isRetrograde) {
    if (baseDignity === 'debilitated') {
      return {
        baseDignity,
        uttaraKalamritaModifier: {
          applied: true,
          source: 'Uttara Kalamrita',
          effectiveStrength: 'exaltation_like_power',
          explanation:
            'Classical rule (Uttara Kalamrita): A debilitated planet in retrograde motion gains profound motional vigor (Cheshta Bala) and resilience, expressing significant latent drive.',
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
            'Classical rule (Uttara Kalamrita): An exalted planet in retrograde motion internalizes its high status, requiring recalibration of outward results rather than effortless projection.',
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

// =============================================================================
// Helper: House Group Classifier
// =============================================================================

export function getHouseGroup(house: number): HouseGroup {
  if ([1, 4, 7, 10].includes(house)) return 'kendra';
  if ([5, 9].includes(house)) return 'trikona';
  if ([6, 8, 12].includes(house)) return 'dusthana';
  if ([3, 6, 10, 11].includes(house)) return 'upachaya';
  if ([2, 7].includes(house)) return 'maraka';
  return 'other';
}

// =============================================================================
// Helper: 3-Layer Interpretations (Classical, Interpretive, Karmic)
// =============================================================================

export function generateVakriInterpretations(
  planet: Planet,
  house: number,
  sign: ZodiacSign,
  lordship: VakriLordship,
  dignity: VakriDignity,
  dispositor: VakriDispositorInfo | null,
): VakriInterpretations {
  const houseNames: Record<number, string> = {
    1: '1st house (Self, Vitality & Identity)',
    2: '2nd house (Wealth, Speech & Family)',
    3: '3rd house (Initiative, Courage & Skills)',
    4: '4th house (Emotional Anchor, Mother & Property)',
    5: '5th house (Intellect, Creativity & Dharma)',
    6: '6th house (Service, Obstacles & Resolution)',
    7: '7th house (Partnerships, Marriage & Outreach)',
    8: '8th house (Transformation, Research & Secrets)',
    9: '9th house (Higher Guidance, Dharma & Wisdom)',
    10: '10th house (Career, Authority & Public Life)',
    11: '11th house (Gains, Networks & Ambition)',
    12: '12th house (Solitude, Foreign Sphere & Spirituality)',
  };

  const houseDesc = houseNames[house] || `house ${house}`;

  // 1. Classical Layer
  let classical = `${planet} is in Vakri (retrograde) motion in ${sign} in the ${houseDesc}, conferring elevated Cheshta Bala (motional strength). As lord of house(s) ${lordship.housesOwned.join(', ')}, its capacity to deliver its portfolio is amplified.`;
  if (dignity.uttaraKalamritaModifier.applied) {
    classical += ` ${dignity.uttaraKalamritaModifier.explanation}`;
  }
  if (dispositor) {
    classical += ` Its dispositor is ${dispositor.planet} placed in house ${dispositor.house} (${dispositor.sign}), anchoring its manifestation.`;
  }

  // 2. Interpretive Layer (Psychological & Real-World Non-Linear Dynamic)
  let interpretive = '';
  switch (planet) {
    case 'Mercury':
      interpretive = `Intellectual processing tends toward deep introspection, continuous review of decisions, and non-linear communication styles. Analytical projects benefit from thorough auditing.`;
      break;
    case 'Venus':
      interpretive = `Evaluates relationships, aesthetics, and finances through an individualized, reflective lens. Values authenticity and re-evaluates relational commitments with careful self-awareness.`;
      break;
    case 'Mars':
      interpretive = `Drive and initiative operate from internal conviction rather than impulsive outward aggression. Energy is channeled strategically through calculated, deliberate action.`;
      break;
    case 'Jupiter':
      interpretive = `Wisdom, belief systems, and guiding philosophies develop via personal introspection and direct life experience rather than blind adherence to conventional dogmas.`;
      break;
    case 'Saturn':
      interpretive = `Career path, responsibilities, and structural foundations develop through iterative cycles, patience, and rigorous internal discipline.`;
      break;
    default:
      interpretive = `Themes of the ${houseDesc} manifest through cycles of review, restructuring, and deliberate personal pacing.`;
  }

  // 3. Karmic Layer (Classical Tradition & Soul Lessons)
  let karmic = '';
  switch (planet) {
    case 'Saturn':
      karmic = `In traditional karmic Jyotish, retrograde Saturn represents recurring responsibilities and unfinished soul duties where patient accountability and perseverance bring profound maturity.`;
      break;
    case 'Jupiter':
      karmic = `Traditional perspectives view retrograde Jupiter as a soul-level search for deeper philosophical truth, revisiting spiritual principles with authentic personal dedication.`;
      break;
    case 'Mars':
      karmic = `Karmic traditions associate retrograde Mars with mastering willpower and the constructive redirection of passionate energy toward enduring purpose.`;
      break;
    case 'Venus':
      karmic = `Traditional Jyotish regards retrograde Venus as a journey to discover unconditional self-worth and deeper spiritual dimensions of love beyond superficial attachments.`;
      break;
    case 'Mercury':
      karmic = `Vakri Mercury reflects a karmic pattern of refining perception, discernment, and seeking genuine intellectual clarity.`;
      break;
    default:
      karmic = `Some traditions interpret Vakri status as a marker of recurring, introspective life lessons associated with the ${houseDesc}.`;
  }

  return {
    classical,
    interpretive,
    karmic,
  };
}

// =============================================================================
// Helper: Multi-Factor Confidence Score Calculation
// =============================================================================

export function calculateVakriConfidence(
  hasDispositor: boolean,
  dispositorStrong: boolean,
  hasBeneficDrishti: boolean,
  isDashaActive: boolean,
  isLordshipHarmonious: boolean,
): VakriConfidence {
  let score = 0.5; // Baseline
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

  return {
    level,
    score,
    factors,
  };
}

// =============================================================================
// Core Analyzer Function: analyzeVakriPlanet
// =============================================================================

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

  // Only the 5 visible classical planets undergo standard physical Vakri mechanics
  if (!TARA_GRAHAS.has(planet)) {
    return null;
  }

  const speed = planetPos.speed ?? 0;
  const isRetrograde = Boolean(planetPos.isRetrograde || speed < 0);

  // If not retrograde and speed is normal direct, return null unless stationary
  const avgSpeed = AVERAGE_PLANETARY_SPEEDS[planet] || 1.0;
  const isStation = Math.abs(speed) < avgSpeed * 0.15;

  if (!isRetrograde && !isStation) {
    return null;
  }

  const ascSignIndex = chartData.ascendant?.signIndex ?? 0;
  const house = planetPos.house || 1;
  const sign = planetPos.sign;

  // 1. Motion
  const motion = calculateVakriMotion(planet, speed, isRetrograde);

  // 2. Motional Strength (Cheshta Bala)
  const cheshtaBala = calculateVakriCheshtaBala(planet, isRetrograde, speed);

  // 3. Lordship
  const lordship = getFunctionalLordship(planet, ascSignIndex);

  // 4. Dignity + Uttara Kalamrita Reversal
  const dignity = calculateVakriDignity(planet, sign, isRetrograde);

  // 5. Combustion & War
  const sunPos = chartData.planets.find((p) => p.planet === 'Sun');
  const sunLong = sunPos?.longitude ?? null;
  const combust = isCombust(planet, planetPos.longitude, sunLong);

  let combustionType: 'none' | 'inferior' | 'superior' | 'standard' = 'none';
  if (combust) {
    if (planet === 'Mercury' || planet === 'Venus') {
      combustionType = isRetrograde ? 'inferior' : 'superior';
    } else {
      combustionType = 'standard';
    }
  }

  // Planetary War check (within 1 degree of another Tara Graha)
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

  // 6. Dispositor
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
      const dispCombust = isCombust(signLord, dispPos.longitude, sunLong);
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

  // 7. Aspects Received
  const aspectsReceived: VakriAspectInfo[] = [];
  let hasBeneficDrishti = false;
  let hasSaturnDrishti = false;

  for (const other of chartData.planets) {
    if (other.planet === planet) continue;
    const diffHouses = (((house - (other.house || 1)) % 12) + 12) % 12;

    let aspects = false;
    let aspectType = '7th';

    // 7th house full aspect for all planets
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

  // 8. House Group
  const houseGroup = getHouseGroup(house);

  // 9. Optional Previous House Rule
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

  // 10. 3-Layer Interpretations
  const interpretation = generateVakriInterpretations(
    planet,
    house,
    sign,
    lordship,
    dignity,
    dispositor,
  );

  // 11. Confidence
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

  // 12. Structured Facts for LLM / AI Prompts
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

// =============================================================================
// Batch Analyzer: analyzeAllVakriPlanets
// =============================================================================

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
