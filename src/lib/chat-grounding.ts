// =============================================================================
// Chat Grounding — comprehensive chart-fact set for the single AI astrologer
// =============================================================================
// Minimum-necessary-data discipline still applies (never the raw name/DOB/
// place, never the full planetary degree table) but the fact set is no
// longer sliced per persona: a single astrologer must be able to answer
// career, love, health, education, legal, family, and remedy questions in
// the same conversation, so every domain-relevant derived fact is surfaced
// up front and the LLM decides what's relevant to the user's question.
// The LLM's job is narration, never arithmetic — every number here comes
// from the user's already-computed, stored kundli.
// =============================================================================

import { dashaLordTransitQuality, detectDoubleTransit, SIGNS } from './astro-tools/index.js';
import { findPeriodAsOf, type RawDashaPeriod } from './astro-tools/dasha-reading.js';
import {
  dateToJulianDay,
  calculatePlanetPositions,
  getLalKitabRemedies,
  calculateShadbala,
  computePlanetStates,
  computeBhavaChalit,
  analyzeAllVakriPlanets,
} from './astro-engine/index.js';
import { NAKSHATRAS } from '@aroha-astrology/shared';
import { kpLordsForPlanets } from './astro-engine/calculations/kp-sublord.js';
import {
  baladiAvastha,
  detectGrahaYuddha,
  calculateVimsopakaBala,
} from './astro-engine/calculations/avastha.js';
import { scoreDomainWindows, DOMAIN_CONFIG, type Domain } from './astro-engine/dasha-confidence.js';
import { buildSharedDashaTree } from './dasha-window.js';
import { calculateAllDivisionalChartsWithLagna } from './astro-engine/charts/divisionalCharts.js';
import type { DailySynthesisResult } from './astro-tools/daily-synthesis.js';
import {
  evaluateSavBand,
  hasBinduMandate,
} from './astro-engine/calculations/ashtakavarga-shodhana.js';
import type { TransitEvent } from './astro-tools/transit-events.js';
import { buildKarmicProfile } from './astro-engine/lalkitab/karmicProfile.js';
import type { ChartData } from '@aroha-astrology/shared';
import {
  calculateArudhaLagna,
  calculateUpapadaLagna,
  calculateAtmakaraka,
  calculateKarakamshaSignIndex,
} from './astro-engine/charts/jaiminiPoints.js';
import { FAMILY_BRACKET_LABELS, INCOME_BRACKET_LABELS } from './chat-income.js';

/**
 * IST, not UTC — duplicated (not imported) from
 * swarm/agents/scholar.ts's identical `todayIST` to avoid a circular import
 * (scholar.ts already imports this file). Genuinely a one-line formatting
 * rule; keep both in sync if it ever changes.
 */
function todayIST(now: Date): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export interface GroundingSource {
  /** kundli.chartData — planets, houses (with lord), ascendant. */
  chart: Record<string, unknown> | null;
  /** kundli.dashaData — { vimshottari: VimshottariDasha }. */
  dasha: Record<string, unknown> | null;
  /** kundli.yogaData — { yogas: Yoga[] }. */
  yogas: Record<string, unknown> | null;
  /** kundli.doshaData — DoshaAnalysis (mangal, kaalSarp, sadeSati, pitra, kemDruma, grahan, guruChandal). */
  doshas: Record<string, unknown> | null;
  /** kundli.ashtakavargaData — AshtakavargaData ({ bhinna, sarva }). */
  ashtakavarga: Record<string, unknown> | null;
}

interface HouseFact {
  house: number;
  lord: string;
  sign: string;
}

export interface PlanetFact {
  planet: string;
  sign: string;
  signIndex: number;
  house: number;
  nakshatra: string;
  nakshatraPada: number;
  nakshatraLord: string;
  longitude: number;
  /**
   * Optional rather than required: `getPlanets` always populates it from the
   * stored chart, but several existing fixtures/callers build `PlanetFact`
   * literals by hand, and `computePlanetStates` reads it as `Boolean(...)` —
   * so an absent flag degrades to "direct motion", never to a wrong claim.
   */
  isRetrograde?: boolean;
}

function getHouses(chart: Record<string, unknown> | null): HouseFact[] {
  const houses = (chart?.houses ?? []) as Array<Record<string, unknown>>;
  return houses
    .filter((h) => h.house != null && h.lord != null)
    .map((h) => ({ house: Number(h.house), lord: String(h.lord), sign: String(h.sign ?? '') }));
}

function getPlanets(chart: Record<string, unknown> | null): PlanetFact[] {
  const planets = (chart?.planets ?? []) as Array<Record<string, unknown>>;
  return planets
    .filter((p) => p.planet != null)
    .map((p) => ({
      planet: String(p.planet),
      sign: String(p.sign ?? ''),
      signIndex: Number(p.signIndex ?? 0),
      house: Number(p.house ?? 0),
      nakshatra: String(p.nakshatra ?? ''),
      nakshatraPada: Number(p.nakshatraPada ?? 0),
      nakshatraLord: String(p.nakshatraLord ?? ''),
      longitude: Number(p.longitude ?? 0),
      isRetrograde: Boolean(p.isRetrograde),
    }));
}

/**
 * The app's UI shows "Sun Sign" as the Western tropical sign (what someone
 * means by "I'm a Cancer"), not the Vedic sidereal sign used everywhere else
 * in this chart — see `lib/kundli-helpers.ts#westernSunSign` on the frontend
 * (the two must stay in sync, or the astrologer's chat answer will contradict
 * what the user sees on screen). Derived from the sidereal longitude +
 * ayanamsaValue rather than a calendar-date table, so it's exact for cusp
 * births too. Returns undefined if ayanamsaValue is missing (older/degraded
 * charts) — callers should fall back to the sidereal sign name.
 */
function westernSunSign(
  sunLongitude: number,
  ayanamsaValue: number | undefined,
): string | undefined {
  if (typeof ayanamsaValue !== 'number') return undefined;
  const tropicalLongitude = (((sunLongitude + ayanamsaValue) % 360) + 360) % 360;
  return SIGNS[Math.floor(tropicalLongitude / 30)];
}

function houseLord(houses: HouseFact[], houseNum: number): HouseFact | undefined {
  return houses.find((h) => h.house === houseNum);
}

function planetPlacement(planets: PlanetFact[], planetName: string): PlanetFact | undefined {
  return planets.find((p) => p.planet === planetName);
}

interface CurrentDasha {
  mahadasha?: string | undefined;
  antardasha?: string | undefined;
  pratyantardasha?: string | undefined;
  mahaStart?: string | undefined;
  mahaEnd?: string | undefined;
}

/**
 * Resolves the Mahadasha/Antardasha/Pratyantardasha actually covering `asOf`
 * — NOT the `currentMahadasha`/`currentAntardasha`/`currentPratyantardasha`
 * fields on the stored dasha blob, which are frozen at whatever "now" was
 * when the kundli was generated (see kundli.service.ts's birthHash — it has
 * no time component, so a kundli is never regenerated just because time
 * moved on). Without this, the "Active Major Planetary Period" fact silently
 * goes stale the moment the user's real Antardasha rolls over — months to
 * years after the kundli was first computed, and forever after for a user
 * who never triggers a regeneration. Falls back to the frozen fields only
 * when `dasha.mahadashas` isn't present (older/degraded rows), matching
 * dasha-reading.ts's buildDashaReading, which fixed this exact bug for the
 * dasha-chapter card already.
 */
function currentDasha(dasha: Record<string, unknown> | null, asOf: Date): CurrentDasha {
  const v = (dasha?.vimshottari ?? {}) as Record<string, unknown>;

  const mahadashas = v.mahadashas as RawDashaPeriod[] | undefined;
  const md =
    (mahadashas && findPeriodAsOf(mahadashas, asOf)) ??
    (v.currentMahadasha as RawDashaPeriod | undefined);

  const mdSubPeriods = md?.subPeriods as RawDashaPeriod[] | undefined;
  const ad =
    (mdSubPeriods && findPeriodAsOf(mdSubPeriods, asOf)) ??
    (md === v.currentMahadasha ? (v.currentAntardasha as RawDashaPeriod | undefined) : undefined);

  const adSubPeriods = ad?.subPeriods as RawDashaPeriod[] | undefined;
  const pd =
    (adSubPeriods && findPeriodAsOf(adSubPeriods, asOf)) ??
    (ad === v.currentAntardasha
      ? (v.currentPratyantardasha as RawDashaPeriod | undefined)
      : undefined);

  return {
    mahadasha: md?.planet ? String(md.planet) : undefined,
    antardasha: ad?.planet ? String(ad.planet) : undefined,
    pratyantardasha: pd?.planet ? String(pd.planet) : undefined,
    mahaStart: md?.startDate ? String(md.startDate).slice(0, 10) : undefined,
    mahaEnd: md?.endDate ? String(md.endDate).slice(0, 10) : undefined,
  };
}

function currentYoginiFact(dasha: Record<string, unknown> | null): string | null {
  const y = (dasha?.yogini ?? {}) as Record<string, unknown>;
  const cy = y.currentYogini as Record<string, unknown> | undefined;
  if (!cy || !cy.planet || !cy.deity) return null;

  const antardashas = (cy.subPeriods ?? []) as Array<Record<string, unknown>>;
  const activeAntar = antardashas.find((sp) => sp.isActive);

  let fact = `Concurrent Yogini Dasha (micro-cycle confirmation): ${String(cy.deity)} (${String(cy.planet)})`;
  if (activeAntar && activeAntar.deity) {
    fact += ` → ${String(activeAntar.deity)} Yogini sub-period`;
  }
  return fact;
}

/**
 * Yoga types worth surfacing to the astrologer. Excludes 'dosha'-type yogas
 * because the 7 traditional doshas (mangal/kaalSarp/sadeSati/pitra/kemDruma/
 * grahan/guruChandal) are already surfaced explicitly via `doshaFacts` below.
 */
const RELEVANT_YOGA_TYPES = ['dhana', 'raja', 'mahapurusha', 'lunar', 'solar', 'benefic'];

/** Cap how many yoga facts get injected — some charts trip many Parivartana/
 * lunar yogas at once; the strongest ones are the most narratively useful. */
const MAX_YOGA_FACTS = 8;

/** Present yogas of a relevant type, strongest first (not house-scoped — a
 * single comprehensive astrologer needs the full picture, not a persona slice). */
function relevantYogas(yogas: Record<string, unknown> | null): string[] {
  const list = (yogas?.yogas ?? []) as Array<Record<string, unknown>>;
  return list
    .filter((y) => y.present && RELEVANT_YOGA_TYPES.includes(String(y.type)))
    .sort((a, b) => Number(b.strength ?? 0) - Number(a.strength ?? 0))
    .slice(0, MAX_YOGA_FACTS)
    .map((y) => String(y.description ?? y.name ?? ''))
    .filter(Boolean);
}

async function currentTransitSignIndex(planet: string, asOfDate?: string): Promise<number | null> {
  try {
    const dt = asOfDate ? parseDateMidday(asOfDate) : new Date();
    const jd = await dateToJulianDay(
      dt.getUTCFullYear(),
      dt.getUTCMonth() + 1,
      dt.getUTCDate(),
      dt.getUTCHours(),
      dt.getUTCMinutes(),
      0,
    );
    const positions = (await calculatePlanetPositions(jd)) as unknown as Array<
      Record<string, unknown>
    >;
    const p = positions.find((x) => x.planet === planet);
    return p ? Number(p.signIndex) : null;
  } catch {
    return null; // best-effort — a missing transit fact is fine, an invented one is not
  }
}

/**
 * Moon changes sign every ~2.25 days and nakshatra roughly daily — the only
 * fast-moving transit signal available (Saturn/Jupiter, the other transits
 * computed here, hold the same sign for months/years, so a daily/tomorrow
 * horoscope grounded only in those two plus permanent natal facts has near-
 * identical input every day and inevitably reads as a generic, evergreen
 * "tagline" rather than something tied to that specific date).
 */
async function currentTransitMoonDetail(
  asOfDate?: string,
): Promise<{ signIndex: number; nakshatraIndex: number } | null> {
  try {
    const dt = asOfDate ? parseDateMidday(asOfDate) : new Date();
    const jd = await dateToJulianDay(
      dt.getUTCFullYear(),
      dt.getUTCMonth() + 1,
      dt.getUTCDate(),
      dt.getUTCHours(),
      dt.getUTCMinutes(),
      0,
    );
    const positions = (await calculatePlanetPositions(jd)) as unknown as Array<
      Record<string, unknown>
    >;
    const p = positions.find((x) => x.planet === 'Moon');
    if (!p) return null;
    const signIndex = Number(p.signIndex);
    const nakshatraIndex =
      (p.nakshatraIndex as number | undefined) ?? Math.floor(Number(p.longitude) / (360 / 27));
    return { signIndex, nakshatraIndex };
  } catch {
    return null;
  }
}

/** Parse a YYYY-MM-DD date string to a Date at 12:00 UTC (midday avoids day-boundary issues). */
function parseDateMidday(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/**
 * Human labels for the houses covered in the comprehensive house-lord pass.
 * House 1 (self) is covered via the Ascendant fact; house 3 (siblings/
 * courage) isn't part of the requested domain set and is omitted.
 */
const HOUSE_LABELS: Record<number, string> = {
  2: 'wealth',
  4: 'home/property/vehicles',
  5: 'education/creativity',
  6: 'health',
  7: 'relationships',
  8: 'health/transformation',
  9: 'luck/father',
  10: 'career',
  11: 'gains',
  12: 'health/losses',
};

/** Present/absent facts for all 7 traditional doshas, mirroring each dosha's own computed shape. */
function doshaFacts(doshas: Record<string, unknown> | null): string[] {
  if (!doshas) return [];
  const facts: string[] = [];

  const mangal = doshas.mangal as Record<string, unknown> | undefined;
  if (mangal) {
    facts.push(
      mangal.present
        ? `Mangal Dosha: present (${String(mangal.severity)} severity, ${String(mangal.type)} type)`
        : 'Mangal Dosha: not present',
    );
  }

  const kaalSarp = doshas.kaalSarp as Record<string, unknown> | undefined;
  if (kaalSarp) {
    facts.push(
      kaalSarp.present
        ? `Kaal Sarp Dosha: present (${String(kaalSarp.name || kaalSarp.type)}, ${String(kaalSarp.severity)}${
            kaalSarp.isPartial ? ', partial' : ', full'
          })`
        : 'Kaal Sarp Dosha: not present',
    );
  }

  const sadeSati = doshas.sadeSati as Record<string, unknown> | undefined;
  if (sadeSati) {
    facts.push(
      sadeSati.active
        ? `Sade Sati: ${String(sadeSati.phase)} phase (Saturn's 7.5-year transit over the Moon sign), ${String(
            sadeSati.severity,
          )} severity — traditionally a period calling for extra care and resilience`
        : 'Sade Sati: not currently active',
    );
  }

  const pitra = doshas.pitra as Record<string, unknown> | undefined;
  if (pitra) {
    const indicators = Array.isArray(pitra.indicators) ? (pitra.indicators as string[]) : [];
    facts.push(
      pitra.present
        ? `Pitra Dosha: present (${String(pitra.severity)} severity)${
            indicators.length > 0 ? ` — ${indicators.join('; ')}` : ''
          }`
        : 'Pitra Dosha: not present',
    );
  }

  const kemDruma = doshas.kemDruma as Record<string, unknown> | undefined;
  if (kemDruma) {
    const cancellations = Array.isArray(kemDruma.cancellations)
      ? (kemDruma.cancellations as string[])
      : [];
    facts.push(
      kemDruma.present
        ? `Kemdruma Dosha: present (${String(kemDruma.severity)} severity)`
        : cancellations.length > 0
          ? `Kemdruma Dosha: not present (cancelled — ${cancellations.join('; ')})`
          : 'Kemdruma Dosha: not present',
    );
  }

  const grahan = doshas.grahan as Record<string, unknown> | undefined;
  if (grahan) {
    facts.push(
      grahan.present
        ? `Grahan Dosha: present (${String(grahan.type)}, ${String(grahan.severity)} severity)`
        : 'Grahan Dosha: not present',
    );
  }

  const guruChandal = doshas.guruChandal as Record<string, unknown> | undefined;
  if (guruChandal) {
    facts.push(
      guruChandal.present
        ? `Guru Chandal Dosha: present (house ${String(guruChandal.house)}, ${String(
            guruChandal.severity,
          )} severity)`
        : 'Guru Chandal Dosha: not present',
    );
  }

  return facts;
}

/**
 * Sarvashtakavarga (total bindu) summary, one house-indexed line. `sarva.bindus`
 * is sign-indexed (0=Aries..11=Pisces); it's remapped to house numbers via the
 * Ascendant's sign index since that's what an astrologer/user reasons in.
 * Thresholds (<25 weak, >30 strong) are the traditional rule of thumb against
 * the classical 337-point/12-house average of ~28.
 */
export function ashtakavargaFacts(
  ashtakavarga: Record<string, unknown> | null,
  ascSignIndex: number | null,
): string[] {
  if (!ashtakavarga || ascSignIndex == null) return [];
  const sarva = ashtakavarga.sarva as Record<string, unknown> | undefined;
  const bindus = Array.isArray(sarva?.bindus) ? (sarva.bindus as number[]) : null;
  if (!bindus || bindus.length !== 12) return [];

  const byHouse = Array.from({ length: 12 }, (_, signIdx) => ({
    house: ((signIdx - ascSignIndex + 12) % 12) + 1,
    bindus: Number(bindus[signIdx] ?? 0),
  })).sort((a, b) => a.house - b.house);

  const summary = byHouse.map((h) => `H${h.house}:${h.bindus}`).join(', ');
  const weak = byHouse.filter((h) => h.bindus < 25).map((h) => `House ${h.house}`);
  const strong = byHouse.filter((h) => h.bindus > 30).map((h) => `House ${h.house}`);

  let line = `Ashtakavarga (raw Sarvashtakavarga bindu count per house): ${summary}.`;
  if (weak.length > 0) line += ` Structurally weak (<25 bindus): ${weak.join(', ')}.`;
  if (strong.length > 0) line += ` Structurally strong (>30 bindus): ${strong.join(', ')}.`;

  const facts = [line];

  // Reduced (Trikona + Ekadhipatya Shodhana) SAV — the classically correct
  // basis for fine-grained house judgment; the raw table above is kept as
  // context but is not what should drive a "this house is a power center"
  // claim. Only present on kundlis generated after this reduction shipped —
  // absent on older rows, which is why this is additive rather than a
  // replacement of the raw line.
  const reduced = ashtakavarga.reduced as Record<string, unknown> | undefined;
  const reducedSarva = reduced?.sarva as Record<string, unknown> | undefined;
  const reducedBindus = Array.isArray(reducedSarva?.bindus)
    ? (reducedSarva.bindus as number[])
    : null;
  if (reducedBindus && reducedBindus.length === 12) {
    const byHouseReduced = Array.from({ length: 12 }, (_, signIdx) => ({
      house: ((signIdx - ascSignIndex + 12) % 12) + 1,
      bindus: Number(reducedBindus[signIdx] ?? 0),
    })).sort((a, b) => a.house - b.house);
    const powerCenters = byHouseReduced
      .filter((h) => evaluateSavBand(h.bindus) === 'power-center')
      .map((h) => `House ${h.house}`);
    const karmicStruggle = byHouseReduced
      .filter((h) => evaluateSavBand(h.bindus) === 'karmic-struggle')
      .map((h) => `House ${h.house}`);
    let reducedLine = `Reduced Ashtakavarga (after Trikona + Ekadhipatya Shodhana — the more accurate basis for house-strength judgment): ${byHouseReduced.map((h) => `H${h.house}:${h.bindus}`).join(', ')}.`;
    if (powerCenters.length > 0)
      reducedLine += ` Power centers (>=30, even malefics deliver good results here): ${powerCenters.join(', ')}.`;
    if (karmicStruggle.length > 0)
      reducedLine += ` Karmic-struggle zones (<=25, results demand real effort): ${karmicStruggle.join(', ')}.`;
    facts.push(reducedLine);
  }

  return facts;
}

/**
 * Bhinnashtakavarga (per-planet bindu strength) — how many points each
 * planet has in the house it natally occupies, the single most commonly
 * consulted per-planet AV number (self-support at its own placement).
 * `ashtakavargaFacts` above only surfaces the Sarva (total) table; this adds
 * the per-planet detail the interface already carries but nothing read.
 */
export function bhinnashtakavargaFacts(
  ashtakavarga: Record<string, unknown> | null,
  planets: PlanetFact[],
): string[] {
  if (!ashtakavarga) return [];
  const bhinna = ashtakavarga.bhinna as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(bhinna)) return [];

  const reducedBhinna = (ashtakavarga.reduced as Record<string, unknown> | undefined)?.bhinna as
    | Array<Record<string, unknown>>
    | undefined;

  const lines: string[] = [];
  for (const entry of bhinna) {
    const planetName = String(entry.planet ?? '');
    const bindus = Array.isArray(entry.bindus) ? (entry.bindus as number[]) : null;
    if (!planetName || !bindus || bindus.length !== 12) continue;
    const placement = planets.find((p) => p.planet === planetName);
    if (!placement) continue;
    const ownBindus = bindus[placement.signIndex] ?? 0;
    let line = `${planetName} has ${ownBindus} raw Bhinnashtakavarga bindus in its own natal house (house ${placement.house}, ${placement.sign}) — self-support at its own placement`;

    const reducedEntry = reducedBhinna?.find((b) => String(b.planet) === planetName);
    const reducedPlanetBindus = Array.isArray(reducedEntry?.bindus)
      ? (reducedEntry.bindus as number[])
      : null;
    if (reducedPlanetBindus && reducedPlanetBindus.length === 12) {
      const reducedOwnBindus = reducedPlanetBindus[placement.signIndex] ?? 0;
      const mandate = hasBinduMandate(reducedOwnBindus) ? 'has' : 'lacks';
      line += `; after Shodhana reduction this is ${reducedOwnBindus} bindus, which ${mandate} the classical mandate (>=4) to deliver favorable results when transited`;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Non-identifying user-context facts that improve narration without
 * touching the "never the name" rule — gender, relationship status, and
 * stated interest areas are all on the `users` row already, share-safe, and
 * (per the 2026-07-17 audit) were captured but never reaching the chat
 * prompt. Kept as a separate function from `buildGroundingFacts` (which
 * horoscope generation also calls) so this only affects chat, where it's
 * being added, and horoscope's existing bespoke relationship-status handling
 * in `lib/llm/horoscope.ts` is untouched.
 *
 * Split across two params, same `(profile, user)` shape as
 * `kundli.service.ts`'s `birthInputsForProfile`: `gender` is read off the
 * resolved (possibly non-primary) `profile` — if the active chat is grounded
 * on a child/partner's saved profile, the gender that belongs in the prompt
 * is THEIRS, not the account owner's. `relationshipStatus`/`interestAreas`
 * have no per-profile equivalent (not on `ProfileContext`) and stay sourced
 * from the account-level `user` row regardless of which profile is active.
 */
export function buildProfileFacts(
  profile: { gender?: string | null; birthTimeAccuracy?: string | null },
  user: {
    relationshipStatus?: string | null;
    interestAreas?: string[] | null;
    incomeBracket?: string | null;
    familyIncomeBracket?: string | null;
  },
): string[] {
  const facts: string[] = [];
  if (profile.gender) facts.push(`User's gender: ${profile.gender}`);

  // Birth-time confidence. `birthTimeAccuracy` has been collected since
  // onboarding but was only ever read as a binary `=== 'unknown'` gate (no
  // chart at all). The 'approximate' case — a chart that EXISTS but rests on a
  // remembered time — was indistinguishable from a birth-certificate time, so
  // the ascendant, the varga charts and every dasha date were narrated with
  // identical confidence. A ±30 min error moves the Lagna a whole sign and the
  // first Mahadasha by months, so the model is told to hedge exactly the
  // time-sensitive claims and nothing else.
  if (profile.birthTimeAccuracy === 'approximate') {
    facts.push(
      'BIRTH TIME CONFIDENCE: approximate (remembered, not from a record). Sign placements, dashas and yogas stay reliable, but the Ascendant, the house numbers, the divisional charts and exact dasha dates all depend on the precise minute. When the answer turns on any of THOSE, add a brief natural caveat once (e.g. "if your birth time is accurate to the minute") and prefer month/season-level timing over exact dates. Do not caveat every sentence, and never say the chart is unreliable.',
    );
  }

  if (user.relationshipStatus) {
    facts.push(
      `User's relationship status: ${user.relationshipStatus}. If single, do not assume a spouse/partner exists; if partnered, framing can reference the relationship.`,
    );
  }
  if (user.interestAreas && user.interestAreas.length > 0) {
    facts.push(`User's stated areas of interest: ${user.interestAreas.join(', ')}.`);
  }

  // Self-reported income, collected as a one-tap answer in chat (chat-income.ts).
  // Stated here so the astrologer reads money questions against the user's real
  // scale AND — just as important — never asks for it a second time: 'undisclosed'
  // is a deliberate answer, not a gap to fill.
  if (user.incomeBracket) {
    facts.push(
      user.incomeBracket === 'undisclosed'
        ? 'User chose not to share their income range. Never ask for it again; read money questions from the chart alone.'
        : `User's own monthly income bracket: ${INCOME_BRACKET_LABELS[user.incomeBracket] ?? user.incomeBracket}. Already on file — never ask for it again. Scale any money reading to this, and never repeat the figure back as if quoting a record.`,
    );
  }
  if (user.familyIncomeBracket) {
    facts.push(
      user.familyIncomeBracket === 'undisclosed'
        ? 'User chose not to share their household income range. Never ask for it again.'
        : `User's household monthly income bracket: ${FAMILY_BRACKET_LABELS[user.familyIncomeBracket] ?? user.familyIncomeBracket}. Already on file — never ask for it again.`,
    );
  }
  return facts;
}

/**
 * Short domain tags for all 24 vargas this engine computes, used only to
 * orient the astrologer on what each chart traditionally speaks to — the
 * model still reads the actual placements, this doesn't pre-interpret them.
 * D14/D21/D81/D108 are deliberately labeled "general" rather than given a
 * specific claimed domain: their classical significations are not
 * consistently sourced across texts, and asserting a confident domain for
 * them would be exactly the kind of fabricated specificity this whole fact
 * set exists to avoid.
 */
const VARGA_LABELS: Record<string, string> = {
  D1: 'body, self, physical identity',
  D2: 'wealth, financial stability, liquid assets',
  D3: 'siblings, courage, short journeys',
  D4: 'property, home, vehicles, general luck',
  D5: 'fame, authority, destiny',
  D6: 'health crises, litigation, visible enemies',
  D7: 'children, progeny, creative output',
  D8: 'longevity, sudden transformation, accidents',
  D9: 'marriage, spouse, inner strength, dharma',
  D10: 'career, profession, public status',
  D11: 'sudden windfalls or losses',
  D12: 'parents, ancestry',
  D14: 'general/auxiliary — classical domain not confidently sourced',
  D16: 'vehicles, comforts, material happiness',
  D20: 'spirituality, religious devotion',
  D21: 'general/auxiliary — classical domain not confidently sourced',
  D24: 'education, learning, higher intelligence',
  D27: 'stamina, general strength, resilience',
  D30: 'hardships, health vulnerabilities, misfortune, hidden vices and boundary-testing tendencies',
  D40: 'inherited patterns from the maternal line',
  D45: 'character, ethics, paternal-line inheritance',
  D60: 'overall karmic destiny — the most fine-grained varga, time-sensitive',
  D81: 'advanced subdivision of D9 — classical domain not confidently sourced',
  D108: 'advanced subdivision of D9 — classical domain not confidently sourced',
};

/**
 * All 24 divisional-chart (varga) facts, computed live from natal planet
 * longitudes via `calculateAllDivisionalChartsWithLagna` — chat grounding
 * previously carried only D9/D10 (hand-rolled here), so any question landing
 * on a different varga (progeny -> D7, career -> D10, health -> D30, etc.)
 * had no grounded data to draw on. The frontend already recomputes these
 * client-side for display and the backend defines the same varga math, but
 * never persists them at kundli-generation time — rather than a migration +
 * backfill, this computes all 24 on the fly from `chart.planets[].longitude`
 * (already present on every existing stored chart, old and new users alike),
 * which is pure arithmetic (no ephemeris lookup) and needs no schema change.
 * Format is deliberately compact (`Sign-Sign-...` rather than a full
 * sentence per planet) to keep 24 charts' worth of data within budget.
 */
function divisionalChartFacts(chart: Record<string, unknown> | null): string[] {
  const rawPlanets = (chart?.planets ?? []) as Array<Record<string, unknown>>;
  const asc = chart?.ascendant as Record<string, unknown> | undefined;
  const ascSignIndex = asc?.signIndex != null ? Number(asc.signIndex) : null;
  if (rawPlanets.length === 0 || ascSignIndex == null) return [];

  const withLongitude = rawPlanets
    .filter((p) => p.planet != null && p.longitude != null)
    .map((p) => ({ planet: String(p.planet), longitude: Number(p.longitude) }));
  if (withLongitude.length === 0) return [];

  const chartData = {
    planets: withLongitude,
    ascendant: { signIndex: ascSignIndex, degree: Number(asc?.degree ?? 0) },
  } as unknown as ChartData;

  const allVargas = calculateAllDivisionalChartsWithLagna(chartData);

  return Object.entries(allVargas).map(([chartKey, entry]) => {
    const label = VARGA_LABELS[chartKey] ?? 'general';
    const lagna = SIGNS[entry.ascendantSignIndex];
    const placements = entry.planets.map((p) => `${p.planet}-${p.sign}`).join(' ');
    return `${chartKey} (${label}): Lagna ${lagna} | ${placements}`;
  });
}

/**
 * Chandra Kundali (Moon chart) and Surya Kundali (Sun chart) — the D1 chart
 * re-cast with the natal Moon or Sun, rather than the Ascendant, treated as
 * the 1st house. Pure house-relabeling of already-known D1 placements (no
 * new astronomical calculation), traditionally consulted for mental/
 * emotional patterns (Chandra) and soul-purpose/vitality (Surya) alongside
 * the standard Lagna-based reading.
 */
function chandraSuryaKundaliFacts(planets: PlanetFact[]): string[] {
  const facts: string[] = [];
  for (const [label, anchorPlanet, purpose] of [
    [
      'Chandra Kundali (Moon chart)',
      'Moon',
      'mental/emotional patterns, baseline for transit timing',
    ],
    ['Surya Kundali (Sun chart)', 'Sun', "soul's inner strength, ego, vitality, public honor"],
  ] as const) {
    const anchor = planetPlacement(planets, anchorPlanet);
    if (!anchor) continue;
    const placements = planets
      .map((p) => `${p.planet}-house${((p.signIndex - anchor.signIndex + 12) % 12) + 1}`)
      .join(' ');
    facts.push(
      `${label} (${purpose}): houses recast with ${anchorPlanet} as 1st house | ${placements}`,
    );
  }
  return facts;
}

/**
 * Jaimini special points — Arudha Lagna (worldly image/reputation), Upapada
 * Lagna (marriage/spouse timing), and Karakamsha (soul purpose, via
 * Atmakaraka's D9 placement). See `astro-engine/charts/jaiminiPoints.ts` for
 * the verified formulas. Varshaphala now has its own dedicated module
 * (`astro-engine/varshphal/`); Prashna remains out of scope (not derivable
 * from birth data alone).
 */
function jaiminiPointFacts(
  chart: Record<string, unknown> | null,
  ascSignIndex: number | null,
): string[] {
  const rawPlanets = (chart?.planets ?? []) as Array<Record<string, unknown>>;
  const withLongitude = rawPlanets
    .filter((p) => p.planet != null && p.longitude != null)
    .map((p) => ({ planet: String(p.planet), longitude: Number(p.longitude) }));
  if (withLongitude.length === 0 || ascSignIndex == null) return [];

  const facts: string[] = [];

  const arudhaSignIndex = calculateArudhaLagna(ascSignIndex, withLongitude);
  facts.push(
    `Arudha Lagna (AL — worldly image, how others perceive you, material reputation): ${SIGNS[arudhaSignIndex]}`,
  );

  const upapadaSignIndex = calculateUpapadaLagna(ascSignIndex, withLongitude);
  facts.push(
    `Upapada Lagna (UL — spouse, marriage timing and quality; read alongside D9/D1 7th house): ${SIGNS[upapadaSignIndex]}`,
  );

  const atmakaraka = calculateAtmakaraka(withLongitude);
  const karakamshaSignIndex = calculateKarakamshaSignIndex(withLongitude);
  if (atmakaraka && karakamshaSignIndex != null) {
    facts.push(
      `Atmakaraka (soul-significator planet, highest degree in its sign): ${atmakaraka}. Karakamsha (Atmakaraka's D9 sign — soul's ultimate direction, spiritual/career purpose): ${SIGNS[karakamshaSignIndex]}`,
    );
  }

  return facts;
}

const GOCHAR_PLANETS = [
  'Sun',
  'Moon',
  'Mars',
  'Mercury',
  'Jupiter',
  'Venus',
  'Saturn',
  'Rahu',
  'Ketu',
];

/** Same 9 as GOCHAR_PLANETS, as a Set for the Lal Kitab natal-remedy scan (Set.has vs Array.includes). */
const CLASSICAL_NINE = new Set(GOCHAR_PLANETS);

/**
 * Full Gochar (live transit) snapshot — every planet's current sign and house
 * from the Ascendant, not just the Saturn/Jupiter sign-index checks and Moon
 * detail already computed above for scoring/daily-signal purposes. A
 * "what's the sky doing right now" question about any planet (not just the
 * three already surfaced) previously had no grounded answer.
 */
async function fullGocharFacts(ascSignIndex: number | null, asOfDate?: string): Promise<string[]> {
  if (ascSignIndex == null) return [];
  try {
    const dt = asOfDate ? parseDateMidday(asOfDate) : new Date();
    const jd = await dateToJulianDay(
      dt.getUTCFullYear(),
      dt.getUTCMonth() + 1,
      dt.getUTCDate(),
      dt.getUTCHours(),
      dt.getUTCMinutes(),
      0,
    );
    const positions = (await calculatePlanetPositions(jd)) as unknown as Array<
      Record<string, unknown>
    >;
    const label = asOfDate ? `as of ${asOfDate}` : 'currently';
    const parts = GOCHAR_PLANETS.map((name) => {
      const p = positions.find((x) => x.planet === name);
      if (!p) return null;
      const signIdx = Number(p.signIndex);
      const houseFromAsc = ((signIdx - ascSignIndex + 12) % 12) + 1;
      return `${name}-${SIGNS[signIdx]}(house${houseFromAsc})`;
    }).filter(Boolean);
    if (parts.length === 0) return [];
    return [`Full Gochar (live transit snapshot, ${label}): ${parts.join(' ')}`];
  } catch {
    return []; // best-effort — a missing transit fact is fine, an invented one is not
  }
}

/**
 * Facts derived from the deterministic daily synthesis engine
 * (astro-tools/daily-synthesis.ts's `synthesizeDailyForecast`) — the
 * authoritative score and the layers that produced it. Only the horoscope
 * pipeline currently passes a `synthesis` result (chat has no single `asOf`
 * day to score); when absent this returns no facts and grounding behaves
 * exactly as before.
 *
 * Deliberately plain-language + parenthetical Sanskrit, matching the rest of
 * this file's fact style (e.g. "Rising Sign (Ascendant)") rather than bare
 * jargon — these are input facts, not the model's output, but there's no
 * reason to make the model's translation job harder than it needs to be.
 */
export function synthesisFacts(synthesis: DailySynthesisResult | null | undefined): string[] {
  if (!synthesis) return [];
  const facts: string[] = [];

  facts.push(
    `DETERMINISTIC DAILY SCORE (computed from the classical layers below, not narrated): ${synthesis.score}/5. Your per-area scores must stay within 1 point of this — do not narrate a markedly better or worse day than this number supports.`,
  );

  // Why the score sits where it does — the Mahadasha/Antardasha/Gochara
  // hierarchy's own reasoning chain (see daily-synthesis.ts's
  // computeAggregateScore), so the narrative can say "the period's ceiling
  // is X because Y" instead of presenting the score as unexplained.
  if (synthesis.scoreReasoning.length > 0) {
    facts.push(`SCORE REASONING: ${synthesis.scoreReasoning.join(' ')}`);
  }

  const { mahadasha, antardasha } = synthesis.dashaTransit;
  if (mahadasha) {
    facts.push(
      `The major life-period lord (${mahadasha.planet}) is currently transiting ${mahadasha.transitSign} — ${mahadasha.dignity} dignity (${mahadasha.description}).`,
    );
  }
  if (antardasha) {
    facts.push(
      `The minor life-period lord (${antardasha.planet}) is currently transiting ${antardasha.transitSign} — ${antardasha.dignity} dignity (${antardasha.description}).`,
    );
  }

  if (synthesis.vedha.blockedCount > 0) {
    facts.push(
      `${synthesis.vedha.blockedCount} otherwise-favorable transit(s) today are currently obstructed (Vedha) — read those areas as blocked or delayed, not fully supportive.`,
    );
  }

  const kakshya = synthesis.kakshya as
    | { quality?: string; activeBindus?: number; total?: number }
    | undefined;
  if (kakshya?.quality) {
    facts.push(
      `Today's finer planetary sub-window quality (Kakshya): ${kakshya.quality}${
        typeof kakshya.activeBindus === 'number' && typeof kakshya.total === 'number'
          ? ` (${kakshya.activeBindus}/${kakshya.total} planets in a favorable compartment)`
          : ''
      }.`,
    );
  }

  const lunar = synthesis.lunar as { overallQuality?: string } | undefined;
  if (lunar?.overallQuality) {
    facts.push(`Today's lunar day quality (Tara Bala / Chandra Bala): ${lunar.overallQuality}.`);
  }

  const doubleTransit = synthesis.doubleTransit as
    | Array<{ house: number; sign: string }>
    | undefined;
  if (doubleTransit && doubleTransit.length > 0) {
    const houses = doubleTransit.map((d) => d.house).join(', ');
    facts.push(
      `Jupiter and Saturn are jointly aspecting house(s) ${houses} from your Moon sign today — a rare double-transit window associated with amplified, high-probability change in those life areas.`,
    );
  }

  const panchaka = synthesis.panchaka as
    | { isDangerous?: boolean; name?: string | null; danger?: string | null; safe?: string | null }
    | undefined;
  if (panchaka?.isDangerous) {
    facts.push(
      `Today falls in a Panchaka caution window${panchaka.name ? ` (${panchaka.name})` : ''}${
        panchaka.danger ? `: ${panchaka.danger}` : ''
      }${panchaka.safe ? `. Favorable instead for: ${panchaka.safe}` : ''}.`,
    );
  }

  // Never flag a challenge above without pairing it with a mitigation — see
  // synthesizeDailyForecast's remedies field (astro-tools/daily-synthesis.ts).
  for (const r of synthesis.remedies) {
    facts.push(
      `REMEDY (for: ${r.reason}): ${r.remedies.join('; ')}. Weave 1 of these into the advice for the relevant life area — do not list all of them verbatim.`,
    );
  }

  return facts;
}

/**
 * Karmic profile facts — ancestral/karmic debts (Rin), Pakka Ghar
 * (permanent-house) placements, and blind planets, from Lal Kitab's own
 * fixed-house convention (Aries always the 1st house — see
 * lalkitab/chart.ts). All three sub-modules (debts.ts, pakkaghar.ts,
 * blindPlanets.ts) existed with no caller anywhere in the codebase before
 * this wiring. `src.chart` is the stored kundli's full chartData, which
 * already carries the house/occupant fields these need (assignPlanetsToHouses
 * populates both `planet.house` and `houses[].planets` at kundli-generation
 * time), so no re-derivation from a stripped-down shape is needed here,
 * unlike divisionalChartFacts' minimal {planet, longitude} chart above.
 */
export function karmicProfileFacts(chart: Record<string, unknown> | null): string[] {
  if (!chart || !Array.isArray(chart.planets) || !Array.isArray(chart.houses)) return [];

  try {
    const profile = buildKarmicProfile(chart as unknown as ChartData);
    const facts: string[] = [];

    for (const debt of profile.presentDebts) {
      facts.push(
        `Karmic debt (${debt.type}): ${debt.indicators.join('; ')}. Remedy: ${debt.remedies[0] ?? 'see full remedy list'}.`,
      );
    }

    if (profile.blindPlanets.length > 0) {
      facts.push(
        `Lal Kitab blind planets (obstructed): ${profile.blindPlanets.map((p) => `${p.planet} (${p.isBlind ? 'full' : 'half'}, house ${p.house})`).join(', ')}.`,
      );
    }

    // Kept to just the planet list (no extra wording) to stay within the
    // CHART DATA block's char budget — this is a supporting strength note,
    // not the priority content (debts/blind planets above).
    const inOwnHouse = profile.pakkaGharPlacements.filter((p) => p.isInPakkaGhar);
    if (inOwnHouse.length > 0) {
      facts.push(`Pakka Ghar (strong): ${inOwnHouse.map((p) => p.planet).join(', ')}.`);
    }

    return facts;
  } catch {
    // Best-effort — a malformed/older chart shape should never break the
    // rest of the grounding fact set.
    return [];
  }
}

/**
 * The macro events (ingresses/stations) that actually happened WITHIN a
 * weekly/monthly/yearly period, so the LLM can narrate the period's real arc
 * instead of only ever seeing the single-day snapshot at its start date (the
 * bug this responds to: buildGroundingFacts(source, ctx.forDate) was called
 * with only the period's FIRST day, so a monthly reading was grounded on the
 * sky of the 1st and a yearly reading on Jan 1, no matter what changed
 * afterward). Stations get an explicit "intensifies" callout per the audit's
 * volatility framing — a retrograde/direct turn during the period matters
 * more than an ordinary sign change.
 */
export function periodEventFacts(
  events: TransitEvent[],
  natalMoonSignIdx: number | null,
): string[] {
  if (events.length === 0) return [];

  const lines = events.map((e) => {
    const relevantSign = e.eventType === 'ingress' ? e.toSign : e.fromSign;
    const signIndex = relevantSign ? SIGNS.indexOf(relevantSign) : -1;
    const houseFromMoon =
      natalMoonSignIdx != null && signIndex >= 0
        ? ((signIndex - natalMoonSignIdx + 12) % 12) + 1
        : null;
    const houseNote = houseFromMoon ? ` (your ${houseFromMoon}th house from the Moon)` : '';

    if (e.eventType === 'ingress') {
      return `${e.planet} moves from ${e.fromSign} into ${e.toSign} on ${e.forDate}${houseNote} — a shift in that life area's focus partway through the period.`;
    }
    const verb = e.eventType === 'retrograde' ? 'turns retrograde' : 'turns direct';
    return `${e.planet} ${verb} in ${e.fromSign} on ${e.forDate}${houseNote} — this intensifies ${e.planet}'s effect on that life area for the rest of the period.`;
  });

  return [
    `KEY EVENTS DURING THIS PERIOD (narrate the period's actual arc around these — do not just describe the sky as it was on day one): ${lines.join(' ')}`,
  ];
}

/**
 * Build the comprehensive "CHART DATA" fact lines for the single astrologer.
 * Every line is traceable to a value already present in the user's stored
 * kundli (or, for the transit lines, a planet-position calculation for
 * `asOfDate`) — nothing here is generated by an LLM.
 *
 * @param asOfDate  YYYY-MM-DD to compute transits for. Defaults to now
 *                  (used by chat). Horoscope generation passes the period's
 *                  `forDate` so daily/tomorrow/weekly get date-specific
 *                  transit context instead of always seeing "today".
 * @param now       The instant "today" means for this request. Threaded in
 *                  from the caller (rather than each of this function and
 *                  its callees independently calling `new Date()`) so every
 *                  date comparison in a single chat turn — the anchor text,
 *                  the elapsed/upcoming window filtering, the confidence
 *                  scoring — uses the exact same instant. Defaults to now.
 * @param synthesis Optional deterministic daily-synthesis result (horoscope
 *                  pipeline only) — when present, its score and layers are
 *                  surfaced as the authoritative facts above the LLM's own
 *                  per-area read (see `synthesisFacts`).
 */
/** Pure — instantaneous Jupiter+Saturn double-transit fact, or null when none of the three sign indices are known or no house is jointly aspected. */
export function buildDoubleTransitFact(
  moonSignIndex: number | null | undefined,
  saturnSignIndex: number | null | undefined,
  jupiterSignIndex: number | null | undefined,
  transitLabel: string,
): string | null {
  if (moonSignIndex == null || saturnSignIndex == null || jupiterSignIndex == null) return null;
  const doubleTransit = detectDoubleTransit(jupiterSignIndex, saturnSignIndex, moonSignIndex);
  if (doubleTransit.length === 0) return null;
  return `Jupiter+Saturn aspect house(s) ${doubleTransit.map((d) => d.house).join(', ')} from Moon sign ${transitLabel} — double-transit window, high-probability change.`;
}

/** Pure — Lal Kitab remedy fact for the first NATALLY debilitated classical (Sun-Ketu) planet found, or null when none are debilitated. */
export function buildNatalDebilitationRemedyFact(planets: PlanetFact[]): string | null {
  for (const p of planets) {
    if (!CLASSICAL_NINE.has(p.planet)) continue;
    const dignity = dashaLordTransitQuality(p.planet, p.signIndex).dignity;
    if (dignity !== 'debilitated') continue;
    const { remedies: lalKitabRemedies } = getLalKitabRemedies(p.planet as never, p.house);
    if (lalKitabRemedies.length > 0) {
      return `Lal Kitab remedy (${p.planet} debil., house ${p.house}): ${lalKitabRemedies[0]}.`;
    }
  }
  return null;
}

/**
 * Planetary condition facts: retrogression, combustion, and Shadbala strength.
 *
 * All three were already computed by this engine and none of them reached the
 * astrologer. Retrogression was persisted on every planet and simply never
 * read; combustion was buried inside the yoga detector's private strength
 * score; Shadbala was fully implemented, unit-tested, and called by nothing on
 * the live path. The result was narration that could not distinguish a
 * dignified Jupiter from a combust one — the single loudest "this reading is
 * generic" tell in classical practice.
 *
 * The closing STRENGTH RULE is the part that actually changes predictions:
 * classical Jyotish is strength-gated (a yoga delivers in proportion to its
 * ruling planet's bala), so the model is told to qualify promises rather than
 * announce every detected yoga as if it fires cleanly.
 *
 * `shadbala` is read off the stored chart when present and recomputed when it
 * isn't — kundlis generated before this became persisted (i.e. every existing
 * user) have no stored copy, and a pure function of the natal chart is safe to
 * derive on read.
 */
/**
 * One planet's reader-facing condition row — the same numbers `planetStrengthFacts`
 * below narrates, kept structured instead of joined into prose.
 *
 * `pct` is Shadbala's total as a percentage of the planet's own REQUIRED virupas,
 * which is why it is not capped at 100: 100 is the classical pass mark, not the
 * maximum. A UI rendering this must say so, or 69% reads as a defect score rather
 * than "below the minimum this planet needs".
 */
export interface PlanetStrengthRow {
  planet: string;
  /** Percentage of the classical minimum. 100 = exactly meets it. Can exceed 100. */
  pct: number;
  isStrong: boolean;
  isRetrograde: boolean;
  isCombust: boolean;
}

/**
 * The structured form of the Shadbala/retrogression/combustion block, for the
 * reader-facing PlanetStrengthCard.
 *
 * Split out of `planetStrengthFacts` (which now builds its prose from this exact
 * return value) so the numbers have one source. The alternative — parsing them
 * back out of the English prose lines on the frontend — would break the moment
 * that wording changed, and the prose is explicitly not written for the reader.
 *
 * Returns `[]` rather than throwing on a degraded chart, matching the prose path:
 * a missing card is correct, invented strength numbers are not.
 */
export function planetStrengthTable(
  chart: Record<string, unknown> | null,
  planets: PlanetFact[],
): PlanetStrengthRow[] {
  if (planets.length === 0) return [];

  const states = computePlanetStates(planets);
  const stateFor = new Map(states.map((s) => [s.planet, s]));

  const stored = chart?.shadbala;
  let shadbala: Array<Record<string, unknown>> | null = Array.isArray(stored)
    ? (stored as Array<Record<string, unknown>>)
    : null;
  if (!shadbala && chart) {
    try {
      shadbala = calculateShadbala(chart as never) as unknown as Array<Record<string, unknown>>;
    } catch {
      shadbala = null;
    }
  }
  if (!shadbala || shadbala.length === 0) return [];

  return shadbala
    .map((s) => {
      const planet = String(s.planet ?? '');
      const total = Number(s.totalVirupas ?? 0);
      const required = Number(s.requiredVirupas ?? 0);
      const st = stateFor.get(planet);
      return {
        planet,
        pct: required > 0 ? Math.round((total / required) * 100) : null,
        isStrong: Boolean(s.isStrong),
        isRetrograde: Boolean(st?.isRetrograde),
        isCombust: Boolean(st?.isCombust),
      };
    })
    .filter((s): s is PlanetStrengthRow => s.planet !== '' && s.pct != null)
    .sort((a, b) => b.pct - a.pct);
}

export function planetStrengthFacts(
  chart: Record<string, unknown> | null,
  planets: PlanetFact[],
): string[] {
  if (planets.length === 0) return [];
  const facts: string[] = [];

  // --- Retrogression + combustion + Vakri Rules Engine --------------------
  const states = computePlanetStates(planets);

  const retrograde = states.filter((s) => s.isRetrograde).map((s) => s.planet);
  if (retrograde.length > 0) {
    facts.push(
      `Retrograde (Vakri) at birth: ${retrograde.join(', ')}. In Jyotish, Vakri motion grants elevated Cheshta Bala (motional strength), giving the planet greater capacity to express its portfolio. Manifestation follows non-linear, introspective, and iterative cycles.`,
    );

    if (chart) {
      try {
        // ONE fact for every Vakri graha, not one per planet: analyzeAllVakriPlanets can
        // return up to 5 (the tara grahas), and a per-planet block pushed this past the
        // 24000-char chart-data budget — which exists so the <user_facts> reserve (dated
        // commitments accumulated over a user's lifetime) still fits under MAX_CONTEXT_CHARS.
        // See verify-chat-fix.spec.ts. Chart-specific measurements only: the three
        // interpretation layers (classical/interpretive/karmic) are generic per-planet lore
        // that scholar.ts's system prompt already tells the model how to apply.
        const vakriAnalyses = analyzeAllVakriPlanets(chart as never);
        if (vakriAnalyses.length > 0) {
          facts.push(
            `VAKRI DETAIL — ${vakriAnalyses
              .map(
                (va) =>
                  `${va.planet}: H${va.placement.house} ${va.placement.sign}, rules ${va.lordship.housesOwned.join('/')} (${va.lordship.functionalNature}), Cheshta ${va.cheshtaBala.score} Virupas (${va.cheshtaBala.level}), confidence ${va.confidence.level}`,
              )
              .join('; ')}.`,
          );
        }
      } catch {
        // Fallback gracefully if chart data is partial
      }
    }
  } else {
    facts.push('Retrograde at birth: none — every planet was in direct motion.');
  }

  const combust = states.filter((s) => s.isCombust);
  if (combust.length > 0) {
    const detail = combust.map((s) => `${s.planet} (${s.degreesFromSun}° from the Sun)`).join(', ');
    facts.push(
      `Combust (astangata — too close to the Sun to act freely): ${detail}. A combust planet's significations are weakened and absorbed by the Sun's agenda; treat any promise it rules as muted or obstructed, never as fully delivered.`,
    );
  } else {
    facts.push('Combust planets: none — no planet is burnt by the Sun in this chart.');
  }

  // --- Shadbala -------------------------------------------------------------
  // Shares `planetStrengthTable`'s rows rather than re-deriving them: a degraded
  // chart yields [] there (strength facts skipped, never faked) exactly as the
  // inline computation this replaced did.
  const ranked = planetStrengthTable(chart, planets);
  if (ranked.length === 0) return facts;

  const summary = ranked
    .map((s) => `${s.planet} ${s.pct}% (${s.isStrong ? 'strong' : 'below par'})`)
    .join(', ');

  facts.push(
    `Planetary Strength (Shadbala — 100% is the classical minimum a planet needs to deliver what it promises): ${summary}.`,
  );

  const weak = ranked.filter((s) => !s.isStrong).map((s) => s.planet);
  if (weak.length > 0) {
    facts.push(
      `STRENGTH RULE: A yoga, house promise, or dasha result only delivers in proportion to the strength of the planet that rules it. These planets are below the classical minimum: ${weak.join(', ')}. When a combination listed anywhere above is ruled by one of them — or by a combust or debilitated planet — describe the promise as present but partial, delayed, or requiring effort. Never describe it as if it fires cleanly. Do NOT quote these percentages or the word "Shadbala" to the user; let them shape how confidently you phrase the result.`,
    );
  }

  return facts;
}

/**
 * KP star/sub lords for the two points that decide the most: the Moon (which
 * KP treats as the mind and the primary significator) and the Sun.
 *
 * KP's whole claim is that the SUB LORD, not the sign or the house, decides
 * whether a promise actually fructifies — two charts identical down to the
 * nakshatra can differ here and behave completely differently. Nothing in this
 * engine computed it before.
 *
 * Deliberately limited to Moon and Sun rather than all nine: a full KP table is
 * nine lines of jargon the astrologer would have to suppress anyway, and the
 * Moon's sub lord is the one KP itself leans on hardest. Cuspal sub lords are
 * NOT emitted — those need real Placidus cusps, which the whole-sign default
 * discards (see bhavaChalit.ts), and inventing them would be confident nonsense.
 */
export function kpSubLordFacts(planets: PlanetFact[]): string[] {
  const wanted = planets.filter((p) => p.planet === 'Moon' || p.planet === 'Sun');
  if (wanted.length === 0) return [];

  const lords = kpLordsForPlanets(wanted);
  if (lords.length === 0) return [];

  const detail = lords
    .map((l) => `${l.planet}: star lord ${l.starLord}, sub lord ${l.subLord}`)
    .join('; ');

  return [
    `KP sub lords (Krishnamurti Paddhati — the sub lord is what decides whether a promise actually fructifies, and is a sharper timing signal than the Mahadasha alone): ${detail}. Where the sub lord is a planet you have already described as weak, combust or defeated, treat the timing as slipping rather than firm. Never say "KP" or "sub lord" to the user.`,
  ];
}

/**
 * Bhava Chalit — where each planet actually falls by HOUSE, as opposed to by
 * sign. Only the planets that disagree between the two reckonings are emitted:
 * on a chart with an early-degree Lagna nothing moves and this is silent, which
 * is correct — there is nothing to reconcile.
 *
 * Standard practice reads dignity and aspect from the Rasi chart but
 * house-level events from the Chalit chart. Nothing in this engine computed a
 * chalit chart at all before, so a planet at the far end of its sign was always
 * narrated in the house its SIGN implied, even when by bhava it had already
 * moved into the next (or previous) one.
 */
export function bhavaChalitFacts(
  chart: Record<string, unknown> | null,
  planets: PlanetFact[],
): string[] {
  const asc = chart?.ascendant as Record<string, unknown> | undefined;
  const ascSignIndex = Number(asc?.signIndex ?? NaN);
  const ascDegree = Number(asc?.degree ?? NaN);
  if (!Number.isFinite(ascSignIndex) || !Number.isFinite(ascDegree)) return [];

  const ascendantLongitude = ascSignIndex * 30 + ascDegree;
  const placements = computeBhavaChalit(planets, ascendantLongitude, ascSignIndex);
  const moved = placements.filter((p) => p.moved);
  if (moved.length === 0) return [];

  const detail = moved
    .map(
      (p) => `${p.planet} sits in house ${p.rasiHouse} by sign but house ${p.chalitHouse} by bhava`,
    )
    .join('; ')
    .concat('.');

  return [
    `Bhava Chalit (house chart — the Ascendant is at ${ascDegree.toFixed(1)}° of its sign, so the house boundaries do not line up with the sign boundaries): ${detail}`,
    'CHALIT RULE: read character, dignity and aspects from the sign placements above, but when the question is about an EVENT in a specific area of life (career, marriage, children, property, money), weight the bhava house for the planets just listed. Where the two disagree, say the theme is split or transitional rather than picking one and stating it flatly. Never mention "Bhava Chalit" or house numbers as jargon to the user.',
  ];
}

/**
 * Planetary condition for a chart: strength (Shadbala), retrogression,
 * combustion, and the Rasi-vs-Chalit house split — the whole "how strong and
 * how placed is each planet" block, in one call.
 *
 * Exists so chat/voice/horoscope (via `buildGroundingFacts` below) and the PAID
 * REPORTS (via reports.service.ts, which has `scores`/a chart but never touches
 * `buildGroundingFacts`) share one definition. When this first shipped only the
 * grounding path got it, which left the most expensive thing users buy as the
 * one surface still narrating every yoga as if it fires cleanly.
 */
export function chartConditionFacts(chart: Record<string, unknown> | null): string[] {
  const planets = getPlanets(chart);
  if (planets.length === 0) return [];
  return [
    ...planetStrengthFacts(chart, planets),
    ...avasthaAndWarFacts(chart, planets),
    ...kpSubLordFacts(planets),
    ...bhavaChalitFacts(chart, planets),
  ];
}

/**
 * Chart-only companion to `chartConditionFacts` — the READER-facing half of the
 * same data. `chartConditionFacts` returns prose written at the model (and which
 * must never be displayed, see its callers); this returns the structured rows a
 * UI can render.
 *
 * Exists so callers holding only a chart (reports.service.ts) don't need
 * `getPlanets`, which is private to this module.
 */
export function chartPlanetStrength(chart: Record<string, unknown> | null): PlanetStrengthRow[] {
  return planetStrengthTable(chart, getPlanets(chart));
}

/**
 * Baladi Avastha, Graha Yuddha and Vimsopaka Bala — the "is this planet in any
 * condition to use its strength" layer that sits on top of Shadbala's "how much
 * strength does it have".
 *
 * Only the states that actually change a reading are emitted: a planet in Yuva
 * (full potency) is the unremarkable case and is left out, as is a chart with
 * no planetary war. Vimsopaka is reported only for its extremes, because the
 * middle of the range says nothing a reader can act on.
 */
export function avasthaAndWarFacts(
  chart: Record<string, unknown> | null,
  planets: PlanetFact[],
): string[] {
  const facts: string[] = [];
  const raw = (chart?.planets ?? []) as Array<Record<string, unknown>>;

  // --- Baladi Avastha -------------------------------------------------------
  const weakStates: string[] = [];
  for (const p of raw) {
    const signDegree = Number(p.signDegree ?? NaN);
    const signIndex = Number(p.signIndex ?? NaN);
    if (!Number.isFinite(signDegree) || !Number.isFinite(signIndex)) continue;
    const state = baladiAvastha(signDegree, signIndex);
    if (state === 'Yuva') continue; // full potency — nothing to qualify
    weakStates.push(`${String(p.planet)} is ${state}`);
  }
  if (weakStates.length > 0) {
    facts.push(
      `Baladi Avastha (a planet's "age", which caps how much of its promise it can actually deliver — Bala/infant and Vriddha/old give about a quarter, Kumara about half, Mrita none): ${weakStates.join(', ')}. Treat these planets' results as reduced in proportion, even where their strength is otherwise fine.`,
    );
  }

  // --- Graha Yuddha ---------------------------------------------------------
  const wars = detectGrahaYuddha(raw as never);
  if (wars.length > 0) {
    facts.push(
      `Graha Yuddha (planetary war — two planets within 1° fight, and the loser is badly damaged whatever its other strengths say): ${wars
        .map((w) => `${w.winner} defeats ${w.loser} (${w.separation}° apart)`)
        .join(
          '; ',
        )}. Anything the defeated planet rules should be described as compromised or hard-won.`,
    );
  }

  // --- Vimsopaka Bala -------------------------------------------------------
  const vimsopaka = calculateVimsopakaBala(chart);
  if (vimsopaka.length > 0) {
    const strong = vimsopaka.filter((v) => v.score >= 15).map((v) => v.planet);
    const weak = vimsopaka.filter((v) => v.score < 5).map((v) => v.planet);
    if (strong.length > 0 || weak.length > 0) {
      const parts: string[] = [];
      if (strong.length > 0) parts.push(`consistently dignified: ${strong.join(', ')}`);
      if (weak.length > 0) parts.push(`consistently undignified: ${weak.join(', ')}`);
      facts.push(
        `Vimsopaka Bala (dignity held across the divisional charts, not just the main one — this is what separates a planet that only LOOKS well placed from one that holds up everywhere): ${parts.join('; ')}. A planet strong here delivers reliably across life areas; one weak here disappoints even when the main chart looks fine.`,
      );
    }
  }

  return facts;
}

/**
 * A dated window this grounding pass produced, handed back so the caller can
 * record it as a falsifiable prediction (see prediction_outcomes).
 *
 * Collected through an optional sink rather than a changed return type: this
 * function has four callers and only the ones that can attribute a window to a
 * user care. Passing nothing keeps the old behaviour exactly.
 */
export interface DomainWindowSink {
  windows: Array<{
    domain: string;
    level: string;
    startDate: string;
    endDate: string;
    dashaLevel: string;
  }>;
}

/**
 * The 5 of ~15 DOMAIN_CONFIG domains a horoscope actually narrates as its own
 * block (health/career/marriage/finance/education — see HOROSCOPE_SYSTEM's
 * STRUCTURED_JSON_RULE in lib/llm/horoscope.ts). `scope: 'periodic'` scores
 * only these; siblings/parents/legal/foreign/spirituality/business/friends/
 * property/vehicle/children have no corresponding output block and were
 * costing 2/3 of the domain-confidence pass for text nothing ever reads.
 */
const HOROSCOPE_DOMAINS: readonly Domain[] = ['health', 'career', 'love', 'wealth', 'education'];

export async function buildGroundingFacts(
  src: GroundingSource,
  asOfDate?: string,
  now: Date = new Date(),
  synthesis?: DailySynthesisResult | null,
  sink?: DomainWindowSink,
  /**
   * 'full' (default): every fact chat/voice/reports need to answer an
   * arbitrary question — unchanged.
   *
   * 'periodic': the horoscope pipeline only. Skips facts that are (a) fixed
   * for the user's entire life and (b) not something the horoscope's own
   * 6-block output ever narrates: the 24 divisional charts, Chandra/Surya
   * Kundali, per-planet Bhinnashtakavarga detail, and the Jaimini special
   * points. Also narrows the domain-confidence sweep to HOROSCOPE_DOMAINS.
   * Added 2026-08-28: measured at 107 facts / 23,675 chars for 'full' against
   * a real chart (test/verify-chat-fix.spec.ts) — of which only the Moon-
   * transit line and ~8 synthesis lines actually differ from one day to the
   * next. A daily reading was being asked to find "what's different about
   * today" inside a haystack that was ~97% identical to yesterday's, which is
   * exactly the failure mode the team had already spotted from the outside
   * (see SHOW_TOMORROW_TOGGLE's comment in the frontend). Every fact this
   * scope keeps is either day-varying or part of the natal core the six
   * category blocks are house-grounded on (categoryGrounding in
   * lib/llm/horoscope.ts); chat/voice/reports pass no third argument here and
   * are completely unaffected.
   */
  scope: 'full' | 'periodic' = 'full',
): Promise<string[]> {
  const houses = getHouses(src.chart);
  const planets = getPlanets(src.chart);
  // The reading is FOR asOfDate when the caller supplies one (horoscope's
  // period start), not necessarily the instant this function happens to run —
  // same reasoning as the transit lookups below, applied to the dasha anchor.
  const dashaAsOf = asOfDate ? parseDateMidday(asOfDate) : now;
  const dasha = currentDasha(src.dasha, dashaAsOf);
  const facts: string[] = [];

  // --- Date anchor, always first: survives clip() truncation (which cuts
  // from the tail), and is the single fact every temporal question depends
  // on getting right — see scholar.ts's TEMPORAL_ANCHOR for the matching
  // system-prompt instruction this reinforces.
  facts.push(
    `TODAY'S DATE: ${todayIST(now)} (IST). Any window below that ended before this date has already passed.`,
  );

  // --- Deterministic daily synthesis (horoscope pipeline only) -----------
  // Placed early, right after the date anchor, so it's never lost to
  // clip() truncation and the model sees the authoritative score before
  // it starts reasoning about individual layers below.
  facts.push(...synthesisFacts(synthesis));

  // --- Active dasha -----------------------------------------------------
  if (dasha.mahadasha) {
    const range =
      dasha.mahaStart && dasha.mahaEnd
        ? ` (started ${dasha.mahaStart}, ends ${dasha.mahaEnd})`
        : '';
    const antar = dasha.antardasha ? ` / ${dasha.antardasha} minor period` : '';
    const pratyantar = dasha.pratyantardasha ? ` / ${dasha.pratyantardasha} sub-minor period` : '';
    facts.push(`Active Major Planetary Period: ${dasha.mahadasha}${antar}${pratyantar}${range}`);
  }

  const yoginiFact = currentYoginiFact(src.dasha);
  if (yoginiFact) facts.push(yoginiFact);

  // --- Ascendant ----------------------------------------------------------
  const asc = src.chart?.ascendant as Record<string, unknown> | undefined;
  const ascSignIndex = asc?.signIndex != null ? Number(asc.signIndex) : null;
  if (asc?.sign) facts.push(`Rising Sign (Ascendant): ${String(asc.sign)}`);

  // --- Key yogas (all domains, strongest first) ---------------------------
  for (const y of relevantYogas(src.yogas)) facts.push(`Significant Planetary Combination: ${y}`);

  // --- House-lord + sign for the domain-relevant houses --------------------
  // 7th and 10th additionally get their lord's natal-placement dignity, as
  // those were already computed for the (former) love/career personas.
  const tenthLord = houseLord(houses, 10)?.lord;
  const seventhLord = houseLord(houses, 7)?.lord;
  for (const houseNum of [2, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const h = houseLord(houses, houseNum);
    if (!h) continue;
    facts.push(`${houseNum}th house (${HOUSE_LABELS[houseNum]}) sign: ${h.sign}, lord: ${h.lord}`);

    if (houseNum === 7 || houseNum === 10) {
      const placement = planetPlacement(planets, h.lord);
      if (placement) {
        const dignity = dashaLordTransitQuality(h.lord, placement.signIndex);
        facts.push(
          `${h.lord} (${houseNum}th lord) is natally placed in house ${placement.house} (${placement.sign}) — ${dignity.dignity} dignity`,
        );
      }
    }
  }

  // --- Natal planet placements ---------------------------------------------
  // Moon sign (Rashi) and Sun sign are two of the most fundamental facts in
  // Vedic astrology and are surfaced directly elsewhere in the app (the
  // moon-sign forecast feature, the Plain-mode ascendant/moon/sun-sign
  // pills) — stated explicitly here for the same reason Venus/Mars/Saturn/
  // Jupiter are below, rather than leaving the astrologer to infer them
  // indirectly from house-lord facts alone.
  const moon = planetPlacement(planets, 'Moon');
  if (moon) facts.push(`Moon Sign (Rashi) is natally in ${moon.sign} (house ${moon.house})`);
  // Janma Nakshatra (birth star) — computed and stored on every kundli but
  // was previously dropped by getPlanets() above; only the transiting Moon's
  // CURRENT nakshatra was ever surfaced (see the transit block below), never
  // the user's own birth star, even though it's fundamental to identity,
  // emotional temperament, and synastry/matchmaking questions.
  if (moon?.nakshatra) {
    facts.push(
      `Janma Nakshatra (birth star) is ${moon.nakshatra}, pada ${moon.nakshatraPada}, ruled by ${moon.nakshatraLord}`,
    );
  }
  const sun = planetPlacement(planets, 'Sun');
  if (sun) {
    facts.push(
      `Sun Sign (Vedic sidereal, used for all astrological analysis) is natally in ${sun.sign} (house ${sun.house})`,
    );
    // The app's UI shows the Western tropical Sun sign specifically (see the
    // helper doc comment above) — surfaced separately so a casual "what's my
    // sun sign / zodiac sign" question gets the same answer the user sees on
    // screen, without the astrologer using the tropical sign for any actual
    // Vedic reasoning (dignity, yogas, etc. all stay sidereal, above).
    const ayanamsaValue =
      typeof src.chart?.ayanamsaValue === 'number' ? src.chart.ayanamsaValue : undefined;
    const tropicalSunSign = westernSunSign(sun.longitude, ayanamsaValue);
    if (tropicalSunSign && tropicalSunSign !== sun.sign) {
      facts.push(
        `If the user casually asks "what's my sun sign" or "what's my zodiac sign" (the popular Western meaning), answer ${tropicalSunSign} — that is the Western tropical sign this app displays for that specific question, distinct from the Vedic sidereal Sun Sign above.`,
      );
    }
  }

  const venus = planetPlacement(planets, 'Venus');
  if (venus) {
    const dignity = dashaLordTransitQuality('Venus', venus.signIndex);
    facts.push(
      `Venus is natally in ${venus.sign} (house ${venus.house}) — ${dignity.dignity} dignity`,
    );
  }
  const mars = planetPlacement(planets, 'Mars');
  if (mars) facts.push(`Mars is natally in house ${mars.house} (${mars.sign})`);
  const saturnNatal = planetPlacement(planets, 'Saturn');
  if (saturnNatal)
    facts.push(`Saturn is natally in house ${saturnNatal.house} (${saturnNatal.sign})`);
  const jupiterNatal = planetPlacement(planets, 'Jupiter');
  if (jupiterNatal)
    facts.push(`Jupiter is natally in house ${jupiterNatal.house} (${jupiterNatal.sign})`);

  // --- Transits as of the target date (timing signals, not persona-gated) --
  const transitLabel = asOfDate ? `as of ${asOfDate}` : 'currently';
  const saturnSignIdx = await currentTransitSignIndex('Saturn', asOfDate);
  const jupiterSignIdx = await currentTransitSignIndex('Jupiter', asOfDate);

  // --- Double transit (Jupiter + Saturn jointly aspecting a house from Moon)
  // Instantaneous only (cheap — reuses the signs just fetched above); the
  // forward-scanning window search (astro-tools/double-transit.ts) is NOT
  // run here to keep this hot, streaming-latency-critical path fast — that
  // scan is for a bounded, on-demand surface, not every chat turn.
  const doubleTransitFact = buildDoubleTransitFact(
    moon?.signIndex,
    saturnSignIdx,
    jupiterSignIdx,
    transitLabel,
  );
  if (doubleTransitFact) facts.push(doubleTransitFact);

  // --- Lal Kitab remedy for the worst NATALLY debilitated classical planet -
  // Reuses the same 108-combination remedy database wired into GET
  // /v1/remedies and the daily reading's Dasha-lord remedy — dignity here is
  // the NATAL placement, not a live transit, so this is stable across a
  // whole conversation rather than changing turn to turn. Capped to one
  // (the char-budget for this whole block is tight; the daily-synthesis
  // reading is where the exhaustive per-planet remedy list lives).
  const debilitationRemedyFact = buildNatalDebilitationRemedyFact(planets);
  if (debilitationRemedyFact) facts.push(debilitationRemedyFact);

  if (ascSignIndex != null) {
    const moonTransit = await currentTransitMoonDetail(asOfDate);
    if (moonTransit) {
      const moonHouseFromAsc = ((moonTransit.signIndex - ascSignIndex + 12) % 12) + 1;
      facts.push(
        `Moon is ${transitLabel} transiting ${SIGNS[moonTransit.signIndex]} in ${
          NAKSHATRAS[moonTransit.nakshatraIndex] ?? 'an unknown'
        } lunar mansion, your ${moonHouseFromAsc}th house from the Rising Sign — this is the fastest-moving daily signal (changes sign every ~2.25 days, lunar mansion roughly daily) and should anchor what's distinctive about THIS specific date versus other days`,
      );
    }
  }

  // --- Confidence Scoring Engine — every life domain, ranked best-first -----
  // Was hardcoded to 3 domains (career/love/health); a childbirth question
  // hit this with zero data because 'children' didn't exist as a domain at
  // all — see DOMAIN_CONFIG in dasha-confidence.ts. `buildSharedDashaTree`
  // builds the (expensive, forceFullDepth) sub-period tree once for this
  // request and every domain below reuses it, instead of rebuilding it once
  // per domain (14x the cost otherwise, on the streaming-latency-critical
  // chat path).
  const houseLordsMap: Record<number, string> = {};
  for (const h of houses) houseLordsMap[h.house] = h.lord;

  const houseOccupantsMap: Record<number, string[]> = {};
  for (const p of planets) {
    if (!houseOccupantsMap[p.house]) houseOccupantsMap[p.house] = [];

    houseOccupantsMap[p.house]!.push(p.planet);
  }

  const transits = {
    saturnSignIndex: saturnSignIdx,
    jupiterSignIndex: jupiterSignIdx,
  };

  const sharedDashaTree = buildSharedDashaTree(src.dasha, now);

  const domainsToScore =
    scope === 'periodic' ? HOROSCOPE_DOMAINS : (Object.keys(DOMAIN_CONFIG) as Domain[]);
  for (const domain of domainsToScore) {
    const config = DOMAIN_CONFIG[domain];
    const houseLords = config.natalHouses.map((h) => houseLordsMap[h]).filter(Boolean) as string[];
    const houseOccupants = config.natalHouses.flatMap((h) => houseOccupantsMap[h] ?? []);
    const significators = [...new Set([...houseLords, ...config.staticKarakas, ...houseOccupants])];

    const result = scoreDomainWindows(
      domain,
      significators,
      src.dasha,
      ascSignIndex,
      now,
      transits,
      sharedDashaTree,
    );

    // Only the STRONGEST window per domain is recorded. Capturing every ranked
    // window would multiply rows by 15 domains on every single chat turn, and
    // the top-ranked one is the claim the narration actually leans on.
    const strongest = result.windows[0];
    if (sink && strongest) {
      sink.windows.push({
        domain,
        level: strongest.level,
        startDate: strongest.startDate,
        endDate: strongest.endDate,
        dashaLevel: strongest.dashaLevel,
      });
    }

    if (result.windows.length === 0) {
      facts.push(
        `${config.label}: NONE — no favorable Vimshottari window found for this domain's significators within the near-term dasha lookahead. Do not invent a window here; say plainly that the chart data doesn't support a specific timing answer for this.`,
      );
      continue;
    }

    const rankedText = result.windows
      .map((w, i) => {
        const tag = i === 0 ? 'STRONGEST' : `#${i + 1}`;
        // A window that is running RIGHT NOW has a start date in the past, and the model is
        // separately (and correctly) told never to present an elapsed window as upcoming
        // (scholar.ts PAST_IS_FOR_VERIFICATION_ONLY / TEMPORAL_ANCHOR). Without this marker it
        // reads the past start date, discards the live window, and answers with the next one —
        // years out. Say plainly that it is open today.
        const dates =
          new Date(w.startDate) <= now
            ? `ACTIVE NOW, open since ${w.startDate} and running to ${w.endDate}`
            : `approx ${w.startDate} to ${w.endDate}`;
        return `${tag} ${w.level} (${w.reasoning.join(' ')}) ${dates}`;
      })
      .join(' | ');
    facts.push(`${config.label} (cross-read with ${config.varga}): ${rankedText}`);
  }

  // --- Planetary condition: strength, retrograde, combust, Bhava Chalit -----
  // Placed BEFORE the doshas/yogas detail so the model reads how strong each
  // planet is before it reads what each planet promises. Same function the
  // paid reports call, so the two can never diverge.
  facts.push(...chartConditionFacts(src.chart));

  // --- All 7 traditional doshas ---------------------------------------------
  facts.push(...doshaFacts(src.doshas));

  // --- Ashtakavarga summary ---------------------------------------------------
  facts.push(...ashtakavargaFacts(src.ashtakavarga, ascSignIndex));

  // --- Lal Kitab karmic profile (Rin debts, Pakka Ghar, blind planets) -------
  facts.push(...karmicProfileFacts(src.chart));

  // The following four sections are fixed for the user's entire life AND have
  // no corresponding block in the horoscope's own output (see HOROSCOPE_DOMAINS'
  // doc comment above) — skipped under 'periodic' scope, kept for 'full'
  // (chat/voice/reports, which must be able to answer a direct question about
  // any of them).
  if (scope === 'full') {
    facts.push(...bhinnashtakavargaFacts(src.ashtakavarga, planets));

    // --- All 24 divisional (varga) charts ------------------------------------
    facts.push(...divisionalChartFacts(src.chart));

    // --- Chandra/Surya Kundali (Moon/Sun as 1st house) -----------------------
    facts.push(...chandraSuryaKundaliFacts(planets));

    // --- Jaimini special points (Arudha Lagna, Upapada Lagna, Karakamsha) ----
    facts.push(...jaiminiPointFacts(src.chart, ascSignIndex));
  }

  // --- Full Gochar (all-planet live transit snapshot) -------------------------
  facts.push(...(await fullGocharFacts(ascSignIndex, asOfDate)));

  return facts;
}
