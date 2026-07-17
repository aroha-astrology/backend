import { FRIENDS, ENEMIES, OWN_SIGNS } from '../astro-tools/transit.js';
import { findFavorableWindows } from '../dasha-window.js';
import { buildSubPeriods } from './index.js';
import { buildYoginiAntardashas } from './dashas/yogini.js';
import { YOGINI_PLANETS } from '@aroha-astrology/shared';

export type Domain =
  | 'career'
  | 'love'
  | 'health'
  | 'children'
  | 'wealth'
  | 'education'
  | 'property'
  | 'vehicle'
  | 'siblings'
  | 'parents'
  | 'legal'
  | 'foreign'
  | 'spirituality'
  | 'business'
  | 'friends';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface DomainConfigEntry {
  /** Fact-line label shown to the model, e.g. "Progeny Window Confidence". */
  label: string;
  /** Natal houses whose lord + occupants get merged into this domain's
   * significators by the caller (chat-grounding.ts already builds house-lord/
   * occupant maps for the house-fact pass; DOMAIN_CONFIG stays chart-agnostic
   * static metadata rather than duplicating that lookup). */
  natalHouses: number[];
  /** Fixed significator planets beyond the house lord/occupants (e.g. Jupiter
   * as Putra Karaka for children, regardless of what the chart's 5th lord is). */
  staticKarakas: string[];
  /** Which slow transit is checked for "does the sky currently support this." */
  transitPlanet: 'Saturn' | 'Jupiter';
  /** Houses (from Ascendant) the transit planet triggers this domain from. */
  triggerHouses: number[];
  /** Divisional chart traditionally cross-read alongside this domain, named
   * in the reasoning text so the model knows which varga fact to cite. */
  varga: string;
}

/**
 * Domain metadata table — was a 3-way if/else hardcoded into the transit-
 * gating step below (career/love/health only), which meant any domain added
 * without also adding a matching if-branch silently scored `transitAligned`
 * as always 0, capping it at MEDIUM forever (HIGH requires all 3 points, see
 * the scoring below). Every domain now reads its own transit rule from here,
 * so adding a domain is a one-line table entry, not a new branch to remember.
 *
 * `triggerHouses` are the traditional kendra/trikona/upachaya houses for each
 * domain — a judgment call the same way the original 3-domain version's
 * lists were (career [10,11], love [2,5,7,9,11], health [6,8,12] — those
 * three are carried over unchanged).
 */
export const DOMAIN_CONFIG: Record<Domain, DomainConfigEntry> = {
  career: {
    label: 'Career Window Confidence',
    natalHouses: [10],
    staticKarakas: ['Saturn', 'Sun'],
    transitPlanet: 'Saturn',
    triggerHouses: [10, 11],
    varga: 'D10',
  },
  love: {
    label: 'Relationship Window Confidence',
    natalHouses: [7],
    staticKarakas: ['Venus'],
    transitPlanet: 'Jupiter',
    triggerHouses: [2, 5, 7, 9, 11],
    varga: 'D9',
  },
  health: {
    label: 'Health Vigilance Required',
    natalHouses: [6, 8, 12],
    staticKarakas: [],
    transitPlanet: 'Saturn',
    triggerHouses: [6, 8, 12],
    varga: 'D30',
  },
  children: {
    label: 'Progeny Window Confidence',
    natalHouses: [5],
    staticKarakas: ['Jupiter'],
    transitPlanet: 'Jupiter',
    triggerHouses: [5, 9, 11],
    varga: 'D7',
  },
  wealth: {
    label: 'Wealth Window Confidence',
    natalHouses: [2, 11],
    staticKarakas: ['Jupiter'],
    transitPlanet: 'Jupiter',
    triggerHouses: [2, 11],
    varga: 'D2',
  },
  education: {
    label: 'Education Window Confidence',
    natalHouses: [4, 5, 9],
    staticKarakas: ['Mercury'],
    transitPlanet: 'Jupiter',
    triggerHouses: [4, 5, 9],
    varga: 'D24',
  },
  property: {
    label: 'Property/Home Window Confidence',
    natalHouses: [4],
    staticKarakas: ['Mars'],
    transitPlanet: 'Saturn',
    triggerHouses: [4],
    varga: 'D4',
  },
  vehicle: {
    label: 'Vehicle Window Confidence',
    natalHouses: [4],
    staticKarakas: ['Venus'],
    transitPlanet: 'Jupiter',
    triggerHouses: [4, 11],
    varga: 'D16',
  },
  siblings: {
    label: 'Siblings Window Confidence',
    natalHouses: [3],
    staticKarakas: ['Mars'],
    transitPlanet: 'Jupiter',
    triggerHouses: [3, 11],
    varga: 'D3',
  },
  parents: {
    label: 'Parents Window Confidence',
    natalHouses: [4, 9],
    staticKarakas: ['Moon', 'Sun'],
    transitPlanet: 'Jupiter',
    triggerHouses: [4, 9, 10],
    varga: 'D12',
  },
  legal: {
    label: 'Legal/Dispute Window Confidence',
    natalHouses: [6, 7],
    staticKarakas: ['Saturn', 'Mars'],
    transitPlanet: 'Saturn',
    triggerHouses: [6, 8, 12],
    varga: 'D1',
  },
  foreign: {
    label: 'Foreign Travel/Relocation Window Confidence',
    natalHouses: [9, 12],
    staticKarakas: ['Rahu'],
    transitPlanet: 'Saturn',
    triggerHouses: [9, 12],
    varga: 'D1',
  },
  spirituality: {
    label: 'Spirituality Window Confidence',
    natalHouses: [9, 12],
    staticKarakas: ['Ketu', 'Jupiter'],
    transitPlanet: 'Jupiter',
    triggerHouses: [5, 9, 12],
    varga: 'D20',
  },
  business: {
    label: 'Business/Partnership Window Confidence',
    natalHouses: [7, 10, 11],
    staticKarakas: ['Mercury'],
    transitPlanet: 'Saturn',
    triggerHouses: [7, 10, 11],
    varga: 'D10',
  },
  friends: {
    label: 'Friendships/Community Window Confidence',
    natalHouses: [11],
    staticKarakas: ['Jupiter', 'Mercury'],
    transitPlanet: 'Jupiter',
    triggerHouses: [3, 11],
    varga: 'D1',
  },
};

// Deliberately excluded from Domain/DOMAIN_CONFIG: longevity/lifespan/death.
// The standing chat policy (scholar.ts) withholds that subject entirely; a
// Domain entry here would quietly reopen a windowed "when" answer for it.

export interface RankedWindow {
  startDate: string;
  endDate: string;
  score: number;
  level: ConfidenceLevel;
  /** Vimshottari depth (antardasha vs. pratyantardasha) — distinct from
   * `level` above (confidence tier). An antardasha period is classically a
   * bigger, more enduring period than a nested pratyantardasha sub-blip, so
   * this is the PRIMARY ranking key (see the sort below), ahead of score. */
  dashaLevel: 'antardasha' | 'pratyantardasha';
  reasoning: string[];
}

export interface DomainWindowResult {
  domain: Domain;
  /** Top 2-3 windows, STRONGEST FIRST. Empty when no favorable window was
   * found at all — the caller should state that explicitly as a fact rather
   * than staying silent (silence is what let the model invent one). */
  windows: RankedWindow[];
}

function getRelationship(planetA: string, planetB: string): 'friend' | 'enemy' | 'neutral' {
  const planetBOwnSigns = OWN_SIGNS[planetB] ?? [];
  const aFriends = FRIENDS[planetA] ?? [];
  const aEnemies = ENEMIES[planetA] ?? [];

  let isFriend = false;
  let isEnemy = false;

  for (const sign of planetBOwnSigns) {
    if (aFriends.includes(sign)) isFriend = true;
    if (aEnemies.includes(sign)) isEnemy = true;
  }

  if (isFriend && !isEnemy) return 'friend';
  if (isEnemy && !isFriend) return 'enemy';
  return 'neutral';
}

/** ~13 months — a little over Jupiter's own sign-transit cycle (~1 year).
 * Beyond this, "today's" Saturn/Jupiter sign is not a meaningful proxy for
 * the transit at the window's own (much later) start date, since Saturn
 * moves roughly one sign per 2.5 years and Jupiter roughly one per year —
 * scoring a window 8 years out against today's transit would silently credit
 * it with an alignment that has no relationship to the sky at that time. */
const TRANSIT_RELEVANCE_DAYS = 396;

function yoginiAlignment(
  dasha: Record<string, unknown> | null,
  windowStart: Date,
  significatorLords: string[],
  vimshottariLord: string,
): { aligned: boolean; reason: string } {
  const y = (dasha?.yogini ?? {}) as Record<string, unknown>;
  const yoginis = (y.yoginis ?? []) as any[];
  const activeMaha = yoginis.find(
    (m) =>
      new Date(m.startDate).getTime() <= windowStart.getTime() &&
      new Date(m.endDate).getTime() > windowStart.getTime(),
  );

  if (!activeMaha) {
    return {
      aligned: false,
      reason: 'Yogini alignment: could not determine active Yogini period.',
    };
  }

  const startYoginiIdx = YOGINI_PLANETS.indexOf(activeMaha.planet);
  const durationYears =
    (new Date(activeMaha.endDate).getTime() - new Date(activeMaha.startDate).getTime()) /
    (365.25 * 86_400_000);
  const antardashas = buildYoginiAntardashas(
    startYoginiIdx,
    new Date(activeMaha.startDate),
    durationYears,
    windowStart,
  );
  const activeAntar = antardashas.find(
    (a) =>
      new Date(a.startDate).getTime() <= windowStart.getTime() &&
      new Date(a.endDate).getTime() > windowStart.getTime(),
  );

  const yoginiLord = activeAntar ? activeAntar.planet : activeMaha.planet;
  const deity = activeAntar ? activeAntar.deity : activeMaha.deity;

  if (significatorLords.includes(yoginiLord)) {
    return {
      aligned: true,
      reason: `Yogini alignment: ${deity} period lord (${yoginiLord}) is a primary significator.`,
    };
  }
  const rel = getRelationship(yoginiLord, vimshottariLord);
  if (rel === 'friend') {
    return {
      aligned: true,
      reason: `Yogini alignment: ${deity} period lord (${yoginiLord}) is a friend to Vimshottari lord ${vimshottariLord}.`,
    };
  }
  return {
    aligned: false,
    reason: `Yogini alignment: ${deity} period lord (${yoginiLord}) is ${rel} to Vimshottari lord ${vimshottariLord}.`,
  };
}

function transitAlignment(
  domain: Domain,
  domainNatalHouses: number[],
  windowStart: Date,
  now: Date,
  ascSignIndex: number | null,
  transits: { saturnSignIndex: number | null; jupiterSignIndex: number | null },
): { aligned: boolean; reason: string } {
  if (ascSignIndex == null) {
    return { aligned: false, reason: 'Transit gating: Ascendant unknown.' };
  }
  const daysOut = (windowStart.getTime() - now.getTime()) / 86_400_000;
  if (daysOut > TRANSIT_RELEVANCE_DAYS) {
    return {
      aligned: false,
      reason: `Transit gating: window is too far out for today's transit to be a meaningful signal (not scored).`,
    };
  }

  const config = DOMAIN_CONFIG[domain];
  const transitSignIndex =
    config.transitPlanet === 'Saturn' ? transits.saturnSignIndex : transits.jupiterSignIndex;
  if (transitSignIndex == null) {
    return { aligned: false, reason: `Transit gating: ${config.transitPlanet} position unknown.` };
  }

  const houseFromAsc = ((transitSignIndex - ascSignIndex + 12) % 12) + 1;
  if (domainNatalHouses.includes(houseFromAsc) || config.triggerHouses.includes(houseFromAsc)) {
    return {
      aligned: true,
      reason: `${config.transitPlanet} transit triggers relevant houses (${houseFromAsc}).`,
    };
  }
  return {
    aligned: false,
    reason: `${config.transitPlanet} transit (house ${houseFromAsc}) does not strongly trigger this domain's houses.`,
  };
}

/**
 * Score and rank every favorable window found for a domain, strongest first
 * (was: return only the single chronologically-nearest window). Each
 * candidate window gets its own score — Vimshottari anchor (always 1 for a
 * candidate that exists) + Yogini alignment at THAT window's own start date
 * (0/1) + transit alignment, only meaningfully checked for windows within
 * ~13 months (0/1, see TRANSIT_RELEVANCE_DAYS) — then windows are ranked
 * antardasha-level before ANY pratyantardasha-level match (a bigger period
 * always outranks a nested sub-blip, regardless of score — see the sort
 * below), score desc within that tier, chronologically on a further tie.
 * Returns an empty `windows` array (not a fabricated LOW-confidence guess)
 * when nothing qualifies at all — the caller should surface that absence as
 * its own explicit fact.
 */
export function scoreDomainWindows(
  domain: Domain,
  significatorLords: string[],
  dasha: Record<string, unknown> | null,
  ascSignIndex: number | null,
  now: Date,
  transits: { saturnSignIndex: number | null; jupiterSignIndex: number | null },
  sharedSubPeriods?: Map<string, ReturnType<typeof buildSubPeriods>>,
): DomainWindowResult {
  const config = DOMAIN_CONFIG[domain];
  const candidates = findFavorableWindows(dasha, significatorLords, now, 3, 8, sharedSubPeriods);

  const scored: RankedWindow[] = candidates.map((window) => {
    const windowStart = new Date(window.startDate);
    const reasoning = [
      `Vimshottari anchor: ${window.lord} ${window.level} (within ${window.withinMahadasha} major period).`,
    ];
    let score = 1;

    const yogini = yoginiAlignment(dasha, windowStart, significatorLords, window.lord);
    reasoning.push(yogini.reason);
    if (yogini.aligned) score += 1;

    const transit = transitAlignment(
      domain,
      config.natalHouses,
      windowStart,
      now,
      ascSignIndex,
      transits,
    );
    reasoning.push(transit.reason);
    if (transit.aligned) score += 1;

    const level: ConfidenceLevel = score >= 3 ? 'HIGH' : score === 2 ? 'MEDIUM' : 'LOW';
    return {
      startDate: window.startDate,
      endDate: window.endDate,
      score,
      level,
      dashaLevel: window.level,
      reasoning,
    };
  });

  // Primary key: dasha depth — an antardasha is a classically bigger, more
  // enduring period than any pratyantardasha nested inside it, so ANY
  // antardasha-level match outranks EVERY pratyantardasha-level match,
  // regardless of score (mirrors the original single-window search's
  // "Pass 1: antardasha, Pass 2: pratyantardasha" tiering — see the
  // regression test this preserves in test/dasha-window.spec.ts's sibling
  // in test/dasha-confidence.spec.ts). Secondary: score, so the strongest
  // window within a tier still leads. Tertiary: chronological.
  scored.sort((a, b) => {
    if (a.dashaLevel !== b.dashaLevel) return a.dashaLevel === 'antardasha' ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
  });

  return { domain, windows: scored.slice(0, 3) };
}
