import crypto from 'node:crypto';
import {
  calculateChart,
  calculateVimshottariDasha,
  detectAllYogas,
  analyzeAllDoshas,
  calculateAshtakavarga,
} from '../../lib/astro-engine/index.js';
import { logger } from '../../lib/logger.js';
import type { KundliRow, UserRow } from '../../db/schema.js';
import type { KundliDto } from './kundli.schemas.js';
import { findActiveUserById } from '../users/users.repo.js';
import {
  STALE_GENERATING_MS,
  claimKundliGeneration,
  findKundliByUserId,
  markKundliFailed,
  markKundliReady,
} from './kundli.repo.js';

type EngineAyanamsa = 'lahiri' | 'raman' | 'krishnamurti';
type EngineHouseSystem = 'W' | 'P' | 'K' | 'E';

/* -------------------------------------------------------------------------- */
/* Strict required parameters                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The parameters a CORRECT natal kundli requires. Exact birth time is
 * mandatory — without it the ascendant, houses, and dasha cannot be computed,
 * so we report it as missing rather than producing a degraded/guessed chart.
 * These are all collected during onboarding.
 */
export const KUNDLI_REQUIRED_FIELDS = [
  'displayName',
  'gender',
  'dateOfBirth',
  'timeOfBirth',
  'placeOfBirth',
] as const;

export type KundliRequiredField = (typeof KUNDLI_REQUIRED_FIELDS)[number];

function placeIsComplete(place: UserRow['placeOfBirth']): boolean {
  return (
    place != null &&
    typeof place.lat === 'number' &&
    typeof place.lon === 'number' &&
    typeof place.tz === 'string' &&
    place.tz.length > 0
  );
}

/** Required kundli fields that are absent on the user (empty = ready to compute). */
export function missingKundliParams(user: UserRow): KundliRequiredField[] {
  const missing: KundliRequiredField[] = [];
  if (!user.displayName) missing.push('displayName');
  if (!user.gender) missing.push('gender');
  if (!user.dateOfBirth) missing.push('dateOfBirth');
  // An EXACT time is required: a null time OR an explicitly 'unknown' accuracy
  // both count as missing (a disclaimed time can't yield lagna/houses/dasha).
  if (!user.timeOfBirth || user.birthTimeAccuracy === 'unknown') missing.push('timeOfBirth');
  if (!placeIsComplete(user.placeOfBirth)) missing.push('placeOfBirth');
  return missing;
}

/* -------------------------------------------------------------------------- */
/* Preference / timezone resolution                                            */
/* -------------------------------------------------------------------------- */

/** Map the user's ayanamsa preference onto an engine-supported one. */
function resolveAyanamsa(pref: string | null): EngineAyanamsa {
  if (pref === 'raman') return 'raman';
  if (pref === 'krishnamurti') return 'krishnamurti';
  return 'lahiri'; // default + fallback for ayanamsas the engine doesn't support
}

function resolveHouseSystem(pref: string | null): EngineHouseSystem {
  switch (pref) {
    case 'placidus':
    case 'kp_placidus':
      return 'P';
    case 'koch':
      return 'K';
    case 'equal':
      return 'E';
    default:
      return 'W'; // whole-sign (and any system the engine doesn't model)
  }
}

/**
 * UTC offset in hours for a tz that may be numeric ("5.5"), ±HH:MM, or IANA.
 * IANA zones use current DST rules applied to the birth date (best-effort;
 * exact for zones without historical DST changes, e.g. Asia/Kolkata).
 */
function tzOffsetHours(tz: string, refDate: Date): number {
  const trimmed = tz.trim();

  // Signed offsets FIRST — otherwise "+0530" parses as the number 530.
  const m = /^([+-])(\d{1,2}):?(\d{2})?$/.exec(trimmed);
  if (m) {
    const sign = m[1] === '-' ? -1 : 1;
    return sign * (parseInt(m[2] ?? '0', 10) + parseInt(m[3] ?? '0', 10) / 60);
  }

  const numeric = Number(trimmed);
  if (trimmed !== '' && !Number.isNaN(numeric)) return numeric;

  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const p: Record<string, string> = Object.fromEntries(
      dtf.formatToParts(refDate).map((x) => [x.type, x.value]),
    );
    const hour = p.hour === '24' ? 0 : Number(p.hour ?? '0');
    const asUtc = Date.UTC(
      Number(p.year ?? '0'),
      Number(p.month ?? '1') - 1,
      Number(p.day ?? '1'),
      hour,
      Number(p.minute ?? '0'),
      Number(p.second ?? '0'),
    );
    return (asUtc - refDate.getTime()) / 3_600_000;
  } catch {
    return 5.5; // IST fallback
  }
}

/* -------------------------------------------------------------------------- */
/* Generation                                                                  */
/* -------------------------------------------------------------------------- */

type BirthInputs = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  tzOffset: number;
  lat: number;
  lng: number;
  ayanamsa: EngineAyanamsa;
  houseSystem: EngineHouseSystem;
  birthHash: string;
};

/**
 * Build engine inputs from a user row, or null if ANY required parameter is
 * missing (use `missingKundliParams` to report exactly which). Exact birth
 * time is required.
 */
export function birthInputsForUser(user: UserRow): BirthInputs | null {
  if (missingKundliParams(user).length > 0) return null;

  // Guaranteed present by the check above.
  const place = user.placeOfBirth!;
  const [year, month, day] = (user.dateOfBirth as string).split('-').map(Number);
  if (!year || !month || !day) return null;
  const [hh, mm] = (user.timeOfBirth as string).split(':').map(Number);
  const hour = hh ?? 0;
  const minute = mm ?? 0;

  const refDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const tzOffset = tzOffsetHours(place.tz, refDate);
  const ayanamsa = resolveAyanamsa(user.preferredAyanamsa);
  const houseSystem = resolveHouseSystem(user.preferredHouseSystem);

  const birthHash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        d: user.dateOfBirth,
        t: user.timeOfBirth,
        acc: user.birthTimeAccuracy,
        lat: place.lat,
        lon: place.lon,
        tz: place.tz,
        ayanamsa,
        houseSystem,
      }),
    )
    .digest('hex')
    .slice(0, 16);

  return {
    year,
    month,
    day,
    hour,
    minute,
    tzOffset,
    lat: place.lat,
    lng: place.lon,
    ayanamsa,
    houseSystem,
    birthHash,
  };
}

function tryCompute<T>(label: string, fn: () => T): T | null {
  try {
    return fn();
  } catch (err) {
    logger.warn({ err, label }, 'kundli enrichment step failed (skipped)');
    return null;
  }
}

async function runGeneration(userId: string, inputs: BirthInputs, claimedAt: Date): Promise<void> {
  try {
    const chart = await calculateChart(
      inputs.year,
      inputs.month,
      inputs.day,
      inputs.hour,
      inputs.minute,
      inputs.tzOffset,
      inputs.lat,
      inputs.lng,
      inputs.ayanamsa,
      inputs.houseSystem,
    );

    const moon = chart.planets.find((p) => p.planet === 'Moon');
    const saturn = chart.planets.find((p) => p.planet === 'Saturn');
    // True birth instant in UTC (server-tz-independent), consistent with the
    // chart's Julian-day computation.
    const birthDate = new Date(
      Date.UTC(inputs.year, inputs.month - 1, inputs.day, inputs.hour, inputs.minute) -
        inputs.tzOffset * 3_600_000,
    );
    const dasha = calculateVimshottariDasha(moon?.longitude ?? 0, birthDate);

    // Best-effort enrichment: a failure in any single (unvetted) calc must NOT
    // fail the whole kundli — the chart + dasha are the required payload.
    const yogas = tryCompute('yogas', () => detectAllYogas(chart));
    const doshas = tryCompute('doshas', () => analyzeAllDoshas(chart, saturn?.longitude ?? 0));
    const ashtakavarga = tryCompute('ashtakavarga', () => calculateAshtakavarga(chart));

    await markKundliReady(userId, claimedAt, {
      ayanamsa: inputs.ayanamsa,
      houseSystem: inputs.houseSystem,
      timeKnown: true,
      birthHash: inputs.birthHash,
      chartData: { ...chart },
      dashaData: { vimshottari: dasha },
      yogaData: yogas ? { yogas } : null,
      doshaData: doshas ? (doshas as unknown as Record<string, unknown>) : null,
      ashtakavargaData: ashtakavarga ? (ashtakavarga as unknown as Record<string, unknown>) : null,
    });
  } catch (err) {
    logger.error({ err, userId }, 'kundli generation failed');
    await markKundliFailed(userId, claimedAt, err instanceof Error ? err.message : String(err));
  }
}

/**
 * Idempotently (re)generate a user's kundli. Safe to call fire-and-forget and
 * to call repeatedly — the DB claim dedupes concurrent/duplicate runs and skips
 * a kundli that is already up to date. No-op when a required parameter is
 * missing (the GET/regenerate endpoints report exactly what's missing).
 */
export async function requestKundliGeneration(userId: string): Promise<void> {
  const user = await findActiveUserById(userId);
  if (!user) return;
  const inputs = birthInputsForUser(user);
  if (!inputs) return; // a required parameter is missing

  const claimed = await claimKundliGeneration(userId, inputs.birthHash);
  if (!claimed?.startedAt) return; // another run owns it, or it's already ready for this hash

  await runGeneration(userId, inputs, claimed.startedAt);
}

export type RegenerateResult =
  | { ok: false; missing: KundliRequiredField[] }
  | { ok: true; row: KundliRow };

/**
 * Force a (synchronous) regeneration and return the resulting row. Used by the
 * test/regenerate endpoint — it awaits generation so the caller sees the fresh
 * kundli in one request. Reports missing required parameters instead.
 */
export async function regenerateKundli(userId: string): Promise<RegenerateResult> {
  const user = await findActiveUserById(userId);
  if (!user) return { ok: false, missing: [...KUNDLI_REQUIRED_FIELDS] };

  const missing = missingKundliParams(user);
  if (missing.length > 0) return { ok: false, missing };

  const inputs = birthInputsForUser(user);
  if (!inputs) return { ok: false, missing: [...KUNDLI_REQUIRED_FIELDS] };

  const claimed = await claimKundliGeneration(userId, inputs.birthHash, { force: true });
  if (claimed?.startedAt) {
    await runGeneration(userId, inputs, claimed.startedAt);
  }

  const row = await findKundliByUserId(userId);
  // Row always exists after a claim; fall back defensively.
  return row ? { ok: true, row } : { ok: false, missing: [...KUNDLI_REQUIRED_FIELDS] };
}

/** A 'generating' row whose run likely crashed (older than the stale cutoff). */
export function isStaleGenerating(row: KundliRow): boolean {
  return (
    row.status === 'generating' &&
    row.startedAt !== null &&
    Date.now() - row.startedAt.getTime() > STALE_GENERATING_MS
  );
}

export async function getKundliForUser(userId: string): Promise<KundliRow | undefined> {
  return findKundliByUserId(userId);
}

export function toKundliDto(row: KundliRow): KundliDto {
  return {
    status: 'ready',
    id: row.id,
    timeKnown: row.timeKnown,
    ayanamsa: row.ayanamsa,
    houseSystem: row.houseSystem,
    chart: row.chartData,
    dasha: row.dashaData,
    yogas: row.yogaData,
    doshas: row.doshaData,
    generatedAt: row.generatedAt ? row.generatedAt.toISOString() : null,
  };
}
