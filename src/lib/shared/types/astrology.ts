// ============================================================
// Core Vedic Astrology Types
// ============================================================

export type Planet =
  | 'Sun'
  | 'Moon'
  | 'Mars'
  | 'Mercury'
  | 'Jupiter'
  | 'Venus'
  | 'Saturn'
  | 'Rahu'
  | 'Ketu';

export type ZodiacSign =
  | 'Aries'
  | 'Taurus'
  | 'Gemini'
  | 'Cancer'
  | 'Leo'
  | 'Virgo'
  | 'Libra'
  | 'Scorpio'
  | 'Sagittarius'
  | 'Capricorn'
  | 'Aquarius'
  | 'Pisces';

export type Nakshatra =
  | 'Ashwini'
  | 'Bharani'
  | 'Krittika'
  | 'Rohini'
  | 'Mrigashira'
  | 'Ardra'
  | 'Punarvasu'
  | 'Pushya'
  | 'Ashlesha'
  | 'Magha'
  | 'PurvaPhalguni'
  | 'UttaraPhalguni'
  | 'Hasta'
  | 'Chitra'
  | 'Swati'
  | 'Vishakha'
  | 'Anuradha'
  | 'Jyeshtha'
  | 'Moola'
  | 'PurvaAshadha'
  | 'UttaraAshadha'
  | 'Shravana'
  | 'Dhanishta'
  | 'Shatabhisha'
  | 'PurvaBhadrapada'
  | 'UttaraBhadrapada'
  | 'Revati';

export type Rashi =
  | 'Mesha'
  | 'Vrishabha'
  | 'Mithuna'
  | 'Karka'
  | 'Simha'
  | 'Kanya'
  | 'Tula'
  | 'Vrischika'
  | 'Dhanu'
  | 'Makara'
  | 'Kumbha'
  | 'Meena';

export type Ayanamsa = 'lahiri' | 'krishnamurti' | 'raman';

export type HouseSystem = 'W' | 'P' | 'K' | 'E'; // Whole sign, Placidus, Koch, Equal

export type DivisionalChart =
  | 'D1'
  | 'D2'
  | 'D3'
  | 'D4'
  | 'D5'
  | 'D6'
  | 'D7'
  | 'D8'
  | 'D9'
  | 'D10'
  | 'D11'
  | 'D12'
  | 'D14'
  | 'D16'
  | 'D20'
  | 'D21'
  | 'D24'
  | 'D27'
  | 'D30'
  | 'D40'
  | 'D45'
  | 'D60'
  | 'D81'
  | 'D108';

export type ChartStyle = 'north' | 'south';

// ============================================================
// Planet Position Data
// ============================================================

export interface PlanetPosition {
  planet: Planet;
  longitude: number;
  latitude: number;
  speed: number;
  sign: ZodiacSign;
  signIndex: number; // 0-11
  signDegree: number; // 0-30 degrees within sign
  nakshatra: Nakshatra;
  nakshatraIndex: number; // 0-26
  nakshatraPada: number; // 1-4
  nakshatraLord: Planet;
  isRetrograde: boolean;
  house: number; // 1-12
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

// ============================================================
// Dasha Types
// ============================================================

export interface DashaPeriod {
  planet: Planet;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  level: 'mahadasha' | 'antardasha' | 'pratyantardasha' | 'sookshma' | 'prana';
  subPeriods: DashaPeriod[];
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
  signs: { sign: ZodiacSign; startDate: Date; endDate: Date; isActive: boolean }[];
}

// ============================================================
// Dosha Types
// ============================================================

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

// ============================================================
// Yoga Types
// ============================================================

export type YogaType = 'benefic' | 'dosha' | 'mahapurusha' | 'dhana' | 'raja' | 'lunar' | 'solar';

export interface Yoga {
  name: string;
  type: YogaType;
  present: boolean;
  strength: number; // 0-100
  description: string;
  planets: Planet[];
  houses: number[];
  activationPeriod?: string | undefined;
}

// ============================================================
// Shadbala
// ============================================================

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

// ============================================================
// Ashtakavarga
// ============================================================

export interface BhinnaAshtakavarga {
  planet: Planet;
  bindus: number[]; // 12 values (one per sign)
  total: number;
}

export interface SarvaAshtakavarga {
  bindus: number[]; // 12 values (one per sign)
  total: number; // always 337
}

export interface AshtakavargaData {
  bhinna: BhinnaAshtakavarga[];
  sarva: SarvaAshtakavarga;
}

// ============================================================
// Matching Types
// ============================================================

export type Koota =
  | 'Varna'
  | 'Vashya'
  | 'Tara'
  | 'Yoni'
  | 'GrahaMaitri'
  | 'Gana'
  | 'Bhakoot'
  | 'Nadi';

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
  scores: { name: string; maxScore: number; score: number; description: string }[];
  totalScore: number;
  maxTotal: number;
  overallCompatibility: 'excellent' | 'good' | 'average' | 'below_average' | 'poor';
}

// ============================================================
// Lal Kitab Types
// ============================================================

export interface LalKitabChart {
  houses: { house: number; planets: Planet[]; sign: ZodiacSign }[];
  pakkaGhar: Record<Planet, number>;
}

export interface LalKitabDebt {
  type: string; // Pitra Rin, Matri Rin, Stri Rin, etc.
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

// ============================================================
// Panchang Types
// ============================================================

export interface Tithi {
  number: number; // 1-30
  name: string;
  paksha: 'Shukla' | 'Krishna';
  deity: string;
  isAuspicious: boolean;
}

export interface NakshatraData {
  index: number;
  name: Nakshatra;
  lord: Planet;
  pada: number;
  deity: string;
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
  vara: string; // weekday
  rahuKaal: { start: string; end: string };
  gulikaKaal: { start: string; end: string };
  yamagandaKaal: { start: string; end: string };
  abhijitMuhurta: { start: string; end: string };
  sunriseTime: string;
  sunsetTime: string;
  regionalMonths?: Record<RegionId, RegionalMonth>;
  /** 8 day + 8 night periods, cycling through 7 named types by weekday. */
  choghadiya?: { day: Choghadiya[]; night: Choghadiya[] };
  /** All 24 planetary hours for the day, starting at sunrise. */
  hora?: Hora[];
}

// ── Regional calendar variants ───────────────────────────────────────────────
// India's four cultural regions disagree about lunar/solar month names and era
// years for the same Gregorian date. RegionalMonth captures the per-region view.

export type RegionId = 'north' | 'south' | 'west' | 'east';
export type MonthSystem = 'purnimanta' | 'amanta' | 'solar';

export interface RegionalMonth {
  region: RegionId;
  calendar: string; // 'Vikram Samvat' | 'Shalivahana Shaka' | 'Bengali San'
  monthSystem: MonthSystem;
  monthIndex: number; // 0..11
  monthName: string; // localised name in the regional convention
  paksha?: 'shukla' | 'krishna'; // omitted for solar (East)
  year: number; // era year (Vikram 2083, Shaka 1948, Bengali 1433, ...)
  isAdhikMaas?: boolean; // true on dates inside an Adhik Maas range (lunisolar regions only)
  adhikMaasLabel?: string; // e.g., 'Adhik Jyeshtha 2026' when isAdhikMaas
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

// ============================================================
// Muhurta Types
// ============================================================

export type MuhurtaType =
  | 'marriage'
  | 'griha_pravesh'
  | 'business'
  | 'namkaran'
  | 'vehicle_purchase'
  | 'gold_purchase'
  | 'travel'
  | 'surgery';

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

// ============================================================
// Numerology Types
// ============================================================

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

// ============================================================
// Horoscope category ratings (Overall/Health/Career/Marriage)
// ============================================================

export type Category = 'overall' | 'health' | 'career' | 'marriage';

export interface CategoryReading {
  hook: string;
  description: string;
  advice: string;
  quality: 'good' | 'moderate' | 'challenging' | 'avoid';
  score: number; // 1-5
}
