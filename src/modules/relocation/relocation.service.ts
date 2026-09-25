// =============================================================================
// Aroha Relocation (roadmap step 12, ships off)
// =============================================================================
// Compare up to five places, from anywhere in the world, against the birth
// place: the same birth moment read from each place scores six life areas
// (astrocartography/relocation-areas.ts). A one-off unlock per profile
// (paid.relocation, free with the Aroha Pass) opens unlimited comparisons.
// Blocked, with the reason, while birth-time confidence is low — the rising
// sign decides every house here, and a few minutes of error can move it.
// Rule-based, no AI.
// =============================================================================

import type { ChartData } from '@aroha-astrology/shared';
import type { PlaceOfBirth, UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import {
  relocateChart,
  scoreRelocationAreas,
  type AreaScore,
  type RelocationArea,
} from '../../lib/astro-engine/astrocartography/relocation-areas.js';
import { resolveActiveProfileContext } from '../birth-profiles/profile-context.js';
import { findKundliByUserId } from '../kundli/kundli.repo.js';
import { getBirthTimeStatus } from '../insights/insights.service.js';
import { purchaseUnlock, unlockState, type UnlockState } from '../unlocks/unlocks.service.js';

export const RELOCATION_KEY = 'paid.relocation';
/** Only used if the feature registry has no price for the key — see config/features.ts. */
export const RELOCATION_FALLBACK_PAISE = 9900;
export const RELOCATION_REASON = 'relocation';
export const MAX_PLACES = 5;

export interface RelocationStatus {
  confidence: { pct: number; level: 'low' | 'medium' | 'high' };
  /** Low birth-time confidence: comparing places would mean little. */
  blocked: boolean;
  unlock: UnlockState;
  birthPlace: { name: string | null } | null;
}

export interface PlaceResult {
  name: string;
  lat: number;
  lon: number;
  isBirthPlace: boolean;
  ascendantSign: string;
  overall: number;
  areas: Record<RelocationArea, AreaScore>;
}

export async function getRelocationStatus(user: UserRow): Promise<RelocationStatus> {
  const profile = await resolveActiveProfileContext(user);
  const [birthTime, unlock] = await Promise.all([
    getBirthTimeStatus(user),
    unlockState(user.id, profile.birthProfileId, RELOCATION_KEY, RELOCATION_FALLBACK_PAISE),
  ]);
  return {
    confidence: { pct: birthTime.confidence.pct, level: birthTime.confidence.level },
    blocked: birthTime.confidence.level === 'low',
    unlock,
    birthPlace: profile.placeOfBirth ? { name: profile.placeOfBirth.name ?? null } : null,
  };
}

export async function unlockRelocation(user: UserRow): Promise<UnlockState> {
  const profile = await resolveActiveProfileContext(user);
  return purchaseUnlock({
    userId: user.id,
    birthProfileId: profile.birthProfileId,
    featureKey: RELOCATION_KEY,
    fallbackPaise: RELOCATION_FALLBACK_PAISE,
    reason: RELOCATION_REASON,
  });
}

async function scorePlace(
  chart: ChartData,
  place: { name: string; lat: number; lon: number },
  isBirthPlace: boolean,
): Promise<PlaceResult> {
  const relocated = await relocateChart(chart, place.lat, place.lon);
  const areas = scoreRelocationAreas(relocated);
  const scores = Object.values(areas).map((a) => a.score);
  return {
    name: place.name,
    lat: place.lat,
    lon: place.lon,
    isBirthPlace,
    ascendantSign: relocated.ascendant.sign,
    overall: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    areas,
  };
}

/** Scores the birth place and each chosen place. */
export async function compareRelocation(
  user: UserRow,
  places: Array<Pick<PlaceOfBirth, 'name' | 'lat' | 'lon'>>,
): Promise<{ places: PlaceResult[] }> {
  const status = await getRelocationStatus(user);
  if (status.blocked) throw Errors.conflict('BIRTH_TIME_TOO_UNCERTAIN');
  if (!status.unlock.unlocked) throw Errors.conflict('RELOCATION_LOCKED');

  const profile = await resolveActiveProfileContext(user);
  const kundli = await findKundliByUserId(user.id, profile.birthProfileId);
  const chart = kundli?.status === 'ready' ? (kundli.chartData as ChartData | null) : null;
  if (!chart || typeof chart.julianDay !== 'number') throw Errors.conflict('CHART_NOT_READY');

  const birth = profile.placeOfBirth;
  const results = await Promise.all([
    ...(birth
      ? [scorePlace(chart, { name: birth.name, lat: birth.lat, lon: birth.lon }, true)]
      : []),
    ...places.slice(0, MAX_PLACES).map((p) => scorePlace(chart, p, false)),
  ]);
  return { places: results };
}
