// =============================================================================
// Daily-return hooks — reading one local day's sky
// =============================================================================
// Adapters between the engine (panchang, planet positions) and the pure hook functions in
// lib/astro-tools/daily-hooks. Nothing here decides anything; it only fetches and reshapes.
// =============================================================================

import type { UserRow } from '../../db/schema.js';
import { calculatePlanetPositions } from '../../lib/astro-engine/calculations/planetPositions.js';
import { jdFromDate } from '../../lib/astro-tools/transit-events.js';
import type { DayWindows, MoonSample, NatalMoon } from '../../lib/astro-tools/daily-hooks/windows.js';
import { toMin } from '../../lib/astro-tools/daily-hooks/windows.js';
import { zonedInstant } from '../../lib/user-time-zone.js';
import { getPanchang } from '../astro/astro.service.js';
import { resolveActiveProfileContext, type ProfileContext } from '../birth-profiles/profile-context.js';
import { loadBondChart } from '../bonds/bonds.service.js';
import type { Place } from './hooks-common.js';

type PanchangShape = {
  vara: string;
  sunriseTime: string;
  sunsetTime: string;
  tithi: { number: number };
  hora?: DayWindows['hora'];
  choghadiya?: DayWindows['choghadiya'];
  rahuKaal: DayWindows['rahuKaal'];
  gulikaKaal: DayWindows['gulikaKaal'];
  yamagandaKaal: DayWindows['yamagandaKaal'];
  abhijitMuhurta: DayWindows['abhijit'];
};

export async function loadDayWindows(place: Place, localDate: string): Promise<DayWindows> {
  const p = (await getPanchang(place.lat, place.lon, localDate, { timeZone: place.tz })) as unknown as PanchangShape;
  return {
    date: localDate,
    vara: p.vara,
    sunrise: p.sunriseTime,
    sunset: p.sunsetTime,
    hora: p.hora ?? [],
    choghadiya: p.choghadiya ?? { day: [], night: [] },
    rahuKaal: p.rahuKaal,
    gulikaKaal: p.gulikaKaal,
    yamagandaKaal: p.yamagandaKaal,
    abhijit: p.abhijitMuhurta,
    tithiNumber: p.tithi.number,
  };
}

/** The tithi (1-30) running at an instant: the Moon's lead over the Sun in 12-degree steps. */
export async function tithiAt(instant: Date): Promise<number> {
  const sky = await calculatePlanetPositions(jdFromDate(instant), 'lahiri');
  const sun = sky.find((p) => p.planet === 'Sun')?.longitude ?? 0;
  const moon = sky.find((p) => p.planet === 'Moon')?.longitude ?? 0;
  return Math.floor((((moon - sun) % 360) + 360) % 360 / 12) + 1;
}

/** The Moon's sign and nakshatra every `stepMin` minutes from sunrise to the next sunrise. */
export async function moonTrack(place: Place, localDate: string, sunriseHHMM: string, stepMin = 60): Promise<MoonSample[]> {
  const start = toMin(sunriseHHMM);
  const out: MoonSample[] = [];
  for (let m = start; m < start + 1440; m += stepMin) {
    const sky = await calculatePlanetPositions(jdFromDate(zonedInstant(localDate, place.tz, m)), 'lahiri');
    const moon = sky.find((p) => p.planet === 'Moon');
    if (moon) out.push({ atMin: m, signIndex: moon.signIndex, nakshatraIndex: moon.nakshatraIndex });
  }
  return out;
}

export interface NatalLoad {
  profile: ProfileContext;
  natalMoon: NatalMoon | null;
  /** True when the chart rests on an exact birth time. */
  exactTime: boolean;
}

/** The reader's active profile and its natal Moon; natalMoon is null when no chart can be read. */
export async function loadNatal(user: UserRow, now: Date): Promise<NatalLoad> {
  const profile = await resolveActiveProfileContext(user);
  const chart = await loadBondChart(user, profile, now).catch(() => null);
  return {
    profile,
    natalMoon: chart ? { signIndex: chart.ctx.moonSignIndex, nakshatraIndex: chart.ctx.moonNakshatraIndex } : null,
    exactTime: profile.birthTimeAccuracy === 'exact',
  };
}
