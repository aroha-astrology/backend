// =============================================================================
// Progeny report -- deterministic scoring
// =============================================================================
// Requires spouse birth details (requiresPartner, like kundli_milan -- see
// config/reports.ts) and runs three independently-readable tiers, per the
// reviewed algorithm this report is built from:
//   motherEngine / fatherEngine  -- one person's own progeny promise
//   coupleEngine                 -- both engines + cross-chart timing overlap
//   d7 (self + spouse)           -- classical child sequence + sex tally
//   childrenCard                 -- age-gated (35+), retrospective only
//
// FRAMING, non-negotiable (see docs/superpowers -- this report's own design
// doc, and scholar.ts:310-328 for the app's settled progeny voice):
//   - Beeja/Kshetra are astrological reproductive-CAPACITY indicators, never
//     a medical fertility measurement. No wording here or in the narrative
//     layer may imply sperm/ovum/uterine health.
//   - Every classical claim below carries a `provenance` tag (see
//     progeny-sphuta.ts's Provenance type) rather than being flattened into
//     one undifferentiated "classical" bucket.
//   - The overall deliverable is "a structured traditional Jyotish framework
//     whose predictive validity remains an empirical question," never
//     "accurate prediction."
// =============================================================================

import { analyzePlanetStrengths } from '../gemstones.js';
import { getHouseLord, strengthOfPlanet, strengthScoreOfPlanet } from './chart-facts.js';
import { computeDoshaYogaSummary, type DoshaYogaSummary } from './report-dosha-yoga-summary.js';
import { computeLifeContext } from './report-life-context.js';
import { buildReportHeader } from './report-header.js';
import { computeReportVargas, type ReportVarga } from './report-vargas.js';
import { computeReportTimingWindows, type RankedWindow } from './report-timing.js';
import {
  computeSphuta,
  computePutraTithi,
  type SphutaFact,
  type PutraTithiFact,
} from './progeny-sphuta.js';
import { computeD7Progeny, type D7Progeny } from './progeny-d7.js';
import type { ReportSharedFacts } from './report-shared-facts.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

/** Card-worthy tiers -- deliberately never a single number. */
export type PromiseBand = 'Strong' | 'Moderate' | 'Mixed' | 'Weak';
export type ConvergenceBand = 'Strong convergence' | 'Moderate convergence' | 'Mixed' | 'Conflict';

export interface ProgenyPromise {
  band: PromiseBand;
  /** 0-100, an internal weighting only -- the narrative reports the band, not this number. */
  score: number;
  fifthHouseLord: string | undefined;
  fifthHouseLordStrength: string;
  jupiterStrength: string;
  moonStrength: string;
  sphuta: SphutaFact | null;
  putraTithi: PutraTithiFact | null;
  d7: D7Progeny | null;
}

export interface ChildrenCardSlot {
  index: number;
  tendency: 'male' | 'female' | 'inconclusive';
  confidence: 'low' | 'moderate';
  obstructionScore: number;
}

/** The 35+ retrospective card -- see this file's top comment and the module doc below. */
export interface ChildrenCard {
  likelyCount: number;
  sequence: ChildrenCardSlot[];
  /** 'both' when Method A and Method B agree on child #1's house; otherwise the reader sees
   * both readings labelled by school -- never one picked silently. */
  method: 'A' | 'B' | 'both';
  note: string;
}

export interface ProgenyScores extends Record<string, unknown>, ReportSharedFacts {
  motherPromise: ProgenyPromise | null;
  fatherPromise: ProgenyPromise | null;
  coupleConvergence: ConvergenceBand;
  /** Flat, pre-sorted (soonest-first) -- same shape/field name every other report type uses
   * (e.g. marriage's `windows`), so the frontend's existing `isRankedWindowArray(scores.windows)`
   * guard and `TopWindowCard` just work with no progeny-specific handling. */
  windows: RankedWindow[];
  /**
   * Present only when the purchasing user is 35 or older -- see `computeChildrenCard`'s doc
   * comment for why this gate exists. `null` for every younger buyer; the frontend renders the
   * card only when this is non-null, so no separate age check is needed there.
   */
  childrenCard: ChildrenCard | null;
  /**
   * The READER's own D7 child sequence -- the "Child Sequence" section and the 35+ card both
   * read this one object. ponytail: a single-chart sequence, not cross-validated against the
   * spouse's own D7 -- the reviewed algorithm's "sequential D7 analysis" is classically read off
   * one agreed chart, and running it twice per couple would need a rule for reconciling two
   * disagreeing per-child readings that no source this report was built from actually specifies.
   * Upgrade path if that reconciliation rule is ever settled: compute computeD7Progeny(partnerD7,
   * partnerChart, spouseGender) too and cross-check slot-by-slot.
   */
  childSequence: D7Progeny | null;
  spouseName: string | null;
  /** The spouse's own D7 -- same pattern marriage-spouse-synastry.ts uses for `spouseNavamsa`. */
  partnerVargas: ReportVarga[];
  doshaYoga: DoshaYogaSummary;
}

const PROGENY_TIMING_KARAKA = 'Jupiter';

/**
 * Tiny inline age-from-DOB -- not worth a shared helper for one caller.
 *
 * Parses `dob` as plain y/m/d digits rather than `new Date(dob)`: a date-only string is parsed
 * as UTC midnight per spec, but this function's own birthday comparison reads LOCAL getMonth/
 * getDate off that value -- in any timezone behind UTC that silently rolls the birth date back
 * by one day. A birthday is a calendar date with no timezone attached, so comparing y/m/d
 * digits directly (both sides, no Date-object round-trip for the birth side) is the correct fix,
 * not a workaround.
 */
function ageFrom(dob: string | null | undefined, now: Date): number | null {
  if (!dob) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
  if (!match) return null;
  const [y, m, d] = [match[1], match[2], match[3]].map(Number) as [number, number, number];
  let age = now.getFullYear() - y;
  const beforeBirthday = now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

function bandFromScore(score: number): PromiseBand {
  if (score >= 70) return 'Strong';
  if (score >= 55) return 'Moderate';
  if (score >= 40) return 'Mixed';
  return 'Weak';
}

const STRENGTH_SCORE: Record<string, number> = { weak: 30, average: 60, strong: 90 };

/**
 * One person's progeny promise -- Tier 1 of the reviewed architecture. Reuses the SAME
 * primitives match-risks.ts's computeChildrenFactor uses (getHouseLord/analyzePlanetStrengths/
 * strengthScoreOfPlanet) rather than calling through computeMatchRiskFactors itself, which would
 * force a full Ashtakoota+Dashakoota+Manglik computation this report has no other use for.
 *
 * `sphutaKind` is 'beeja' for a male native, 'kshetra' for a female native -- see
 * progeny-sphuta.ts's top comment for why an 'other'/unknown gender degrades to showing both
 * sphutas without assigning a role, handled by the caller rather than here.
 */
function computePromise(
  chart: Record<string, unknown> | null,
  d7Varga: ReportVarga | undefined,
  gender: 'male' | 'female' | 'other' | null | undefined,
): ProgenyPromise | null {
  if (!chart) return null;

  const analyses = analyzePlanetStrengths(chart);
  const fifthHouseLord = getHouseLord(5, chart);
  const fifthHouseLordStrength = fifthHouseLord
    ? strengthOfPlanet(fifthHouseLord, analyses)
    : 'average';
  const jupiterStrength = strengthOfPlanet('Jupiter', analyses);
  const moonStrength = strengthOfPlanet('Moon', analyses);

  const fifthScore = fifthHouseLord ? strengthScoreOfPlanet(fifthHouseLord, analyses) : 60;
  const jupiterScore = strengthScoreOfPlanet('Jupiter', analyses);
  const moonScore = strengthScoreOfPlanet('Moon', analyses);

  const sphutaKind = gender === 'female' ? 'kshetra' : gender === 'male' ? 'beeja' : null;
  const sphuta = sphutaKind ? computeSphuta(chart, sphutaKind) : null;
  const sphutaScore = sphuta
    ? (STRENGTH_SCORE[
        sphuta.strength === 'strong'
          ? 'strong'
          : sphuta.strength === 'moderate'
            ? 'average'
            : 'weak'
      ] ?? 60)
    : 60;

  const putraTithi = computePutraTithi(chart);
  const tithiScore = putraTithi?.isChidra ? 40 : 65;

  const d7 = computeD7Progeny(d7Varga, chart, gender ?? null);
  const d7Score = d7 ? Math.round((d7.supportedCount / d7.maxChildren) * 100) : 60;

  // ponytail: a flat weighted average over 6 already-computed signals, no per-factor tuning
  // beyond equal weight. Matches the coarse "Strong/Moderate/Mixed/Weak" output this report
  // promises -- a finer model would be effort spent on precision the band throws away anyway.
  const score = Math.round(
    (fifthScore + jupiterScore + moonScore + sphutaScore + tithiScore + d7Score) / 6,
  );

  return {
    band: bandFromScore(score),
    score,
    fifthHouseLord,
    fifthHouseLordStrength,
    jupiterStrength,
    moonStrength,
    sphuta,
    putraTithi,
    d7,
  };
}

function convergenceFrom(
  mother: ProgenyPromise | null,
  father: ProgenyPromise | null,
): ConvergenceBand {
  if (!mother && !father) return 'Mixed';
  const scores = [mother?.score, father?.score].filter((s): s is number => typeof s === 'number');
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const bothStrong = scores.every((s) => s >= 55);
  const anyWeak = scores.some((s) => s < 40);

  if (avgScore >= 65 && bothStrong) return 'Strong convergence';
  if (avgScore >= 50 && !anyWeak) return 'Moderate convergence';
  if (anyWeak && scores.length > 1 && Math.max(...scores) - Math.min(...scores) >= 25) {
    return 'Conflict';
  }
  return 'Mixed';
}

/**
 * The 35+ retrospective card. Gated on age rather than shown unconditionally, because a report
 * that reads as predicting the sex of an EXPECTED child is a live Play-policy and reputational
 * risk in this market even though astrology sits outside the PCPNDT Act's medical scope. Once the
 * reader is 35+, the sequence is almost always about children who already exist, so this card
 * reads as classical VERIFICATION rather than prediction -- the framing the narrative layer must
 * preserve (see RETROSPECTIVE_RULE in llm/reports/progeny.ts).
 */
function computeChildrenCard(d7: D7Progeny | null, age: number | null): ChildrenCard | null {
  if (age == null || age < 35 || !d7) return null;

  const slotsFor = (seq: D7Progeny['methodA']): ChildrenCardSlot[] =>
    seq.slots.map((s) => ({
      index: s.index,
      tendency: s.sex.tendency,
      confidence: s.sex.confidence,
      obstructionScore: s.obstructionScore,
    }));

  if (d7.agreement) {
    return {
      likelyCount: d7.supportedCount,
      sequence: slotsFor(d7.methodA),
      method: 'both',
      note: 'Both classical child-sequence methods agree on the eldest child’s house.',
    };
  }

  // Disagreement -- show Method A only in the primary sequence (it is gender-aware, the more
  // commonly taught lineage for a mixed-gender couple), but say plainly that the schools differ
  // rather than silently picking a winner.
  return {
    likelyCount: d7.supportedCount,
    sequence: slotsFor(d7.methodA),
    method: 'A',
    note: 'The two classical child-sequence schools disagree on the eldest child’s house; shown here per the gender-based method.',
  };
}

export function computeProgenyScores(
  ctx: ReportScoreContext,
  _periodMonth: string | null,
): ProgenyScores {
  const chart = ctx.chart;
  const partnerChart = ctx.partnerChart ?? null;

  const selfVargas = computeReportVargas(chart, ['D7']);
  const partnerVargas = computeReportVargas(partnerChart, ['D7']);
  const selfD7 = selfVargas[0];
  const partnerD7 = partnerVargas[0];

  // The spouse's own gender is never collected (see config/reports.ts's PartnerBirthDetailsSchema
  // -- only DOB/time/place/name), so which chart is "mother" and which is "father" is inferred
  // purely from the PURCHASER's own gender -- known for every 'male'/'female' buyer.
  //
  // ponytail: when personGender is 'other' or missing, both promises are left null rather than
  // guessing a role -- an honest gap (both charts' D7/sphuta/timing facts still surface via
  // vargas/partnerVargas/windows above), not a silent misattribution. Upgrade path if this
  // ever matters in practice: collect the spouse's gender at purchase time (a new optional field
  // on PartnerBirthDetailsSchema) so the mapping never needs to be inferred at all.
  const gender = ctx.personGender;
  const motherPromise = computePromise(
    gender === 'female' ? chart : gender === 'male' ? partnerChart : null,
    gender === 'female' ? selfD7 : gender === 'male' ? partnerD7 : undefined,
    'female',
  );
  const fatherPromise = computePromise(
    gender === 'male' ? chart : gender === 'female' ? partnerChart : null,
    gender === 'male' ? selfD7 : gender === 'female' ? partnerD7 : undefined,
    'male',
  );

  const fifthLord = getHouseLord(5, chart);
  const significators = Array.from(
    new Set([fifthLord, PROGENY_TIMING_KARAKA].filter(Boolean)),
  ) as string[];
  const windows = computeReportTimingWindows(
    'children',
    significators,
    ctx.dashaData ?? null,
    chart,
  ).windows;

  const doshaYoga = computeDoshaYogaSummary(
    ctx.doshaData ?? null,
    ctx.yogaData ?? null,
    ['mangal', 'kaalSarp', 'pitra'],
    ['raja', 'dhana'],
  );

  const analyses = analyzePlanetStrengths(chart);
  const lifeContext = computeLifeContext(chart, analyses, ctx.dashaData ?? null, new Date());
  const header = buildReportHeader(chart, ctx.personName, ctx.personDob, lifeContext);

  const childSequence = computeD7Progeny(selfD7, chart, gender);
  const age = ageFrom(ctx.personDob, new Date());
  const childrenCard = computeChildrenCard(childSequence, age);

  return {
    header,
    lifeContext,
    vargas: selfVargas,
    userAnswers: ctx.userAnswers ?? null,
    motherPromise,
    fatherPromise,
    coupleConvergence: convergenceFrom(motherPromise, fatherPromise),
    windows,
    childrenCard,
    childSequence,
    spouseName: ctx.partnerName ?? null,
    // Exposed on `scores` under a report-specific key (not part of ReportSharedFacts) so the
    // narrative/verdict layers and the frontend can read the spouse's D7 directly -- same pattern
    // marriage-spouse-synastry.ts uses for `spouseNavamsa`.
    partnerVargas,
    doshaYoga,
  };
}
