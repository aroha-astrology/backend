// =============================================================================
// Decision Astrology + Find My Date (roadmap step 6, ships off)
// =============================================================================
// Both score every day of a range with lib/astro-tools/decision-engine.ts:
//   Decision (nav.decisions)       "Should I change jobs, and when?" — the
//     user's chart leads (dasha support for the area, Jupiter/Saturn, tara,
//     chandra bala), at the user's own location.
//   Find My Date (panchang.findMyDate)  "Best day to buy a car in Pune" — the
//     panchang leads (category nakshatra/tithi/weekday rules), at the place the
//     user picks, in that place's own timezone; tara and chandra bala are added
//     when the chart is ready.
// Aroha Pass only: without a live Pass every route answers PASS_REQUIRED.
// Each result is stored so it can be reopened. No AI call.
// =============================================================================

import type { Planet } from '@aroha-astrology/shared';
import type { PlaceOfBirth, UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { requirePass } from '../../lib/entitlements.js';
import { calculatePlanetPositions } from '../../lib/astro-engine/calculations/planetPositions.js';
import { calculateFullPanchang } from '../../lib/astro-engine/panchang/index.js';
import { eclipsesBetween } from '../../lib/astro-engine/panchang/eclipse.js';
import {
  dashaPeriodsInRange,
  type StoredMahadasha,
} from '../../lib/astro-engine/dashas/dasha-range.js';
import { jdFromDate } from '../../lib/astro-tools/transit-events.js';
import {
  bestTimeOfDay,
  findWindows,
  pickBestDays,
  pickCautionDays,
  scoreDay,
  type AvoidFlag,
  type DashaSupport,
  type DaySky,
  type DayTone,
  type DecisionMode,
  type DecisionWindow,
  type PersonalChart,
  type TimeWindow,
} from '../../lib/astro-tools/decision-engine.js';
import {
  DECISION_SPECS,
  MUHURTA_SPECS,
  type CategorySpec,
  type DecisionCategory,
  type MuhurtaCategory,
} from '../../lib/astro-tools/muhurta-rules.js';
import type { ChartContext } from '../../lib/intelligence/chart-context.js';
import type { WhyFactor } from '../../lib/intelligence/types.js';
import { resolveActiveProfileContext } from '../birth-profiles/profile-context.js';
import { findKundliByUserId } from '../kundli/kundli.repo.js';
import { tzOffsetHours } from '../kundli/kundli.service.js';
import { loadChartContext } from '../insights/insights.service.js';
import { lordScore, periodScore } from '../insights/timeline.service.js';
import {
  findDecisionQuery,
  insertDecisionQuery,
  listDecisionQueries,
  type DecisionInput,
  type DecisionKind,
  type DecisionQuery,
} from './decisions.repo.js';

export const MIN_RANGE_DAYS = 7;
export const MAX_RANGE_DAYS = 90;
const BEST_DAYS = 5;
const CAUTION_DAYS = 5;
const MS_PER_DAY = 86_400_000;
const DEFAULT_PLACE = { name: 'New Delhi', lat: 28.6139, lon: 77.209, tz: 'Asia/Kolkata' };

export interface BestDay {
  date: string;
  score: number;
  why: WhyFactor[];
  /** The best daytime slot at the place, in its local time. */
  time: TimeWindow | null;
  rahuKaal: { start: string; end: string } | null;
}

export interface DecisionResult {
  from: string;
  to: string;
  /** Chart factors were used (always for decisions; for Find My Date once the chart is ready). */
  personal: boolean;
  approximateBirthTime: boolean;
  days: Array<{ date: string; score: number; tone: DayTone; avoid: AvoidFlag[] }>;
  windows: DecisionWindow[];
  best: BestDay[];
  caution: Array<{ date: string; score: number; why: WhyFactor[] }>;
}

export interface DecisionDto extends DecisionResult {
  id: string;
  kind: DecisionKind;
  category: string;
  question: string | null;
  place: DecisionInput['place'];
  pricePaidPaise: number;
  createdAt: string;
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

function ymd(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y!, m!, d!];
}

/** Local noon of `date` at a place `tz` hours ahead of UTC, as an instant. */
function localNoon(date: string, tz: number): Date {
  const [y, m, d] = ymd(date);
  return new Date(Date.UTC(y, m - 1, d, 12) - tz * 3_600_000);
}

/** The sky at local noon for each day, plus eclipse days (by the place's calendar date). */
export async function daySkies(
  from: string,
  days: number,
  tzHours: number,
  ayanamsa: string | null,
): Promise<DaySky[]> {
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
  const eclipses = await eclipsesBetween(
    new Date(localNoon(from, tzHours).getTime() - MS_PER_DAY),
    new Date(localNoon(dates[dates.length - 1]!, tzHours).getTime() + MS_PER_DAY),
  ).catch((err: unknown) => {
    logger.warn({ err }, 'decision eclipse lookup failed — scoring without eclipses');
    return [];
  });
  const eclipseOn = new Map(
    eclipses.map((e) => [
      new Date(e.at.getTime() + tzHours * 3_600_000).toISOString().slice(0, 10),
      e.kind,
    ]),
  );

  return Promise.all(
    dates.map(async (date) => {
      const sky = await calculatePlanetPositions(
        jdFromDate(localNoon(date, tzHours)),
        (ayanamsa ?? 'lahiri') as Parameters<typeof calculatePlanetPositions>[1],
      );
      const sun = sky.find((p) => p.planet === 'Sun')!;
      const moon = sky.find((p) => p.planet === 'Moon')!;
      const [y, m, d] = ymd(date);
      return {
        date,
        weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay(),
        tithi: Math.floor(((((moon.longitude - sun.longitude) % 360) + 360) % 360) / 12) + 1,
        nakshatraIndex: moon.nakshatraIndex,
        moonSignIndex: moon.signIndex,
        planets: sky.map((p) => ({
          planet: p.planet,
          longitude: p.longitude,
          signIndex: p.signIndex,
          sign: p.sign,
          isRetrograde: p.isRetrograde,
        })),
        ...(eclipseOn.has(date) ? { eclipse: eclipseOn.get(date)! } : {}),
      };
    }),
  );
}

/** Day-by-day dasha support for `area` over the range (the lords rarely change inside 90 days). */
function dashaSupportFor(
  ctx: ChartContext,
  mahadashas: StoredMahadasha[],
  spec: CategorySpec,
  from: string,
  to: string,
): (date: string) => DashaSupport | undefined {
  const spans = dashaPeriodsInRange(
    mahadashas,
    new Date(`${from}T00:00:00Z`),
    new Date(Date.parse(`${to}T00:00:00Z`) + MS_PER_DAY),
    1,
  ).map((span) => {
    const [mahaLord, antarLord] = span.lords as [Planet, Planet];
    const maha = lordScore(ctx, mahaLord, spec.area, 'mahadasha');
    const antar = lordScore(ctx, antarLord, spec.area, 'antardasha');
    const why: WhyFactor[] = [...antar.why, ...maha.why];
    if (why.length === 0) {
      why.push({
        kind: 'dasha',
        planet: antarLord,
        level: 'antardasha',
        effect: 0,
        textKey: 'decide.why.dashaQuiet',
        params: { planet: antarLord },
      });
    }
    return {
      start: span.startDate,
      end: span.endDate,
      support: { score: periodScore(maha, antar), why },
    };
  });
  return (date) => {
    const at = localNoon(date, 5.5);
    return spans.find((s) => s.start <= at && at < s.end)?.support;
  };
}

function toPersonal(ctx: ChartContext): PersonalChart {
  return {
    moonSignIndex: ctx.moonSignIndex,
    moonNakshatraIndex: ctx.moonNakshatraIndex,
    ascendantSignIndex: ctx.ascendantSignIndex,
  };
}

/** Scores the range and picks windows, best dates (with the best time) and dates to avoid. */
export function buildResult(opts: {
  mode: DecisionMode;
  spec: CategorySpec;
  skies: DaySky[];
  place: { lat: number; lon: number };
  tzHours: number;
  personal?: PersonalChart;
  dashaOn?: (date: string) => DashaSupport | undefined;
  approximateBirthTime: boolean;
}): DecisionResult {
  const scored = opts.skies.map((sky) =>
    scoreDay(sky, opts.spec, opts.mode, opts.personal, opts.dashaOn?.(sky.date)),
  );
  const skyOn = new Map(opts.skies.map((s) => [s.date, s]));

  const best = pickBestDays(scored, BEST_DAYS).map((day): BestDay => {
    const sky = skyOn.get(day.date)!;
    const [y, m, d] = ymd(day.date);
    const sun = sky.planets.find((p) => p.planet === 'Sun')!.longitude;
    const moon = sky.planets.find((p) => p.planet === 'Moon')!.longitude;
    const panchang = calculateFullPanchang(
      new Date(y, m - 1, d, 12),
      opts.place.lat,
      opts.place.lon,
      sun,
      moon,
      opts.tzHours,
    ) as {
      abhijitMuhurta?: { start: string; end: string };
      rahuKaal?: { start: string; end: string };
      choghadiya?: {
        day: Array<{ name: string; type: string; startTime: string; endTime: string }>;
      };
    };
    return {
      date: day.date,
      score: day.score,
      why: day.why,
      time: bestTimeOfDay({
        weekday: sky.weekday,
        abhijitMuhurta: panchang.abhijitMuhurta,
        rahuKaal: panchang.rahuKaal,
        choghadiyaDay: panchang.choghadiya?.day,
      }),
      rahuKaal: panchang.rahuKaal ?? null,
    };
  });

  return {
    from: opts.skies[0]!.date,
    to: opts.skies[opts.skies.length - 1]!.date,
    personal: Boolean(opts.personal),
    approximateBirthTime: opts.approximateBirthTime,
    days: scored.map(({ date, score, tone, avoid }) => ({ date, score, tone, avoid })),
    windows: findWindows(scored, opts.mode),
    best,
    caution: pickCautionDays(scored, CAUTION_DAYS).map(({ date, score, why }) => ({
      date,
      score,
      why,
    })),
  };
}

function toDto(row: DecisionQuery<DecisionResult>): DecisionDto {
  return {
    ...row.result,
    id: row.id,
    kind: row.kind,
    category: row.category,
    question: row.input.question,
    place: row.input.place,
    pricePaidPaise: row.pricePaidPaise,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Stores a computed result so it can be reopened. */
async function store(opts: {
  user: UserRow;
  birthProfileId: string | null;
  kind: DecisionKind;
  category: string;
  input: DecisionInput;
  result: DecisionResult;
}): Promise<DecisionDto> {
  const row = await insertDecisionQuery({
    userId: opts.user.id,
    birthProfileId: opts.birthProfileId,
    kind: opts.kind,
    category: opts.category,
    input: opts.input,
    result: opts.result,
    pricePaidPaise: 0,
  });
  return toDto(row);
}

function placeOf(loc: PlaceOfBirth | null | undefined): DecisionInput['place'] {
  if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon)) {
    return { name: loc.name ?? null, lat: loc.lat, lon: loc.lon, tz: loc.tz || 'Asia/Kolkata' };
  }
  return DEFAULT_PLACE;
}

async function mahadashasFor(
  userId: string,
  birthProfileId: string | null,
): Promise<StoredMahadasha[]> {
  const kundli = await findKundliByUserId(userId, birthProfileId);
  return (
    (kundli?.dashaData as { vimshottari?: { mahadashas?: StoredMahadasha[] } } | null)?.vimshottari
      ?.mahadashas ?? []
  );
}

/** Decision Astrology: when does the chart back this choice, over the next `days` days? */
export async function runDecision(
  user: UserRow,
  input: { category: DecisionCategory; question?: string; from: string; days: number },
): Promise<DecisionDto> {
  await requirePass(user.id);
  const loaded = await loadChartContext(user);
  if (!loaded) throw Errors.conflict('CHART_NOT_READY');
  const { profile, ctx } = loaded;
  const mahadashas = await mahadashasFor(user.id, profile.birthProfileId);
  const place = placeOf(user.currentLocation ?? user.placeOfBirth);
  const tzHours = tzOffsetHours(place.tz, localNoon(input.from, 5.5));
  const spec = DECISION_SPECS[input.category];
  const to = addDays(input.from, input.days - 1);

  const skies = await daySkies(input.from, input.days, tzHours, ctx.calculation.ayanamsa);
  const result = buildResult({
    mode: 'decision',
    spec,
    skies,
    place,
    tzHours,
    personal: toPersonal(ctx),
    dashaOn: dashaSupportFor(ctx, mahadashas, spec, input.from, to),
    approximateBirthTime: profile.birthTimeAccuracy !== 'exact',
  });

  return store({
    user,
    birthProfileId: profile.birthProfileId,
    kind: 'decision',
    category: input.category,
    input: { question: input.question?.trim() || null, place },
    result,
  });
}

/** Find My Date: the best days for a kind of beginning at a chosen place. */
export async function runFindDate(
  user: UserRow,
  input: { category: MuhurtaCategory; place: PlaceOfBirth; from: string; days: number },
): Promise<DecisionDto> {
  await requirePass(user.id);
  const loaded = await loadChartContext(user);
  const birthProfileId =
    loaded?.profile.birthProfileId ?? (await resolveActiveProfileContext(user)).birthProfileId;
  const place = placeOf(input.place);
  const tzHours = tzOffsetHours(place.tz, localNoon(input.from, 5.5));
  const skies = await daySkies(
    input.from,
    input.days,
    tzHours,
    loaded?.ctx.calculation.ayanamsa ?? null,
  );
  const result = buildResult({
    mode: 'muhurta',
    spec: MUHURTA_SPECS[input.category],
    skies,
    place,
    tzHours,
    ...(loaded ? { personal: toPersonal(loaded.ctx) } : {}),
    approximateBirthTime: loaded ? loaded.profile.birthTimeAccuracy !== 'exact' : false,
  });

  return store({
    user,
    birthProfileId,
    kind: 'muhurta',
    category: input.category,
    input: { question: null, place },
    result,
  });
}

export async function getDecision(user: UserRow, id: string): Promise<DecisionDto> {
  await requirePass(user.id);
  const row = await findDecisionQuery<DecisionResult>(user.id, id);
  if (!row) throw Errors.notFound('DECISION_NOT_FOUND');
  return toDto(row);
}

export interface DecisionListItem {
  id: string;
  kind: DecisionKind;
  category: string;
  question: string | null;
  placeName: string | null;
  from: string;
  to: string;
  topDate: string | null;
  createdAt: string;
}

export async function listDecisions(
  user: UserRow,
  kind: DecisionKind | undefined,
): Promise<{ items: DecisionListItem[] }> {
  await requirePass(user.id);
  const rows = await listDecisionQueries<DecisionResult>(user.id, kind);
  return {
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      category: r.category,
      question: r.input.question,
      placeName: r.input.place.name,
      from: r.result.from,
      to: r.result.to,
      topDate: r.result.best[0]?.date ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
