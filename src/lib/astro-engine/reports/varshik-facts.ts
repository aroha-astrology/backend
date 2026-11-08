// =============================================================================
// Varshik Rashifal 2027: the facts object (the completeness contract)
// =============================================================================
// ONE object holds everything the report says and shows. It is built once, validated BEFORE any
// text is written, frozen into the saved report, and every sentence is later checked against it.
//
//   buildVarshikFacts()      the builder (async: it needs the sky for the eclipses and stations)
//   VarshikFactsSchema       the zod schema; a missing, NaN or out-of-range field fails it
//   preflightVarshikFacts()  schema + the invariants a schema cannot say (the Mudda seam, 12 months,
//                            365 days, one window for every key a question may use)
//   coverageProblems()       after the text is written: every page, month, area, dosha, yoga and
//                            eclipse has its words
//
// If the preflight fails, generation stops, the existing refund flow returns the reader's money
// and the row's error names the fields that failed. The report never ships with a gap, a
// placeholder or a value the model guessed. Reader facts may be empty; nothing else may be.
//
// Status: PROVISIONAL, on a Sprint 1 engine not yet checked against JHora (see varshik-2027.ts).
// =============================================================================

import { z } from 'zod';
import { ZODIAC_SIGNS } from '@aroha-astrology/shared';
import type { ChartData, Planet } from '@aroha-astrology/shared';
import { AREAS, TIER_EDGES } from '../../../config/varshik-weights.js';
import { HINDU_FESTIVALS } from '../../../config/hindu-festivals.js';
import { calculatePlanetPositions } from '../calculations/planetPositions.js';
import { isCombust } from '../calculations/planet-state.js';
import { calculateShadbala } from '../calculations/shadbala.js';
import { calculateVimshottariDasha } from '../dashas/vimshottari.js';
import { computeReportVargas } from './report-vargas.js';
import { signDignity } from '../rules/dignity.js';
import { jdFromDate } from '../../astro-tools/transit-events.js';
import { panchavargiBala } from '../varshphal/tajika.js';
import { computeTajikaYogas } from '../varshphal/tajika-yogas.js';
import { computeYearEvents } from '../varshphal/year-events.js';
import { computeVarshikScores, type VarshikAnswers, type VarshikScores } from './varshik-2027.js';
import {
  DOSHA_KEYS,
  answerWindow,
  doshaActivityAll,
  reliefTimeline,
  yogaDelivery,
  type DoshaKey,
} from './varshik-timing.js';
import { munthaLordOf, type VarshikContext } from './varshik-context.js';
import { DOSHA_LABEL, MONTH_NAMES, NINE_PLANETS, TAJIKA_LABEL } from './varshik-labels.js';
import { buildStarFacts, buildVarshaExtraFacts, starsZ, varshaExtraZ } from './varshik-facts-c3.js';
import {
  closureZ,
  decisionC5Z,
  eclipseInfo,
  eclipseInfoZ,
  eclipsePlaceOf,
  eclipsePlaceZ,
  type ReaderPlace,
} from './varshik-facts-c5.js';
import { CLOSED_DECISION_KEYS, MIN_OPEN_DAYS, astaCovered, chaturmasOf, closuresFor, ruleSource } from './varshik-muhurta.js';

export { DOSHA_LABEL, MONTH_NAMES, NINE_PLANETS };

const SEVEN_PLANETS: Planet[] = NINE_PLANETS.slice(0, 7);
const BALA_PLANETS_7: string[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
const SLOW: Planet[] = ['Saturn', 'Jupiter', 'Rahu', 'Ketu'];

/** What each dosha touches and the one simple, free remedy. Plain facts, no fear. */
const DOSHA_NOTES: Record<DoshaKey, { touches: string; remedy: string }> = {
  mangal: {
    touches: 'partnership, temper and energy',
    remedy: 'Mars is honoured on Tuesdays: a short walk, or sharing food with someone who needs it.',
  },
  kaalSarp: {
    touches: 'the pace at which results arrive',
    remedy: 'A few quiet minutes each Saturday, and feeding birds or a street animal.',
  },
  pitra: {
    touches: 'family inheritance and the elders',
    remedy: 'A call or a visit to an elder, and a lamp lit for the family on the new moon.',
  },
  guruChandal: {
    touches: 'advice, belief and how you weigh counsel',
    remedy: 'Thursday is Jupiter\'s day: help a teacher or a student, in any small way.',
  },
  grahan: {
    touches: 'confidence and the sense of direction',
    remedy: 'A steady morning routine, and a few minutes of sunlight each day.',
  },
  kemadruma: {
    touches: 'steadiness of mood and support',
    remedy: 'Monday is the Moon\'s day: spend an evening with someone close, and sleep on time.',
  },
  sadeSati: {
    touches: 'work pace, patience and rest',
    remedy: 'Saturday service: a small act of help to someone who works with their hands.',
  },
  dhaiya: {
    touches: 'effort, routine and the weight of duty',
    remedy: 'Saturday service: a small act of help to someone who works with their hands.',
  },
  gandanta: {
    touches: 'a sensitive junction point at birth, felt in how the mind settles and in new beginnings',
    remedy: 'Monday is the Moon day: a few quiet minutes of prayer or stillness, and time with an elder.',
  },
};

const KAKSHYA_LORDS = ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon', 'Lagna'] as const;

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------

const mod12 = (n: number): number => ((n % 12) + 12) % 12;
const signIndexOf = (lon: number): number => Math.floor((((lon % 360) + 360) % 360) / 30);
const houseFromSign = (lagnaSign: number, sign: number): number => mod12(sign - lagnaSign) + 1;
const r1 = (x: number): number => Math.round(x * 10) / 10;
const r2 = (x: number): number => Math.round(x * 100) / 100;

/** 'YYYY-MM-DD' of an instant in a zone. */
export function localDate(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

function localDateTime(ms: number, tz: string): string {
  const d = localDate(ms, tz);
  const t = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms));
  return `${d} ${t}`;
}

/** '12 March' from 'YYYY-MM-DD'. */
export function dayMonth(iso: string): string {
  const [, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${d} ${MONTH_NAMES[m - 1]}`;
}

// -----------------------------------------------------------------------------
// The schema
// -----------------------------------------------------------------------------

const fin = z.number().finite();
const month = z.number().int().min(0).max(11);
const sign = z.string().min(3);
const tierZ = z.enum(['dark_green', 'light_green', 'amber', 'rust']);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cellZ = z.object({ score: fin.min(0).max(100), tier: tierZ });
const areaZ = z.enum(AREAS);
const driverZ = z.object({ key: z.string().min(1), effect: fin });
const windowZ = z.object({
  fromDate: isoDate,
  toDate: isoDate,
  peakDate: isoDate,
  score: fin.min(0).max(100),
  tier: tierZ,
});

export const ANSWER_KEYS = [
  'relationship',
  'occupation',
  'children',
  'mainDecision',
  'livingWith',
  'home',
  'moneyFocus',
  'travelPlan',
  'studyPlan',
  'practice',
] as const;

const planetRowZ = z.object({
  planet: z.string().min(2),
  sign,
  signIndex: z.number().int().min(0).max(11),
  degree: fin.min(0).max(30),
  house: z.number().int().min(1).max(12),
  nakshatra: z.string().min(3),
  pada: z.number().int().min(1).max(4),
  retrograde: z.boolean(),
  combust: z.boolean(),
  dignity: z.string().min(3),
});

const vargaZ = z.object({ lagna: sign, planets: z.record(z.string(), sign) });

const sahamZ = z.object({
  name: z.string().min(3),
  sign,
  house: z.number().int().min(1).max(12),
  lord: z.string().min(2),
  supported: z.boolean(),
});

const muddaZ = z.object({
  lord: z.string().min(2),
  from: isoDate,
  to: isoDate,
  fromMs: fin,
  toMs: fin,
  antar: z
    .array(z.object({ lord: z.string().min(2), from: isoDate, to: isoDate }))
    .length(9),
});

const varshaZ = z.object({
  targetYear: z.number().int(),
  startsAt: z.string().min(10),
  endsAt: z.string().min(10),
  startMs: fin,
  endMs: fin,
  isDayReturn: z.boolean(),
  lagna: sign,
  lagnaIndex: z.number().int().min(0).max(11),
  muntha: z.object({
    sign,
    house: z.number().int().min(1).max(12),
    lord: z.string().min(2),
    auspicious: z.boolean(),
  }),
  yearLord: z.string().min(2),
  wonByMunthaTiebreak: z.boolean(),
  panchadhikari: z
    .array(
      z.object({
        role: z.string().min(3),
        planet: z.string().min(2),
        strength: fin,
        aspectsLagna: z.boolean(),
      }),
    )
    .min(1),
  panchavargi: z.record(z.string(), fin).refine((r) => SEVEN_PLANETS.every((p) => p in r), {
    message: 'Panchavargi must cover all 7 planets',
  }),
  planets: z.array(planetRowZ).length(9),
  sahams: z.array(sahamZ).length(8),
  tajikaYogas: z.array(
    z.object({
      kind: z.string().min(3),
      planets: z.array(z.string()).min(2),
      gapDeg: fin.nullable(),
      reason: z.string().optional(),
    }),
  ),
  mudda: z.array(muddaZ).length(9),
  /** C2/C3: Mudda Yogini, Patyayini (by week), balas, extra yogas, life Sahams, Tri-Pataki. */
  extra: varshaExtraZ,
});

const skyEventZ = z.object({
  kind: z.enum([
    'ingress',
    'station-retrograde',
    'station-direct',
    'combust-in',
    'combust-out',
    'eclipse-solar',
    'eclipse-lunar',
  ]),
  planet: z.string().min(2),
  date: isoDate,
  month,
  sign,
  fromSign: z.string().nullable(),
  natalHouse: z.number().int().min(1).max(12),
  /** C5: the same sign counted from the natal Moon sign ("3rd from your Moon"). */
  moonHouse: z.number().int().min(1).max(12),
  varshaHouse: z.number().int().min(1).max(12),
  /** C5: eclipses only: type, magnitude, Grahan / Upachchaya / not visible, local times and Sutak. */
  eclipse: eclipseInfoZ.optional(),
});

const doshaZ = z.object({
  key: z.enum(DOSHA_KEYS as [DoshaKey, ...DoshaKey[]]),
  label: z.string().min(3),
  status: z.enum(['present', 'cancelled', 'not_present']),
  cancellations: z.array(z.string()),
  activeMonths: z.array(month),
  because: z.record(z.string(), z.array(z.string())),
  touches: z.string().min(3),
  remedy: z.string().min(3),
});

const yogaZ = z.object({
  source: z.enum(['natal', 'tajika']),
  name: z.string().min(3),
  kind: z.string().min(2),
  planets: z.array(z.string()),
  months: z.array(month),
  because: z.record(z.string(), z.array(z.string())),
  targetYear: z.number().int().nullable(),
  reason: z.string().optional(),
});

const reliefEventZ = z.object({
  date: isoDate,
  kind: z.string().min(3),
  effect: z.enum(['relief', 'hard']),
  detail: z.string().min(3),
  temporary: z.boolean().optional(),
});

export const VarshikFactsSchema = z.object({
  version: z.literal(1),
  year: z.number().int().min(2026).max(2100),
  window: z.object({ start: isoDate, end: isoDate }),
  reader: z.object({
    name: z.string().nullable(),
    birthDate: isoDate,
    birthTime: z.string().regex(/^\d{2}:\d{2}/),
    timezone: z.string().min(2),
    lat: fin.min(-90).max(90),
    lng: fin.min(-180).max(180),
    answers: z.object({
      relationship: z.string().optional(),
      occupation: z.string().optional(),
      children: z.string().optional(),
      mainDecision: z.string().optional(),
      livingWith: z.string().optional(),
      home: z.string().optional(),
      moneyFocus: z.string().optional(),
      travelPlan: z.string().optional(),
      studyPlan: z.string().optional(),
      practice: z.string().optional(),
    }),
    /** The reader's stored chat facts for this birth profile; may be empty, the one group that may. */
    facts: z.array(z.object({ id: z.string().regex(/^F\d+$/), fact: z.string().min(1) })),
    /** C5: where eclipses are judged (the reader's current place, else the India summary; never the birth place). */
    eclipsePlace: eclipsePlaceZ,
  }),
  birth: z.object({
    lagna: z.object({
      sign,
      signIndex: z.number().int().min(0).max(11),
      degree: fin.min(0).max(30),
      nakshatra: z.string().min(3),
      pada: z.number().int().min(1).max(4),
    }),
    planets: z.array(planetRowZ).length(9),
    d9: vargaZ,
    d10: vargaZ,
    shadbala: z
      .array(
        z.object({
          planet: z.string().min(2),
          totalVirupas: fin,
          requiredVirupas: fin,
          strong: z.boolean(),
        }),
      )
      .length(7),
  }),
  dashas: z.object({
    balance: z.object({ planet: z.string().min(2), yearsLeft: fin.min(0) }),
    /** Maha + Antar from 2026 to 2029. */
    antar: z
      .array(
        z.object({ from: isoDate, to: isoDate, maha: z.string().min(2), antar: z.string().min(2) }),
      )
      .min(1),
    /** Pratyantar through 2027. */
    pratyantar2027: z
      .array(
        z.object({
          from: isoDate,
          to: isoDate,
          maha: z.string().min(2),
          antar: z.string().min(2),
          praty: z.string().min(2),
        }),
      )
      .min(1),
  }),
  ashtakavarga: z.object({
    bav: z
      .record(z.string(), z.array(z.number().int().min(0).max(8)).length(12))
      .refine((r) => SEVEN_PLANETS.every((p) => p in r), { message: 'BAV must cover 7 planets' }),
    sav: z.array(z.number().int().min(0).max(60)).length(12),
    /** One row per month per slow planet: where it stands mid-month and its kakshya. */
    transits: z
      .array(
        z.object({
          month,
          planet: z.string().min(2),
          sign,
          natalHouse: z.number().int().min(1).max(12),
          /** C5: counted from the natal Moon sign. */
          moonHouse: z.number().int().min(1).max(12),
          bindus: z.number().int().min(0).max(60),
          kakshya: z.string().min(3),
        }),
      )
      .length(48),
  }),
  /** C1/C3: the birth stars, the stars the planets cross in the year, Moorti, and the month-by-month Moon gochar. */
  stars: starsZ,
  doshas: z.array(doshaZ).length(DOSHA_KEYS.length),
  yogas: z.array(yogaZ),
  varsha: z.array(varshaZ).min(1).max(2),
  muddaSeamExact: z.boolean(),
  /** Saham windows inside 2027: when a trigger planet crosses a Saham's degree, and how strong. */
  sahamWindows: z.array(
    z.object({
      saham: z.string().min(3),
      planet: z.string().min(2),
      roles: z.array(z.string()),
      from: isoDate,
      to: isoDate,
      exact: z.array(isoDate),
      strength: fin.min(0),
    }),
  ),
  skyEvents: z.array(skyEventZ).min(1),
  scores: z.object({
    overall: cellZ,
    months: z.array(cellZ).length(12),
    timingMap: z.record(z.string(), z.array(cellZ).length(12)).refine(
      (r) => AREAS.every((a) => a in r),
      { message: 'Timing Map must cover all 7 areas' },
    ),
    areaOverall: z.record(z.string(), cellZ),
    peakMonths: z.array(month).length(3),
    restMonth: month,
    why: z
      .array(z.object({ lifting: z.array(driverZ), weighing: z.array(driverZ) }))
      .length(12),
    decisionTable: z.array(
      z.object({
        key: z.string().min(2),
        months: z.array(cellZ).length(12),
        best: z.object({ from: month, to: month, score: fin, tier: tierZ }),
        hold: z.array(month),
        isMain: z.boolean(),
      }).merge(decisionC5Z),
    ),
    planetImpact: z
      .array(
        z.object({
          planet: z.string().min(2),
          natalHouse: z.number().int().min(1).max(12).nullable(),
          varshaHouses: z.array(z.number().int().min(0).max(12)),
          roles: z.array(z.string()),
          strength: fin.nullable(),
          transitHouses: z.array(z.number().int().min(1).max(12)),
          effect: z.enum(['helping', 'weighing', 'neutral']),
          bestMonth: month,
          hardMonth: month,
          topArea: z.object({ area: areaZ, effect: fin }),
        }),
      )
      .length(9),
    /** 365 smoothed daily scores, 0-100, one decimal. */
    dailyOverall: z.array(fin.min(0).max(100)).length(365),
    answerWindows: z.record(
      z.string(),
      z.object({
        best: windowZ,
        then: windowZ.nullable(),
        weak: z.boolean(),
      }),
    ),
    relief: z.object({
      lookbackFrom: isoDate,
      lookbackTo: isoDate,
      lookback: z.array(reliefEventZ),
      wasHard: z.boolean(),
      saturnDamperDays: z.number().int().min(0),
      varsha2026: z
        .object({
          yearLord: z.string(),
          munthaHouse: z.number().int().min(1).max(12),
          munthaAuspicious: z.boolean(),
          endedOn: isoDate,
        })
        .nullable(),
      ahead: z.array(reliefEventZ),
      nextRelief: reliefEventZ.nullable(),
      reliefInYear: z.boolean(),
      nextReliefBeyondYear: reliefEventZ.nullable(),
    }),
  }),
  calendar: z.object({
    festivals: z
      .array(
        z.object({
          date: isoDate,
          month,
          name: z.string().min(2),
          importance: z.enum(['major', 'minor']),
        }),
      )
      .min(1),
    /** C5: the year's Shukra Asta, Guru Asta, Kharmas and Chaturmas, as inclusive local date runs. */
    closures: z.array(closureZ),
  }),
});

export type VarshikFacts = z.infer<typeof VarshikFactsSchema>;
export type SkyEventFact = z.infer<typeof skyEventZ>;

// -----------------------------------------------------------------------------
// The builder
// -----------------------------------------------------------------------------

export interface ReaderFactInput {
  fact: string;
}

export interface BuildFactsArgs {
  ctx: VarshikContext;
  /** The natal chart as the app stores it. */
  natal: ChartData;
  scores: VarshikScores;
  reader: {
    name: string | null;
    birthDate: string;
    birthTime: string;
    timezone: string;
    lat: number;
    lng: number;
    answers: VarshikAnswers;
    facts: ReaderFactInput[];
    /** C5: where the reader lives now (account owner only); null = use the India summary for eclipses. */
    currentPlace?: ReaderPlace | null;
  };
}

function planetRows(chart: ChartData): z.infer<typeof planetRowZ>[] {
  const sun = chart.planets.find((p) => p.planet === 'Sun');
  return NINE_PLANETS.map((name) => {
    const p = chart.planets.find((x) => x.planet === name);
    if (!p) throw new Error(`chart has no ${name}`);
    return {
      planet: name,
      sign: p.sign,
      signIndex: p.signIndex,
      degree: r2(p.signDegree),
      house: houseFromSign(chart.ascendant.signIndex, p.signIndex),
      nakshatra: p.nakshatra,
      pada: p.nakshatraPada,
      retrograde: p.isRetrograde,
      combust: isCombust(name, p.longitude, sun?.longitude, p.isRetrograde),
      dignity: signDignity(name, p.signIndex),
    };
  });
}

function kakshyaOf(lon: number): string {
  const within = (((lon % 360) + 360) % 360) % 30;
  return KAKSHYA_LORDS[Math.min(7, Math.floor(within / 3.75))]!;
}

/** Every sky event of the year with the sign it stands in and the houses it falls in. */
async function skyEventFacts(
  ctx: VarshikContext,
  where: ReturnType<typeof eclipsePlaceOf>,
): Promise<SkyEventFact[]> {
  const tz = ctx.timezone;
  const events = await computeYearEvents(ctx.calendar.windowStartMs, ctx.calendar.windowEndMs);
  const natalLagna = ctx.natal.ascendant.signIndex;
  const natalMoon = ctx.natal.planets.find((p) => p.planet === 'Moon')!.signIndex;
  const slices = ctx.calendar.varshaYears;
  const out: SkyEventFact[] = [];
  const cache = new Map<number, Map<string, number>>();

  for (const e of events) {
    const planet = e.planet ?? (e.kind === 'eclipse-solar' ? 'Sun' : 'Moon');
    let signName: string | null = e.kind === 'ingress' ? (e.toSign ?? null) : null;
    if (!signName) {
      const jd = jdFromDate(new Date(e.atMs));
      let positions = cache.get(jd);
      if (!positions) {
        positions = new Map(
          (await calculatePlanetPositions(jd, ctx.natal.ayanamsa)).map((p) => [p.planet, p.longitude]),
        );
        cache.set(jd, positions);
      }
      const lon = positions.get(planet);
      if (lon === undefined) continue;
      signName = ZODIAC_SIGNS[signIndexOf(lon)]!;
    }
    const signIdx = ZODIAC_SIGNS.indexOf(signName as (typeof ZODIAC_SIGNS)[number]);
    if (signIdx < 0) continue;
    const date = localDate(e.atMs, tz);
    const slice = slices.find((s) => e.atMs >= s.startMs && e.atMs < s.endMs) ?? slices[slices.length - 1]!;
    out.push({
      kind: e.kind,
      planet,
      date,
      month: Number(date.slice(5, 7)) - 1,
      sign: signName,
      fromSign: e.fromSign ?? null,
      natalHouse: houseFromSign(natalLagna, signIdx),
      moonHouse: houseFromSign(natalMoon, signIdx),
      varshaHouse: houseFromSign(slice.varshphal.solarReturn.chart.ascendant.signIndex, signIdx),
      ...(e.eclipse ? { eclipse: await eclipseInfo(e.eclipse, where) } : {}),
    });
  }
  return out;
}

export async function buildVarshikFacts(args: BuildFactsArgs): Promise<VarshikFacts> {
  const { ctx, natal, scores, reader } = args;
  const tz = ctx.timezone;
  const natalLagna = natal.ascendant.signIndex;

  // --- birth ---------------------------------------------------------------
  const vargas = computeReportVargas(natal as unknown as Record<string, unknown>, ['D9', 'D10']);
  const varga = (key: string) => {
    const v = vargas.find((x) => x.key === key);
    return { lagna: v?.lagna ?? '', planets: v?.planets ?? {} };
  };
  const shadbala = calculateShadbala(natal)
    .filter((s) => SEVEN_PLANETS.includes(s.planet))
    .map((s) => ({
      planet: s.planet,
      totalVirupas: r1(s.totalVirupas),
      requiredVirupas: r1(s.requiredVirupas),
      strong: s.isStrong,
    }));

  // --- dashas --------------------------------------------------------------
  const moon = natal.planets.find((p) => p.planet === 'Moon')!;
  const birth = new Date(ctx.birthMs);
  const tree = calculateVimshottariDasha(moon.longitude, birth, birth);
  const first = tree.mahadashas[0]!;
  const balance = {
    planet: first.planet,
    yearsLeft: r2(Math.max(0, (first.endDate.getTime() - ctx.birthMs) / (365.25 * 86_400_000))),
  };
  const from2026 = Date.UTC(ctx.year - 1, 0, 1);
  const to2030 = Date.UTC(ctx.year + 3, 0, 1);
  const antar: VarshikFacts['dashas']['antar'] = [];
  for (const seg of ctx.natalDasha) {
    if (seg.endMs <= from2026 || seg.startMs >= to2030) continue;
    const last = antar[antar.length - 1];
    const fromD = localDate(Math.max(seg.startMs, from2026), tz);
    const toD = localDate(Math.min(seg.endMs, to2030) - 1, tz);
    if (last && last.maha === seg.maha && last.antar === seg.antar) last.to = toD;
    else antar.push({ from: fromD, to: toD, maha: seg.maha, antar: seg.antar });
  }
  const pratyantar2027 = ctx.natalDasha
    .filter((s) => s.endMs > ctx.calendar.windowStartMs && s.startMs < ctx.calendar.windowEndMs)
    .map((s) => ({
      from: localDate(Math.max(s.startMs, ctx.calendar.windowStartMs), tz),
      to: localDate(Math.min(s.endMs, ctx.calendar.windowEndMs) - 1, tz),
      maha: s.maha,
      antar: s.antar,
      praty: s.praty,
    }));

  // --- Ashtakavarga and slow transits -------------------------------------
  const transits: VarshikFacts['ashtakavarga']['transits'] = [];
  const natalMoonSign = natal.planets.find((p) => p.planet === 'Moon')!.signIndex;
  for (let m = 0; m < 12; m++) {
    const idx = ctx.monthOfDay.findIndex((x) => x === m);
    const count = ctx.monthOfDay.filter((x) => x === m).length;
    const day = ctx.days[idx + Math.floor(count / 2)]!;
    for (const planet of SLOW) {
      const lon = day.lon[planet];
      if (lon === undefined) continue;
      const s = signIndexOf(lon);
      transits.push({
        month: m,
        planet,
        sign: ZODIAC_SIGNS[s]!,
        natalHouse: houseFromSign(natalLagna, s),
        moonHouse: houseFromSign(natalMoonSign, s),
        bindus: planet === 'Saturn' || planet === 'Jupiter' ? (ctx.bav[planet]?.[s] ?? 0) : (ctx.sav[s] ?? 0),
        kakshya: kakshyaOf(lon),
      });
    }
  }

  // --- doshas and yogas ----------------------------------------------------
  const doshaMonths = doshaActivityAll(ctx);
  const doshas = DOSHA_KEYS.map((key) => {
    const rows = doshaMonths.map((mo) => mo.items.find((i) => i.key === key)!);
    const because: Record<string, string[]> = {};
    rows.forEach((r, m) => {
      if (r.active) because[String(m)] = r.because;
    });
    return {
      key,
      label: DOSHA_LABEL[key],
      status: rows[0]!.status,
      cancellations: rows[0]!.cancellations,
      activeMonths: rows.map((r, m) => (r.active ? m : -1)).filter((m) => m >= 0),
      because,
      touches: DOSHA_NOTES[key].touches,
      remedy: DOSHA_NOTES[key].remedy,
    };
  });
  const yogas = yogaDelivery(ctx).map((y) => ({
    source: y.source,
    name:
      y.source === 'tajika'
        ? `${TAJIKA_LABEL[y.kind] ?? y.kind}: ${y.planets.join(' and ')}${y.targetYear ? ` (${y.targetYear} chart)` : ''}`
        : y.name,
    kind: y.kind,
    planets: y.planets,
    months: y.months,
    because: Object.fromEntries(Object.entries(y.because).map(([k, v]) => [k, v])),
    targetYear: y.targetYear,
    ...(y.reason ? { reason: y.reason } : {}),
  }));

  // --- the Varsha years ----------------------------------------------------
  const varsha = ctx.calendar.varshaYears.map((s) => {
    const chart = s.varshphal.solarReturn.chart;
    const v = s.varshphal;
    const mudda = s.mudda.map((p) => ({
      lord: p.lord,
      from: localDate(p.startMs, tz),
      to: localDate(p.endMs, tz),
      fromMs: p.startMs,
      toMs: p.endMs,
      antar: p.antardashas.map((a) => ({
        lord: a.lord,
        from: localDate(a.startMs, tz),
        to: localDate(a.endMs, tz),
      })),
    }));
    return {
      targetYear: s.targetYear,
      startsAt: localDateTime(s.startMs, tz),
      endsAt: localDateTime(s.endMs, tz),
      startMs: s.startMs,
      endMs: s.endMs,
      isDayReturn: v.solarReturn.isDayReturn,
      lagna: ZODIAC_SIGNS[chart.ascendant.signIndex]!,
      lagnaIndex: chart.ascendant.signIndex,
      muntha: {
        sign: ZODIAC_SIGNS[v.muntha.signIndex]!,
        house: v.muntha.houseFromVarshaAsc,
        lord: munthaLordOf(v.muntha.signIndex),
        auspicious: v.muntha.isAuspicious,
      },
      yearLord: v.varsheshwara.varsheshwara,
      wonByMunthaTiebreak: v.varsheshwara.wonByMunthaTiebreak,
      panchadhikari: v.varsheshwara.candidates.map((c) => ({
        role: c.role,
        planet: c.planet,
        strength: r2(c.strength),
        aspectsLagna: c.aspectsVarshaAscendant,
      })),
      panchavargi: Object.fromEntries(
        SEVEN_PLANETS.map((p) => [p, r2(panchavargiBala(p, chart).vimsopaka)]),
      ),
      planets: planetRows(chart),
      sahams: v.sahams.map((x) => ({
        name: x.name,
        sign: x.sign,
        house: x.houseFromVarshaAsc,
        lord: x.lord,
        supported: x.beneficSupported,
      })),
      tajikaYogas: computeTajikaYogas(chart).map((y) => ({
        kind: y.kind,
        planets: y.planets,
        gapDeg: y.gapDeg === null ? null : r2(y.gapDeg),
        ...(y.reason ? { reason: y.reason } : {}),
      })),
      mudda,
      extra: buildVarshaExtraFacts(s, natal, tz, (ms) => localDate(ms, tz)),
    };
  });
  // The seam: the first Varsha year's Mudda list ends on the same number that starts the next.
  let seam = true;
  if (ctx.calendar.varshaYears.length === 2) {
    const [a, b] = ctx.calendar.varshaYears;
    const lastOfFirst = a!.mudda[a!.mudda.length - 1]!.endMs;
    seam = lastOfFirst === b!.mudda[0]!.startMs && a!.endMs === b!.startMs;
  }

  // --- sky and calendar ----------------------------------------------------
  const where = eclipsePlaceOf(reader.currentPlace);
  const skyEvents = await skyEventFacts(ctx, where);
  const festivals: VarshikFacts['calendar']['festivals'] = [];
  for (const [date, list] of Object.entries(HINDU_FESTIVALS)) {
    if (!date.startsWith(`${ctx.year}-`)) continue;
    for (const f of list) {
      festivals.push({
        date,
        month: Number(date.slice(5, 7)) - 1,
        name: f.name,
        importance: f.importance,
      });
    }
  }
  festivals.sort((a, b) => (a.date < b.date ? -1 : 1));

  // --- scores --------------------------------------------------------------
  const dayDate = (i: number): string => localDate(ctx.dayStartMs[i]! + 12 * 3_600_000, tz);
  const winOf = (w: ReturnType<typeof answerWindow>['best']) =>
    w
      ? {
          fromDate: dayDate(w.fromDay),
          toDate: dayDate(w.toDay),
          peakDate: dayDate(w.peakDay),
          score: w.score,
          tier: w.tier,
        }
      : null;
  const keys = [...AREAS, ...scores.decisionTable.map((d) => d.key)];
  const answerWindows: Record<string, { best: NonNullable<ReturnType<typeof winOf>>; then: ReturnType<typeof winOf>; weak: boolean }> = {};
  for (const key of keys) {
    const w = answerWindow(scores, ctx, key);
    const best = winOf(w.best);
    if (best) answerWindows[key] = { best, then: winOf(w.then), weak: w.weak };
  }

  const rel = reliefTimeline(ctx);
  // The relief timeline finds a sign change from daily samples; the sky calendar finds the same ingress from
  // the ephemeris. They can sit a day apart, and the reader would see two dates for one event. Wherever the sky
  // calendar has the ingress (all of 2027), the timeline adopts its date: one source of truth.
  const SIGN_CHANGE_KINDS = new Set(['slow_planet_house', 'sade_sati_start', 'sade_sati_end', 'dhaiya_start', 'dhaiya_end']);
  const alignToSky = (e: (typeof rel.ahead)[number], date: string): string => {
    if (!e.planet || !SIGN_CHANGE_KINDS.has(e.kind)) return date;
    const at = Date.parse(`${date}T00:00:00Z`);
    let best: { date: string; gap: number } | null = null;
    for (const s of skyEvents) {
      if (s.kind !== 'ingress' || s.planet !== e.planet) continue;
      const gap = Math.abs(Date.parse(`${s.date}T00:00:00Z`) - at);
      if (gap <= 2 * 86_400_000 && (!best || gap < best.gap)) best = { date: s.date, gap };
    }
    return best ? best.date : date;
  };
  const relEv = (e: (typeof rel.ahead)[number]) => ({
    date: alignToSky(e, localDate(e.atMs, tz)),
    kind: e.kind,
    effect: e.effect,
    detail: e.detail,
    ...(e.temporary ? { temporary: true } : {}),
  });

  const facts: VarshikFacts = {
    version: 1,
    year: ctx.year,
    window: { start: `${ctx.year}-01-01`, end: `${ctx.year}-12-31` },
    reader: {
      name: reader.name,
      birthDate: reader.birthDate,
      birthTime: reader.birthTime,
      timezone: reader.timezone,
      lat: reader.lat,
      lng: reader.lng,
      answers: Object.fromEntries(
        Object.entries(reader.answers).filter(([, v]) => typeof v === 'string' && v.length > 0),
      ),
      facts: reader.facts.map((f, i) => ({ id: `F${i + 1}`, fact: f.fact })),
      eclipsePlace: where.fact,
    },
    birth: {
      lagna: {
        sign: natal.ascendant.sign,
        signIndex: natalLagna,
        degree: r2(natal.ascendant.degree),
        nakshatra: natal.ascendant.nakshatra,
        pada: natal.ascendant.nakshatraPada,
      },
      planets: planetRows(natal),
      d9: varga('D9'),
      d10: varga('D10'),
      shadbala,
    },
    dashas: { balance, antar, pratyantar2027 },
    ashtakavarga: { bav: ctx.bav, sav: ctx.sav, transits },
    stars: buildStarFacts(ctx, (ms) => localDate(ms, tz)),
    doshas,
    yogas,
    varsha,
    muddaSeamExact: seam,
    sahamWindows: ctx.sahamWindows.map((w) => ({
      saham: w.saham,
      planet: w.planet,
      roles: w.roles,
      from: localDate(w.startMs, tz),
      to: localDate(w.endMs, tz),
      exact: w.exactMs.map((ms) => localDate(ms, tz)),
      strength: r2(w.strength),
    })),
    skyEvents,
    scores: {
      overall: scores.overall,
      months: scores.months,
      timingMap: scores.timingMap,
      areaOverall: scores.areaOverall,
      peakMonths: scores.peakMonths,
      restMonth: scores.restMonth,
      why: scores.why.map((w) => ({
        lifting: w.lifting.map((d) => ({ key: d.key, effect: r2(d.effect) })),
        weighing: w.weighing.map((d) => ({ key: d.key, effect: r2(d.effect) })),
      })),
      decisionTable: scores.decisionTable.map((d) => {
        const closures = d.closed
          ? closuresFor(d.key, scores.closures).map((c) => ({ reason: c.reason, from: c.from, to: c.to }))
          : [];
        return {
          key: d.key,
          months: d.months,
          best: d.best,
          hold: d.hold,
          isMain: d.isMain,
          closed: d.closed,
          openSpans: d.openSpans,
          closures,
          ruleSource: closures.map((c) => ruleSource(d.key, c.reason)),
          noOpenWindow: d.noOpenWindow,
          note: d.note,
        };
      }),
      planetImpact: scores.planetImpact.map((p) => ({
        planet: p.planet,
        natalHouse: p.natalHouse,
        varshaHouses: p.varshaHouses,
        roles: p.roles,
        strength: p.strength === null ? null : r2(p.strength),
        transitHouses: p.transitHouses,
        effect: p.effect,
        bestMonth: p.bestMonth,
        hardMonth: p.hardMonth,
        topArea: { area: p.topArea.area, effect: r2(p.topArea.effect) },
      })),
      dailyOverall: scores.series.overall.map(r1),
      answerWindows,
      relief: {
        lookbackFrom: localDate(rel.lookback.fromMs, tz),
        lookbackTo: localDate(rel.lookback.toMs, tz),
        lookback: rel.lookback.events.map(relEv),
        wasHard: rel.wasHard,
        saturnDamperDays: rel.saturnDamperDays,
        varsha2026: rel.varsha2026
          ? {
              yearLord: rel.varsha2026.yearLord,
              munthaHouse: rel.varsha2026.munthaHouse,
              munthaAuspicious: rel.varsha2026.munthaAuspicious,
              endedOn: localDate(rel.varsha2026.endedAtMs, tz),
            }
          : null,
        ahead: rel.ahead.map(relEv),
        nextRelief: rel.nextRelief ? relEv(rel.nextRelief) : null,
        reliefInYear: rel.reliefInYear,
        nextReliefBeyondYear: rel.nextReliefBeyondYear ? relEv(rel.nextReliefBeyondYear) : null,
      },
    },
    calendar: { festivals, closures: scores.closures.map((c) => ({ reason: c.reason, from: c.from, to: c.to })) },
  };
  return facts;
}

/** Convenience for tests and scripts: score a context with the reader's answers and build facts. */
export async function buildFactsFromContext(
  ctx: VarshikContext,
  natal: ChartData,
  reader: BuildFactsArgs['reader'],
): Promise<VarshikFacts> {
  const scores = computeVarshikScores(ctx, reader.answers);
  return buildVarshikFacts({ ctx, natal, scores, reader });
}

// -----------------------------------------------------------------------------
// Preflight: the schema plus what a schema cannot say
// -----------------------------------------------------------------------------

export interface PreflightResult {
  ok: boolean;
  /** One entry per failed field, as 'path: reason'. Goes to the admin log through the row's error. */
  failures: string[];
}

export function preflightVarshikFacts(input: unknown): PreflightResult {
  const parsed = VarshikFactsSchema.safeParse(input);
  const failures: string[] = [];
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 40)) {
      failures.push(`${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    return { ok: false, failures };
  }
  const f = parsed.data;

  if (!f.muddaSeamExact) failures.push('muddaSeamExact: the earlier Mudda list does not end where the later one starts');
  if (f.varsha.length === 0) failures.push('varsha: no Varsha year');

  // Every tier agrees with its score.
  const tierFor = (s: number) =>
    s >= TIER_EDGES.dark_green ? 'dark_green' : s >= TIER_EDGES.light_green ? 'light_green' : s >= TIER_EDGES.amber ? 'amber' : 'rust';
  f.scores.months.forEach((c, i) => {
    if (tierFor(Math.round(c.score)) !== c.tier) failures.push(`scores.months.${i}: tier does not match score`);
  });

  // The 7 areas each have a full row and a window; every decision has a window too, so a question
  // tied to any key can be answered from the engine.
  for (const a of AREAS) {
    if (!f.scores.answerWindows[a]) failures.push(`scores.answerWindows.${a}: missing`);
    if (!f.scores.areaOverall[a]) failures.push(`scores.areaOverall.${a}: missing`);
  }
  for (const d of f.scores.decisionTable) {
    if (!f.scores.answerWindows[d.key]) failures.push(`scores.answerWindows.${d.key}: missing`);
  }

  // 2027 events: every month that has an ingress or station has them dated inside the year.
  for (const [i, e] of f.skyEvents.entries()) {
    if (e.date < f.window.start || e.date > f.window.end) failures.push(`skyEvents.${i}: date outside ${f.year}`);
  }
  const eclipses = f.skyEvents.filter((e) => e.kind === 'eclipse-solar' || e.kind === 'eclipse-lunar');
  if (eclipses.length < 2) failures.push(`skyEvents: fewer than 2 eclipses found for ${f.year}`);

  // C5: every eclipse is classified; only a Grahan has Sutak or may be a personal trigger.
  for (const e of eclipses) {
    const x = e.eclipse;
    if (!x) {
      failures.push(`skyEvents: the eclipse on ${e.date} has no type or visibility`);
      continue;
    }
    if (x.class === 'grahan' && x.sutak.length === 0) failures.push(`skyEvents: the Grahan on ${e.date} has no Sutak time`);
    if (x.class !== 'grahan' && (x.sutak.length > 0 || x.personalTrigger)) failures.push(`skyEvents: the ${x.class} eclipse on ${e.date} carries Sutak or a trigger`);
    if (x.subtype === 'penumbral' && x.class === 'grahan') failures.push(`skyEvents: the penumbral eclipse on ${e.date} is marked Grahan`);
  }
  // C5: the no-muhurat periods. Chaturmas needs both Ekadashis in the festival table.
  if (!chaturmasOf(f.year)) failures.push(`calendar: the festival table lacks Devshayani or Devuthani Ekadashi for ${f.year}`);
  if (!astaCovered(f.year)) failures.push(`calendar: config/asta-dates.ts has no drikpanchang Shukra/Guru Asta dates for ${f.year}`);
  else if (!f.calendar.closures.some((c) => c.reason === 'chaturmas')) failures.push('calendar.closures: no Chaturmas');
  for (const d of f.scores.decisionTable) {
    if (CLOSED_DECISION_KEYS.includes(d.key) !== d.closed) failures.push(`scores.decisionTable.${d.key}: closed flag is wrong`);
    if (!d.closed || d.noOpenWindow) continue;
    if (d.openSpans.length === 0) failures.push(`scores.decisionTable.${d.key}: the best window has no open day`);
    for (const span of d.openSpans) {
      for (const c of d.closures) {
        if (span.from <= c.to && span.to >= c.from) failures.push(`scores.decisionTable.${d.key}: open span ${span.from}..${span.to} overlaps ${c.reason}`);
      }
    }
    const open = d.openSpans.reduce((n, sp) => n + 1 + (Date.parse(sp.to) - Date.parse(sp.from)) / 86_400_000, 0);
    if (open < MIN_OPEN_DAYS) failures.push(`scores.decisionTable.${d.key}: the best window has only ${open} open days`);
  }

  // C3: the star layer and the other dashas. Any hole stops generation and refunds the reader.
  for (const planet of ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Rahu', 'Ketu']) {
    const segs = f.stars.segments.filter((s) => s.planet === planet);
    if (segs.length === 0) failures.push(`stars.segments: no row for ${planet}`);
    else {
      if (segs[0]!.from !== f.window.start) failures.push(`stars.segments: ${planet} does not start on 1 January`);
      if (segs[segs.length - 1]!.to !== f.window.end) failures.push(`stars.segments: ${planet} does not end on 31 December`);
      for (let i = 1; i < segs.length; i++) {
        if (!segs[i]!.enters) failures.push(`stars.segments: ${planet} row ${i} is not an entry`);
      }
    }
  }
  const order = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu', 'Lagna'];
  order.forEach((p, i) => {
    if (f.stars.table[i]?.point !== p) failures.push(`stars.table.${i}: expected ${p}`);
  });
  for (const m of f.stars.moorti) {
    if (m.date < f.window.start || m.date > f.window.end) failures.push(`stars.moorti: ${m.planet} ${m.date} outside ${f.year}`);
  }
  if (f.stars.moorti.filter((m) => m.planet === 'Saturn' || m.planet === 'Jupiter').length === 0 && f.skyEvents.some((e) => e.kind === 'ingress' && (e.planet === 'Saturn' || e.planet === 'Jupiter'))) {
    failures.push('stars.moorti: a Saturn or Jupiter sign change in the sky calendar has no Moorti');
  }
  for (const [i, v] of f.varsha.entries()) {
    if (v.extra.muddaYogini[0]!.from !== localDate(v.startMs, f.reader.timezone)) failures.push(`varsha.${i}.extra.muddaYogini: does not start on the solar return`);
    if (v.extra.muddaYogini[v.extra.muddaYogini.length - 1]!.to !== localDate(v.endMs, f.reader.timezone)) failures.push(`varsha.${i}.extra.muddaYogini: does not end on the next solar return`);
    if (v.extra.lifeSahams.some((s) => /mrityu|apamrityu/i.test(s.name))) failures.push(`varsha.${i}.extra.lifeSahams: a Saham that is never shown`);
    if (!BALA_PLANETS_7.every((p) => p in v.extra.harsha && p in v.extra.dwadasha)) failures.push(`varsha.${i}.extra: Harsha and Dwadashavargiya must cover 7 planets`);
  }

  // Dasha rows cover the whole of 2027 without a hole.
  const pr = f.dashas.pratyantar2027;
  if (pr[0]!.from !== f.window.start) failures.push('dashas.pratyantar2027: does not start on 1 January');
  if (pr[pr.length - 1]!.to !== f.window.end) failures.push('dashas.pratyantar2027: does not end on 31 December');

  return { ok: failures.length === 0, failures };
}

// -----------------------------------------------------------------------------
// Coverage: after the text is written
// -----------------------------------------------------------------------------

export interface CoverageSection {
  id?: string;
  heading: string;
  paragraphs: string[];
}

const stripPunct = (s: string): string => s.toLowerCase();

/** "Raja Yoga (1-5 Lords)" -> "Raja Yoga". */
export function yogaBaseName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * What the written text must cover, as plain problems (empty = complete):
 *   all 12 months with both pages' text (5 paragraphs each), all 7 area pages, a line for every
 *   one of the 9 doshas (a dosha that is not present still gets its "not in your chart" line),
 *   every yoga that delivers in 2027, and every eclipse. Sections are found by id.
 */
export function coverageProblems(
  facts: VarshikFacts,
  sections: CoverageSection[],
  /** Check only these section ids (one LLM call's own sections). Omit to check the whole report. */
  only?: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  const byId = new Map(sections.filter((s) => s.id).map((s) => [s.id!, s]));
  const wants = (id: string): boolean => !only || only.has(id);
  const need = (id: string): CoverageSection | null => {
    if (!wants(id)) return null;
    const s = byId.get(id);
    if (!s || s.paragraphs.filter((p) => p.trim().length > 0).length === 0) {
      problems.push(`section ${id}: missing`);
      return null;
    }
    return s;
  };

  for (let m = 1; m <= 12; m++) {
    const id = `month_${String(m).padStart(2, '0')}`;
    const s = need(id);
    if (s && s.paragraphs.filter((p) => p.trim()).length !== 5) {
      problems.push(`section ${id}: expected 5 paragraphs, found ${s.paragraphs.length}`);
    }
  }
  for (const a of AREAS) need(`area_${a}`);
  for (const id of [
    'welcome_letter',
    'year_at_a_glance',
    'year_lord_muntha',
    'two_varsha_years',
    'big_sky_moves',
    'timing_map',
    'year_rhythm',
    'sky_calendar',
    'when_to_act',
    'golden_windows',
    'simple_remedies',
    'what_changes',
    'closing_letter',
  ]) {
    need(id);
  }

  const planets = need('planet_by_planet');
  if (planets && planets.paragraphs.length !== 9) {
    problems.push(`section planet_by_planet: expected 9 paragraphs, found ${planets.paragraphs.length}`);
  } else if (planets) {
    NINE_PLANETS.forEach((p, i) => {
      if (!planets.paragraphs[i]!.includes(p)) problems.push(`planet_by_planet: paragraph ${i + 1} does not name ${p}`);
    });
  }

  const doshaSec = need('doshas');
  if (doshaSec) {
    if (doshaSec.paragraphs.length !== DOSHA_KEYS.length) {
      problems.push(`section doshas: expected ${DOSHA_KEYS.length} paragraphs, found ${doshaSec.paragraphs.length}`);
    } else {
      DOSHA_KEYS.forEach((k, i) => {
        if (!stripPunct(doshaSec.paragraphs[i]!).includes(stripPunct(DOSHA_LABEL[k]))) {
          problems.push(`doshas: paragraph ${i + 1} does not name ${DOSHA_LABEL[k]}`);
        }
      });
    }
  }

  const yogaSec = need('yogas');
  if (yogaSec) {
    const text = stripPunct(yogaSec.paragraphs.join(' '));
    // Natal yogas are named by their base name ("Raja Yoga (1-5 Lords)" and "Raja Yoga (4-5 Lords)"
    // are both "Raja Yoga"); Tajika yogas by their kind ("Ithasala"). One mention covers each.
    const wanted = new Set<string>();
    for (const y of facts.yogas) {
      if (y.months.length === 0) continue;
      wanted.add(y.source === 'natal' ? yogaBaseName(y.name) : (TAJIKA_LABEL[y.kind] ?? y.kind));
    }
    for (const label of wanted) {
      if (!text.includes(stripPunct(label))) problems.push(`yogas: does not mention ${label}`);
    }
  }

  // C3: the three star pages, and the slow planets' star moves in the month pages.
  const stars = need('birth_stars');
  if (stars) {
    const text = stars.paragraphs.join(' ');
    if (!stripPunct(text).replace(/\s+/g, '').includes(stripPunct(facts.stars.birthStar.name))) problems.push(`birth_stars: does not name the birth star ${facts.stars.birthStar.name}`);
    for (const d of facts.stars.dashaLords) {
      if (!text.includes(d.planet)) problems.push(`birth_stars: does not name the ${d.planet} dasha lord's star`);
    }
  }
  const flags = need('three_flags');
  if (flags) {
    const text = flags.paragraphs.join(' ');
    for (const w of ['Tri-Pataki', 'Lagna', 'Moon', 'Mudda', 'Yogini', 'Patyayini']) {
      if (!text.includes(w)) problems.push(`three_flags: does not mention ${w}`);
    }
  }
  const sky27 = need('your_stars_2027');
  if (sky27) {
    const text = sky27.paragraphs.join(' ');
    for (const s of facts.stars.sensitive) {
      if (!s.enters || !['Saturn', 'Jupiter', 'Rahu', 'Ketu'].includes(s.planet)) continue;
      if (!text.includes(dayMonth(s.from))) problems.push(`your_stars_2027: does not date the ${s.planet} move into ${s.nakshatra} (${dayMonth(s.from)})`);
    }
    for (const m of facts.stars.moorti) {
      if (!['Saturn', 'Jupiter'].includes(m.planet)) continue;
      if (!text.includes(dayMonth(m.date))) problems.push(`your_stars_2027: does not date the ${m.planet} sign change (${dayMonth(m.date)})`);
    }
  }
  for (let m = 1; m <= 12; m++) {
    const id = `month_${String(m).padStart(2, '0')}`;
    if (!wants(id)) continue;
    const s = byId.get(id);
    if (!s) continue;
    const text = s.paragraphs.join(' ');
    for (const seg of facts.stars.segments) {
      if (!seg.enters || !['Saturn', 'Jupiter', 'Rahu', 'Ketu'].includes(seg.planet)) continue;
      if (Number(seg.from.slice(5, 7)) !== m) continue;
      if (!text.includes(dayMonth(seg.from))) problems.push(`${id}: does not date the ${seg.planet} move into ${seg.nakshatra} (${dayMonth(seg.from)})`);
    }
  }

  const skySec = need('sky_calendar');
  if (skySec) {
    const text = skySec.paragraphs.join(' ');
    for (const e of facts.skyEvents.filter((x) => x.kind.startsWith('eclipse'))) {
      if (!text.includes(dayMonth(e.date))) problems.push(`sky_calendar: does not mention the eclipse on ${dayMonth(e.date)}`);
    }
    // C5: each eclipse class is said in words.
    const classes = new Set(facts.skyEvents.map((e) => e.eclipse?.class).filter(Boolean));
    if (classes.has('grahan') && !/\bsutak\b/i.test(text)) problems.push('sky_calendar: does not give the Sutak of the visible Grahan');
    if (classes.has('upachchaya') && !/\b(?:penumbral|upachchaya)\b/i.test(text)) problems.push('sky_calendar: does not call the penumbral eclipses penumbral (Upachchaya)');
    if (classes.has('not_visible') && !/\bnot\s+(?:be\s+)?(?:visible|seen)\b/i.test(text)) problems.push('sky_calendar: does not say which eclipse is not visible');
  }

  // C5: when_to_act names every no-muhurat period of a wedding, commitment or home-move row it covers.
  const act = need('when_to_act');
  if (act && facts.scores.decisionTable.some((d) => d.closed)) {
    const text = act.paragraphs.join(' ');
    const said: Record<string, boolean> = {
      shukra_asta: /\b(?:Venus|Shukra)\b/.test(text) && /\b(?:combust\w*|asta)\b/i.test(text),
      guru_asta: /\b(?:Jupiter|Guru)\b/.test(text) && /\b(?:combust\w*|asta)\b/i.test(text),
      kharmas: /\bkharmas\b/i.test(text),
      chaturmas: /\bchaturmas\b/i.test(text),
    };
    const reasons = new Set(facts.scores.decisionTable.flatMap((d) => d.closures.map((c) => c.reason)));
    for (const reason of reasons) {
      if (!said[reason]) problems.push(`when_to_act: does not name ${reason.replace('_', ' ')} for the wedding or move-in rows`);
    }
  }
  return problems;
}
