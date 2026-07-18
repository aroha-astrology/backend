import crypto from 'node:crypto';
import {
  calculateChart,
  calculateVimshottariDasha,
  calculateYoginiDasha,
  detectAllYogas,
  analyzeAllDoshas,
  calculateAshtakavarga,
  getCurrentSaturnLongitude,
  detectCurrentSadeSati,
} from '../../lib/astro-engine/index.js';
import type { ZodiacSign } from '@aroha-astrology/shared';
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
import { HOROSCOPE_PERIODS, requestHoroscopeGeneration } from '../horoscope/horoscope.service.js';
import { generateHouseInsight, translateHouseInsightContent } from '../../lib/llm/house-insight.js';
import {
  STALE_GENERATING_MS as HOUSE_INSIGHT_STALE_GENERATING_MS,
  claimHouseInsightGeneration,
  findHouseInsight,
  markHouseInsightFailed,
  markHouseInsightReady,
  saveHouseInsightTranslation,
} from './house-insight.repo.js';
import type { HouseInsightRow } from '../../db/schema.js';

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

async function runGeneration(user: UserRow, inputs: BirthInputs, claimedAt: Date): Promise<void> {
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
    // True birth instant in UTC (server-tz-independent), consistent with the
    // chart's Julian-day computation.
    const birthDate = new Date(
      Date.UTC(inputs.year, inputs.month - 1, inputs.day, inputs.hour, inputs.minute) -
        inputs.tzOffset * 3_600_000,
    );
    const dasha = calculateVimshottariDasha(moon?.longitude ?? 0, birthDate);
    const yogini = calculateYoginiDasha(moon?.longitude ?? 0, birthDate);

    // Sade Sati is a TRANSIT dosha — it needs Saturn's CURRENT sky position,
    // not the natal chart's Saturn (which is where Saturn was at birth, a
    // wholly different value). A failed live lookup falls back to 0 (=
    // Aries), the same safe "no data" default the rest of this best-effort
    // block uses; it just means Sade Sati won't be flagged, never a wrong one.
    let currentSaturnLongitude = 0;
    try {
      currentSaturnLongitude = await getCurrentSaturnLongitude();
    } catch (err) {
      logger.warn({ err }, 'live Saturn transit lookup failed (Sade Sati skipped)');
    }

    // Best-effort enrichment: a failure in any single (unvetted) calc must NOT
    // fail the whole kundli — the chart + dasha are the required payload.
    const yogas = tryCompute('yogas', () => detectAllYogas(chart));
    const doshas = tryCompute('doshas', () => analyzeAllDoshas(chart, currentSaturnLongitude));
    const ashtakavarga = tryCompute('ashtakavarga', () => calculateAshtakavarga(chart));

    await markKundliReady(user.id, claimedAt, {
      ayanamsa: inputs.ayanamsa,
      houseSystem: inputs.houseSystem,
      timeKnown: true,
      birthHash: inputs.birthHash,
      chartData: { ...chart },
      dashaData: { vimshottari: dasha, yogini },
      yogaData: yogas ? { yogas } : null,
      doshaData: doshas ? (doshas as unknown as Record<string, unknown>) : null,
      ashtakavargaData: ashtakavarga ? (ashtakavarga as unknown as Record<string, unknown>) : null,
    });

    // The horoscope LLM context is only grounded once the kundli is actually
    // ready (see buildHoroscopeContext) — firing this in parallel with kundli
    // generation instead of after would risk baking in an ungrounded reading
    // that then sits cached until the period rolls over. `force: true` is a
    // no-op for a brand-new onboarding (no row yet) and correctly overwrites
    // a stale reading if this run was a birth-data correction, not first-time
    // onboarding. `retryForever` because nothing else is blocked on this.
    for (const period of HOROSCOPE_PERIODS) {
      void requestHoroscopeGeneration(user, period, { force: true, retryForever: true }).catch(
        (err: unknown) => {
          logger.error({ err, userId: user.id, period }, 'post-kundli horoscope trigger failed');
        },
      );
    }

    const readyKundli = await findKundliByUserId(user.id);
    if (readyKundli) {
      const unlockedHouses = user.unlockedHouses ?? [1];
      for (const house of unlockedHouses) {
        void requestHouseInsightGeneration(user.id, house, readyKundli).catch((err: unknown) => {
          logger.error({ err, userId: user.id, house }, 'post-kundli house insight trigger failed');
        });
      }
    }
  } catch (err) {
    logger.error({ err, userId: user.id }, 'kundli generation failed');
    await markKundliFailed(user.id, claimedAt, err instanceof Error ? err.message : String(err));
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

  await runGeneration(user, inputs, claimed.startedAt);
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
    await runGeneration(user, inputs, claimed.startedAt);
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

/**
 * Sade Sati is the one dosha whose correctness depends on TODAY, not the
 * birth-chart snapshot taken at kundli-generation time — Saturn keeps
 * transiting after that, so a value cached at generation goes stale and
 * (unlike every other, natal dosha here) never self-corrects. Recompute it
 * live on every read; leave the rest of doshaData (natal, unchanging) as-is.
 * Same self-healing-at-read pattern as the 2026-07-17 gemstone fix.
 */
export async function withLiveSadeSati(
  doshaData: Record<string, unknown> | null,
  asOf?: Date,
): Promise<Record<string, unknown> | null> {
  if (!doshaData) return doshaData;
  const cached = doshaData.sadeSati as { moonSign?: ZodiacSign } | undefined;
  if (!cached?.moonSign) return doshaData;
  try {
    const sadeSati = await detectCurrentSadeSati(cached.moonSign, asOf);
    return { ...doshaData, sadeSati };
  } catch (err) {
    logger.warn({ err }, 'live Sade Sati recompute failed at read time (serving cached value)');
    return doshaData;
  }
}

export async function toKundliDto(row: KundliRow): Promise<KundliDto> {
  return {
    status: 'ready',
    id: row.id,
    timeKnown: row.timeKnown,
    ayanamsa: row.ayanamsa,
    houseSystem: row.houseSystem,
    chart: row.chartData,
    dasha: row.dashaData,
    yogas: row.yogaData,
    doshas: await withLiveSadeSati(row.doshaData),
    generatedAt: row.generatedAt ? row.generatedAt.toISOString() : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Per-house insight — lazy, cached-forever LLM generation                    */
/* -------------------------------------------------------------------------- */

export interface HouseInsightReadyDto {
  status: 'ready';
  text: string;
  strengths: string[];
  weaknesses: string[];
}

/** Only call this once the row is confirmed `status === 'ready'` — the 202 (generating/failed) cases are plain literals, no DTO needed. */
export function toHouseInsightDto(row: HouseInsightRow): HouseInsightReadyDto {
  return {
    status: 'ready',
    text: row.text ?? '',
    strengths: row.strengths ?? [],
    weaknesses: row.weaknesses ?? [],
  };
}

async function runHouseInsightGeneration(
  userId: string,
  house: number,
  kundli: KundliRow,
  claimedAt: Date,
): Promise<void> {
  try {
    const result = await generateHouseInsight({
      userId,
      house,
      chart: kundli.chartData,
      dasha: kundli.dashaData,
    });
    await markHouseInsightReady(userId, house, claimedAt, result);
  } catch (err) {
    logger.error({ err, userId, house }, 'house insight generation failed');
    await markHouseInsightFailed(
      userId,
      house,
      claimedAt,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Fire-and-forget entry point used by the GET route (cache miss/retry) — a
 * single bounded attempt (no retry-forever loop; a user re-opening the house
 * drawer naturally retries), same as horoscope's on-demand weekly/monthly
 * periods. No-op (returns 'skipped') if another run already owns the claim
 * or a ready row already exists.
 */
export async function requestHouseInsightGeneration(
  userId: string,
  house: number,
  kundli: KundliRow,
): Promise<'generated' | 'skipped'> {
  const claimed = await claimHouseInsightGeneration(userId, house);
  if (!claimed?.startedAt) return 'skipped';
  await runHouseInsightGeneration(userId, house, kundli, claimed.startedAt);
  return 'generated';
}

/** A 'generating' house_insights row whose run likely crashed (older than the stale cutoff). */
export function isHouseInsightStale(row: HouseInsightRow): boolean {
  return (
    row.status === 'generating' &&
    row.startedAt !== null &&
    Date.now() - row.startedAt.getTime() > HOUSE_INSIGHT_STALE_GENERATING_MS
  );
}

export { findHouseInsight };

/**
 * The house-insight dto in the requested language. English (or no language)
 * returns the canonical row as-is. Otherwise checks the cached `translations`
 * map first; on a miss, translates via a second LLM call and persists it for
 * next time — same pattern as horoscope's translate-on-read. A translation
 * failure logs and falls back to the untranslated dto rather than erroring
 * the request.
 */
export async function toHouseInsightDtoForLanguage(
  row: HouseInsightRow,
  language: string,
): Promise<HouseInsightReadyDto> {
  const dto = toHouseInsightDto(row);
  if (language === 'en') return dto;

  const cached = row.translations?.[language];
  if (cached) return { ...dto, ...cached };

  try {
    const translated = await translateHouseInsightContent(
      { text: row.text ?? '', strengths: row.strengths ?? [], weaknesses: row.weaknesses ?? [] },
      language,
    );
    await saveHouseInsightTranslation(row.userId, row.house, language, translated);
    return { ...dto, ...translated };
  } catch (err) {
    logger.warn(
      { err, userId: row.userId, house: row.house, language },
      'failed to translate house insight',
    );
    return dto;
  }
}
