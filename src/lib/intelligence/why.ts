// =============================================================================
// "Why Aroha is saying this" — rule-based evidence for a life area
// =============================================================================
// Turns a ChartContext into a short, ranked list of WhyFactors for one area:
// the running dasha lords and how they're tied to the area, the area's house
// lord and occupants, and the slow planets moving through the area's houses.
// No AI call: every factor is a fact read off the chart, so the same chart on
// the same day always gives the same explanation, in any language.
// =============================================================================

import type { Planet } from '@aroha-astrology/shared';
import { NATURAL_BENEFICS } from '@aroha-astrology/shared';
import { AREA_CONFIG, type LifeArea } from './areas.js';
import type { ChartContext, DashaNow } from './chart-context.js';
import type { WhyFactor } from './types.js';

const KENDRA_TRIKONA = new Set([1, 4, 5, 7, 9, 10]);
const DUSTHANA = new Set([6, 8, 12]);

/**
 * Classical gochara: houses from the natal Moon where each planet's transit
 * is favourable. Anything else is treated as a strain for that planet.
 */
const GOCHARA_FAVOURABLE: Record<string, readonly number[]> = {
  Sun: [3, 6, 10, 11],
  Moon: [1, 3, 6, 7, 10, 11],
  Mars: [3, 6, 11],
  Mercury: [2, 4, 6, 8, 10, 11],
  Jupiter: [2, 5, 7, 9, 11],
  Venus: [1, 2, 3, 4, 5, 8, 9, 11, 12],
  Saturn: [3, 6, 11],
  Rahu: [3, 6, 11],
  Ketu: [3, 6, 11],
};

/** Slow planets whose transit through a house colours it for months. */
const SLOW_PLANETS: readonly Planet[] = ['Jupiter', 'Saturn', 'Rahu'];

/** Tara bala (1-9) that support the day; 3, 5 and 7 strain it; 1 (Janma) is mixed. */
const GOOD_TARAS = new Set([2, 4, 6, 8, 9]);
const BAD_TARAS = new Set([3, 5, 7]);

const MAX_FACTORS = 5;

function isBenefic(planet: Planet): boolean {
  return (NATURAL_BENEFICS as readonly string[]).includes(planet);
}

function natalHouseOf(ctx: ChartContext, planet: Planet): number | undefined {
  return ctx.natal.find((p) => p.planet === planet)?.house;
}

/** Houses (from the Ascendant) a planet rules. */
function housesRuledBy(ctx: ChartContext, planet: Planet): number[] {
  return Object.entries(ctx.houseLords)
    .filter(([, lord]) => lord === planet)
    .map(([h]) => Number(h));
}

/** +1 in a kendra/trikona, -1 in a dusthana, 0 otherwise. */
function placementEffect(house: number | undefined): -1 | 0 | 1 {
  if (house == null) return 0;
  if (KENDRA_TRIKONA.has(house)) return 1;
  if (DUSTHANA.has(house)) return -1;
  return 0;
}

function dashaFactor(
  ctx: ChartContext,
  area: LifeArea,
  period: DashaNow,
  level: 'mahadasha' | 'antardasha',
): WhyFactor {
  const cfg = AREA_CONFIG[area];
  const ruled = housesRuledBy(ctx, period.planet).filter((h) => cfg.houses.includes(h));
  const placed = natalHouseOf(ctx, period.planet);
  const linkedHouse =
    ruled[0] ?? (placed != null && cfg.houses.includes(placed) ? placed : undefined);
  const isKaraka = cfg.karakas.includes(period.planet);
  const tied = linkedHouse != null || isKaraka;

  return {
    kind: 'dasha',
    level,
    planet: period.planet,
    ...(linkedHouse != null ? { house: linkedHouse } : {}),
    // A lord tied to the area speaks for it; its natal placement says in which direction.
    effect: tied ? (placementEffect(placed) === -1 ? -1 : 1) : 0,
    textKey:
      linkedHouse != null
        ? `why.dasha.${level}Linked`
        : isKaraka
          ? `why.dasha.${level}Karaka`
          : `why.dasha.${level}`,
    params: {
      planet: period.planet,
      until: period.endDate.slice(0, 10),
      ...(linkedHouse != null ? { house: linkedHouse } : {}),
    },
  };
}

function lordshipFactor(ctx: ChartContext, area: LifeArea): WhyFactor | null {
  const house = AREA_CONFIG[area].houses[0]!;
  const lord = ctx.houseLords[house];
  if (!lord) return null;
  const placed = natalHouseOf(ctx, lord);
  if (placed == null) return null;
  return {
    kind: 'lordship',
    planet: lord,
    house,
    effect: placementEffect(placed),
    textKey: 'why.lordship',
    params: { planet: lord, house, placed },
  };
}

function occupantFactors(ctx: ChartContext, area: LifeArea): WhyFactor[] {
  const house = AREA_CONFIG[area].houses[0]!;
  return ctx.natal
    .filter((p) => p.house === house)
    .map((p) => ({
      kind: 'house' as const,
      planet: p.planet,
      house,
      effect: isBenefic(p.planet) ? 1 : -1,
      textKey: 'why.occupant',
      params: { planet: p.planet, house },
    }));
}

function transitFactors(ctx: ChartContext, area: LifeArea): WhyFactor[] {
  const cfg = AREA_CONFIG[area];
  const out: WhyFactor[] = [];
  for (const t of ctx.transits) {
    const slow = SLOW_PLANETS.includes(t.planet);
    const karaka = cfg.karakas.includes(t.planet) && t.planet !== 'Moon' && t.planet !== 'Sun';
    if (!slow && !karaka) continue;
    // Counted from the Moon (gochara), shown when that house belongs to the area.
    const inArea = cfg.houses.includes(t.houseFromMoon) || cfg.houses.includes(t.houseFromLagna);
    if (!inArea && !karaka) continue;
    const favourable = GOCHARA_FAVOURABLE[t.planet]?.includes(t.houseFromMoon) ?? false;
    out.push({
      kind: 'transit',
      planet: t.planet,
      house: t.houseFromMoon,
      sign: t.sign,
      effect: favourable ? 1 : -1,
      textKey: t.isRetrograde && t.planet !== 'Rahu' ? 'why.transitRetro' : 'why.transit',
      params: { planet: t.planet, house: t.houseFromMoon, sign: t.sign },
    });
  }
  return out;
}

/** The day's own texture: where the Moon is, and the tara of today's star from the birth star. */
function dayFactors(ctx: ChartContext): WhyFactor[] {
  const out: WhyFactor[] = [];
  const moon = ctx.transits.find((t) => t.planet === 'Moon');
  if (!moon) return out;
  out.push({
    kind: 'transit',
    planet: 'Moon',
    house: moon.houseFromMoon,
    sign: moon.sign,
    effect: GOCHARA_FAVOURABLE.Moon!.includes(moon.houseFromMoon) ? 1 : -1,
    textKey: 'why.moonToday',
    params: { house: moon.houseFromMoon, sign: moon.sign },
  });
  const tara = (((moon.nakshatraIndex - ctx.moonNakshatraIndex + 27) % 27) % 9) + 1;
  out.push({
    kind: 'nakshatra',
    effect: GOOD_TARAS.has(tara) ? 1 : BAD_TARAS.has(tara) ? -1 : 0,
    textKey: 'why.tara',
    params: { tara },
  });
  return out;
}

const KIND_PRIORITY: Record<WhyFactor['kind'], number> = {
  dasha: 0,
  transit: 1,
  nakshatra: 2,
  lordship: 3,
  house: 4,
  yoga: 5,
  panchang: 6,
};

/**
 * The evidence behind a reading for `area`, most telling first, at most five.
 * Dasha factors always lead (they set the season); a factor that pushes one
 * way outranks a neutral one of the same kind.
 */
export function explainArea(area: LifeArea, ctx: ChartContext): WhyFactor[] {
  const factors: WhyFactor[] = [];
  if (ctx.dasha.mahadasha) factors.push(dashaFactor(ctx, area, ctx.dasha.mahadasha, 'mahadasha'));
  if (ctx.dasha.antardasha)
    factors.push(dashaFactor(ctx, area, ctx.dasha.antardasha, 'antardasha'));
  factors.push(...transitFactors(ctx, area));
  if (area === 'overall') factors.push(...dayFactors(ctx));
  const lordship = lordshipFactor(ctx, area);
  if (lordship) factors.push(lordship);
  factors.push(...occupantFactors(ctx, area));

  return factors
    .map((f, i) => ({ f, i }))
    .sort(
      (a, b) =>
        KIND_PRIORITY[a.f.kind] - KIND_PRIORITY[b.f.kind] ||
        Math.abs(b.f.effect) - Math.abs(a.f.effect) ||
        a.i - b.i,
    )
    .slice(0, MAX_FACTORS)
    .map(({ f }) => f);
}

/** Net lean of a factor list: sum of effects, for callers that need a direction. */
export function netEffect(factors: readonly WhyFactor[]): number {
  return factors.reduce((sum, f) => sum + f.effect, 0);
}
