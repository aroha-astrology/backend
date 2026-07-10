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
import { findFavorableWindow } from './dasha-window.js';
import { NAKSHATRAS } from '@aroha-astrology/shared';

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
  mahaStart?: string | undefined;
  mahaEnd?: string | undefined;
}

function currentDasha(dasha: Record<string, unknown> | null): CurrentDasha {
  const v = (dasha?.vimshottari ?? {}) as Record<string, unknown>;
  const md = v.currentMahadasha as Record<string, unknown> | undefined;
  const ad = v.currentAntardasha as Record<string, unknown> | undefined;
  return {
    mahadasha: md?.planet ? String(md.planet) : undefined,
    antardasha: ad?.planet ? String(ad.planet) : undefined,
    mahaStart: md?.startDate ? String(md.startDate).slice(0, 10) : undefined,
    mahaEnd: md?.endDate ? String(md.endDate).slice(0, 10) : undefined,
  };
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
 * Build the comprehensive "CHART DATA" fact lines for the single astrologer.
 * Every line is traceable to a value already present in the user's stored
 * kundli (or, for the transit lines, a planet-position calculation for
 * `asOfDate`) — nothing here is generated by an LLM.
 *
 * @param asOfDate  YYYY-MM-DD to compute transits for. Defaults to now
 *                  (used by chat). Horoscope generation passes the period's
 *                  `forDate` so daily/tomorrow/weekly get date-specific
 *                  transit context instead of always seeing "today".
 */
export async function buildGroundingFacts(
  src: GroundingSource,
  asOfDate?: string,
): Promise<string[]> {
  const houses = getHouses(src.chart);
  const planets = getPlanets(src.chart);
  const dasha = currentDasha(src.dasha);
  const facts: string[] = [];

  // --- Active dasha -----------------------------------------------------
  if (dasha.mahadasha) {
    const range =
      dasha.mahaStart && dasha.mahaEnd
        ? ` (started ${dasha.mahaStart}, ends ${dasha.mahaEnd})`
        : '';
    const antar = dasha.antardasha ? ` / ${dasha.antardasha} Antardasha` : '';
    facts.push(`Active Dasha: ${dasha.mahadasha} Mahadasha${antar}${range}`);
  }

  // --- Ascendant ----------------------------------------------------------
  const asc = src.chart?.ascendant as Record<string, unknown> | undefined;
  const ascSignIndex = asc?.signIndex != null ? Number(asc.signIndex) : null;
  if (asc?.sign) facts.push(`Ascendant: ${String(asc.sign)}`);

  // --- Key yogas (all domains, strongest first) ---------------------------
  for (const y of relevantYogas(src.yogas)) facts.push(`Relevant Yoga: ${y}`);

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
  if (saturnSignIdx != null) {
    const q = dashaLordTransitQuality('Saturn', saturnSignIdx);
    facts.push(
      `Saturn is ${transitLabel} transiting ${SIGNS[saturnSignIdx]} — ${q.dignity} dignity (career timing signal)`,
    );
  }

  if (ascSignIndex != null) {
    const jupiterSignIdx = await currentTransitSignIndex('Jupiter', asOfDate);
    if (jupiterSignIdx != null) {
      const houseFromAsc = ((jupiterSignIdx - ascSignIndex + 12) % 12) + 1;
      const favorable = [2, 5, 7, 9, 11].includes(houseFromAsc);
      facts.push(
        `Jupiter is ${transitLabel} transiting your ${houseFromAsc}th house from the Ascendant — ${
          favorable
            ? 'traditionally favorable for relationship/marriage timing'
            : 'not one of the classic favorable houses for relationship timing right now'
        }`,
      );
    }

    const moonTransit = await currentTransitMoonDetail(asOfDate);
    if (moonTransit) {
      const moonHouseFromAsc = ((moonTransit.signIndex - ascSignIndex + 12) % 12) + 1;
      facts.push(
        `Moon is ${transitLabel} transiting ${SIGNS[moonTransit.signIndex]} in ${
          NAKSHATRAS[moonTransit.nakshatraIndex] ?? 'an unknown'
        } nakshatra, your ${moonHouseFromAsc}th house from the Ascendant — this is the fastest-moving daily signal (changes sign every ~2.25 days, nakshatra roughly daily) and should anchor what's distinctive about THIS specific date versus other days`,
      );
    }
  }

  // --- Active dasha lord significance (career / love / health windows) -----
  const activeLords = [...new Set([dasha.mahadasha, dasha.antardasha].filter(Boolean))] as string[];
  const tenthOccupants = planets.filter((p) => p.house === 10).map((p) => p.planet);
  const seventhOccupants = planets.filter((p) => p.house === 7).map((p) => p.planet);
  const sixEightTwelveLords = [6, 8, 12]
    .map((h) => houseLord(houses, h)?.lord)
    .filter((l): l is string => Boolean(l));
  const sixEightTwelveOccupants = planets
    .filter((p) => [6, 8, 12].includes(p.house))
    .map((p) => p.planet);

  for (const lord of activeLords) {
    const careerRole =
      lord === tenthLord
        ? '10th house lord'
        : tenthOccupants.includes(lord)
          ? 'natally placed in the 10th house'
          : null;
    if (careerRole) {
      facts.push(
        `Currently active dasha lord ${lord} is also the ${careerRole} — a traditionally significant window for career matters`,
      );
    }

    const loveRole =
      lord === seventhLord
        ? '7th house lord'
        : lord === 'Venus'
          ? 'natural relationship significator'
          : seventhOccupants.includes(lord)
            ? 'natally placed in the 7th house'
            : null;
    if (loveRole) {
      facts.push(
        `Currently active dasha lord ${lord} is also the ${loveRole} — a traditionally significant window for relationship/marriage matters`,
      );
    }

    if (sixEightTwelveLords.includes(lord) || sixEightTwelveOccupants.includes(lord)) {
      facts.push(
        `Currently active dasha lord (${lord}) is linked to the 6th/8th/12th houses — traditionally a period to pay closer attention to health`,
      );
    }
  }

  // --- All 7 traditional doshas ---------------------------------------------
  facts.push(...doshaFacts(src.doshas));

  // --- Ashtakavarga summary ---------------------------------------------------
  facts.push(...ashtakavargaFacts(src.ashtakavarga, ascSignIndex));

  // --- Forward-looking favorable dasha windows -------------------------------
  // Unlike the "currently active dasha lord" checks above (which can only say
  // "now is/isn't aligned"), this walks the *future* mahadasha→antardasha→
  // pratyantardasha timeline to answer "when" — e.g. marriage-timing
  // questions get an actual projected date range, not just a present/absent
  // read. Never fabricates: findFavorableWindow returns undefined (and no
  // fact is added) if nothing matches within its lookahead.
  const now = new Date();

  const marriageLords = [
    ...new Set([seventhLord, 'Venus', ...seventhOccupants].filter(Boolean)),
  ] as string[];
  const marriageWindow = findFavorableWindow(src.dasha, marriageLords, now);
  if (marriageWindow) {
    facts.push(
      `Nearest traditionally favorable window for marriage: ${marriageWindow.lord} ${marriageWindow.level} (within ${marriageWindow.withinMahadasha} Mahadasha), approx ${marriageWindow.startDate} to ${marriageWindow.endDate}`,
    );
  }

  const careerLords = [
    ...new Set([tenthLord, 'Saturn', ...tenthOccupants].filter(Boolean)),
  ] as string[];
  const careerWindow = findFavorableWindow(src.dasha, careerLords, now);
  if (careerWindow) {
    facts.push(
      `Nearest traditionally favorable window for career growth: ${careerWindow.lord} ${careerWindow.level} (within ${careerWindow.withinMahadasha} Mahadasha), approx ${careerWindow.startDate} to ${careerWindow.endDate}`,
    );
  }

  const healthLords = [...new Set([...sixEightTwelveLords, ...sixEightTwelveOccupants])];
  const healthWindow = findFavorableWindow(src.dasha, healthLords, now);
  if (healthWindow) {
    facts.push(
      `Nearest period traditionally calling for extra health care: ${healthWindow.lord} ${healthWindow.level} (within ${healthWindow.withinMahadasha} Mahadasha), approx ${healthWindow.startDate} to ${healthWindow.endDate}`,
    );
  }

  return facts;
}
