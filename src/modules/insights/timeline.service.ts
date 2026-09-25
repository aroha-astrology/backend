// =============================================================================
// Life Timeline — which stretches of life light up which area, and why
// =============================================================================
// Scores every Antardasha from birth to age 80 for each life area, from the
// two running lords (Mahadasha 40%, Antardasha 60%):
//   rules the area's primary house +3, another of its houses +2,
//   occupies one of its houses +2, is the area's karaka +1,
//   its own nakshatra lord is tied to the area +1,
//   natal placement: kendra/trikona +1, dusthana -1.
// Deterministic, Vimshottari-only (no AI call). Periods scoring MEDIUM or
// HIGH become bands on the area's lane; adjacent bands of the same level
// merge. Aroha Pass only: without a live Pass the route answers PASS_REQUIRED.
// =============================================================================

import type { Planet } from '@aroha-astrology/shared';
import { NAKSHATRA_LORDS } from '@aroha-astrology/shared';
import type { UserRow } from '../../db/schema.js';
import { requirePass } from '../../lib/entitlements.js';
import { Errors } from '../../lib/errors.js';
import {
  dashaPeriodsInRange,
  type StoredMahadasha,
} from '../../lib/astro-engine/dashas/dasha-range.js';
import { AREA_CONFIG, type LifeArea } from '../../lib/intelligence/areas.js';
import type { ChartContext } from '../../lib/intelligence/chart-context.js';
import { housesRuledBy, placementEffect } from '../../lib/intelligence/why.js';
import type { WhyFactor } from '../../lib/intelligence/types.js';
import { findKundliByUserId } from '../kundli/kundli.repo.js';
import { loadChartContext } from './insights.service.js';

export const TIMELINE_AREAS = [
  'career',
  'relationships',
  'money',
  'education',
  'family',
  'business',
  'relocation',
] as const satisfies readonly LifeArea[];
export type TimelineArea = (typeof TIMELINE_AREAS)[number];

const MAX_AGE_YEARS = 80;
const MS_PER_YEAR = 365.25 * 86_400_000;

export type BandLevel = 'high' | 'medium';

export interface TimelineBand {
  start: string;
  end: string;
  /** 0-100. */
  score: number;
  level: BandLevel;
  /** [mahadasha lord, antardasha lord] of the strongest period in the band. */
  lords: [Planet, Planet];
  why: WhyFactor[];
}

export interface TimelineResponse {
  birthDate: string;
  today: string;
  /** Span the response covers: birth to age 80. */
  range: { from: string; to: string };
  /** True when the birth time is approximate or unknown — dasha dates can shift. */
  approximateBirthTime: boolean;
  mahadashas: Array<{ planet: Planet; start: string; end: string }>;
  lanes: Array<{ area: TimelineArea; bands: TimelineBand[] }>;
}

interface LordScore {
  score: number;
  why: WhyFactor[];
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** How strongly one dasha lord speaks for `area` in this chart (0 to ~9), with the evidence. */
export function lordScore(
  ctx: ChartContext,
  planet: Planet,
  area: LifeArea,
  level: 'mahadasha' | 'antardasha',
): LordScore {
  const cfg = AREA_CONFIG[area];
  const why: WhyFactor[] = [];
  let score = 0;

  const ruled = housesRuledBy(ctx, planet).filter((h) => cfg.houses.includes(h));
  if (ruled.length > 0) {
    score += ruled.includes(cfg.houses[0]!) ? 3 : 2;
    why.push({
      kind: 'lordship',
      planet,
      house: ruled[0]!,
      level,
      effect: 1,
      textKey: 'timeline.why.rules',
      params: { planet, house: ruled[0]! },
    });
  }

  const natal = ctx.natal.find((p) => p.planet === planet);
  if (natal && cfg.houses.includes(natal.house)) {
    score += 2;
    why.push({
      kind: 'house',
      planet,
      house: natal.house,
      effect: 1,
      textKey: 'timeline.why.sits',
      params: { planet, house: natal.house },
    });
  }

  if (cfg.karakas.includes(planet)) {
    score += 1;
    why.push({
      kind: 'dasha',
      planet,
      level,
      effect: 1,
      textKey: 'timeline.why.karaka',
      params: { planet },
    });
  }

  if (natal) {
    const starLord = NAKSHATRA_LORDS[natal.nakshatraIndex];
    if (starLord && starLord !== planet) {
      const starTied =
        housesRuledBy(ctx, starLord).some((h) => cfg.houses.includes(h)) ||
        cfg.houses.includes(ctx.natal.find((p) => p.planet === starLord)?.house ?? -1);
      if (starTied) {
        score += 1;
        why.push({
          kind: 'nakshatra',
          planet,
          effect: 1,
          textKey: 'timeline.why.star',
          params: { planet, starLord },
        });
      }
    }
    const placement = placementEffect(natal.house);
    score += placement;
    if (placement !== 0 && score > 0) {
      why.push({
        kind: 'house',
        planet,
        house: natal.house,
        effect: placement,
        textKey: placement > 0 ? 'timeline.why.strongPlace' : 'timeline.why.weakPlace',
        params: { planet, house: natal.house },
      });
    }
  }
  return { score: Math.max(0, score), why };
}

/** The Antardasha's 0-100 score for `area`: Mahadasha lord 40%, Antardasha lord 60%, of a 9-point scale. */
export function periodScore(maha: LordScore, antar: LordScore): number {
  return Math.min(100, Math.round(((0.4 * maha.score + 0.6 * antar.score) / 6) * 100));
}

export function levelOf(score: number): BandLevel | null {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return null;
}

/** Bands for one lane: scored Antardashas at MEDIUM or above, merging neighbours of the same level. */
export function laneBands(
  ctx: ChartContext,
  mahadashas: StoredMahadasha[],
  area: TimelineArea,
  from: Date,
  to: Date,
): TimelineBand[] {
  const bands: TimelineBand[] = [];
  for (const span of dashaPeriodsInRange(mahadashas, from, to, 1)) {
    const [mahaLord, antarLord] = span.lords as [Planet, Planet];
    const maha = lordScore(ctx, mahaLord, area, 'mahadasha');
    const antar = lordScore(ctx, antarLord, area, 'antardasha');
    const score = periodScore(maha, antar);
    const level = levelOf(score);
    if (!level) continue;
    const start = isoDate(span.startDate < from ? from : span.startDate);
    const end = isoDate(span.endDate > to ? to : span.endDate);
    const why = [...antar.why, ...maha.why].slice(0, 4);
    const last = bands[bands.length - 1];
    if (last && last.level === level && last.end === start) {
      last.end = end;
      if (score > last.score) Object.assign(last, { score, lords: [mahaLord, antarLord], why });
      continue;
    }
    bands.push({ start, end, score, level, lords: [mahaLord, antarLord], why });
  }
  return bands;
}

function birthMoment(dateOfBirth: string, mahadashas: StoredMahadasha[]): Date {
  const first = mahadashas[0];
  return first ? new Date(first.startDate) : new Date(`${dateOfBirth}T00:00:00Z`);
}

export async function getTimeline(user: UserRow): Promise<TimelineResponse> {
  await requirePass(user.id);
  const now = new Date();
  const loaded = await loadChartContext(user, now);
  if (!loaded) throw Errors.conflict('CHART_NOT_READY');
  const { profile, ctx } = loaded;
  const kundli = await findKundliByUserId(user.id, profile.birthProfileId);
  const mahadashas =
    (kundli?.dashaData as { vimshottari?: { mahadashas?: StoredMahadasha[] } } | null)?.vimshottari
      ?.mahadashas ?? [];
  if (mahadashas.length === 0 || !profile.dateOfBirth) throw Errors.conflict('CHART_NOT_READY');

  const birth = birthMoment(profile.dateOfBirth, mahadashas);
  const lifeEnd = new Date(birth.getTime() + MAX_AGE_YEARS * MS_PER_YEAR);

  return {
    birthDate: profile.dateOfBirth,
    today: isoDate(now),
    range: { from: isoDate(birth), to: isoDate(lifeEnd) },
    approximateBirthTime: profile.birthTimeAccuracy !== 'exact',
    mahadashas: dashaPeriodsInRange(mahadashas, birth, lifeEnd, 0).map((m) => ({
      planet: m.planet,
      start: isoDate(m.startDate),
      end: isoDate(m.endDate > lifeEnd ? lifeEnd : m.endDate),
    })),
    lanes: TIMELINE_AREAS.map((area) => ({
      area,
      bands: laneBands(ctx, mahadashas, area, birth, lifeEnd),
    })),
  };
}
