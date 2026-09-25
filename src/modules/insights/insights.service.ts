import type { UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { requirePass } from '../../lib/entitlements.js';
import { buildChartContext, type ChartContext } from '../../lib/intelligence/chart-context.js';
import { explainArea } from '../../lib/intelligence/why.js';
import type { LifeArea } from '../../lib/intelligence/areas.js';
import type { WhyFactor } from '../../lib/intelligence/types.js';
import {
  baselineBirthTimeConfidence,
  levelFor,
  type BirthTimeConfidence,
} from '../../lib/intelligence/birth-time-confidence.js';
import {
  rectifyBirthTime,
  type LifeEvent,
} from '../../lib/astro-engine/calculations/rectification.js';
import {
  resolveActiveProfileContext,
  type ProfileContext,
} from '../birth-profiles/profile-context.js';
import { findKundliByUserId } from '../kundli/kundli.repo.js';
import { requestKundliGeneration, tzOffsetHours } from '../kundli/kundli.service.js';
import { findActiveUserById, updateUserById } from '../users/users.repo.js';
import { updateOwnedBirthProfile } from '../birth-profiles/birth-profiles.repo.js';
import {
  findLatestAppliedRectification,
  findLatestRectification,
  findRectificationForUser,
  insertRectification,
  markRectificationApplied,
  type Rectification,
} from './birth-time.repo.js';

/* -------------------------------------------------------------------------- */
/* Chart context — shared by every roadmap feature                             */
/* -------------------------------------------------------------------------- */

export interface LoadedChart {
  profile: ProfileContext;
  ctx: ChartContext;
}

/**
 * The active profile's chart context at `asOf`, or null while its kundli
 * isn't ready yet (callers answer 409 chart_not_ready; the kundli pipeline
 * builds it on first view).
 */
export async function loadChartContext(
  user: UserRow,
  asOf: Date = new Date(),
): Promise<LoadedChart | null> {
  const profile = await resolveActiveProfileContext(user);
  const kundli = await findKundliByUserId(user.id, profile.birthProfileId);
  if (!kundli) return null;
  const ctx = await buildChartContext(kundli, profile, asOf);
  return ctx ? { profile, ctx } : null;
}

/** Noon IST on a 'YYYY-MM-DD' date — the moment a "for this day" reading is read at. */
export function istNoon(date: string): Date {
  return new Date(`${date}T06:30:00Z`);
}

/* -------------------------------------------------------------------------- */
/* Why Aroha is saying this                                                    */
/* -------------------------------------------------------------------------- */

export interface WhyResponse {
  area: LifeArea;
  asOf: string;
  factors: WhyFactor[];
  calculation: ChartContext['calculation'];
  birth: { placeName: string | null; timezone: string | null };
  birthTime: BirthTimeConfidence;
  dasha: ChartContext['dasha'];
}

export async function getWhy(user: UserRow, area: LifeArea, asOf: Date): Promise<WhyResponse> {
  const loaded = await loadChartContext(user, asOf);
  if (!loaded) throw Errors.conflict('CHART_NOT_READY');
  const { profile, ctx } = loaded;
  return {
    area,
    asOf: ctx.asOf,
    factors: explainArea(area, ctx),
    calculation: ctx.calculation,
    birth: { placeName: ctx.birth.placeName, timezone: ctx.birth.timezone },
    birthTime: await confidenceFor(user.id, profile),
    dasha: ctx.dasha,
  };
}

/* -------------------------------------------------------------------------- */
/* Birth Time Confidence                                                       */
/* -------------------------------------------------------------------------- */

export async function confidenceFor(
  userId: string,
  profile: ProfileContext,
): Promise<BirthTimeConfidence> {
  if (profile.birthTimeSource === 'rectified') {
    const applied = await findLatestAppliedRectification(userId, profile.birthProfileId);
    if (applied) {
      return {
        pct: applied.confidencePct,
        level: levelFor(applied.confidencePct),
        basis: 'rectified',
      };
    }
  }
  return baselineBirthTimeConfidence(profile);
}

export interface RectificationDto {
  id: string;
  statedTime: string;
  suggestedTime: string;
  offsetMinutes: number;
  confidence: 'low' | 'medium' | 'high';
  confidencePct: number;
  eventMatches: Rectification['detail']['eventMatches'];
  counts: { strong: number; weak: number; none: number };
  /** Applying is only offered when the evidence is at least medium and it moves the time. */
  canApply: boolean;
  appliedAt: string | null;
  createdAt: string;
  pricePaidPaise: number;
}

export function toRectificationDto(row: Rectification): RectificationDto {
  const matches = row.detail.eventMatches;
  return {
    id: row.id,
    statedTime: row.statedTime,
    suggestedTime: row.suggestedTime,
    offsetMinutes: row.detail.offsetMinutes,
    confidence: row.confidence,
    confidencePct: row.confidencePct,
    eventMatches: matches,
    counts: {
      strong: matches.filter((m) => m.strength === 'strong').length,
      weak: matches.filter((m) => m.strength === 'weak').length,
      none: matches.filter((m) => m.strength === 'none').length,
    },
    canApply: row.appliedAt === null && row.confidence !== 'low' && row.detail.offsetMinutes !== 0,
    appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    pricePaidPaise: row.pricePaidPaise,
  };
}

export interface BirthTimeStatus {
  time: string | null;
  accuracy: ProfileContext['birthTimeAccuracy'];
  source: ProfileContext['birthTimeSource'];
  confidence: BirthTimeConfidence;
  latest: RectificationDto | null;
}

/** Aroha Pass only, like the check itself. */
export async function getBirthTimeStatus(user: UserRow): Promise<BirthTimeStatus> {
  await requirePass(user.id);
  const profile = await resolveActiveProfileContext(user);
  const [latest, confidence] = await Promise.all([
    findLatestRectification(user.id, profile.birthProfileId),
    confidenceFor(user.id, profile),
  ]);
  return {
    time: profile.timeOfBirth,
    accuracy: profile.birthTimeAccuracy,
    source: profile.birthTimeSource,
    confidence,
    latest: latest ? toRectificationDto(latest) : null,
  };
}

/**
 * How far either side of the stated time to search: an "unknown" time is only
 * the midpoint of a part-of-day window (lib/birth-time-window.ts), so it gets
 * the widest search; an "exact" one only needs the standard hour.
 */
export function searchWindowMinutes(accuracy: ProfileContext['birthTimeAccuracy']): number {
  if (accuracy === 'unknown') return 180;
  if (accuracy === 'approximate') return 90;
  return 60;
}

/**
 * Runs a birth-time check for the active profile (Aroha Pass only).
 */
export async function runBirthTimeCheck(
  user: UserRow,
  events: LifeEvent[],
): Promise<RectificationDto> {
  await requirePass(user.id);
  const profile = await resolveActiveProfileContext(user);
  const place = profile.placeOfBirth;
  if (!profile.dateOfBirth || !profile.timeOfBirth || place?.lat == null || place?.lon == null) {
    throw Errors.unprocessable('MISSING_BIRTH_DATA');
  }
  const [y, m, d] = profile.dateOfBirth.split('-').map(Number);
  const [hh, mm] = profile.timeOfBirth.split(':').map(Number);
  if (!y || !m || !d || hh == null || mm == null) throw Errors.unprocessable('MISSING_BIRTH_DATA');

  const result = await rectifyBirthTime({
    year: y,
    month: m,
    day: d,
    hour: hh,
    minute: mm,
    tzOffset: tzOffsetHours(place.tz, new Date(Date.UTC(y, m - 1, d))),
    lat: place.lat,
    lng: place.lon,
    events,
    windowMinutes: searchWindowMinutes(profile.birthTimeAccuracy),
  });
  if (!result) throw Errors.unprocessable('NOT_ENOUGH_EVIDENCE');

  const row = await insertRectification({
    userId: user.id,
    birthProfileId: profile.birthProfileId,
    statedTime: profile.timeOfBirth.slice(0, 5),
    suggestedTime: result.best.time,
    detail: {
      events,
      eventMatches: result.eventMatches,
      reasoning: result.reasoning,
      offsetMinutes: result.best.offsetMinutes,
    },
    confidence: result.confidence,
    confidencePct: result.confidencePct,
    pricePaidPaise: 0,
  });
  return toRectificationDto(row);
}

/**
 * Moves the profile's stored birth time to a check's suggestion. Rebuilds the
 * kundli (which also clears cached horoscopes, see kundli.service.ts) and does
 * NOT use up the primary profile's one-time birth-detail edit.
 */
export async function applyBirthTimeCheck(
  user: UserRow,
  rectificationId: string,
): Promise<RectificationDto> {
  await requirePass(user.id);
  const row = await findRectificationForUser(rectificationId, user.id);
  if (!row) throw Errors.notFound('Birth-time check not found');
  const dto = toRectificationDto(row);
  if (row.appliedAt) throw Errors.conflict('ALREADY_APPLIED');
  if (!dto.canApply) throw Errors.conflict('NOT_CONFIDENT_ENOUGH');

  const accuracy = row.confidence === 'high' ? 'exact' : 'approximate';
  if (row.birthProfileId === null) {
    const current = await findActiveUserById(user.id);
    if (!current) throw Errors.notFound('User not found');
    await updateUserById(user.id, {
      timeOfBirth: row.suggestedTime,
      birthTimeAccuracy: accuracy,
      birthTimeSource: 'rectified',
      birthTimeRectified: true,
      birthTimeRectificationConfidence: row.confidence,
    });
  } else {
    const updated = await updateOwnedBirthProfile(row.birthProfileId, user.id, {
      timeOfBirth: row.suggestedTime,
      birthTimeAccuracy: accuracy,
      birthTimeSource: 'rectified',
    });
    if (!updated) throw Errors.notFound('Profile not found');
  }

  const marked = await markRectificationApplied(row.id, user.id);
  if (!marked) throw Errors.conflict('ALREADY_APPLIED');

  void requestKundliGeneration(user.id, row.birthProfileId).catch((err: unknown) => {
    logger.error({ err, userId: user.id }, 'kundli regeneration after birth-time apply failed');
  });

  const fresh = await findRectificationForUser(row.id, user.id);
  return toRectificationDto(fresh ?? row);
}
