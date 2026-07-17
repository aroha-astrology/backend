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

import { dashaLordTransitQuality, SIGNS } from './astro-tools/index.js';
import { dateToJulianDay, calculatePlanetPositions } from './astro-engine/index.js';
import { NAKSHATRAS } from '@aroha-astrology/shared';
import { scoreDomainWindows, DOMAIN_CONFIG, type Domain } from './astro-engine/dasha-confidence.js';
import { buildSharedDashaTree } from './dasha-window.js';
import { calculateAllDivisionalChartsWithLagna } from './astro-engine/charts/divisionalCharts.js';
import type { ChartData } from '@aroha-astrology/shared';
import {
  calculateArudhaLagna,
  calculateUpapadaLagna,
  calculateAtmakaraka,
  calculateKarakamshaSignIndex,
} from './astro-engine/charts/jaiminiPoints.js';

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

interface PlanetFact {
  planet: string;
  sign: string;
  signIndex: number;
  house: number;
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
    }));
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

function currentDasha(dasha: Record<string, unknown> | null): CurrentDasha {
  const v = (dasha?.vimshottari ?? {}) as Record<string, unknown>;
  const md = v.currentMahadasha as Record<string, unknown> | undefined;
  const ad = v.currentAntardasha as Record<string, unknown> | undefined;
  const pd = v.currentPratyantardasha as Record<string, unknown> | undefined;
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
function ashtakavargaFacts(
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

  let line = `Ashtakavarga (Sarvashtakavarga bindu count per house): ${summary}.`;
  if (weak.length > 0) line += ` Structurally weak (<25 bindus): ${weak.join(', ')}.`;
  if (strong.length > 0) line += ` Structurally strong (>30 bindus): ${strong.join(', ')}.`;

  return [line];
}

/**
 * Bhinnashtakavarga (per-planet bindu strength) — how many points each
 * planet has in the house it natally occupies, the single most commonly
 * consulted per-planet AV number (self-support at its own placement).
 * `ashtakavargaFacts` above only surfaces the Sarva (total) table; this adds
 * the per-planet detail the interface already carries but nothing read.
 */
function bhinnashtakavargaFacts(
  ashtakavarga: Record<string, unknown> | null,
  planets: PlanetFact[],
): string[] {
  if (!ashtakavarga) return [];
  const bhinna = ashtakavarga.bhinna as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(bhinna)) return [];

  const lines: string[] = [];
  for (const entry of bhinna) {
    const planetName = String(entry.planet ?? '');
    const bindus = Array.isArray(entry.bindus) ? (entry.bindus as number[]) : null;
    if (!planetName || !bindus || bindus.length !== 12) continue;
    const placement = planets.find((p) => p.planet === planetName);
    if (!placement) continue;
    const ownBindus = bindus[placement.signIndex] ?? 0;
    lines.push(
      `${planetName} has ${ownBindus} Bhinnashtakavarga bindus in its own natal house (house ${placement.house}, ${placement.sign}) — self-support at its own placement`,
    );
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
 */
export function buildProfileFacts(profile: {
  gender?: string | null;
  relationshipStatus?: string | null;
  interestAreas?: string[] | null;
}): string[] {
  const facts: string[] = [];
  if (profile.gender) facts.push(`User's gender: ${profile.gender}`);
  if (profile.relationshipStatus) {
    facts.push(
      `User's relationship status: ${profile.relationshipStatus}. If single, do not assume a spouse/partner exists; if partnered, framing can reference the relationship.`,
    );
  }
  if (profile.interestAreas && profile.interestAreas.length > 0) {
    facts.push(`User's stated areas of interest: ${profile.interestAreas.join(', ')}.`);
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
  D30: 'hardships, health vulnerabilities, misfortune',
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
 * the verified formulas and what's deliberately NOT included (Varshaphala,
 * Prashna).
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
 */
export async function buildGroundingFacts(
  src: GroundingSource,
  asOfDate?: string,
  now: Date = new Date(),
): Promise<string[]> {
  const houses = getHouses(src.chart);
  const planets = getPlanets(src.chart);
  const dasha = currentDasha(src.dasha);
  const facts: string[] = [];

  // --- Date anchor, always first: survives clip() truncation (which cuts
  // from the tail), and is the single fact every temporal question depends
  // on getting right — see scholar.ts's TEMPORAL_ANCHOR for the matching
  // system-prompt instruction this reinforces.
  facts.push(
    `TODAY'S DATE: ${todayIST(now)} (IST). Any window below that ended before this date has already passed.`,
  );

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
  const sun = planetPlacement(planets, 'Sun');
  if (sun) facts.push(`Sun Sign is natally in ${sun.sign} (house ${sun.house})`);

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
    houseOccupantsMap[p.house].push(p.planet);
  }

  const transits = {
    saturnSignIndex: saturnSignIdx,
    jupiterSignIndex: jupiterSignIdx,
  };

  const sharedDashaTree = buildSharedDashaTree(src.dasha, now);

  for (const domain of Object.keys(DOMAIN_CONFIG) as Domain[]) {
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

    if (result.windows.length === 0) {
      facts.push(
        `${config.label}: NONE — no favorable Vimshottari window found for this domain's significators within the near-term dasha lookahead. Do not invent a window here; say plainly that the chart data doesn't support a specific timing answer for this.`,
      );
      continue;
    }

    const rankedText = result.windows
      .map((w, i) => {
        const tag = i === 0 ? 'STRONGEST' : `#${i + 1}`;
        return `${tag} ${w.level} (${w.reasoning.join(' ')}) approx ${w.startDate} to ${w.endDate}`;
      })
      .join(' | ');
    facts.push(`${config.label} (cross-read with ${config.varga}): ${rankedText}`);
  }

  // --- All 7 traditional doshas ---------------------------------------------
  facts.push(...doshaFacts(src.doshas));

  // --- Ashtakavarga summary ---------------------------------------------------
  facts.push(...ashtakavargaFacts(src.ashtakavarga, ascSignIndex));
  facts.push(...bhinnashtakavargaFacts(src.ashtakavarga, planets));

  // --- All 24 divisional (varga) charts --------------------------------------
  facts.push(...divisionalChartFacts(src.chart));

  // --- Chandra/Surya Kundali (Moon/Sun as 1st house) --------------------------
  facts.push(...chandraSuryaKundaliFacts(planets));

  // --- Jaimini special points (Arudha Lagna, Upapada Lagna, Karakamsha) -------
  facts.push(...jaiminiPointFacts(src.chart, ascSignIndex));

  // --- Full Gochar (all-planet live transit snapshot) -------------------------
  facts.push(...(await fullGocharFacts(ascSignIndex, asOfDate)));

  return facts;
}
