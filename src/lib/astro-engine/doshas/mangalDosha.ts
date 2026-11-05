// @ts-nocheck
import type { ChartData, MangalDosha, Planet, ZodiacSign } from '@aroha-astrology/shared';
import { PLANET_EXALTATION, PLANET_OWN_SIGNS } from '@aroha-astrology/shared';

/**
 * Mangal (Mars) Dosha Detection
 *
 * Sources (opened 2026-11-05, audit M12; register entries BPHS-80.47, BPHS-3.11, RAMAN-MUH in
 * docs/engine-audit/D-source-register.md):
 * - BPHS 80.47-49 (primary): Mars in the 1st, 4th, 7th, 8th or 12th, "subha-drg-yoga-hine",
 *   with no benefic aspect or conjunction. 80.49: two such charts married cancel it (matching).
 * - BPHS 3.11 (primary): benefics are Jupiter, Venus, the waxing Moon, and Mercury unless it is
 *   joined by a malefic.
 * - B.V. Raman, Muhurtha (Electional Astrology) pp. 98-100 (20th-century book): houses counted
 *   from the Lagna, the Moon and Venus; the house+sign exceptions; Mars in Leo or Aquarius forms
 *   no dosha; Mars with Jupiter or with the Moon counteracts it.
 *
 * Formation: Mars in houses 1, 2, 4, 7, 8 or 12 from the Lagna, the Moon or Venus (the 2nd is
 * Raman's, the 1st is BPHS's). Venus in Mars's own sign is not counted as a point: Mars would be
 * "1st from Venus" and then cleared at once by the Venus conjunction, and neither source counts it.
 *
 * Two kinds of exemption:
 * - About Mars itself, so they clear every point: a benefic joining or aspecting Mars (BPHS),
 *   Mars in Leo or Aquarius (Raman), and Mars in its own or exaltation sign. The last one is
 *   Aroha's convention: Raman lists own sign only for the 4th and exaltation only for the 7th.
 * - Raman's house+sign exceptions. Each clears only the point it is true from; another point can
 *   still carry the dosha (the old code let one exception clear every point).
 *
 * Severity = the points still afflicted after the exemptions (1 mild, 2 moderate, 3 severe).
 * No source words any rule as "lower one level", so none does here.
 */

const MANGAL_DOSHA_HOUSES = [1, 2, 4, 7, 8, 12];
const MALEFICS: Planet[] = ['Sun', 'Mars', 'Saturn', 'Rahu', 'Ketu'];
const SUFFIX = ' - cancellation applies';

import { separationDeg } from './separation';

type Point = 'Lagna' | 'Moon' | 'Venus';

/** Compute house number of a planet relative to a reference sign index (0-based). */
function getHouseFromSign(planetSignIndex: number, referenceSignIndex: number): number {
  return ((planetSignIndex - referenceSignIndex + 12) % 12) + 1;
}

function getPlanetPosition(chartData: ChartData, planet: Planet) {
  return chartData.planets.find((p) => p.planet === planet);
}

/** Whole-sign aspect: every planet aspects the 7th from itself; Jupiter also the 5th and 9th. */
function aspectsSign(planet: Planet, fromSignIndex: number, targetSignIndex: number): boolean {
  const offsets = planet === 'Jupiter' ? [5, 7, 9] : [7];
  return offsets.some((o) => (fromSignIndex + o - 1) % 12 === targetSignIndex);
}

/** The Moon is waxing when it is less than 180 degrees ahead of the Sun. Unknown -> null. */
function moonWaxing(chartData: ChartData): boolean | null {
  const sun = getPlanetPosition(chartData, 'Sun');
  const moon = getPlanetPosition(chartData, 'Moon');
  if (typeof sun?.longitude !== 'number' || typeof moon?.longitude !== 'number') return null;
  return (((moon.longitude - sun.longitude) % 360) + 360) % 360 < 180;
}

/** BPHS 3.11: Mercury is a benefic unless a malefic (or a waning Moon) shares its sign. */
function mercuryIsBenefic(chartData: ChartData, waxing: boolean | null): boolean {
  const mercury = getPlanetPosition(chartData, 'Mercury');
  if (!mercury) return false;
  return !chartData.planets.some(
    (p) =>
      p.signIndex === mercury.signIndex &&
      (MALEFICS.includes(p.planet) || (p.planet === 'Moon' && waxing === false)),
  );
}

/**
 * Raman, Muhurtha pp. 99-100: Mars in this house from a point, in one of these signs, forms no
 * dosha for that point.
 */
const HOUSE_SIGN_EXCEPTIONS: Record<number, ZodiacSign[]> = {
  2: ['Gemini', 'Virgo'],
  4: ['Aries', 'Scorpio'],
  7: ['Cancer', 'Capricorn'],
  8: ['Sagittarius', 'Pisces'],
  12: ['Taurus', 'Libra'],
};

/** Exemptions about Mars itself, in a fixed order (the first one names the reason). */
function marsExemptions(chartData: ChartData, mars): string[] {
  const out: string[] = [];
  const m = mars.signIndex;
  const waxing = moonWaxing(chartData);

  // Aroha's convention (Raman: own sign in the 4th, exaltation in the 7th only).
  if (PLANET_OWN_SIGNS.Mars.includes(mars.sign)) out.push(`Mars in own sign ${mars.sign}${SUFFIX}`);
  if (PLANET_EXALTATION.Mars && mars.sign === PLANET_EXALTATION.Mars.sign) {
    out.push(`Mars exalted in Capricorn${SUFFIX}`);
  }

  // BPHS 80.47: a benefic joining Mars. Jupiter and Venus are always benefics; the Moon joining
  // Mars counts in any phase (Raman). Mercury joining Mars never does: it joins a malefic.
  const joined = chartData.planets.filter((p) => p.signIndex === m && p.planet !== 'Mars');
  const benefics = joined.filter((p) => p.planet === 'Jupiter' || p.planet === 'Venus');
  if (benefics.length > 0) {
    out.push(`Mars conjunct benefic (${benefics.map((p) => p.planet).join(', ')})${SUFFIX}`);
  }

  // BPHS 80.47: a benefic aspecting Mars.
  const jupiter = getPlanetPosition(chartData, 'Jupiter');
  if (jupiter && aspectsSign('Jupiter', jupiter.signIndex, m)) {
    out.push(`Mars aspected by Jupiter${SUFFIX}`);
  }
  if (joined.some((p) => p.planet === 'Moon')) out.push(`Mars conjunct Moon${SUFFIX}`);

  const venus = getPlanetPosition(chartData, 'Venus');
  if (venus && aspectsSign('Venus', venus.signIndex, m))
    out.push(`Mars aspected by Venus${SUFFIX}`);
  const moon = getPlanetPosition(chartData, 'Moon');
  if (moon && waxing === true && aspectsSign('Moon', moon.signIndex, m)) {
    out.push(`Mars aspected by a waxing Moon${SUFFIX}`);
  }
  const mercury = getPlanetPosition(chartData, 'Mercury');
  if (
    mercury &&
    mercuryIsBenefic(chartData, waxing) &&
    aspectsSign('Mercury', mercury.signIndex, m)
  ) {
    out.push(`Mars aspected by Mercury${SUFFIX}`);
  }

  // Raman, Muhurtha p.100: "In Aquarius and Leo, Mars produces no dosha whatsoever."
  if (mars.sign === 'Leo' || mars.sign === 'Aquarius') {
    out.push(`Mars in ${mars.sign}, a sign where it forms no Mangal Dosha${SUFFIX}`);
  }
  return out;
}

function computeAge(birthDate: string, asOf: Date = new Date()): number {
  const birth = new Date(birthDate);
  let age = asOf.getFullYear() - birth.getFullYear();
  const monthDiff = asOf.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function buildDescription(
  present: boolean,
  type: MangalDosha['type'],
  marsHouseFromLagna: number,
  afflicted: Point[],
  remaining: Point[],
  cancellations: string[],
  clearedPoints: { point: Point; reason: string }[],
): string {
  if (!present) return '';

  if (type === 'cancelled') {
    const reason =
      cancellations[0]?.replace(/ - cancellation applies$/, '') ?? 'a traditional exception';
    return `Mars sits in house ${marsHouseFromLagna} from your ${afflicted.join(', ')}, which would normally form Mangal Dosha, but ${reason} — a traditional cancellation that substantially neutralizes its effect.`;
  }
  const cleared = clearedPoints.length
    ? ` From your ${clearedPoints.map((c) => c.point).join(', ')} it is cleared: ${clearedPoints.map((c) => c.reason).join('; ')}.`
    : '';
  if (type === 'full') {
    return `Mars afflicts all three reference points (Lagna, Moon, and Venus) from house ${marsHouseFromLagna}, forming a full Mangal Dosha with no cancellation — traditionally significant for marriage timing and marital harmony.`;
  }
  return `Mars in house ${marsHouseFromLagna} afflicts your ${remaining.join(', ')}, forming a partial Mangal Dosha (${remaining.length} of 3 reference points affected).${cleared}`;
}

export function detectMangalDosha(chartData: ChartData, birthDate?: string): MangalDosha {
  const mars = getPlanetPosition(chartData, 'Mars');

  if (!mars) {
    return {
      present: false,
      severity: 'none',
      percentage: 0,
      fromLagna: false,
      fromMoon: false,
      fromVenus: false,
      marsHouseFromLagna: 0,
      marsHouseFromMoon: 0,
      marsHouseFromVenus: 0,
      cancellations: [],
      type: 'none',
      description: '',
    };
  }

  const moon = getPlanetPosition(chartData, 'Moon');
  const venus = getPlanetPosition(chartData, 'Venus');
  const marsSignIndex = mars.signIndex;

  const marsHouseFromLagna = getHouseFromSign(marsSignIndex, chartData.ascendant.signIndex);
  const marsHouseFromMoon = moon ? getHouseFromSign(marsSignIndex, moon.signIndex) : 0;
  const marsHouseFromVenus = venus ? getHouseFromSign(marsSignIndex, venus.signIndex) : 0;

  const fromLagna = MANGAL_DOSHA_HOUSES.includes(marsHouseFromLagna);
  const fromMoon = moon ? MANGAL_DOSHA_HOUSES.includes(marsHouseFromMoon) : false;
  // Venus with Mars is not a point (see the module comment).
  const fromVenus =
    venus && venus.signIndex !== marsSignIndex
      ? MANGAL_DOSHA_HOUSES.includes(marsHouseFromVenus)
      : false;

  const houseOf: Record<Point, number> = {
    Lagna: marsHouseFromLagna,
    Moon: marsHouseFromMoon,
    Venus: marsHouseFromVenus,
  };
  const afflicted = (['Lagna', 'Moon', 'Venus'] as Point[]).filter(
    (_, i) => [fromLagna, fromMoon, fromVenus][i],
  );
  const present = afflicted.length > 0;
  const percentage = Math.round((afflicted.length / 3) * 100);

  const global = present ? marsExemptions(chartData, mars) : [];
  const perPoint = afflicted
    .filter((pt) => (HOUSE_SIGN_EXCEPTIONS[houseOf[pt]] ?? []).includes(mars.sign))
    .map((pt) => ({
      point: pt,
      reason: `Mars in house ${houseOf[pt]} from ${pt} in ${mars.sign}`,
    }));
  const remaining =
    global.length > 0 ? [] : afflicted.filter((pt) => !perPoint.some((c) => c.point === pt));

  const isCancelled = present && remaining.length === 0;
  const cancellations = isCancelled
    ? [...global, ...perPoint.map((c) => `${c.reason}${SUFFIX}`)]
    : [];
  const clearedPoints = isCancelled ? [] : perPoint;

  let severity: MangalDosha['severity'] = 'none';
  if (present && !isCancelled) {
    severity = remaining.length === 3 ? 'severe' : remaining.length === 2 ? 'moderate' : 'mild';
  }

  let type: MangalDosha['type'] = 'none';
  if (!present) type = 'none';
  else if (isCancelled) type = 'cancelled';
  else if (remaining.length === 3) type = 'full';
  else type = 'partial';

  // True angular distance from Mars to Jupiter, Venus or the Moon when they share its sign
  // (audit G2). Data only: the sign rule decides what cancels.
  const conjunctionSeparations = chartData.planets
    .filter(
      (p) =>
        p.signIndex === marsSignIndex &&
        (p.planet === 'Jupiter' || p.planet === 'Venus' || p.planet === 'Moon'),
    )
    .map((p) => ({ planet: p.planet, deg: separationDeg(p.longitude, mars.longitude) }));

  let description = buildDescription(
    present,
    type,
    marsHouseFromLagna,
    afflicted,
    remaining,
    cancellations,
    clearedPoints,
  );

  // Non-authoritative folk belief: never gates type/severity, only ever adds
  // an informational note to the description when a birth date is supplied.
  if (present && birthDate && computeAge(birthDate) >= 28) {
    description +=
      ' Note: some practitioners informally consider Mangal Dosha to weaken after age 28, though this belief has no basis in traditional texts — treat it as a cultural note, not an astrological rule.';
  }

  return {
    present,
    severity,
    percentage,
    fromLagna,
    fromMoon,
    fromVenus,
    marsHouseFromLagna,
    marsHouseFromMoon,
    marsHouseFromVenus,
    cancellations,
    ...(clearedPoints.length ? { clearedPoints } : {}),
    ...(conjunctionSeparations.length ? { conjunctionSeparations } : {}),
    type,
    description,
  };
}
