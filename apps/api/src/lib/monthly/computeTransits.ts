// Deterministic monthly transit summary derived from Swiss Ephemeris.
// Same for every user — depends only on (year, month). Sampled at noon IST.
import { dateToJulianDay, calculatePlanetPositions } from '@aroha-astrology/astro-engine';

const RASHI_NAMES = [
  'Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya',
  'Tula', 'Vrischika', 'Dhanu', 'Makara', 'Kumbha', 'Meena',
] as const;

// Planets we care about for monthly transit narrative. Moon moves through every
// sign in ~2.3 days, so its ingresses are noise at month scale — handled via
// the panchang day grid instead.
const TRACKED_PLANETS = new Set([
  'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Rahu', 'Ketu',
]);

// Retrograde-capable (Sun/Moon never go retrograde, Rahu/Ketu are always
// mean-retrograde so calling them "retrograde" adds no information).
const RETRO_CAPABLE = new Set(['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']);

export interface PlanetIngress {
  planet: string;
  fromSign: string;
  toSign: string;
  date: string; // YYYY-MM-DD
}

export interface RetrogradeWindow {
  planet: string;
  start: string | null; // null if already retrograde at month start
  end: string | null;   // null if still retrograde at month end
}

export interface MoonPhase {
  date: string;
  type: 'new_moon' | 'full_moon';
}

export interface MonthlyTransits {
  ingresses: PlanetIngress[];
  retrogrades: RetrogradeWindow[];
  moonPhases: MoonPhase[]; // populated by generate.ts from panchang grid
  notes: string[];          // human-readable highlights for LLM grounding
}

type DailySample = {
  date: string;
  bySign: Record<string, number>;     // planet → signIndex
  byRetro: Record<string, boolean>;   // planet → isRetrograde
};

async function sampleDay(year: number, month: number, day: number): Promise<DailySample> {
  const jd = await dateToJulianDay(year, month, day, 12, 0, 5.5);
  const positions = await calculatePlanetPositions(jd, 'lahiri');
  const bySign: Record<string, number> = {};
  const byRetro: Record<string, boolean> = {};
  for (const p of positions) {
    bySign[p.planet] = p.signIndex;
    byRetro[p.planet] = p.isRetrograde;
  }
  // Ketu is opposite Rahu; not in PLANET_SE_IDS but synthesised here so the
  // narrative can mention Ketu ingresses (always paired with Rahu's).
  if (bySign.Rahu !== undefined) {
    bySign.Ketu = (bySign.Rahu + 6) % 12;
    byRetro.Ketu = byRetro.Rahu;
  }
  return {
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    bySign,
    byRetro,
  };
}

export async function computeMonthlyTransits(year: number, month: number): Promise<MonthlyTransits> {
  const daysInMonth = new Date(year, month, 0).getDate();

  // Sample every day plus one day before the month, so a sign change on day 1
  // is captured as "happened on day 1" rather than missed.
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevLast = new Date(prevYear, prevMonth, 0).getDate();

  const dayJobs: Promise<DailySample>[] = [];
  dayJobs.push(sampleDay(prevYear, prevMonth, prevLast));
  for (let d = 1; d <= daysInMonth; d++) {
    dayJobs.push(sampleDay(year, month, d));
  }
  const samples = await Promise.all(dayJobs);

  const ingresses: PlanetIngress[] = [];
  const retroWindows: RetrogradeWindow[] = [];

  // Detect ingresses by walking pairwise. samples[0] is previous-month tail.
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const cur = samples[i];
    for (const planet of Object.keys(cur.bySign)) {
      if (!TRACKED_PLANETS.has(planet)) continue;
      if (prev.bySign[planet] !== undefined && prev.bySign[planet] !== cur.bySign[planet]) {
        ingresses.push({
          planet,
          fromSign: RASHI_NAMES[prev.bySign[planet]],
          toSign: RASHI_NAMES[cur.bySign[planet]],
          date: cur.date,
        });
      }
    }
  }

  // Retrograde windows — track open windows by planet across the month.
  const open: Record<string, { start: string | null }> = {};
  for (const planet of RETRO_CAPABLE) {
    if (samples[0].byRetro[planet]) open[planet] = { start: null }; // already retrograde at boundary
  }
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1].byRetro;
    const cur = samples[i].byRetro;
    for (const planet of RETRO_CAPABLE) {
      if (!prev[planet] && cur[planet]) {
        open[planet] = { start: samples[i].date };
      } else if (prev[planet] && !cur[planet]) {
        if (open[planet]) {
          retroWindows.push({ planet, start: open[planet].start, end: samples[i].date });
          delete open[planet];
        }
      }
    }
  }
  // Still-open windows at month end
  for (const planet of Object.keys(open)) {
    retroWindows.push({ planet, start: open[planet].start, end: null });
  }

  // Human-readable highlights for the LLM. Just facts, no interpretation.
  const notes: string[] = [];
  for (const ig of ingresses) {
    notes.push(`${ig.planet} enters ${ig.toSign} on ${ig.date}.`);
  }
  for (const rw of retroWindows) {
    if (rw.start && rw.end) notes.push(`${rw.planet} retrograde ${rw.start} to ${rw.end}.`);
    else if (rw.start) notes.push(`${rw.planet} goes retrograde on ${rw.start} (extends past month end).`);
    else if (rw.end) notes.push(`${rw.planet} retrograde at month start, becomes direct ${rw.end}.`);
  }

  return { ingresses, retrogrades: retroWindows, moonPhases: [], notes };
}
