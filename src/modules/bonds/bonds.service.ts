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

import type { Planet } from '@aroha-astrology/shared';
import { ZODIAC_SIGNS } from '@aroha-astrology/shared';
import type { BirthProfileRow, KundliRow, UserRow } from '../../db/schema.js';
import { requirePass } from '../../lib/entitlements.js';
import { Errors } from '../../lib/errors.js';
import { calculateChart } from '../../lib/astro-engine/calculations/planetPositions.js';
import { calculateVimshottariDasha } from '../../lib/astro-engine/dashas/vimshottari.js';
import {
  dashaPeriodsInRange,
  type StoredMahadasha,
} from '../../lib/astro-engine/dashas/dasha-range.js';
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
import { findKundliByUserId } from '../kundli/kundli.repo.js';
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

export interface BondPhase {
  tone: PhaseTone;
  /** The two running Antardasha lords (owner's, then theirs). */
  lords: [Planet | null, Planet | null];
  why: WhyFactor[];
}

/** Where this bond stands now: both people's running lords, plus slow planets in its house. */
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

  // Slow planets passing any of the bond's houses, counted from the owner's Moon.
  for (const t of self.transits) {
    if (!spec.houses.includes(t.houseFromMoon)) continue;
    if (t.planet === 'Saturn' || t.planet === 'Rahu' || t.planet === 'Ketu') {
      strain += 1;
      why.push({
        kind: 'transit',
        planet: t.planet,
        house: t.houseFromMoon,
        sign: t.sign,
        effect: -1,
        textKey: 'why.transit',
        params: { planet: t.planet, house: t.houseFromMoon, sign: t.sign },
      });
    } else if (t.planet === 'Jupiter') {
      focus += 2;
      why.push({
        kind: 'transit',
        planet: t.planet,
        house: t.houseFromMoon,
        sign: t.sign,
        effect: 1,
        textKey: 'why.transit',
        params: { planet: t.planet, house: t.houseFromMoon, sign: t.sign },
      });
    }
  }

  const tone: PhaseTone =
    strain >= 2 ? 'testing' : focus >= 4 ? 'active' : strain === 1 ? 'mixed' : 'steady';
  return { tone, lords: [mine, theirs], why: why.slice(0, 5) };
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
  const sign = (ctx: ChartContext) => ZODIAC_SIGNS[ctx.moonSignIndex]!;
  const selfFirst = !(selfGender === 'female' && otherGender === 'male');
  const [a, b] = selfFirst ? [self, them] : [them, self];
  const result = calculateAshtakoota(a.moonNakshatraIndex, b.moonNakshatraIndex, sign(a), sign(b));

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

/** How the two of you tend to feel and talk, from the Moons, the Mercurys and (for couples) Venus and Mars. */
export function communicationThemes(
  self: ChartContext,
  them: ChartContext,
  spec: BondSpec,
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
    const h = houseFrom(mercA, mercB);
    const key = [1, 5, 9].includes(h)
      ? 'mercuryAlike'
      : [3, 7, 11].includes(h)
        ? 'mercuryComplement'
        : [4, 10].includes(h)
          ? 'mercuryFriction'
          : 'mercuryDifferent';
    out.push({
      kind: 'house',
      planet: 'Mercury',
      effect:
        key === 'mercuryAlike' || key === 'mercuryComplement'
          ? 1
          : key === 'mercuryFriction'
            ? -1
            : 0,
      textKey: `bonds.comm.${key}`,
      params: { name },
    });
  }

  if (spec.guna) {
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
  start: string;
  end: string;
  tone: 'good' | 'care';
  lords: [Planet, Planet];
  why: WhyFactor[];
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** The owner's next sub-periods (3 years) that light up or strain this bond, at most four. */
export function upcomingWindows(
  self: ChartContext,
  mahadashas: StoredMahadasha[],
  spec: BondSpec,
  now: Date,
): BondWindow[] {
  const to = new Date(now.getTime() + UPCOMING_YEARS * 365 * MS_PER_DAY);
  const out: BondWindow[] = [];
  for (const span of dashaPeriodsInRange(mahadashas, now, to, 1)) {
    const [maha, antar] = span.lords as [Planet, Planet];
    const antarTie = lordTie(self, antar, spec.houses, spec.karakas);
    const mahaTie = lordTie(self, maha, spec.houses, spec.karakas);
    const care = antarTie.score > 0 && lordStrained(self, antar, spec.houses);
    const good = !care && antarTie.score + mahaTie.score / 2 >= 3;
    if (!good && !care) continue;
    out.push({
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
    if (ctx) return { ctx, mahadashas: mahadashasOf(stored) };
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
  return ctx ? { ctx, mahadashas: mahadashasOf(kundli) } : null;
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
    upcoming: BondWindow[];
    communication: WhyFactor[];
    dates: Array<{ date: string; kind: 'birthday' | 'windowGood' | 'windowCare' }>;
  } | null;
}

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

  let detail: BondDetail['detail'] = null;
  if (them) {
    const upcoming = upcomingWindows(owner.chart.ctx, owner.chart.mahadashas, spec, now);
    const dates: NonNullable<BondDetail['detail']>['dates'] = upcoming.map((w) => ({
      date: w.start,
      kind: w.tone === 'good' ? ('windowGood' as const) : ('windowCare' as const),
    }));
    if (row.dateOfBirth)
      dates.push({ date: nextBirthday(row.dateOfBirth, isoDate(now)), kind: 'birthday' });
    dates.sort((a, b) => a.date.localeCompare(b.date));
    detail = {
      upcoming,
      communication: communicationThemes(owner.chart.ctx, them.ctx, spec, nameOf(row)),
      dates,
    };
  }
  return { ...summary, phaseDetail: phase, detail };
}
