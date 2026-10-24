// =============================================================================
// Ghar Ka Kavach — who in the family could use some care today (pure)
// =============================================================================
// Each member's day is read from their own birth Moon against today's Moon: the Tara (star count) and
// the Chandrabala (Moon house), which together give a quality poor / average / good / excellent. The
// member with the poorest day is the one the reader chants for; ties go to the lower circle pulse, then
// to the name, so the pick is stable. The planet to chant for is the lord of the nakshatra the Moon is
// in today. Words say "could use some care", never that something bad will happen.
// =============================================================================

import { dailyLunarAssessment } from '../tara-bala.js';
import { KAVACH_BEADS } from './weights.js';

export type DayQuality = 'excellent' | 'good' | 'average' | 'poor';

export interface KavachCandidate {
  id: string;
  name: string;
  /** Their birth Moon and today's Moon, as indexes. */
  natalNakshatra: number;
  natalSign: number;
  todayNakshatra: number;
  todaySign: number;
  pulse: number | null;
}

export interface KavachPick {
  id: string;
  name: string;
  quality: DayQuality;
  taraName: string;
  taraNumber: number;
  chandraHouse: number;
  planet: string;
  mantra: string;
  beads: number;
  /** Everyone's quality that day, worst first, for the "why" line. */
  ranked: { id: string; name: string; quality: DayQuality; taraName: string }[];
}

const RANK: Record<DayQuality, number> = { poor: 0, average: 1, good: 2, excellent: 3 };

/** Vimshottari lords repeat every nine nakshatras from Ashwini. */
const NAK_LORDS = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];

export const NAME_IN_HINDI: Record<string, string> = {
  Sun: 'Surya', Moon: 'Chandra', Mars: 'Mangal', Mercury: 'Budh', Jupiter: 'Guru', Venus: 'Shukra', Saturn: 'Shani', Rahu: 'Rahu', Ketu: 'Ketu',
};

/** The standard Navagraha beej mantras, one line each. */
export const BEEJ_MANTRA: Record<string, string> = {
  Sun: 'Om Hraam Hreem Hraum Sah Suryaya Namah',
  Moon: 'Om Shraam Shreem Shraum Sah Chandraya Namah',
  Mars: 'Om Kraam Kreem Kraum Sah Bhaumaya Namah',
  Mercury: 'Om Braam Breem Braum Sah Budhaya Namah',
  Jupiter: 'Om Graam Greem Graum Sah Gurave Namah',
  Venus: 'Om Draam Dreem Draum Sah Shukraya Namah',
  Saturn: 'Om Praam Preem Praum Sah Shanaishcharaya Namah',
  Rahu: 'Om Bhraam Bhreem Bhraum Sah Rahave Namah',
  Ketu: 'Om Sraam Sreem Sraum Sah Ketave Namah',
};

export const nakshatraLord = (nakshatraIndex: number): string => NAK_LORDS[((nakshatraIndex % 27) + 27) % 9]!;

export function pickKavach(people: KavachCandidate[]): KavachPick | null {
  if (people.length === 0) return null;
  const rows = people.map((p) => {
    const a = dailyLunarAssessment(p.natalNakshatra, p.natalSign, p.todayNakshatra, p.todaySign);
    return { p, quality: a.overallQuality as DayQuality, tara: a.taraBala, house: a.chandrabala.house };
  });
  rows.sort(
    (x, y) =>
      RANK[x.quality] - RANK[y.quality] ||
      (x.p.pulse ?? 50) - (y.p.pulse ?? 50) ||
      x.p.name.localeCompare(y.p.name) ||
      x.p.id.localeCompare(y.p.id),
  );
  const top = rows[0]!;
  const planet = nakshatraLord(top.p.todayNakshatra);
  return {
    id: top.p.id,
    name: top.p.name,
    quality: top.quality,
    taraName: top.tara.taraName,
    taraNumber: top.tara.taraNumber,
    chandraHouse: top.house,
    planet,
    mantra: BEEJ_MANTRA[planet] ?? '',
    beads: KAVACH_BEADS,
    ranked: rows.map((r) => ({ id: r.p.id, name: r.p.name, quality: r.quality, taraName: r.tara.taraName })),
  };
}
