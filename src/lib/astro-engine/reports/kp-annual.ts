// =============================================================================
// KP Year Ahead report — deterministic facts
// =============================================================================
// One year, from the day the report is generated to the same day next year,
// judged the KP way:
//
//   PROMISE   the principal cusp's sub lord for each life area (kp-core.ts)
//      ↓
//   TIMING    which dasha / bhukti / antara lords of THIS year signify that
//             area's houses (kp-dasha.ts), month by month
//      ↓
//   TRIGGER   the slow transits (Jupiter, Saturn, Rahu, Ketu) — their star and
//             sub lords' natal significations — as the confirmation layer
//
// plus the classical five Ruling Planets at the report's judgement moment, and
// the reader's own questions (kp-questions.ts), each routed to a house group
// and judged the same way.
//
// No numeric score is produced anywhere in this report on purpose: every
// judgement is a plain-word tone ("peak" / "active" / "quiet", "strong" /
// "steady" / "slow"). A score invites the reader to treat the year as graded;
// the tone is what the KP rules actually support.
//
// The ephemeris work (KP ayanamsa, Placidus cusps, transits) happens once,
// asynchronously, in kp-chart.ts and arrives here as `KpRawData` on the score
// context — this function stays pure and synchronous like every other
// `computeScores`.
// =============================================================================

import {
  KP_AREA_RULES,
  KP_RULESET_VERSION,
  areaPromise,
  buildKpNatal,
  houseOf,
  kpPoint,
  rulingPlanets,
  significationOf,
  type KpAreaKey,
  type KpAreaPromise,
  type KpAreaRule,
  type KpNatalChart,
  type KpPlanetInput,
  type KpPromise,
  type RulingPlanet,
  type Signification,
} from '../kp/kp-core.js';
import { antarasBetween, spanAt, DASHA_YEAR_DAYS, type DashaSpan } from '../kp/kp-dasha.js';
import {
  GENERAL_QUESTION_RULE,
  kpQuestionsFromAnswers,
  questionTopic,
  screenKpQuestions,
  type KpQuestionTopic,
} from '../kp/kp-questions.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';
import type { ReportHeader } from './report-header.js';

/** What kp-chart.ts computes with swisseph and hands to `computeKpAnnualScores`. */
export interface KpRawData {
  /** Birth instant, UT milliseconds. */
  birthMs: number;
  natalPlanets: KpPlanetInput[];
  cusps: number[];
  houseSystem: 'placidus' | 'equal';
  /** True when Placidus could not be trusted at this latitude and equal houses were used. */
  highLatitude: boolean;
  /** One snapshot per report month, taken at the month's midpoint. */
  transits: Array<{ date: string; planets: KpPlanetInput[] }>;
  judgement: { date: string; weekday: number; moonLongitude: number; ascLongitude: number };
}

export type KpTone = 'peak' | 'active' | 'quiet';

export interface KpTransitFact {
  planet: string;
  sign: string;
  nakshatra: string;
  starLord: string;
  subLord: string;
  /** Natal Placidus house the transit is passing through. */
  natalHouse: number;
  retrograde: boolean;
}

export interface KpMonth {
  index: number;
  /** ISO dates; `end` exclusive. */
  start: string;
  end: string;
  mid: string;
  dasha: { md: string; ad: string; pd: string };
  tones: Record<KpAreaKey, KpTone>;
  /** The area the running lords push hardest this month. */
  focus: KpAreaKey;
  /** 'spending' when the lords lean on the 12th, 'rest' when on the 6th/8th — a slow-down cue. */
  care: 'spending' | 'rest' | null;
  transits: KpTransitFact[];
}

export interface KpAreaYear extends KpAreaPromise {
  /** Month indexes (0-11) the area is at its peak. */
  peakMonths: number[];
  activeMonths: number[];
  /** First run of consecutive peak (else active) months — the year's best window. */
  bestWindow: { start: string; end: string; lords: string[] } | null;
}

export interface KpQuestionFact {
  index: number;
  question: string;
  topic: KpQuestionTopic;
  houses: number[];
  principalCusp: number;
  cuspSubLord: string;
  cuspSubLordSignifies: number[];
  promise: KpPromise;
  peakMonths: number[];
  activeMonths: number[];
  bestWindow: { start: string; end: string; lords: string[] } | null;
}

export interface KpAnnualScores {
  engine: {
    ruleset: string;
    ayanamsa: 'krishnamurti';
    houseSystem: 'placidus' | 'equal';
    highLatitude: boolean;
    dashaYearDays: number;
  };
  window: { start: string; end: string };
  header: ReportHeader;
  ascendant: ReturnType<typeof kpPoint>;
  moon: ReturnType<typeof kpPoint>;
  cusps: KpNatalChart['cusps'];
  planets: Array<KpNatalChart['planets'][number] & { signifies: number[] }>;
  /** Cusps whose sub lord would flip with a small birth-time change. */
  sensitiveCusps: number[];
  areas: KpAreaYear[];
  months: KpMonth[];
  dashaNow: { md: string; ad: string; pd: string; adEnds: string } | null;
  /** Bhukti (antardasha) changes inside the window — the year's turning points. */
  dashaShifts: Array<{ date: string; ad: string; md: string }>;
  rulingPlanets: RulingPlanet[];
  questions: KpQuestionFact[];
}

function addMonths(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

/** The 12 report months: [start + i months, start + i+1 months), midpoint for sampling. */
export function reportMonths(start: string): Array<{ start: string; end: string; mid: string }> {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const s = addMonths(start, i);
    const e = addMonths(start, i + 1);
    const mid = new Date(
      (new Date(`${s}T00:00:00Z`).getTime() + new Date(`${e}T00:00:00Z`).getTime()) / 2,
    )
      .toISOString()
      .slice(0, 10);
    out.push({ start: s, end: e, mid });
  }
  return out;
}

function hits(sig: Signification | undefined, houses: number[]): boolean {
  return !!sig && houses.some((h) => sig.strong.includes(h));
}

function matchCount(sig: Signification | undefined, houses: number[]): number {
  return sig ? houses.filter((h) => sig.strong.includes(h)).length : 0;
}

interface WeightInput {
  rule: KpAreaRule;
  md: Signification;
  ad: Signification;
  pd: Signification;
  transitSupport: boolean;
}

/**
 * KP timing weight for one month: the bhukti and antara lords carry the event (each counted
 * by how many of the area's houses it signifies), the dasha lord sets the backdrop, a
 * supporting slow transit confirms, and a bhukti/antara lord tied only to the opposing
 * houses pulls the other way. Internal only — never shown, never persisted as a number.
 */
function monthWeight({ rule, md, ad, pd, transitSupport }: WeightInput): number {
  let w =
    2 * matchCount(ad, rule.houses) + 2 * matchCount(pd, rule.houses) + matchCount(md, rule.houses);
  if (transitSupport) w += 1;
  if (!hits(ad, rule.houses) && hits(ad, rule.opposing)) w -= 1;
  if (!hits(pd, rule.houses) && hits(pd, rule.opposing)) w -= 1;
  return w;
}

/**
 * Turns a year of weights into tones. A "peak" needs BOTH the bhukti and antara lords on
 * the area's houses and must be among the year's own strongest months — so a long bhukti
 * can't paint a whole year as one flat peak — and an area the chart promises only slowly
 * never peaks. "active" is any month where a running lord still carries the area.
 */
function tonesFor(
  weights: number[],
  carried: Array<{ ad: boolean; pd: boolean }>,
  promise: KpPromise,
): KpTone[] {
  const max = Math.max(...weights);
  const peakFloor = Math.max(4, max - 1);
  return weights.map((w, i) => {
    const c = carried[i]!;
    if (promise !== 'slow' && c.ad && c.pd && w >= peakFloor) return 'peak';
    if ((c.ad || c.pd) && w >= 2) return 'active';
    return 'quiet';
  });
}

function bestWindowFor(
  months: Array<{ start: string; end: string; dasha: { ad: string; pd: string } }>,
  tones: KpTone[],
  carriesArea: (planet: string) => boolean,
): { start: string; end: string; lords: string[] } | null {
  for (const target of ['peak', 'active'] as const) {
    let bestStart = -1;
    let bestLen = 0;
    let runStart = -1;
    for (let i = 0; i <= tones.length; i++) {
      if (i < tones.length && tones[i] === target) {
        if (runStart < 0) runStart = i;
      } else if (runStart >= 0) {
        const len = i - runStart;
        if (len > bestLen) {
          bestLen = len;
          bestStart = runStart;
        }
        runStart = -1;
      }
    }
    if (bestStart >= 0) {
      const slice = months.slice(bestStart, bestStart + bestLen);
      // Only the lords that actually deliver this area — not every lord that happened to run.
      const lords = [...new Set(slice.flatMap((m) => [m.dasha.ad, m.dasha.pd]))].filter(
        carriesArea,
      );
      return { start: slice[0]!.start, end: slice[slice.length - 1]!.end, lords };
    }
  }
  return null;
}

export function computeKpAnnualScores(
  ctx: ReportScoreContext,
  periodMonth: string | null,
): KpAnnualScores | Record<string, never> {
  const raw = ctx.kpRaw;
  if (!raw || raw.cusps.length < 12 || raw.natalPlanets.length < 9) return {};

  const start = periodMonth ?? new Date().toISOString().slice(0, 10);
  const end = addMonths(start, 12);
  const chart = buildKpNatal(raw.natalPlanets, raw.cusps);
  const sigs = new Map<string, Signification>(
    chart.planets.map((p) => [p.planet, significationOf(p.planet, chart)]),
  );
  const moonLon = raw.natalPlanets.find((p) => p.planet === 'Moon')!.longitude;
  const spans: DashaSpan[] = antarasBetween(
    moonLon,
    raw.birthMs,
    new Date(`${start}T00:00:00Z`).getTime(),
    new Date(`${end}T00:00:00Z`).getTime(),
  );

  const promises = new Map<KpAreaKey, KpAreaPromise>(
    KP_AREA_RULES.map((r) => [r.key, areaPromise(r, chart)]),
  );

  const monthFrames = reportMonths(start);
  const empty = { md: '', ad: '', pd: '' };
  const sigOf = (planet: string): Signification =>
    sigs.get(planet) ?? { planet, starLord: '', strong: [], all: [], nodeAgent: null };

  // Per-month transit facts, and whether a slow planet's star lord and sub lord both
  // signify a rule's houses (KP: a transit confirms only through its stellar lords).
  const transitFactsFor = (i: number): KpTransitFact[] => {
    const snap = raw.transits[i];
    if (!snap) return [];
    return snap.planets
      .filter((p) => ['Jupiter', 'Saturn', 'Rahu', 'Ketu'].includes(p.planet))
      .map((p) => {
        const pt = kpPoint(p.longitude);
        return {
          planet: p.planet,
          sign: pt.sign,
          nakshatra: pt.nakshatra,
          starLord: pt.starLord,
          subLord: pt.subLord,
          natalHouse: houseOf(p.longitude, raw.cusps),
          retrograde:
            p.planet !== 'Rahu' &&
            p.planet !== 'Ketu' &&
            typeof p.speed === 'number' &&
            p.speed < 0,
        };
      });
  };
  const transitSupports = (facts: KpTransitFact[], rule: KpAreaRule): boolean =>
    facts
      .filter((t) => t.planet === 'Jupiter' || t.planet === 'Saturn')
      .some((t) => hits(sigOf(t.starLord), rule.houses) && hits(sigOf(t.subLord), rule.houses));

  interface MonthFrame {
    span: DashaSpan | null;
    transits: KpTransitFact[];
  }
  const frames: MonthFrame[] = monthFrames.map((f, i) => ({
    span: spanAt(spans, f.mid),
    transits: transitFactsFor(i),
  }));

  /** Weights + tones for any house group across the 12 months. */
  const judgeYear = (rule: KpAreaRule, promise: KpPromise) => {
    const weights = frames.map(({ span, transits }) =>
      span
        ? monthWeight({
            rule,
            md: sigOf(span.md),
            ad: sigOf(span.ad),
            pd: sigOf(span.pd),
            transitSupport: transitSupports(transits, rule),
          })
        : 0,
    );
    const carried = frames.map(({ span }) => ({
      ad: !!span && hits(sigOf(span.ad), rule.houses),
      pd: !!span && hits(sigOf(span.pd), rule.houses),
    }));
    return { weights, tones: tonesFor(weights, carried, promise) };
  };

  const judged = new Map(
    KP_AREA_RULES.map((rule) => [rule.key, judgeYear(rule, promises.get(rule.key)!.promise)]),
  );

  const months: KpMonth[] = monthFrames.map((f, i) => {
    const { span, transits } = frames[i]!;
    const dasha = span ? { md: span.md, ad: span.ad, pd: span.pd } : empty;
    const tones = Object.fromEntries(
      KP_AREA_RULES.map((r) => [r.key, judged.get(r.key)!.tones[i]!]),
    ) as Record<KpAreaKey, KpTone>;
    const rank = { peak: 2, active: 1, quiet: 0 } as const;
    const focus = KP_AREA_RULES.map((r) => r.key).reduce((best, k) => {
      const a = rank[tones[k]] * 100 + judged.get(k)!.weights[i]!;
      const b = rank[tones[best]] * 100 + judged.get(best)!.weights[i]!;
      return a > b ? k : best;
    });
    let care: KpMonth['care'] = null;
    if (span) {
      const both = (h: number[]) => hits(sigOf(span.ad), h) && hits(sigOf(span.pd), h);
      if (both([12])) care = 'spending';
      else if (both([6, 8])) care = 'rest';
    }
    return { index: i, ...f, dasha, tones, focus, care, transits };
  });

  const areas: KpAreaYear[] = KP_AREA_RULES.map((rule) => {
    const tones = judged.get(rule.key)!.tones;
    return {
      ...promises.get(rule.key)!,
      peakMonths: tones.flatMap((t, i) => (t === 'peak' ? [i] : [])),
      activeMonths: tones.flatMap((t, i) => (t === 'active' ? [i] : [])),
      bestWindow: bestWindowFor(months, tones, (p) => hits(sigOf(p), rule.houses)),
    };
  });

  // Reader questions — screened again here as defence in depth (purchase already refused
  // anything the policy blocks, but a row written before that check must never leak one
  // into the prompt).
  const asked = kpQuestionsFromAnswers(ctx.userAnswers);
  const screened = screenKpQuestions(asked);
  const questions: KpQuestionFact[] = asked.flatMap((question, index) => {
    if (!screened[index]?.allowed) return [];
    const topic = questionTopic(question);
    const rule =
      topic === 'general' ? GENERAL_QUESTION_RULE : KP_AREA_RULES.find((r) => r.key === topic)!;
    const promise = topic === 'general' ? areaPromise(rule, chart) : promises.get(topic)!;
    const tones =
      topic === 'general' ? judgeYear(rule, promise.promise).tones : judged.get(topic)!.tones;
    return [
      {
        index,
        question,
        topic,
        houses: rule.houses,
        principalCusp: rule.principalCusp,
        cuspSubLord: promise.cuspSubLord,
        cuspSubLordSignifies: promise.cuspSubLordSignifies,
        promise: promise.promise,
        peakMonths: tones.flatMap((t, i) => (t === 'peak' ? [i] : [])),
        activeMonths: tones.flatMap((t, i) => (t === 'active' ? [i] : [])),
        bestWindow: bestWindowFor(months, tones, (p) => hits(sigOf(p), rule.houses)),
      },
    ];
  });

  const nowSpan = spanAt(spans, start);
  const adEnd = nowSpan
    ? (spans.filter((s) => s.md === nowSpan.md && s.ad === nowSpan.ad).at(-1)?.end ?? nowSpan.end)
    : null;
  const dashaShifts: KpAnnualScores['dashaShifts'] = [];
  for (let i = 1; i < spans.length; i++) {
    const prev = spans[i - 1]!;
    const cur = spans[i]!;
    if ((cur.ad !== prev.ad || cur.md !== prev.md) && cur.start > start && cur.start < end) {
      dashaShifts.push({ date: cur.start, ad: cur.ad, md: cur.md });
    }
  }

  const ascendant = kpPoint(raw.cusps[0]!);
  const moon = kpPoint(moonLon);

  return {
    engine: {
      ruleset: KP_RULESET_VERSION,
      ayanamsa: 'krishnamurti',
      houseSystem: raw.houseSystem,
      highLatitude: raw.highLatitude,
      dashaYearDays: DASHA_YEAR_DAYS,
    },
    window: { start, end },
    header: {
      name: ctx.personName ?? null,
      dob: ctx.personDob ?? null,
      lagnaSign: ascendant.sign,
      moonSign: moon.sign,
      moonNakshatra: moon.nakshatra,
      currentMahadasha: nowSpan?.md ?? null,
      currentAntardasha: nowSpan?.ad ?? null,
      dashaEndsOn: adEnd,
    },
    ascendant,
    moon,
    cusps: chart.cusps,
    planets: chart.planets.map((p) => ({ ...p, signifies: sigOf(p.planet).strong })),
    sensitiveCusps: chart.cusps.filter((c) => c.nearSubBoundary).map((c) => c.house),
    areas,
    months,
    dashaNow: nowSpan
      ? { md: nowSpan.md, ad: nowSpan.ad, pd: nowSpan.pd, adEnds: adEnd ?? nowSpan.end }
      : null,
    dashaShifts,
    rulingPlanets: rulingPlanets(
      raw.judgement.weekday,
      raw.judgement.moonLongitude,
      raw.judgement.ascLongitude,
    ),
    questions,
  };
}

/** Month index → "Oct 2026"-style label for prompts (the UI formats its own). */
export function monthLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
