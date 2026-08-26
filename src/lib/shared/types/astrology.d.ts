export type Planet = 'Sun' | 'Moon' | 'Mars' | 'Mercury' | 'Jupiter' | 'Venus' | 'Saturn' | 'Rahu' | 'Ketu';
export type ZodiacSign = 'Aries' | 'Taurus' | 'Gemini' | 'Cancer' | 'Leo' | 'Virgo' | 'Libra' | 'Scorpio' | 'Sagittarius' | 'Capricorn' | 'Aquarius' | 'Pisces';
export type Nakshatra = 'Ashwini' | 'Bharani' | 'Krittika' | 'Rohini' | 'Mrigashira' | 'Ardra' | 'Punarvasu' | 'Pushya' | 'Ashlesha' | 'Magha' | 'PurvaPhalguni' | 'UttaraPhalguni' | 'Hasta' | 'Chitra' | 'Swati' | 'Vishakha' | 'Anuradha' | 'Jyeshtha' | 'Moola' | 'PurvaAshadha' | 'UttaraAshadha' | 'Shravana' | 'Dhanishta' | 'Shatabhisha' | 'PurvaBhadrapada' | 'UttaraBhadrapada' | 'Revati';
export type Rashi = 'Mesha' | 'Vrishabha' | 'Mithuna' | 'Karka' | 'Simha' | 'Kanya' | 'Tula' | 'Vrischika' | 'Dhanu' | 'Makara' | 'Kumbha' | 'Meena';
export type Ayanamsa = 'lahiri' | 'krishnamurti' | 'raman' | 'true_chitra' | 'fagan_bradley' | 'yukteshwar';
export type HouseSystem = 'W' | 'P' | 'K' | 'E';
export type DivisionalChart = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'D7' | 'D8' | 'D9' | 'D10' | 'D11' | 'D12' | 'D14' | 'D16' | 'D20' | 'D21' | 'D24' | 'D27' | 'D30' | 'D40' | 'D45' | 'D60' | 'D81' | 'D108';
export type ChartStyle = 'north' | 'south';
export interface PlanetPosition {
    planet: Planet;
    longitude: number;
    latitude: number;
    speed: number;
    sign: ZodiacSign;
    signIndex: number;
    signDegree: number;
    nakshatra: Nakshatra;
    nakshatraIndex: number;
    nakshatraPada: number;
    nakshatraLord: Planet;
    isRetrograde: boolean;
    house: number;
}
export interface HouseData {
    house: number;
    cusp: number;
    sign: ZodiacSign;
    signIndex: number;
    lord: Planet;
    planets: Planet[];
}
export interface AscendantData {
    sign: ZodiacSign;
    signIndex: number;
    degree: number;
    nakshatra: Nakshatra;
    nakshatraPada: number;
}
export interface ChartData {
    planets: PlanetPosition[];
    houses: HouseData[];
    ascendant: AscendantData;
    ayanamsa: Ayanamsa;
    ayanamsaValue: number;
    julianDay: number;
}
export interface DashaPeriod {
    planet: Planet;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
    level: 'mahadasha' | 'antardasha' | 'pratyantardasha' | 'sookshma' | 'prana';
    subPeriods: DashaPeriod[];
    deity?: string;
}
export interface VimshottariDasha {
    mahadashas: DashaPeriod[];
    currentMahadasha: DashaPeriod;
    currentAntardasha: DashaPeriod;
    currentPratyantardasha: DashaPeriod;
}
export interface YoginiDasha {
    yoginis: DashaPeriod[];
    currentYogini: DashaPeriod;
}
export interface CharaDasha {
    signs: {
        sign: ZodiacSign;
        startDate: Date;
        endDate: Date;
        isActive: boolean;
    }[];
}
export interface MangalDosha {
    present: boolean;
    severity: 'none' | 'mild' | 'moderate' | 'severe';
    percentage: number;
    fromLagna: boolean;
    fromMoon: boolean;
    fromVenus: boolean;
    marsHouseFromLagna: number;
    marsHouseFromMoon: number;
    marsHouseFromVenus: number;
    cancellations: string[];
    type: 'partial' | 'full' | 'cancelled' | 'none';
    description: string;
}
export interface KaalSarpDosha {
    present: boolean;
    type: string;
    name: string;
    severity: 'none' | 'mild' | 'moderate' | 'severe';
    rahuHouse: number;
    ketuHouse: number;
    isPartial: boolean;
}
export interface SadeSati {
    active: boolean;
    phase: 'rising' | 'peak' | 'setting' | 'none';
    startDate: Date | null;
    endDate: Date | null;
    severity: 'none' | 'mild' | 'moderate' | 'severe';
    saturnSign: ZodiacSign;
    moonSign: ZodiacSign;
}
export interface PitraDosha {
    present: boolean;
    indicators: string[];
    severity: 'none' | 'mild' | 'moderate' | 'severe';
}
export interface KemDrumaDosha {
    present: boolean;
    cancellations: string[];
    severity: 'none' | 'mild' | 'moderate' | 'severe';
}
export interface GrahanDosha {
    present: boolean;
    type: 'surya_grahan' | 'chandra_grahan' | 'both' | 'none';
    severity: 'none' | 'mild' | 'moderate' | 'severe';
}
export interface GuruChandalDosha {
    present: boolean;
    house: number;
    severity: 'none' | 'mild' | 'moderate' | 'severe';
}
export interface DoshaAnalysis {
    mangal: MangalDosha;
    kaalSarp: KaalSarpDosha;
    sadeSati: SadeSati;
    pitra: PitraDosha;
    kemDruma: KemDrumaDosha;
    grahan: GrahanDosha;
    guruChandal: GuruChandalDosha;
}
export type YogaType = 'benefic' | 'dosha' | 'mahapurusha' | 'dhana' | 'raja' | 'lunar' | 'solar';
export interface Yoga {
    name: string;
    type: YogaType;
    present: boolean;
    strength: number;
    description: string;
    planets: Planet[];
    houses: number[];
    activationPeriod?: string | undefined;
}
export interface PlanetShadbala {
    planet: Planet;
    sthanaBala: number;
    digBala: number;
    kalaBala: number;
    cheshtaBala: number;
    naisargikaBala: number;
    drikBala: number;
    totalVirupas: number;
    requiredVirupas: number;
    isStrong: boolean;
}
export interface BhinnaAshtakavarga {
    planet: Planet;
    bindus: number[];
    total: number;
}
export interface SarvaAshtakavarga {
    bindus: number[];
    total: number;
}
export interface AshtakavargaData {
    bhinna: BhinnaAshtakavarga[];
    sarva: SarvaAshtakavarga;
}
export type Koota = 'Varna' | 'Vashya' | 'Tara' | 'Yoni' | 'GrahaMaitri' | 'Gana' | 'Bhakoot' | 'Nadi';
export interface KootaScore {
    koota: Koota;
    maxScore: number;
    score: number;
    description: string;
    compatibility: 'excellent' | 'good' | 'average' | 'poor';
}
export interface AshtakootaResult {
    scores: KootaScore[];
    totalScore: number;
    maxTotal: number;
    mangalMatch: {
        boyManglik: boolean;
        girlManglik: boolean;
        compatible: boolean;
    };
    overallCompatibility: 'excellent' | 'good' | 'average' | 'below_average' | 'poor';
}
export interface DashakootaResult {
    scores: {
        name: string;
        maxScore: number;
        score: number;
        description: string;
    }[];
    totalScore: number;
    maxTotal: number;
    overallCompatibility: 'excellent' | 'good' | 'average' | 'below_average' | 'poor';
}
export interface LalKitabChart {
    houses: {
        house: number;
        planets: Planet[];
        sign: ZodiacSign;
    }[];
    pakkaGhar: Record<Planet, number>;
}
export interface LalKitabDebt {
    type: string;
    present: boolean;
    indicators: string[];
    remedies: string[];
}
export interface LalKitabRemedy {
    planet: Planet;
    house: number;
    remedies: string[];
    totke: string[];
}
export interface BlindPlanet {
    planet: Planet;
    house: number;
    isBlind: boolean;
    isHalfBlind: boolean;
    reason: string;
}
export interface Tithi {
    number: number;
    name: string;
    paksha: 'Shukla' | 'Krishna';
    deity: string;
    isAuspicious: boolean;
    /** Local HH:mm this tithi ends (i.e. when the next one begins) — a real swisseph angle-crossing search, not an estimate. Absent on cached rows written before this field existed. */
    endsAt?: string;
    /** Name of the tithi that begins at `endsAt`. */
    nextName?: string;
}
export interface NakshatraData {
    index: number;
    name: Nakshatra;
    lord: Planet;
    pada: number;
    deity: string;
    /** Local HH:mm this nakshatra ends (i.e. when the next one begins). */
    endsAt?: string;
    /** Name of the nakshatra that begins at `endsAt`. */
    nextName?: string;
}
export interface PanchangYoga {
    index: number;
    name: string;
    isAuspicious: boolean;
}
export interface Karana {
    index: number;
    name: string;
    isFixed: boolean;
}
export interface PanchangData {
    tithi: Tithi;
    nakshatra: NakshatraData;
    yoga: PanchangYoga;
    karana: Karana;
    vara: string;
    rahuKaal: {
        start: string;
        end: string;
    };
    gulikaKaal: {
        start: string;
        end: string;
    };
    yamagandaKaal: {
        start: string;
        end: string;
    };
    abhijitMuhurta: {
        start: string;
        end: string;
    };
    sunriseTime: string;
    sunsetTime: string;
    /** Local HH:mm moonrise via swe_rise_trans (SE_MOON) — a real computation, unlike sunrise/sunset's NOAA approximation. Absent (legitimately, not just missing) on civil days the Moon doesn't rise. */
    moonriseTime?: string;
    /** Local HH:mm moonset via swe_rise_trans (SE_MOON). Same absence caveat as moonriseTime. */
    moonsetTime?: string;
    regionalMonths?: Record<RegionId, RegionalMonth>;
    /** 8 day + 8 night periods, cycling through 7 named types by weekday. */
    choghadiya?: {
        day: Choghadiya[];
        night: Choghadiya[];
    };
    /** All 24 planetary hours for the day, starting at sunrise. */
    hora?: Hora[];
}
export type RegionId = 'north' | 'south' | 'west' | 'east' | 'gujarat' | 'odisha' | 'assam' | 'tamil' | 'malayalam' | 'punjab' | 'kannada';
export type MonthSystem = 'purnimanta' | 'amanta' | 'solar' | 'fixed_solar';
export interface RegionalMonth {
    region: RegionId;
    calendar: string;
    monthSystem: MonthSystem;
    monthIndex: number;
    monthName: string;
    /** 1-indexed day within this regional month — only set for `solar` (approximate, ±1 day; see regional.ts) and `fixed_solar` (exact) systems. Lunisolar (purnimanta/amanta) regions have no separate day-of-month concept distinct from the tithi, so this is omitted for them. */
    dayOfMonth?: number;
    paksha?: 'shukla' | 'krishna';
    year: number;
    isAdhikMaas?: boolean;
    adhikMaasLabel?: string;
}
export interface Choghadiya {
    name: string;
    type: 'good' | 'bad' | 'neutral';
    startTime: string;
    endTime: string;
}
export interface Hora {
    planet: Planet;
    startTime: string;
    endTime: string;
    isAuspicious: boolean;
}
export type MuhurtaType = 'marriage' | 'griha_pravesh' | 'business' | 'namkaran' | 'vehicle_purchase' | 'gold_purchase' | 'travel' | 'surgery';
export interface MuhurtaResult {
    dateTime: Date;
    score: number;
    reasoning: string[];
    warnings: string[];
    tithi: string;
    nakshatra: string;
    yoga: string;
    lagnaSign: ZodiacSign;
}
export interface NumerologyResult {
    lifePath: number;
    expression: number;
    soulUrge: number;
    personality: number;
    luckyNumbers: number[];
    nameNumber: number;
    analysis: {
        lifePath: string;
        expression: string;
        soulUrge: string;
        personality: string;
    };
}
export type Category = 'overall' | 'health' | 'career' | 'marriage' | 'finance' | 'education';
export interface CategoryReading {
    hook: string;
    description: string;
    advice: string;
    quality: 'good' | 'moderate' | 'challenging' | 'avoid';
    score: number;
}
//# sourceMappingURL=astrology.d.ts.map