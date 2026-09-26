// =============================================================================
// KP chart — the ephemeris side of the KP Year Ahead report
// =============================================================================
// The stored kundli is computed with the reader's own ayanamsa and (by default)
// whole-sign houses. KP needs neither: it is defined on the Krishnamurti
// ayanamsa and Placidus cusps, and a whole-sign "cusp" would produce confident
// nonsense sub lords (see kp-sublord.ts's cuspalSubLords doc comment). So this
// recomputes the birth moment the KP way — same Julian day as the stored chart,
// never a re-parse of birth date strings — plus one transit snapshot per report
// month and the Ruling Planets moment.
//
// Everything goes through the cached calculatePlanetPositions/calculateHouses,
// so a report re-read costs ~14 cache lookups, not 14 ephemeris runs.
// =============================================================================

import { calculateHouses, calculatePlanetPositions } from '../calculations/planetPositions.js';
import { reportMonths, type KpRawData } from '../reports/kp-annual.js';

const JD_UNIX_EPOCH = 2440587.5;
const MS_DAY = 86_400_000;

/** Placidus is undefined inside the polar circles and unstable just outside them. */
export const PLACIDUS_MAX_LATITUDE = 66;

function jdFromMs(ms: number): number {
  return ms / MS_DAY + JD_UNIX_EPOCH;
}

/** Midday in India (06:30 UT) — the report's reference instant for a calendar date. */
function referenceMs(isoDate: string): number {
  return new Date(`${isoDate}T06:30:00Z`).getTime();
}

export interface KpChartInput {
  /** Birth Julian day (UT), as stored on the kundli's chartData. */
  birthJd: number;
  latitude: number;
  longitude: number;
  /** Report start date, 'YYYY-MM-DD'. */
  start: string;
}

export async function computeKpRawData(input: KpChartInput): Promise<KpRawData> {
  const highLatitude = Math.abs(input.latitude) >= PLACIDUS_MAX_LATITUDE;
  const system = highLatitude ? 'E' : 'P';

  const [natal, houses] = await Promise.all([
    calculatePlanetPositions(input.birthJd, 'krishnamurti'),
    calculateHouses(input.birthJd, input.latitude, input.longitude, system, 'krishnamurti'),
  ]);

  const months = reportMonths(input.start);
  const transits = await Promise.all(
    months.map(async (m) => ({
      date: m.mid,
      planets: (await calculatePlanetPositions(jdFromMs(referenceMs(m.mid)), 'krishnamurti')).map(
        (p) => ({ planet: p.planet, longitude: p.longitude, speed: p.speed }),
      ),
    })),
  );

  const judgementMs = referenceMs(input.start);
  const judgementJd = jdFromMs(judgementMs);
  const [jPlanets, jHouses] = await Promise.all([
    calculatePlanetPositions(judgementJd, 'krishnamurti'),
    calculateHouses(judgementJd, input.latitude, input.longitude, system, 'krishnamurti'),
  ]);

  return {
    birthMs: (input.birthJd - JD_UNIX_EPOCH) * MS_DAY,
    natalPlanets: natal.map((p) => ({ planet: p.planet, longitude: p.longitude, speed: p.speed })),
    cusps: houses.map((h) => h.cusp),
    houseSystem: highLatitude ? 'equal' : 'placidus',
    highLatitude,
    transits,
    judgement: {
      date: input.start,
      weekday: new Date(judgementMs).getUTCDay(),
      moonLongitude: jPlanets.find((p) => p.planet === 'Moon')?.longitude ?? 0,
      ascLongitude: jHouses[0]?.cusp ?? 0,
    },
  };
}
