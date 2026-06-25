// Pre-compute top auspicious dates for a calendar month, per purpose.
// Same for all users (uses India's geographic centre as the lat/lng baseline).
import { findBestMuhurta } from '@aroha-astrology/astro-engine';
import type { MuhurtaType } from '@aroha-astrology/shared';

const INDIA_LAT = 20.5937;
const INDIA_LNG = 78.9629;
const TZ = 'Asia/Kolkata';

// Purposes we expose to the monthly snapshot. Surgery is intentionally
// omitted — it's a clinical decision; surfacing "best surgery date" on a
// general dashboard invites misuse.
const PURPOSES: MuhurtaType[] = [
  'travel',
  'business',
  'namkaran',
  'griha_pravesh',
  'marriage',
  'vehicle_purchase',
  'gold_purchase',
];

export interface MuhurtaPick {
  date: string;       // YYYY-MM-DD (IST)
  time: string;       // HH:MM (IST)
  score: number;
  tithi: string;
  nakshatra: string;
  reasoning: string[];
  warnings: string[];
}

export type MonthlyMuhurtas = Partial<Record<MuhurtaType, MuhurtaPick[]>>;

function fmtIST(d: Date): { date: string; time: string } {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const date = ist.toISOString().split('T')[0];
  const time = `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`;
  return { date, time };
}

export function computeMonthlyMuhurtas(year: number, month: number): MonthlyMuhurtas {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 30, 0)); // 06:00 IST on day 1
  const end = new Date(Date.UTC(year, month, 0, 18, 30, 0));      // 24:00 IST on last day
  const out: MonthlyMuhurtas = {};

  for (const purpose of PURPOSES) {
    const results = findBestMuhurta(purpose, start, end, INDIA_LAT, INDIA_LNG, TZ);
    // findBestMuhurta returns up to 50 sorted by score; collapse per-day to
    // best slot, then take top 5 distinct days.
    const bestPerDay = new Map<string, MuhurtaPick>();
    for (const r of results) {
      const { date, time } = fmtIST(r.dateTime);
      const existing = bestPerDay.get(date);
      if (!existing || r.score > existing.score) {
        bestPerDay.set(date, {
          date, time, score: r.score,
          tithi: r.tithi, nakshatra: r.nakshatra,
          reasoning: r.reasoning, warnings: r.warnings,
        });
      }
    }
    out[purpose] = Array.from(bestPerDay.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }
  return out;
}
