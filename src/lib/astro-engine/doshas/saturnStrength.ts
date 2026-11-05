// =============================================================================
// What softens or sharpens a Saturn transit (Sade Sati, Shani Dhaiya)
// =============================================================================
// Audit M2/M3 and spec-review G6 (2026-11-04). Sade Sati and Dhaiya used to carry one fixed
// severity for every reader. The engine now also says, per sign of the phase, how much natal
// support Saturn has there, so chat, reports and the Kundli card read the same numbers:
//
// - Saturn's own Bhinnashtakavarga bindus in the sign. Phaladeepika 23.11: 0-4 bindus bring loss,
//   expense or fear; 5-8 bring the desired object, gains, high office.
// - The Sarvashtakavarga total in the sign. Phaladeepika 23.20: above 28 the transit is good,
//   below it brings hardship.
// - Saturn's dignity in the sign. Phaladeepika 26.31: a planet in an untoward house does no harm
//   when it is exalted or in its own sign.
// - Saturn's role for the Lagna: Lagna lord (Capricorn, Aquarius) or yogakaraka (Taurus, Libra).
//   This one is common practice, not one of the verses above.
// (Verse numbers checked on wisdomlib, Sastri's translation, 2026-11-04.)
//
// All four are natal facts about a sign, so they hold for the whole phase; only "which sign is
// Saturn in now" changes. The sign stays the official rule for whether the phase is running.
//
// The Sade Sati cycle number (1st, 2nd, 3rd of life) also lives here: it needs the birth moment
// and natal Saturn, which detectCurrentSadeSati does not otherwise have.
// =============================================================================

import type {
  AshtakavargaData,
  ChartData,
  SaturnTransitStrength,
  ZodiacSign,
} from '@aroha-astrology/shared';
import { ZODIAC_SIGNS } from '@aroha-astrology/shared';
import { calculateAshtakavarga } from '../calculations/ashtakavarga.js';
import { signDignity } from '../rules/dignity.js';

/** The birth chart, and its saved Ashtakavarga when the caller has it (computed from the chart otherwise). */
export interface SaturnNatal {
  chart: ChartData;
  ashtakavarga?: AshtakavargaData | null;
}

/** Saturn's mean sidereal period, in days. */
const SATURN_PERIOD_DAYS = 10759.22;
const DAY_MS = 86_400_000;

function tables(natal: SaturnNatal): { saturn: number[]; sarva: number[] } | null {
  const pick = (av: AshtakavargaData | null | undefined) => {
    const saturn = av?.bhinna?.find((b) => b.planet === 'Saturn')?.bindus;
    const sarva = av?.sarva?.bindus;
    return Array.isArray(saturn) &&
      saturn.length === 12 &&
      Array.isArray(sarva) &&
      sarva.length === 12
      ? { saturn, sarva }
      : null;
  };
  return pick(natal.ashtakavarga) ?? pick(calculateAshtakavarga(natal.chart));
}

/** Saturn's role for a Lagna sign index (0 = Aries). */
export function saturnLagnaRole(
  ascSignIndex: number | null | undefined,
): SaturnTransitStrength['lagnaRole'] {
  if (ascSignIndex === 9 || ascSignIndex === 10) return 'lagna-lord';
  if (ascSignIndex === 1 || ascSignIndex === 6) return 'yogakaraka';
  return null;
}

/**
 * Strength rows for the given signs (in the order given), marking the one Saturn is in now.
 * Null when the chart has no Ashtakavarga to read.
 */
export function saturnStrengthFor(
  natal: SaturnNatal,
  signIndexes: number[],
  saturnSignIndexNow: number,
): SaturnTransitStrength | null {
  const t = tables(natal);
  if (!t) return null;
  return {
    lagnaRole: saturnLagnaRole(natal.chart.ascendant?.signIndex),
    signs: signIndexes.map((i) => ({
      sign: ZODIAC_SIGNS[i] as ZodiacSign,
      saturnBindus: Number(t.saturn[i] ?? 0),
      sarvaBindus: Number(t.sarva[i] ?? 0),
      dignity: signDignity('Saturn', i),
      now: i === saturnSignIndexNow,
    })),
  };
}

function birthOf(chart: ChartData): Date | null {
  const jd = Number(chart.julianDay);
  return Number.isFinite(jd) && jd > 0 ? new Date((jd - 2440587.5) * DAY_MS) : null;
}

/**
 * Which Sade Sati of life the window [start, end) is: 1, 2, 3... One that was already running at
 * birth (natal Saturn in the 12th, 1st or 2nd from the Moon) counts as the 1st. Null when the
 * chart has no birth moment or Saturn, or the window ended before birth.
 *
 * Counts Saturn's passes into the 12th sign from the Moon between birth and the window's middle:
 * the travel since birth is the sign-to-sign difference plus whole turns, and the whole turns come
 * from Saturn's mean period (its real place never strays more than about 15 degrees from the mean,
 * far less than the 360 that rounding has to tell apart). The middle of a Sade Sati is always well
 * past that sign's start, so a retrograde step back cannot be miscounted.
 */
export async function sadeSatiCycle(
  natal: SaturnNatal,
  moonSignIndex: number,
  start: Date,
  end: Date,
  saturnLongitudeAt: (d: Date) => Promise<number>,
): Promise<number | null> {
  const birth = birthOf(natal.chart);
  const natalSaturn = natal.chart.planets?.find((p) => p.planet === 'Saturn');
  if (!birth || !natalSaturn || end.getTime() <= birth.getTime()) return null;

  const natalLon = Number(natalSaturn.longitude);
  const houseFromMoon = ((Math.floor(natalLon / 30) - moonSignIndex + 12) % 12) + 1;
  const bornInside = houseFromMoon === 12 || houseFromMoon === 1 || houseFromMoon === 2;

  const mid = new Date((start.getTime() + end.getTime()) / 2);
  if (mid.getTime() <= birth.getTime()) return bornInside ? 1 : null;
  const lonAtMid = await saturnLongitudeAt(mid);
  const meanTravel = (((mid.getTime() - birth.getTime()) / DAY_MS) * 360) / SATURN_PERIOD_DAYS;
  const delta = (((lonAtMid - natalLon) % 360) + 360) % 360;
  const travel = delta + 360 * Math.round((meanTravel - delta) / 360);

  // Each forward pass over the start of the 12th sign from the Moon begins a new Sade Sati.
  const risingStart = ((moonSignIndex + 11) % 12) * 30;
  const firstPass = (((risingStart - natalLon) % 360) + 360) % 360 || 360;
  const passes = travel >= firstPass ? Math.floor((travel - firstPass) / 360) + 1 : 0;
  const cycle = passes + (bornInside ? 1 : 0);
  return cycle > 0 ? cycle : null;
}
