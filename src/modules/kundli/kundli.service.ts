import crypto from 'node:crypto';
import {
  calculateChart,
  calculateVimshottariDasha,
  calculateYoginiDasha,
  detectAllYogas,
  analyzeAllDoshas,
  calculateAshtakavarga,
  calculateShadbala,
  calculateAllDivisionalChartsWithLagna,
  getCurrentSaturnLongitude,
  detectCurrentSadeSati,
} from '../../lib/astro-engine/index.js';
import { computeReducedAshtakavarga } from '../../lib/astro-engine/calculations/ashtakavarga-shodhana.js';
import {
  CALCULATION_VERSION,
  EPHEMERIS_VERSION,
  HASH_BASELINE_CALCULATION_VERSION,
  HASH_BASELINE_EPHEMERIS_VERSION,
} from '../../lib/astro-engine/version.js';
import type { ZodiacSign, Yoga } from '@aroha-astrology/shared';
import { logger } from '../../lib/logger.js';
import type { KundliRow, UserRow } from '../../db/schema.js';
import type { KundliDto } from './kundli.schemas.js';
import { findActiveUserById } from '../users/users.repo.js';
import { resolveProfileContext, type ProfileContext } from '../birth-profiles/profile-context.js';
import {
  STALE_GENERATING_MS,
  claimKundliGeneration,
  findKundliByUserId,
  markKundliFailed,
  markKundliReady,
  saveKundliContentTranslation,
} from './kundli.repo.js';
import { translateYogaDoshaContent, type KundliContent } from '../../lib/llm/kundli-content.js';
import { deleteHoroscopesForProfile } from '../horoscope/horoscope.repo.js';
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

type EngineAyanamsa =
  | 'lahiri'
  | 'raman'
  | 'krishnamurti'
  | 'true_chitra'
  | 'fagan_bradley'
  | 'yukteshwar';
type EngineHouseSystem = 'W' | 'P' | 'K' | 'E';
type EngineLunarNode = 'mean' | 'true';

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

/** Required kundli fields that are absent on the resolved profile (empty = ready to compute). */
export function missingKundliParams(profile: ProfileContext): KundliRequiredField[] {
  const missing: KundliRequiredField[] = [];
  if (!profile.displayName) missing.push('displayName');
  if (!profile.gender) missing.push('gender');
  if (!profile.dateOfBirth) missing.push('dateOfBirth');
  // An EXACT time is required: a null time OR an explicitly 'unknown' accuracy
  // both count as missing (a disclaimed time can't yield lagna/houses/dasha).
  if (!profile.timeOfBirth || profile.birthTimeAccuracy === 'unknown') missing.push('timeOfBirth');
  if (!placeIsComplete(profile.placeOfBirth)) missing.push('placeOfBirth');
  return missing;
}

/* -------------------------------------------------------------------------- */
/* Preference / timezone resolution                                            */
/* -------------------------------------------------------------------------- */

/**
 * Map the user's ayanamsa preference onto an engine-supported one.
 *
 * `preferred_ayanamsa` has offered six values since the schema was written, but
 * only three were ever honoured — `true_chitrapaksha`, `yukteshwar` and
 * `fagan_bradley` all fell silently back to Lahiri, so a user who picked one
 * got a chart that quietly ignored them. `true_chitrapaksha` now maps to the
 * engine's `true_chitra` (Swiss sid mode 27), which is the same ayanamsa under
 * its other name.
 *
 * All six stored values are now honoured. Each mode id was verified against
 * this WASM build before being mapped (see AYANAMSA_MAP's own comment for the
 * measured 1990 values) rather than trusted from documentation.
 */
function resolveAyanamsa(pref: string | null): EngineAyanamsa {
  if (pref === 'raman') return 'raman';
  if (pref === 'krishnamurti') return 'krishnamurti';
  if (pref === 'true_chitrapaksha') return 'true_chitra';
  if (pref === 'fagan_bradley') return 'fagan_bradley';
  if (pref === 'yukteshwar') return 'yukteshwar';
  return 'lahiri'; // default, and the fallback for an unrecognised stored value
}

/**
 * Map the user's lunar-node preference onto the engine.
 *
 * `undefined` (not 'mean') when unset, so the engine falls through to the
 * process default from LUNAR_NODE_TYPE rather than this function silently
 * overriding a server-wide setting with a hardcoded guess.
 */
function resolveLunarNode(pref: string | null | undefined): EngineLunarNode | undefined {
  return pref === 'true' || pref === 'mean' ? pref : undefined;
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
export function tzOffsetHours(tz: string, refDate: Date): number {
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
  /** undefined = use the server default (LUNAR_NODE_TYPE). */
  lunarNode: EngineLunarNode | undefined;
  birthHash: string;
  calculationVersion: string;
  ephemerisVersion: string;
};

/**
 * Build engine inputs from a resolved profile's birth data plus the owning
 * user's account-level engine preferences (`preferredAyanamsa`/
 * `preferredHouseSystem` remain shared across all of a user's profiles, not
 * per-profile). Returns null if ANY required parameter is missing (use
 * `missingKundliParams` to report exactly which). Exact birth time is
 * required.
 */
export function birthInputsForProfile(profile: ProfileContext, user: UserRow): BirthInputs | null {
  if (missingKundliParams(profile).length > 0) return null;

  // Guaranteed present by the check above.
  const place = profile.placeOfBirth!;
  const [year, month, day] = (profile.dateOfBirth as string).split('-').map(Number);
  if (!year || !month || !day) return null;
  const [hh, mm] = (profile.timeOfBirth as string).split(':').map(Number);
  const hour = hh ?? 0;
  const minute = mm ?? 0;

  const refDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const tzOffset = tzOffsetHours(place.tz, refDate);
  const ayanamsa = resolveAyanamsa(user.preferredAyanamsa);
  const houseSystem = resolveHouseSystem(user.preferredHouseSystem);
  const lunarNode = resolveLunarNode(user.preferredLunarNode);

  const birthHash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        d: profile.dateOfBirth,
        t: profile.timeOfBirth,
        acc: profile.birthTimeAccuracy,
        lat: place.lat,
        lon: place.lon,
        tz: place.tz,
        ayanamsa,
        houseSystem,
        // Included so switching the node preference actually regenerates the
        // chart. Safe to add: it is `undefined` for every existing user (the
        // column defaults to NULL) and JSON.stringify omits undefined keys, so
        // every stored hash is byte-identical to before this line existed — no
        // mass regeneration.
        lunarNode,
        // Birth-input drift (date/time/place/preferences) isn't the only thing
        // that can make a cached chart wrong — the ENGINE that computed it can
        // change too (a fixed bug in house/dasha/yoga math, a swapped
        // ephemeris). Folding both version tags in here means a version bump
        // makes every existing birthHash stop matching, so the next access
        // regenerates automatically — no backfill script, no cache purge. See
        // version.ts for when to bump CALCULATION_VERSION.
        //
        // `undefined` (not the version string) while still at the pre-versioning
        // baseline, so JSON.stringify omits the key entirely and every hash
        // already in the database stays byte-identical — exactly the same trick
        // `lunarNode` above relies on, and for the same reason: introducing this
        // field must not itself invalidate the whole cache. See the
        // HASH_BASELINE_* doc comment in version.ts for the full rationale.
        calculationVersion:
          CALCULATION_VERSION === HASH_BASELINE_CALCULATION_VERSION
            ? undefined
            : CALCULATION_VERSION,
        ephemerisVersion:
          EPHEMERIS_VERSION === HASH_BASELINE_EPHEMERIS_VERSION ? undefined : EPHEMERIS_VERSION,
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
    lunarNode,
    birthHash,
    calculationVersion: CALCULATION_VERSION,
    ephemerisVersion: EPHEMERIS_VERSION,
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

async function runGeneration(
  user: UserRow,
  profile: ProfileContext,
  inputs: BirthInputs,
  claimedAt: Date,
): Promise<void> {
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
      inputs.lunarNode,
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
    // Trikona + Ekadhipatya Shodhana reductions, stored alongside (never
    // instead of) the raw bhinna/sarva tables above — see
    // ashtakavarga-shodhana.ts for why the raw 337-point SAV total isn't
    // what should drive fine-grained transit judgment.
    const reducedAshtakavarga = ashtakavarga
      ? tryCompute('reducedAshtakavarga', () => computeReducedAshtakavarga(ashtakavarga, chart))
      : null;

    // Shadbala (six-fold planetary strength). Implemented and unit-tested since
    // the engine's first version but wired to NOTHING on the live path, so every
    // yoga narrated identically whether its karaka was strong or collapsing.
    // Persisted here (not recomputed per chat turn) because it is a pure
    // function of the natal chart — it can never change for a given birth.
    const shadbala = tryCompute('shadbala', () => calculateShadbala(chart));

    // Divisional charts. The engine always computed these on demand but never
    // stored them, so `chartData.divisionalCharts` arrived undefined and the
    // frontend kept its own 292-line re-implementation of the varga math to
    // fill the gap (two sources of truth for D1-D60). `WithLagna` is the shape
    // the frontend's existing `backendVargas` branch already expects, so
    // storing it switches the UI onto engine truth with no frontend change.
    const divisionalCharts = tryCompute('divisionalCharts', () =>
      calculateAllDivisionalChartsWithLagna(chart),
    );

    await markKundliReady(user.id, profile.birthProfileId, claimedAt, {
      ayanamsa: inputs.ayanamsa,
      houseSystem: inputs.houseSystem,
      nodeType: inputs.lunarNode ?? null,
      calculationVersion: inputs.calculationVersion,
      ephemerisVersion: inputs.ephemerisVersion,
      timeKnown: true,
      birthHash: inputs.birthHash,
      chartData: { ...chart, shadbala, divisionalCharts },
      dashaData: { vimshottari: dasha, yogini },
      yogaData: yogas ? { yogas } : null,
      doshaData: doshas ? (doshas as unknown as Record<string, unknown>) : null,
      ashtakavargaData: ashtakavarga ? { ...ashtakavarga, reduced: reducedAshtakavarga } : null,
    });

    // Invalidate rather than pre-generate. Horoscopes are produced on the fly
    // on first view of each period and then reused for the rest of that period,
    // so nothing should burn an LLM call for a page the user may never open.
    // But a `ready` row computed from the PRE-correction chart would otherwise
    // outlive this regeneration all the way to its next period rollover — up to
    // a year for `yearly`. Dropping the rows makes the next view a cache miss,
    // which regenerates against the chart we just wrote.
    void deleteHoroscopesForProfile(user.id, profile.birthProfileId).catch((err: unknown) => {
      logger.error({ err, userId: user.id }, 'post-kundli horoscope invalidation failed');
    });

    const readyKundli = await findKundliByUserId(user.id, profile.birthProfileId);
    if (readyKundli) {
      // No [1]-fallback: profile.unlockedHouses is already normalized to
      // number[] (never null) by resolveProfileContext, so this exactly
      // reproduces today's real production behavior for the primary
      // profile (unlockedHouses defaults to an empty array at the DB
      // level, so the old `user.unlockedHouses ?? [1]` fallback never
      // actually fired) and gives additional profiles the same starting
      // behavior — no auto-generation until deliberately unlocked.
      const unlockedHouses = profile.unlockedHouses;
      for (const house of unlockedHouses) {
        void requestHouseInsightGeneration(user.id, house, readyKundli).catch((err: unknown) => {
          logger.error({ err, userId: user.id, house }, 'post-kundli house insight trigger failed');
        });
      }
    }
  } catch (err) {
    logger.error({ err, userId: user.id }, 'kundli generation failed');
    await markKundliFailed(
      user.id,
      profile.birthProfileId,
      claimedAt,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Idempotently (re)generate a kundli for one of a user's profiles (primary
 * when `birthProfileId` is null, otherwise that additional profile). Safe to
 * call fire-and-forget and to call repeatedly — the DB claim dedupes
 * concurrent/duplicate runs and skips a kundli that is already up to date.
 * No-op when a required parameter is missing (the GET/regenerate endpoints
 * report exactly what's missing).
 */
export async function requestKundliGeneration(
  userId: string,
  birthProfileId: string | null,
): Promise<void> {
  const user = await findActiveUserById(userId);
  if (!user) return;
  const profile = await resolveProfileContext(user, birthProfileId);
  const inputs = birthInputsForProfile(profile, user);
  if (!inputs) return; // a required parameter is missing

  const claimed = await claimKundliGeneration(userId, profile.birthProfileId, inputs.birthHash);
  if (!claimed?.startedAt) return; // another run owns it, or it's already ready for this hash

  await runGeneration(user, profile, inputs, claimed.startedAt);
}

export type RegenerateResult =
  | { ok: false; missing: KundliRequiredField[] }
  | { ok: true; row: KundliRow };

/**
 * Force a (synchronous) regeneration and return the resulting row. Used by the
 * test/regenerate endpoint — it awaits generation so the caller sees the fresh
 * kundli in one request. Reports missing required parameters instead.
 */
export async function regenerateKundli(
  userId: string,
  birthProfileId: string | null,
): Promise<RegenerateResult> {
  const user = await findActiveUserById(userId);
  if (!user) return { ok: false, missing: [...KUNDLI_REQUIRED_FIELDS] };

  const profile = await resolveProfileContext(user, birthProfileId);
  const missing = missingKundliParams(profile);
  if (missing.length > 0) return { ok: false, missing };

  const inputs = birthInputsForProfile(profile, user);
  if (!inputs) return { ok: false, missing: [...KUNDLI_REQUIRED_FIELDS] };

  const claimed = await claimKundliGeneration(userId, profile.birthProfileId, inputs.birthHash, {
    force: true,
  });
  if (claimed?.startedAt) {
    await runGeneration(user, profile, inputs, claimed.startedAt);
  }

  const row = await findKundliByUserId(userId, profile.birthProfileId);
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

export async function getKundliForUser(
  userId: string,
  birthProfileId: string | null,
): Promise<KundliRow | undefined> {
  return findKundliByUserId(userId, birthProfileId);
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

function hashString(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/**
 * Language-aware DTO for yoga/dosha name+description — same translate-on-read
 * + cache-forever shape as `toHouseInsightDtoForLanguage`, with one addition:
 * `withLiveSadeSati` (inside `toKundliDto`) recomputes Sade Sati's
 * phase/description LIVE on every read (Saturn's transit keeps moving), so a
 * translation cached once could silently go stale with no other trigger to
 * invalidate it. Guard against that by hashing the current English Sade Sati
 * description alongside the cache lookup — a mismatch forces a fresh
 * translation instead of serving a stale cached phase.
 */
export async function toKundliDtoForLanguage(row: KundliRow, language: string): Promise<KundliDto> {
  const dto = await toKundliDto(row);
  if (language === 'en' || !dto.yogas || !dto.doshas) return dto;

  const doshas = dto.doshas as Record<string, Record<string, unknown> | undefined>;
  const liveSadeSatiHash = hashString(JSON.stringify(doshas.sadeSati?.description ?? ''));

  const cached = row.translations?.[language] as
    | { yogas?: unknown; doshas?: unknown; _sadeSatiHash?: string }
    | undefined;
  if (cached && cached._sadeSatiHash === liveSadeSatiHash) {
    return {
      ...dto,
      yogas: (cached.yogas as Record<string, unknown> | undefined) ?? dto.yogas,
      doshas: (cached.doshas as Record<string, unknown> | undefined) ?? dto.doshas,
    };
  }

  try {
    const content: KundliContent = {
      yogas: (dto.yogas as { yogas?: Yoga[] })?.yogas ?? [],
      doshas,
    };
    const translated = await translateYogaDoshaContent(content, language);
    await saveKundliContentTranslation(row.userId, row.birthProfileId, language, {
      yogas: { yogas: translated.yogas },
      doshas: translated.doshas,
      _sadeSatiHash: liveSadeSatiHash,
    });
    return { ...dto, yogas: { yogas: translated.yogas }, doshas: translated.doshas };
  } catch (err) {
    logger.warn(
      { err, userId: row.userId, language },
      'failed to translate kundli yoga/dosha content',
    );
    return dto;
  }
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
    await markHouseInsightReady(userId, kundli.birthProfileId, house, claimedAt, result);
  } catch (err) {
    logger.error({ err, userId, house }, 'house insight generation failed');
    await markHouseInsightFailed(
      userId,
      kundli.birthProfileId,
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
 * or a ready row already exists. `kundli.birthProfileId` (not a separate
 * parameter) identifies which profile this insight belongs to — the passed
 * `kundli` row is always the profile-scoped one the caller already resolved.
 */
export async function requestHouseInsightGeneration(
  userId: string,
  house: number,
  kundli: KundliRow,
): Promise<'generated' | 'skipped'> {
  const claimed = await claimHouseInsightGeneration(userId, kundli.birthProfileId, house);
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
    await saveHouseInsightTranslation(
      row.userId,
      row.birthProfileId,
      row.house,
      language,
      translated,
    );
    return { ...dto, ...translated };
  } catch (err) {
    logger.warn(
      { err, userId: row.userId, house: row.house, language },
      'failed to translate house insight',
    );
    return dto;
  }
}
