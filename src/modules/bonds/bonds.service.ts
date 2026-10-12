// =============================================================================
// Aroha Bonds (roadmap step 7, ships off)
// =============================================================================
// How the account owner's chart and each saved person's chart meet:
//   compatibility  Guna Milan (Ashtakoota /36) for partners and spouses; for
//                  everyone else a 0-100 harmony score from the same classical
//                  pieces that aren't about marriage (Moon-lord friendship,
//                  Bhakoot, Tara).
//   phase          the running dasha lords of BOTH people and how tied they
//                  are to the house this bond lives in (7th partner, 4th/9th
//                  mother/father, 5th child, 3rd sibling, 11th friend ... the
//                  full list is BOND_HOUSES below), plus Saturn/Rahu/Ketu/
//                  Jupiter moving through it (from the owner's Moon).
// Guna Milan is kept for a marriage or one that may come (partner, fiance,
// spouse, prospective match); every other bond gets the harmony score.
// Each bond also carries the detail: the next few sub-periods for it, how the
// two of you communicate, dates to keep in mind. Aroha Pass only: without a
// live Pass both routes answer PASS_REQUIRED. Rule-based, no AI.
// =============================================================================

import type { ChartData, Planet } from '@aroha-astrology/shared';
import { PLANET_ENEMIES, PLANET_FRIENDS, SIGN_LORDS, ZODIAC_SIGNS } from '@aroha-astrology/shared';
import type { BirthProfileRow, KundliRow, UserRow } from '../../db/schema.js';
import { passEntitlement, requirePass } from '../../lib/entitlements.js';
import { Errors } from '../../lib/errors.js';
import { calculateChart } from '../../lib/astro-engine/calculations/planetPositions.js';
import { calculateVimshottariDasha } from '../../lib/astro-engine/dashas/vimshottari.js';
import {
  dashaPeriodsInRange,
  type StoredMahadasha,
} from '../../lib/astro-engine/dashas/dasha-range.js';
import { detectMangalDosha } from '../../lib/astro-engine/doshas/mangalDosha.js';
import { calculateAshtakoota } from '../../lib/astro-engine/matching/ashtakoota.js';
import {
  buildChartContext,
  houseFrom,
  type ChartContext,
} from '../../lib/intelligence/chart-context.js';
import { housesRuledBy, placementEffect } from '../../lib/intelligence/why.js';
import type { WhyFactor } from '../../lib/intelligence/types.js';
import {
  findOwnedBirthProfile,
  listBirthProfilesByOwner,
} from '../birth-profiles/birth-profiles.repo.js';
import { resolveProfileContext, type ProfileContext } from '../birth-profiles/profile-context.js';
import { resolveFeaturesForUser } from '../features/features.service.js';
import { findKundliByUserId } from '../kundli/kundli.repo.js';
import { findActiveUserById } from '../users/users.repo.js';
import { birthInputsForProfile } from '../kundli/kundli.service.js';
import {
  bondCategory,
  isMarriageTrack,
  type BondCategory,
  type Relationship,
} from './bond-types.js';

export {
  bondCategory,
  isMarriageTrack,
  isRomantic,
  type BondCategory,
  type Relationship,
} from './bond-types.js';

const MAX_BONDS = 12;
const MS_PER_DAY = 86_400_000;
const UPCOMING_YEARS = 3;

type Gender = BirthProfileRow['gender'];

/** The houses and karakas a bond lives in, in each person's own chart. */
export interface BondSpec {
  houses: number[];
  karakas: Planet[];
  theirHouses: number[];
  theirKarakas: Planet[];
  /** Score it with Guna Milan (marriage matching) rather than the general harmony score. */
  guna: boolean;
}

/**
 * Where a bond sits in each chart. A parent is the 4th (mother) or 9th
 * (father) house from the child, and the child is the 5th from the parent, so
 * the two sides of a parent-child bond read different houses. A parent whose
 * gender isn't on file is read from both the 4th and the 9th.
 */
export function bondSpec(relationship: Relationship | null, other: Gender, self: Gender): BondSpec {
  const parentOf = (g: Gender) =>
    g === 'female'
      ? { houses: [4], karakas: ['Moon'] as Planet[] }
      : g === 'male'
        ? { houses: [9], karakas: ['Sun'] as Planet[] }
        : { houses: [4, 9], karakas: ['Moon', 'Sun'] as Planet[] };
  const guna = isMarriageTrack(relationship);
  if (relationship === 'child') {
    const me = parentOf(self);
    return {
      houses: [5],
      karakas: ['Jupiter'],
      theirHouses: me.houses,
      theirKarakas: me.karakas,
      guna,
    };
  }
  if (relationship === 'parent') {
    const them = parentOf(other);
    return {
      houses: them.houses,
      karakas: them.karakas,
      theirHouses: [5],
      theirKarakas: ['Jupiter'],
      guna,
    };
  }
  const [mine, theirs] = BOND_HOUSES[relationship ?? 'other'];
  const side = theirs ?? mine;
  return {
    houses: mine.houses,
    karakas: mine.karakas,
    theirHouses: side.houses,
    theirKarakas: side.karakas,
    guna,
  };
}

interface BondSide {
  houses: number[];
  karakas: Planet[];
}

/**
 * The house and significator each bond is read from: the owner's chart first,
 * then the other person's when the two sides differ. Parent and child are
 * worked out in bondSpec because they depend on gender.
 *
 * Classical house meanings and derived houses (counting from the house of the
 * person the bond runs through):
 *   7th  spouse, partners          5th  romance, children, creative work
 *   3rd  siblings, effort, short trips    9th  fortune, long journeys
 *   11th friends, gains            4th  home, mother
 *   10th work, authority           6th  service, employees, rivals
 *   8th  another's money, what is hidden   12th what lies beyond the everyday
 *   mother-in-law = 4th from the 7th = 10th
 *   father-in-law = 9th from the 7th = 3rd
 *   a child's spouse = 7th from the 5th = 11th
 * Which modern label goes with which house (a situationship in the 5th, a
 * soulmate in the 9th and 12th ...) is Aroha's own reading.
 */
const BOND_HOUSES: Record<Exclude<Relationship, 'parent' | 'child'>, [BondSide, BondSide?]> = {
  // Romance
  partner: [{ houses: [7], karakas: ['Venus'] }],
  fiance: [{ houses: [7], karakas: ['Venus'] }],
  spouse: [{ houses: [7], karakas: ['Venus'] }],
  prospective_match: [{ houses: [7], karakas: ['Venus'] }],
  situationship: [{ houses: [5], karakas: ['Venus', 'Rahu'] }],
  crush: [{ houses: [5], karakas: ['Venus'] }],
  first_love: [{ houses: [5], karakas: ['Moon'] }],
  fwb: [{ houses: [11, 8], karakas: ['Venus', 'Mars'] }],
  soulmate: [{ houses: [9, 12], karakas: ['Jupiter', 'Ketu'] }],
  ex: [{ houses: [7], karakas: ['Venus', 'Ketu'] }],
  // Work and money. A manager and an employee are the two ends of one bond:
  // the one who reports reads the 10th (Sun), the one in charge reads the 6th (Saturn).
  business_partner: [{ houses: [7, 10], karakas: ['Mercury'] }],
  manager: [
    { houses: [10], karakas: ['Sun'] },
    { houses: [6], karakas: ['Saturn'] },
  ],
  employee: [
    { houses: [6], karakas: ['Saturn'] },
    { houses: [10], karakas: ['Sun'] },
  ],
  colleague: [{ houses: [10, 3], karakas: ['Mercury'] }],
  // The one funded reads the 8th (another's money); the investor reads the 5th (what they stake).
  investor: [
    { houses: [8], karakas: ['Jupiter'] },
    { houses: [5], karakas: ['Jupiter'] },
  ],
  competitor: [{ houses: [6], karakas: ['Mars'] }],
  // Family
  sibling: [{ houses: [3], karakas: ['Mars'] }],
  cousin: [{ houses: [3], karakas: ['Mars'] }],
  mother_in_law: [
    { houses: [10], karakas: ['Moon', 'Saturn'] },
    { houses: [11], karakas: ['Jupiter'] },
  ],
  father_in_law: [
    { houses: [3], karakas: ['Sun', 'Saturn'] },
    { houses: [11], karakas: ['Jupiter'] },
  ],
  // Friends and shared activities
  friend: [{ houses: [11], karakas: ['Mercury'] }],
  roommate: [{ houses: [4, 11], karakas: ['Moon'] }],
  travel_buddy: [{ houses: [9, 3], karakas: ['Jupiter', 'Mercury'] }],
  creative_partner: [{ houses: [5, 3], karakas: ['Venus', 'Mercury'] }],
  gym_partner: [{ houses: [6, 3], karakas: ['Mars'] }],
  other: [{ houses: [11], karakas: ['Mercury'] }],
};

interface Tie {
  score: number;
  why: WhyFactor[];
}

const DUSTHANA = new Set([6, 8, 12]);

/** How strongly a dasha lord is tied to the bond's houses in one chart (0 to ~7). */
export function lordTie(
  ctx: ChartContext,
  planet: Planet,
  houses: number[],
  karakas: Planet[],
  name?: string,
): Tie {
  const why: WhyFactor[] = [];
  const params = (house: number): Record<string, string | number> =>
    name ? { planet, house, name } : { planet, house };
  let score = 0;
  const ruled = housesRuledBy(ctx, planet).filter((h) => houses.includes(h));
  if (ruled.length > 0) {
    score += 3;
    why.push({
      kind: 'lordship',
      planet,
      house: ruled[0]!,
      effect: 1,
      textKey: name ? 'bonds.why.theirRules' : 'timeline.why.rules',
      params: params(ruled[0]!),
    });
  }
  const natal = ctx.natal.find((p) => p.planet === planet);
  if (natal && houses.includes(natal.house)) {
    score += 2;
    why.push({
      kind: 'house',
      planet,
      house: natal.house,
      effect: 1,
      textKey: name ? 'bonds.why.theirSits' : 'timeline.why.sits',
      params: params(natal.house),
    });
  }
  if (karakas.includes(planet)) {
    score += 1;
    why.push({
      kind: 'dasha',
      planet,
      effect: 1,
      textKey: 'bonds.why.karaka',
      params: { planet },
    });
  }
  if (natal && score > 0) {
    // A lord sitting in the bond's own house is at home there, even when that
    // house is the 6th, 8th or 12th (an employee's 6th, an investor's 8th).
    const effect = placementEffect(natal.house);
    if (effect > 0 || !houses.includes(natal.house)) score += effect;
  }
  return { score: Math.max(0, score), why };
}

/**
 * The strain rule: a planet that rules one of the bond's houses but sits in
 * the 6th, 8th or 12th. Sitting in one of the bond's own houses doesn't count.
 */
export function lordStrained(ctx: ChartContext, planet: Planet, houses: number[]): boolean {
  const natal = ctx.natal.find((p) => p.planet === planet);
  return (
    natal !== undefined &&
    DUSTHANA.has(natal.house) &&
    !houses.includes(natal.house) &&
    housesRuledBy(ctx, planet).some((h) => houses.includes(h))
  );
}

export type PhaseTone = 'active' | 'steady' | 'mixed' | 'testing';

/** What a house is about, in one word the page translates. */
export const HOUSE_THEMES = [
  'self',
  'money',
  'effort',
  'home',
  'creativity',
  'service',
  'relationships',
  'change',
  'fortune',
  'career',
  'gains',
  'retreat',
] as const;
export type HouseTheme = (typeof HOUSE_THEMES)[number];

export interface PeriodTheme {
  planet: Planet;
  /** 1-12 from that person's Ascendant. */
  house: number;
  theme: HouseTheme;
}

/** Sign index (0 = Aries) of each planet's mulatrikona sign; the Moon's own sign is Cancer. */
const MULATRIKONA_SIGN: Partial<Record<Planet, number>> = {
  Sun: 4,
  Moon: 3,
  Mars: 0,
  Mercury: 5,
  Jupiter: 8,
  Venus: 6,
  Saturn: 10,
};

/**
 * What a person's running sub-period is mainly about: the house its lord
 * rules. A planet that rules two houses speaks first for the one holding its
 * mulatrikona sign; Rahu and Ketu rule none, so they speak for the house they
 * sit in.
 */
export function periodTheme(ctx: ChartContext): PeriodTheme | null {
  const planet = ctx.dasha.antardasha?.planet;
  if (!planet) return null;
  const ruled = housesRuledBy(ctx, planet);
  const mula = MULATRIKONA_SIGN[planet];
  const house =
    ruled.find((h) => (ctx.ascendantSignIndex + h - 1) % 12 === mula) ??
    ruled[0] ??
    ctx.natal.find((p) => p.planet === planet)?.house;
  if (!house) return null;
  return { planet, house, theme: HOUSE_THEMES[house - 1]! };
}

export interface BondPhase {
  tone: PhaseTone;
  /** The two running Antardasha lords (owner's, then theirs). */
  lords: [Planet | null, Planet | null];
  /** What each person's running sub-period is about (owner's, then theirs). */
  themes: [PeriodTheme | null, PeriodTheme | null];
  why: WhyFactor[];
}

/**
 * Where this bond stands now: both people's running lords, plus slow planets
 * passing the bond's houses in each chart, counted from that person's Moon.
 */
export function bondPhase(
  self: ChartContext,
  them: ChartContext,
  spec: BondSpec,
  name: string,
): BondPhase {
  const why: WhyFactor[] = [];
  let focus = 0;
  let strain = 0;

  const side = (ctx: ChartContext, houses: number[], karakas: Planet[], who?: string) => {
    const antar = ctx.dasha.antardasha?.planet ?? null;
    const maha = ctx.dasha.mahadasha?.planet ?? null;
    if (antar) {
      const tie = lordTie(ctx, antar, houses, karakas, who);
      focus += tie.score;
      why.push(...tie.why);
      if (tie.score > 0 && lordStrained(ctx, antar, houses)) strain += 1;
    }
    if (maha && maha !== antar) focus += lordTie(ctx, maha, houses, karakas).score / 2;
    return antar;
  };
  const mine = side(self, spec.houses, spec.karakas);
  const theirs = side(them, spec.theirHouses, spec.theirKarakas, name);

  // Slow planets passing any of the bond's houses, counted from each person's own Moon.
  const passing = (ctx: ChartContext, houses: number[], who?: string) => {
    // Rahu and Ketu always sit opposite each other, so a bond read from two
    // opposite houses (the 3rd and 9th) would count the one axis twice.
    let nodeCounted = false;
    for (const t of ctx.transits) {
      if (!houses.includes(t.houseFromMoon)) continue;
      const node = t.planet === 'Rahu' || t.planet === 'Ketu';
      const hard = node || t.planet === 'Saturn';
      if (!hard && t.planet !== 'Jupiter') continue;
      if (node && nodeCounted) continue;
      if (node) nodeCounted = true;
      if (hard) strain += 1;
      else focus += 2;
      why.push({
        kind: 'transit',
        planet: t.planet,
        house: t.houseFromMoon,
        sign: t.sign,
        effect: hard ? -1 : 1,
        textKey: who ? 'bonds.why.theirTransit' : 'why.transit',
        params: {
          planet: t.planet,
          house: t.houseFromMoon,
          sign: t.sign,
          ...(who ? { name: who } : {}),
        },
      });
    }
  };
  passing(self, spec.houses);
  passing(them, spec.theirHouses, name);

  const tone: PhaseTone =
    strain >= 2 ? 'testing' : focus >= 4 ? 'active' : strain === 1 ? 'mixed' : 'steady';
  return {
    tone,
    lords: [mine, theirs],
    themes: [periodTheme(self), periodTheme(them)],
    why: why.slice(0, 6),
  };
}

export interface BondCompatibility {
  kind: 'guna' | 'harmony';
  score: number;
  max: number;
  pct: number;
  label: 'excellent' | 'good' | 'average' | 'below_average' | 'poor' | 'mixed';
  kootas: Array<{ koota: string; score: number; max: number }>;
}

const HARMONY_KOOTAS: Record<string, number> = { GrahaMaitri: 0.4, Bhakoot: 0.35, Tara: 0.25 };

/** A low harmony score is said plainly: under 30 is "poor", shown as "Challenging". */
export function harmonyLabel(pct: number): BondCompatibility['label'] {
  if (pct >= 75) return 'excellent';
  if (pct >= 60) return 'good';
  if (pct >= 45) return 'average';
  if (pct >= 30) return 'mixed';
  return 'poor';
}

/** All eight kootas for the pair, the boy's chart first per Ashtakoota convention. */
export function pairAshtakoota(
  self: ChartContext,
  them: ChartContext,
  selfGender: Gender,
  otherGender: Gender,
) {
  const sign = (ctx: ChartContext) => ZODIAC_SIGNS[ctx.moonSignIndex]!;
  const selfFirst = !(selfGender === 'female' && otherGender === 'male');
  const [a, b] = selfFirst ? [self, them] : [them, self];
  return calculateAshtakoota(a.moonNakshatraIndex, b.moonNakshatraIndex, sign(a), sign(b));
}

/**
 * Guna Milan for a couple (the boy's chart first, per Ashtakoota convention);
 * for any other bond, a harmony score from Moon-lord friendship, Bhakoot and
 * Tara — the parts of matching that speak to getting along, not to marriage.
 */
export function bondCompatibility(
  self: ChartContext,
  them: ChartContext,
  spec: BondSpec,
  selfGender: Gender,
  otherGender: Gender,
): BondCompatibility {
  const result = pairAshtakoota(self, them, selfGender, otherGender);

  if (spec.guna) {
    return {
      kind: 'guna',
      score: result.totalScore,
      max: result.maxTotal,
      pct: Math.round((result.totalScore / result.maxTotal) * 100),
      label: result.overallCompatibility,
      kootas: result.scores.map((s) => ({ koota: s.koota, score: s.score, max: s.maxScore })),
    };
  }
  const kootas = result.scores
    .filter((s) => s.koota in HARMONY_KOOTAS)
    .map((s) => ({ koota: s.koota, score: s.score, max: s.maxScore }));
  const pct = Math.round(
    kootas.reduce((sum, k) => sum + (k.score / k.max) * HARMONY_KOOTAS[k.koota]!, 0) * 100,
  );
  return { kind: 'harmony', score: pct, max: 100, pct, label: harmonyLabel(pct), kootas };
}

/** 0 fire, 1 earth, 2 air, 3 water. */
const elementOf = (signIndex: number) => signIndex % 4;
const easyElements = (a: number, b: number) =>
  a === b || (a + b === 2 && a !== b) || (a + b === 4 && a !== b);

/** How the two of you tend to feel and talk, from the Moons, the Mercurys and (for romance) Venus and Mars. */
export function communicationThemes(
  self: ChartContext,
  them: ChartContext,
  romantic: boolean,
  name: string,
): WhyFactor[] {
  const planetSign = (ctx: ChartContext, planet: Planet) =>
    ctx.natal.find((p) => p.planet === planet)?.signIndex;
  const out: WhyFactor[] = [];

  const moonA = elementOf(self.moonSignIndex);
  const moonB = elementOf(them.moonSignIndex);
  out.push({
    kind: 'house',
    planet: 'Moon',
    effect: moonA === moonB || easyElements(moonA, moonB) ? 1 : 0,
    textKey:
      moonA === moonB
        ? 'bonds.comm.moonSame'
        : easyElements(moonA, moonB)
          ? 'bonds.comm.moonEasy'
          : 'bonds.comm.moonDifferent',
    params: { name },
  });

  const mercA = planetSign(self, 'Mercury');
  const mercB = planetSign(them, 'Mercury');
  if (mercA !== undefined && mercB !== undefined) {
    // 6 and 8 apart (shadashtaka) is the hard pairing, not 4 and 10.
    const relation = signRelation(mercA, mercB);
    const key = {
      alike: 'mercuryAlike',
      complement: 'mercuryComplement',
      friction: 'mercuryFriction',
      different: 'mercuryDifferent',
    }[relation];
    out.push({
      kind: 'house',
      planet: 'Mercury',
      effect:
        relation === 'alike' || relation === 'complement' ? 1 : relation === 'friction' ? -1 : 0,
      textKey: `bonds.comm.${key}`,
      params: { name },
    });
  }

  if (romantic) {
    const venusA = planetSign(self, 'Venus');
    const marsA = planetSign(self, 'Mars');
    const venusB = planetSign(them, 'Venus');
    const marsB = planetSign(them, 'Mars');
    const spark =
      (venusA !== undefined && marsB !== undefined && elementOf(venusA) === elementOf(marsB)) ||
      (venusB !== undefined && marsA !== undefined && elementOf(venusB) === elementOf(marsA));
    if (spark) {
      out.push({
        kind: 'house',
        planet: 'Venus',
        effect: 1,
        textKey: 'bonds.comm.spark',
        params: { name },
      });
    }
  }
  return out;
}

export interface BondWindow {
  /** Whose sub-period this is: the account owner's or the other person's. */
  who: 'you' | 'them';
  start: string;
  end: string;
  tone: 'good' | 'care';
  lords: [Planet, Planet];
  why: WhyFactor[];
}

/** A stretch where both people's periods say the same thing about the bond. */
export interface SharedWindow {
  start: string;
  end: string;
  tone: 'good' | 'care';
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** The end of the three years "Periods ahead" looks across. */
export function upcomingHorizon(now: Date): Date {
  return new Date(now.getTime() + UPCOMING_YEARS * 365 * MS_PER_DAY);
}

/**
 * One person's next sub-periods (3 years) that light up or strain this bond,
 * at most four. `name` is set for the other person, so the reasons name them.
 */
export function upcomingWindows(
  ctx: ChartContext,
  mahadashas: StoredMahadasha[],
  houses: number[],
  karakas: Planet[],
  now: Date,
  name?: string,
): BondWindow[] {
  const to = upcomingHorizon(now);
  const out: BondWindow[] = [];
  for (const span of dashaPeriodsInRange(mahadashas, now, to, 1)) {
    const [maha, antar] = span.lords as [Planet, Planet];
    const antarTie = lordTie(ctx, antar, houses, karakas, name);
    const mahaTie = lordTie(ctx, maha, houses, karakas, name);
    const care = antarTie.score > 0 && lordStrained(ctx, antar, houses);
    const good = !care && antarTie.score + mahaTie.score / 2 >= 3;
    if (!good && !care) continue;
    out.push({
      who: name === undefined ? 'you' : 'them',
      start: isoDate(span.startDate < now ? now : span.startDate),
      end: isoDate(span.endDate > to ? to : span.endDate),
      tone: care ? 'care' : 'good',
      lords: [maha, antar],
      // A Jupiter-Jupiter period would otherwise list the same reason twice.
      why: [...antarTie.why, ...(maha === antar ? [] : mahaTie.why)].slice(0, 3),
    });
    if (out.length >= 4) break;
  }
  return out;
}

const MIN_SHARED_DAYS = 14;

/** Where one of the owner's windows and one of theirs overlap with the same tone, for two weeks or more. */
export function sharedWindows(mine: BondWindow[], theirs: BondWindow[]): SharedWindow[] {
  const out: SharedWindow[] = [];
  for (const a of mine) {
    for (const b of theirs) {
      if (a.tone !== b.tone) continue;
      const start = a.start > b.start ? a.start : b.start;
      const end = a.end < b.end ? a.end : b.end;
      const days = (Date.parse(end) - Date.parse(start)) / MS_PER_DAY;
      if (days >= MIN_SHARED_DAYS) out.push({ start, end, tone: a.tone });
    }
  }
  return out.sort((x, y) => x.start.localeCompare(y.start));
}

export interface BondMangal {
  /** Mangal Dosha in force (present and not cancelled) in the owner's chart, then theirs. */
  you: boolean;
  them: boolean;
  status: 'neither' | 'both' | 'oneSided';
}

/**
 * Mangal Dosha for a marriage or one that may come. Read by the engine's own
 * detector, unchanged; a dosha it finds cancelled counts as not in force.
 */
export function bondMangal(selfChart: unknown, theirChart: unknown): BondMangal | null {
  if (!selfChart || !theirChart) return null;
  const inForce = (chart: unknown) => {
    const m = detectMangalDosha(chart as ChartData);
    return m.present && m.type !== 'cancelled';
  };
  const you = inForce(selfChart);
  const them = inForce(theirChart);
  return { you, them, status: you && them ? 'both' : you || them ? 'oneSided' : 'neither' };
}

/* -------------------------------------------------------------------------- */
/* How you relate: three meters per bond                                       */
/* -------------------------------------------------------------------------- */
// Aroha's own scoring. Each meter is a weighted mix of parts that are either
// classical on their own (the Graha Maitri, Bhakoot, Tara and Yoni kootas, the
// natural friendship of planets, how two signs stand to each other) or a plain
// comparison of elements. The mix and the weights are ours.

export type RelateKey = 'emotion' | 'communication' | 'spark' | 'workflow' | 'vibe' | 'foundation';

export type RelatePart =
  | 'grahaMaitri'
  | 'bhakoot'
  | 'tara'
  | 'yoni'
  | 'moonElement'
  | 'mercury'
  | 'venus'
  | 'sun'
  | 'jupiter'
  | 'venusMars'
  | 'marsVenus'
  | 'lords4'
  | 'lords10'
  | 'lords11';

export interface RelateMeter {
  key: RelateKey;
  /** 0-100. */
  score: number;
  level: 'high' | 'mid' | 'low';
  /** What went into the score, each 0-100 with its share of the meter. */
  parts: Array<{ part: RelatePart; score: number; weight: number }>;
}

/** The meter that belongs to the bond's group, after Emotion and Communication. */
const CATEGORY_METER: Record<BondCategory, RelateKey | null> = {
  romantic: 'spark',
  professional: 'workflow',
  social: 'vibe',
  family: 'foundation',
  other: null,
};

const METER_PARTS: Record<RelateKey, Array<[RelatePart, number]>> = {
  emotion: [
    ['grahaMaitri', 0.4],
    ['bhakoot', 0.3],
    ['moonElement', 0.3],
  ],
  communication: [['mercury', 1]],
  spark: [
    ['yoni', 0.4],
    ['venusMars', 0.2],
    ['marsVenus', 0.2],
    ['venus', 0.2],
  ],
  workflow: [
    ['sun', 0.4],
    ['lords10', 0.3],
    ['mercury', 0.3],
  ],
  vibe: [
    ['moonElement', 0.4],
    ['lords11', 0.3],
    ['tara', 0.3],
  ],
  foundation: [
    ['jupiter', 0.35],
    ['lords4', 0.35],
    ['grahaMaitri', 0.3],
  ],
};

export type SignRelation = 'alike' | 'complement' | 'different' | 'friction';

/**
 * How two signs stand to each other, counted from one to the other. Same sign
 * or a trine (1, 5, 9) share an element; 3, 7 and 11 work together; 6 and 8
 * (shadashtaka) is the classical hard pairing; 2, 12, 4 and 10 are in between.
 */
export function signRelation(fromSign: number, toSign: number): SignRelation {
  const h = houseFrom(fromSign, toSign);
  if (h === 1 || h === 5 || h === 9) return 'alike';
  if (h === 3 || h === 7 || h === 11) return 'complement';
  if (h === 6 || h === 8) return 'friction';
  return 'different';
}

const RELATION_SCORE: Record<SignRelation, number> = {
  alike: 90,
  complement: 75,
  different: 50,
  friction: 25,
};

/** Natural friendship of two planets, read both ways and averaged: friend 100, neutral 60, enemy 20. */
export function friendshipScore(a: Planet, b: Planet): number {
  if (a === b) return 100;
  const oneWay = (x: Planet, y: Planet) =>
    PLANET_FRIENDS[x]?.includes(y) ? 100 : PLANET_ENEMIES[x]?.includes(y) ? 20 : 60;
  return (oneWay(a, b) + oneWay(b, a)) / 2;
}

const elementScore = (a: number, b: number) =>
  elementOf(a) === elementOf(b) ? 100 : easyElements(elementOf(a), elementOf(b)) ? 75 : 40;

/** The same planet in both charts: 70% how the two signs stand, 30% how their lords get on. */
function planetPair(self: ChartContext, them: ChartContext, planet: Planet): number | null {
  const a = self.natal.find((p) => p.planet === planet)?.signIndex;
  const b = them.natal.find((p) => p.planet === planet)?.signIndex;
  if (a === undefined || b === undefined) return null;
  const lords = friendshipScore(SIGN_LORDS[ZODIAC_SIGNS[a]!], SIGN_LORDS[ZODIAC_SIGNS[b]!]);
  return RELATION_SCORE[signRelation(a, b)] * 0.7 + lords * 0.3;
}

function lordPair(self: ChartContext, them: ChartContext, house: number): number | null {
  const a = self.houseLords[house];
  const b = them.houseLords[house];
  return a && b ? friendshipScore(a, b) : null;
}

/** One person's planet against the other's, by element (Venus with Mars). */
function crossElement(
  a: ChartContext,
  planetA: Planet,
  b: ChartContext,
  planetB: Planet,
): number | null {
  const x = a.natal.find((p) => p.planet === planetA)?.signIndex;
  const y = b.natal.find((p) => p.planet === planetB)?.signIndex;
  return x === undefined || y === undefined ? null : elementScore(x, y);
}

/**
 * The meters for one bond: Emotion and Communication for everyone, then the
 * one that belongs to the bond's group. `kootas` are the Ashtakoota scores
 * already worked out for the pair. A part that can't be read is left out and
 * the rest share its weight.
 */
export function relateMeters(
  self: ChartContext,
  them: ChartContext,
  category: BondCategory,
  kootas: Array<{ koota: string; score: number; max: number }>,
): RelateMeter[] {
  const koota = (name: string) => {
    const k = kootas.find((x) => x.koota === name);
    return k && k.max > 0 ? (k.score / k.max) * 100 : null;
  };
  const partScore = (part: RelatePart): number | null => {
    switch (part) {
      case 'grahaMaitri':
        return koota('GrahaMaitri');
      case 'bhakoot':
        return koota('Bhakoot');
      case 'tara':
        return koota('Tara');
      case 'yoni':
        return koota('Yoni');
      case 'moonElement':
        return elementScore(self.moonSignIndex, them.moonSignIndex);
      case 'mercury':
        return planetPair(self, them, 'Mercury');
      case 'venus':
        return planetPair(self, them, 'Venus');
      case 'sun':
        return planetPair(self, them, 'Sun');
      case 'jupiter':
        return planetPair(self, them, 'Jupiter');
      case 'venusMars':
        return crossElement(self, 'Venus', them, 'Mars');
      case 'marsVenus':
        return crossElement(self, 'Mars', them, 'Venus');
      case 'lords4':
        return lordPair(self, them, 4);
      case 'lords10':
        return lordPair(self, them, 10);
      case 'lords11':
        return lordPair(self, them, 11);
    }
  };

  const keys: RelateKey[] = ['emotion', 'communication'];
  const extra = CATEGORY_METER[category];
  if (extra) keys.push(extra);

  const out: RelateMeter[] = [];
  for (const key of keys) {
    const read = METER_PARTS[key]
      .map(([part, weight]) => ({ part, weight, score: partScore(part) }))
      .filter((p): p is { part: RelatePart; weight: number; score: number } => p.score !== null);
    const total = read.reduce((sum, p) => sum + p.weight, 0);
    if (total === 0) continue;
    const score = Math.round(read.reduce((sum, p) => sum + p.score * p.weight, 0) / total);
    out.push({
      key,
      score,
      level: score >= 70 ? 'high' : score >= 45 ? 'mid' : 'low',
      parts: read.map((p) => ({
        part: p.part,
        score: Math.round(p.score),
        weight: Math.round((p.weight / total) * 100) / 100,
      })),
    });
  }
  return out;
}

/** Their next birthday on or after `today` ('YYYY-MM-DD'); 29 Feb falls back to 28 Feb in other years. */
export function nextBirthday(dateOfBirth: string, today: string): string {
  const [, m, d] = dateOfBirth.split('-').map(Number);
  const year = Number(today.slice(0, 4));
  const on = (y: number) => {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const day = m === 2 && d === 29 && !leap ? 28 : d!;
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };
  const thisYear = on(year);
  return thisYear >= today ? thisYear : on(year + 1);
}

/* -------------------------------------------------------------------------- */
/* Loading charts                                                              */
/* -------------------------------------------------------------------------- */

interface LoadedBondChart {
  ctx: ChartContext;
  mahadashas: StoredMahadasha[];
  /** The chart blob itself, for the engine's Mangal Dosha detector. */
  chartData: unknown;
}

function mahadashasOf(kundli: Pick<KundliRow, 'dashaData'>): StoredMahadasha[] {
  return (
    (kundli.dashaData as { vimshottari?: { mahadashas?: StoredMahadasha[] } } | null)?.vimshottari
      ?.mahadashas ?? []
  );
}

/**
 * A person's chart context: the stored kundli when it's ready, otherwise cast
 * on the spot from their birth details with the account's engine settings
 * (the same inputs the kundli pipeline would use). Null without an exact
 * birth date, time and place.
 */
export async function loadBondChart(
  user: UserRow,
  profile: ProfileContext,
  now: Date,
): Promise<LoadedBondChart | null> {
  const stored = await findKundliByUserId(user.id, profile.birthProfileId);
  if (stored && stored.status === 'ready' && stored.chartData) {
    const ctx = await buildChartContext(stored, profile, now);
    if (ctx) return { ctx, mahadashas: mahadashasOf(stored), chartData: stored.chartData };
  }
  const inputs = birthInputsForProfile(profile, user);
  if (!inputs) return null;
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
  const birthUtc = new Date(
    Date.UTC(inputs.year, inputs.month - 1, inputs.day, inputs.hour, inputs.minute) -
      inputs.tzOffset * 3_600_000,
  );
  const vimshottari = calculateVimshottariDasha(moon?.longitude ?? 0, birthUtc);
  const kundli = {
    status: 'ready',
    // Round-tripped through JSON so dates look exactly like a stored row's.
    chartData: JSON.parse(JSON.stringify(chart)) as unknown,
    dashaData: JSON.parse(JSON.stringify({ vimshottari })) as unknown,
    ayanamsa: inputs.ayanamsa,
    houseSystem: inputs.houseSystem,
    nodeType: inputs.lunarNode ?? null,
    calculationVersion: inputs.calculationVersion,
    generatedAt: null,
  } as unknown as KundliRow;
  const ctx = await buildChartContext(kundli, profile, now);
  return ctx ? { ctx, mahadashas: mahadashasOf(kundli), chartData: kundli.chartData } : null;
}

/* -------------------------------------------------------------------------- */
/* Endpoints                                                                   */
/* -------------------------------------------------------------------------- */

export interface BondSummary {
  profileId: string;
  name: string | null;
  relationship: Relationship | null;
  category: BondCategory;
  /** Their gender, so the page can say Mother or Father for a parent. */
  gender: Gender;
  /** False when their birth date, time or place is missing — nothing to compare yet. */
  ready: boolean;
  compatibility: BondCompatibility | null;
  phase: PhaseTone | null;
}

export interface BondDetail extends BondSummary {
  phaseDetail: BondPhase | null;
  /** Null while the other person's chart isn't ready. */
  detail: {
    /** Both people's windows, in date order; `who` says whose each one is. */
    upcoming: BondWindow[];
    /** Stretches where both people's windows agree. */
    shared: SharedWindow[];
    /** The last day "Periods ahead" looks at, so the page can draw its scale. */
    horizon: string;
    communication: WhyFactor[];
    relate: RelateMeter[];
    /** Only for a marriage or one that may come. */
    mangal: BondMangal | null;
    dates: Array<{ date: string; kind: BondDateKind }>;
  } | null;
}

export type BondDateKind =
  | 'birthday'
  | 'windowGood'
  | 'windowCare'
  | 'theirGood'
  | 'theirCare'
  | 'sharedGood'
  | 'sharedCare';

const MAX_DATES = 6;

function nameOf(row: BirthProfileRow): string {
  return row.displayName?.trim() || '';
}

async function ownerChart(
  user: UserRow,
  now: Date,
): Promise<{ profile: ProfileContext; chart: LoadedBondChart }> {
  const profile = await resolveProfileContext(user, null);
  const chart = await loadBondChart(user, profile, now);
  if (!chart) throw Errors.conflict('CHART_NOT_READY');
  return { profile, chart };
}

async function summarize(
  user: UserRow,
  row: BirthProfileRow,
  owner: { profile: ProfileContext; chart: LoadedBondChart },
  now: Date,
): Promise<{
  summary: BondSummary;
  them: LoadedBondChart | null;
  spec: BondSpec;
  phase: BondPhase | null;
}> {
  const spec = bondSpec(row.relationship, row.gender, owner.profile.gender);
  const profile = await resolveProfileContext(user, row.id);
  const them = await loadBondChart(user, profile, now);
  const phase = them ? bondPhase(owner.chart.ctx, them.ctx, spec, nameOf(row)) : null;
  return {
    spec,
    them,
    phase,
    summary: {
      profileId: row.id,
      name: row.displayName,
      relationship: row.relationship,
      category: bondCategory(row.relationship),
      gender: row.gender,
      ready: Boolean(them),
      compatibility: them
        ? bondCompatibility(owner.chart.ctx, them.ctx, spec, owner.profile.gender, row.gender)
        : null,
      phase: phase?.tone ?? null,
    },
  };
}

/** Everyone saved on the account, each with a compatibility score and where the bond stands now. */
export async function listBonds(user: UserRow): Promise<{ bonds: BondSummary[] }> {
  await requirePass(user.id, 'bonds');
  const now = new Date();
  const owner = await ownerChart(user, now);
  const rows = (await listBirthProfilesByOwner(user.id)).slice(0, MAX_BONDS);
  const bonds = await Promise.all(
    rows.map(async (row) => (await summarize(user, row, owner, now)).summary),
  );
  return { bonds };
}

export async function getBond(user: UserRow, profileId: string): Promise<BondDetail> {
  await requirePass(user.id, 'bonds');
  const now = new Date();
  const row = await findOwnedBirthProfile(profileId, user.id);
  if (!row) throw Errors.notFound('BOND_NOT_FOUND');
  const owner = await ownerChart(user, now);
  const { summary, them, spec, phase } = await summarize(user, row, owner, now);

  const detail = them ? bondDetail(owner, them, row, spec, now) : null;
  return { ...summary, phaseDetail: phase, detail };
}

const TONE_WORDS: Record<PhaseTone, string> = {
  active: 'in focus',
  steady: 'steady',
  mixed: 'mixed signals',
  testing: 'needs care',
};

/**
 * The Bonds reading for one saved person as plain facts for Ask Aroha, so a
 * chat answer about them matches what the Bonds page shows. Empty unless the
 * user's Pass includes Bonds and Bonds is switched on for them, and whenever
 * either chart can't be read.
 */
export async function bondFactsForChat(userId: string, profileId: string): Promise<string[]> {
  const pass = await passEntitlement(userId);
  if (!pass?.features.includes('bonds')) return [];
  const features = await resolveFeaturesForUser(userId);
  if (!features['nav.bonds']?.enabled && !features['home.bondsCard']?.enabled) return [];

  const user = await findActiveUserById(userId);
  const row = await findOwnedBirthProfile(profileId, userId);
  if (!user || !row) return [];
  const now = new Date();
  const profile = await resolveProfileContext(user, null);
  const chart = await loadBondChart(user, profile, now);
  if (!chart) return [];
  const owner = { profile, chart };
  const { summary, them, spec, phase } = await summarize(user, row, owner, now);
  if (!them || !summary.compatibility || !phase) return [];

  const name = nameOf(row) || 'this person';
  const kind = (row.relationship ?? 'other').replace(/_/g, ' ');
  const c = summary.compatibility;
  const detail = bondDetail(owner, them, row, spec, now);
  const theme = (t: PeriodTheme | null) =>
    t
      ? `a ${t.planet} sub-period, mainly about ${t.theme} (house ${t.house})`
      : 'no sub-period read';
  const windows = detail.upcoming
    .slice(0, 4)
    .map(
      (w) =>
        `${w.who === 'you' ? 'the seeker' : name}: ${w.tone === 'good' ? 'supportive' : 'go carefully'} ` +
        `${w.start} to ${w.end} (${w.lords.join('-')})`,
    );
  const shared = detail.shared
    .slice(0, 2)
    .map((w) => `${w.tone === 'good' ? 'supportive' : 'go carefully'} ${w.start} to ${w.end}`);

  return [
    `Aroha Bonds reading for saved profile "${name}" (${kind}; a ${summary.category} bond), worked ` +
      `out from both real charts by fixed rules. Cite only these figures and do not add to them. ` +
      (c.kind === 'guna'
        ? `Guna Milan ${c.score}/${c.max} (${c.label.replace(/_/g, ' ')}). `
        : `Harmony ${c.pct}/100 (${c.label === 'poor' ? 'challenging' : c.label}). `) +
      `Right now the bond is "${TONE_WORDS[phase.tone]}": the seeker is in ${theme(phase.themes[0])}; ` +
      `${name} is in ${theme(phase.themes[1])}. ` +
      (detail.relate.length > 0
        ? `How they relate, each out of 100: ${detail.relate.map((m) => `${m.key} ${m.score}`).join(', ')}. `
        : '') +
      (windows.length > 0
        ? `Periods ahead for this bond in the next three years: ${windows.join('; ')}. `
        : 'No stand-out periods for this bond in the next three years. ') +
      (shared.length > 0 ? `Both at once: ${shared.join('; ')}.` : ''),
  ];
}

/** Everything on a bond's own page below the score and the phase. */
function bondDetail(
  owner: { profile: ProfileContext; chart: LoadedBondChart },
  them: LoadedBondChart,
  row: BirthProfileRow,
  spec: BondSpec,
  now: Date,
): NonNullable<BondDetail['detail']> {
  const name = nameOf(row);
  const category = bondCategory(row.relationship);
  const mine = upcomingWindows(
    owner.chart.ctx,
    owner.chart.mahadashas,
    spec.houses,
    spec.karakas,
    now,
  );
  const theirs = upcomingWindows(
    them.ctx,
    them.mahadashas,
    spec.theirHouses,
    spec.theirKarakas,
    now,
    name,
  );
  const shared = sharedWindows(mine, theirs);

  const starts: Array<{ date: string; kind: BondDateKind }> = [
    ...mine.map((w) => ({
      date: w.start,
      kind: w.tone === 'good' ? ('windowGood' as const) : ('windowCare' as const),
    })),
    ...theirs.map((w) => ({
      date: w.start,
      kind: w.tone === 'good' ? ('theirGood' as const) : ('theirCare' as const),
    })),
    ...shared.map((w) => ({
      date: w.start,
      kind: w.tone === 'good' ? ('sharedGood' as const) : ('sharedCare' as const),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  // The birthday always keeps its place; the soonest starts fill the rest.
  const birthday = row.dateOfBirth
    ? [{ date: nextBirthday(row.dateOfBirth, isoDate(now)), kind: 'birthday' as const }]
    : [];
  const dates = [...birthday, ...starts.slice(0, MAX_DATES - birthday.length)].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const kootas = pairAshtakoota(
    owner.chart.ctx,
    them.ctx,
    owner.profile.gender,
    row.gender,
  ).scores.map((s) => ({ koota: s.koota, score: s.score, max: s.maxScore }));

  return {
    upcoming: [...mine, ...theirs].sort((a, b) => a.start.localeCompare(b.start)),
    shared,
    horizon: isoDate(upcomingHorizon(now)),
    communication: communicationThemes(owner.chart.ctx, them.ctx, category === 'romantic', name),
    relate: relateMeters(owner.chart.ctx, them.ctx, category, kootas),
    mangal: spec.guna ? bondMangal(owner.chart.chartData, them.chartData) : null,
    dates,
  };
}
