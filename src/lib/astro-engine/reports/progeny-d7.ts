// =============================================================================
// D7 (Saptamsha) child-sequence and sex-indication engine
// =============================================================================
// Reads the D7 that computeReportVargas already produces -- no new chart
// plumbing. A D7 house number is just the offset from the D7 Lagna:
//   house = mod12(planetD7SignIdx - lagnaD7SignIdx) + 1
//
// TWO SCHOOLS, BOTH RUN. The classical sources genuinely disagree about where
// the first child's house is, and the disagreement does not resolve -- one
// lineage reads the 5th for a male native and the 9th for a female native,
// another reads the 5th for both and reverses the direction on an even D7
// Lagna. Rather than silently picking a winner (the thing the review of this
// algorithm specifically objected to), both run and their AGREEMENT becomes the
// confidence signal: agree -> moderate, disagree -> low and both are shown.
// That is the honest reading of a contested rule, and it costs one extra loop.
//
// SEX INDICATION IS A TALLY, NEVER A VERDICT. Six per-child rule groups each
// vote male/female/neutral and the counts are reported as counts. There is no
// deterministic classical formula here and presenting one would be a fiction --
// see the SexTally doc comment.
// =============================================================================

import { ZODIAC_SIGNS, SIGN_LORDS, type ZodiacSign } from '@aroha-astrology/shared';
import { calculateD9 } from '../charts/divisionalCharts.js';
import { getPlanetPosition } from './chart-facts.js';
import type { ReportVarga } from './report-vargas.js';
import type { Provenance } from './progeny-sphuta.js';

export type School = 'A' | 'B';
export type Tendency = 'male' | 'female' | 'inconclusive';
export type Confidence = 'low' | 'moderate';
export type Vote = 'male' | 'female' | 'neutral';

/** Classical planetary gender. Mercury and Saturn are the traditional neutrals. */
const PLANET_GENDER: Record<string, Vote> = {
  Sun: 'male',
  Mars: 'male',
  Jupiter: 'male',
  Moon: 'female',
  Venus: 'female',
  Mercury: 'neutral',
  Saturn: 'neutral',
  // The nodes vote neutral and instead carry obstruction weight (see NODES below) -- assigning
  // them a sex is modern embellishment with no textual basis worth encoding.
  Rahu: 'neutral',
  Ketu: 'neutral',
};

const NODES: ReadonlySet<string> = new Set(['Rahu', 'Ketu']);

export interface SexRule {
  group: string;
  vote: Vote;
  detail: string;
  provenance: Provenance;
}

/**
 * The output the review asked for in place of a bare "Boy": raw counts plus a tendency and a
 * confidence, so a reader (and later, an accuracy study) can see how contested the reading was.
 * `contradictions` is the size of the losing side -- a 5-4 split and a 9-0 sweep both have a
 * tendency, but only one of them means anything.
 */
export interface SexTally {
  male: number;
  female: number;
  neutral: number;
  contradictions: number;
  tendency: Tendency;
  confidence: Confidence;
  rules: SexRule[];
}

export interface ChildSlot {
  /** 1-based birth order. */
  index: number;
  /** D7 house counted from the D7 Lagna. */
  house: number;
  sign: string;
  lord: string | undefined;
  occupants: string[];
  /** Rahu or Ketu sits in this child's house. A strong obstruction modifier -- NOT a terminator. */
  nodeAfflicted: boolean;
  /** 0-3. Higher means more traditional obstruction indications on this slot. */
  obstructionScore: number;
  sex: SexTally;
}

export interface ChildSequence {
  method: School;
  startHouse: number;
  direction: 'forward' | 'reverse';
  slots: ChildSlot[];
  provenance: Provenance;
}

export interface D7Progeny {
  lagna: string;
  /** planet -> D7 house number. */
  houses: Record<string, number>;
  methodA: ChildSequence;
  methodB: ChildSequence;
  /** Whether both schools put child #1 in the same house. */
  agreement: boolean;
  confidence: Confidence;
  /**
   * How many children the D7 supports, as a heuristic over the first `maxChildren` slots --
   * a slot counts when its obstructionScore is below 2. Reported as an indication, never a promise.
   */
  supportedCount: number;
  maxChildren: number;
}

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function isOddSign(signIdx: number): boolean {
  return signIdx % 2 === 0; // Aries(0) is the 1st sign, therefore odd
}

function houseToSignIndex(lagnaIdx: number, house: number): number {
  return mod12(lagnaIdx + house - 1);
}

/** Tally votes into the reported shape. A tie is `inconclusive`, never broken arbitrarily. */
function tally(rules: SexRule[]): SexTally {
  const male = rules.filter((r) => r.vote === 'male').length;
  const female = rules.filter((r) => r.vote === 'female').length;
  const neutral = rules.filter((r) => r.vote === 'neutral').length;

  const tendency: Tendency = male > female ? 'male' : female > male ? 'female' : 'inconclusive';
  const contradictions = Math.min(male, female);
  // A clear majority over a decided vote is the most this method can honestly claim. There is no
  // 'high' band anywhere in this report.
  const decided = male + female;
  const confidence: Confidence =
    tendency !== 'inconclusive' && decided > 0 && Math.max(male, female) / decided >= 0.7
      ? 'moderate'
      : 'low';

  return { male, female, neutral, contradictions, tendency, confidence, rules };
}

/** The six per-child rule groups. Each is computable from the D7 + natal chart actually at hand. */
function sexRulesFor(
  house: number,
  lagnaIdx: number,
  occupants: string[],
  chart: Record<string, unknown> | null,
): SexRule[] {
  const rules: SexRule[] = [];
  const signIdx = houseToSignIndex(lagnaIdx, house);
  const sign = ZODIAC_SIGNS[signIdx]!;
  const lord = SIGN_LORDS[sign] as string | undefined;

  // 1. Child-house sign polarity.
  rules.push({
    group: 'childHouseSignPolarity',
    vote: isOddSign(signIdx) ? 'male' : 'female',
    detail: `D7 house ${house} is ${sign} (${isOddSign(signIdx) ? 'odd' : 'even'})`,
    provenance: 'SCHOOL-SPECIFIC',
  });

  // 2. Gender of the child-house lord.
  if (lord) {
    rules.push({
      group: 'childHouseLordGender',
      vote: PLANET_GENDER[lord] ?? 'neutral',
      detail: `${sign} is ruled by ${lord}`,
      provenance: 'TEXTUAL',
    });
  }

  // 3. Gender of the planets occupying the child house -- one vote per occupant, since an
  //    occupied house genuinely carries more weight than an empty one.
  for (const occ of occupants) {
    rules.push({
      group: 'childHouseOccupant',
      vote: PLANET_GENDER[occ] ?? 'neutral',
      detail: `${occ} occupies D7 house ${house}`,
      provenance: 'TEXTUAL',
    });
  }

  // 4. D7 Lagna polarity -- a chart-level lean, applied to every slot alike.
  rules.push({
    group: 'd7LagnaPolarity',
    vote: isOddSign(lagnaIdx) ? 'male' : 'female',
    detail: `D7 Lagna ${ZODIAC_SIGNS[lagnaIdx]!} is ${isOddSign(lagnaIdx) ? 'odd' : 'even'}`,
    provenance: 'SCHOOL-SPECIFIC',
  });

  // 5+6. The child-house lord's own natal placement: the polarity of its rasi and of its navamsa.
  if (lord) {
    const p = getPlanetPosition(lord, chart) as { longitude?: unknown } | undefined;
    const lon = typeof p?.longitude === 'number' ? p.longitude : null;
    if (lon != null) {
      const lordRasiIdx = Math.floor((((lon % 360) + 360) % 360) / 30);
      const lordNavIdx = calculateD9(lon);
      rules.push({
        group: 'childLordRasiPolarity',
        vote: isOddSign(lordRasiIdx) ? 'male' : 'female',
        detail: `${lord} sits in ${ZODIAC_SIGNS[lordRasiIdx]!}`,
        provenance: 'COMMENTARY',
      });
      rules.push({
        group: 'childLordNavamsaPolarity',
        vote: isOddSign(lordNavIdx) ? 'male' : 'female',
        detail: `${lord}'s Navamsa is ${ZODIAC_SIGNS[lordNavIdx]!}`,
        provenance: 'COMMENTARY',
      });
    }
  }

  return rules;
}

function buildSequence(
  method: School,
  startHouse: number,
  direction: 'forward' | 'reverse',
  lagnaIdx: number,
  d7HouseOf: Record<string, number>,
  chart: Record<string, unknown> | null,
  maxChildren: number,
): ChildSequence {
  const slots: ChildSlot[] = [];

  for (let i = 0; i < maxChildren; i++) {
    // Successive children advance two houses (the 3rd from the previous child's house).
    const step = direction === 'forward' ? 2 * i : -2 * i;
    const house = mod12(startHouse - 1 + step) + 1;
    const signIdx = houseToSignIndex(lagnaIdx, house);
    const sign = ZODIAC_SIGNS[signIdx]!;
    const occupants = Object.keys(d7HouseOf).filter((p) => d7HouseOf[p] === house);
    const nodeAfflicted = occupants.some((p) => NODES.has(p));

    // ponytail: flat additive obstruction score, no dignity/aspect weighting. Enough to rank
    // slots against each other, which is all the narrative uses it for. Upgrade to a
    // Shadbala-weighted score if the report ever needs an absolute threshold.
    let obstructionScore = 0;
    if (nodeAfflicted) obstructionScore += 2;
    if (occupants.includes('Saturn')) obstructionScore += 1;
    if (occupants.includes('Mars')) obstructionScore += 1;
    if (occupants.includes('Jupiter')) obstructionScore = Math.max(0, obstructionScore - 1);

    slots.push({
      index: i + 1,
      house,
      sign,
      lord: SIGN_LORDS[sign],
      occupants,
      nodeAfflicted,
      obstructionScore: Math.min(3, obstructionScore),
      sex: tally(sexRulesFor(house, lagnaIdx, occupants, chart)),
    });
  }

  return { method, startHouse, direction, slots, provenance: 'SCHOOL-SPECIFIC' };
}

/**
 * Runs both child-sequence schools over one person's D7.
 *
 * `personGender` only steers Method A (male native -> 5th, female native -> 9th). When it is
 * 'other' or unknown, Method A falls back to the 5th -- the same house Method B uses -- which
 * collapses the two schools into agreement. That is a real loss of signal, so the caller should
 * report the gender as unknown rather than presenting the resulting agreement as corroboration.
 *
 * Returns null when the D7 has no usable Lagna.
 */
export function computeD7Progeny(
  varga: ReportVarga | undefined,
  chart: Record<string, unknown> | null,
  personGender: string | null | undefined,
  maxChildren = 4,
): D7Progeny | null {
  if (!varga) return null;
  const lagnaIdx = ZODIAC_SIGNS.indexOf(varga.lagna as ZodiacSign);
  if (lagnaIdx < 0) return null;

  const houses: Record<string, number> = {};
  for (const [planet, sign] of Object.entries(varga.planets)) {
    const idx = ZODIAC_SIGNS.indexOf(sign as ZodiacSign);
    if (idx >= 0) houses[planet] = mod12(idx - lagnaIdx) + 1;
  }

  // Method A -- male native reads the 5th, female native the 9th; always forward.
  const startA = personGender === 'female' ? 9 : 5;
  const methodA = buildSequence('A', startA, 'forward', lagnaIdx, houses, chart, maxChildren);

  // Method B -- the 5th for both, direction set by D7 Lagna polarity.
  const methodB = buildSequence(
    'B',
    5,
    isOddSign(lagnaIdx) ? 'forward' : 'reverse',
    lagnaIdx,
    houses,
    chart,
    maxChildren,
  );

  const agreement = methodA.slots[0]?.house === methodB.slots[0]?.house;

  const supportedCount = methodA.slots.filter((s) => s.obstructionScore < 2).length;

  return {
    lagna: varga.lagna,
    houses,
    methodA,
    methodB,
    agreement,
    confidence: agreement ? 'moderate' : 'low',
    supportedCount,
    maxChildren,
  };
}
