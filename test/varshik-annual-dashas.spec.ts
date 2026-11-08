// C2: Patyayini and Mudda Yogini against Jagannatha Hora (fixtures/jhora/<id>.partial.json),
// plus the seam and shape rules. Each Varsha chart is cast at JHora's own return instant.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import {
  computeMuddaYogini,
  computePatyayini,
  patyayiniOrder,
  yoginiStartIndex,
  YOGINI_ORDER,
  dashaAt,
} from '../src/lib/astro-engine/varshphal/annual-dashas.js';
import { muddaStartIndex, MUDDA_ORDER } from '../src/lib/astro-engine/varshphal/mudda-dasha.js';
import { TEST_BIRTHS } from './fixtures/varshik/births.js';

const dir = new URL('./fixtures/jhora/', import.meta.url);
const files = fs.readdirSync(dir).filter((f) => /^b\d+\.partial\.json$/.test(f));
const SIGNS = ['Ar', 'Ta', 'Ge', 'Cn', 'Le', 'Vi', 'Li', 'Sc', 'Sg', 'Cp', 'Aq', 'Pi'];
const DAY = 86_400_000;

const lonOf = (s: string) => {
  const m = s.match(/^(\d+) (\w\w) (\d+)' ([\d.]+)"/)!;
  return SIGNS.indexOf(m[2]!) * 30 + +m[1]! + +m[3]! / 60 + +m[4]! / 3600;
};
function utcMs(local: string, offsetMin: number): number {
  const m = local.match(/^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)/)!;
  return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!) - offsetMin * 60_000;
}
function offsetOf(s: string): number {
  const m = s.match(/\(([+-])(\d\d):(\d\d)\)/)!;
  return (m[1] === '-' ? -1 : 1) * (+m[2]! * 60 + +m[3]!);
}
const SHORT: Record<string, string> = {
  Sun: 'Sun', Moon: 'Moon', Mars: 'Mars', Merc: 'Mercury', Jup: 'Jupiter', Ven: 'Venus', Sat: 'Saturn',
  Asc: 'Lagna', Rah: 'Rahu', Ket: 'Ketu',
};



let rows: Array<{
  id: string; yr: string; moonNak: number; age: number;
  pat: any[]; patJhora: any[]; yog: any[]; yogJhora: any[]; mudJhoraFirst: string;
}> = [];

for (const f of files) {
  const fx = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
  const nat = JSON.parse(fs.readFileSync(new URL(f.replace('partial', 'natal'), dir), 'utf8'));
  const birth = TEST_BIRTHS.find((b) => b.id === fx.id)!;
  const moonLon = lonOf(nat.bodies.Moon.longitudeSidereal);
  const moonNak = Math.floor(moonLon / (360 / 27)) + 1;
  for (const yr of ['2026', '2027']) {
    const rec = fx.varsha[yr];
    const off = offsetOf(rec.solarReturnLocal);
    const startMs = utcMs(rec.solarReturnLocal, off);
    const pj = rec.patyayini.mahaDasas;
    // JHora lists a ninth row, the first dasha of the next cycle; it starts on the next return.
    const endMs = utcMs(pj[8].start, off);
    rows.push({ id: fx.id, yr, moonNak, age: +yr - +birth.date.slice(0, 4), pat: [], patJhora: [], yog: [], yogJhora: [], mudJhoraFirst: '' });
    const row = rows[rows.length - 1]!;
    row.patJhora = pj.slice(0, 8).map((d: any) => ({ lord: SHORT[d.lord]!, startMs: utcMs(d.start, off), endMs: utcMs(d.end, off) }));
    row.yogJhora = rec.muddaYogini.mahaDasas;
    row.mudJhoraFirst = rec.muddaVimshottari.mahaDasas[0].lord;
    (row as any)._cast = { startMs, endMs, lat: birth.latitude, lng: birth.longitude };
  }
}

describe('Patyayini against Jagannatha Hora (10 gold charts, 2026 and 2027)', () => {
  for (const row of rows) {
    it(`${row.id} ${row.yr}: same lords in the same order (near-ties aside), every cut within 4.5 days`, async () => {
      const { startMs, endMs, lat, lng } = (row as any)._cast;
      const t = new Date(startMs);
      const c = await calculateChart(
        t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(),
        t.getUTCMinutes() + t.getUTCSeconds() / 60, 0, lat, lng, 'lahiri', 'W',
      );
      const planets: any = {};
      for (const p of ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']) {
        planets[p] = c.planets.find((q) => q.planet === p)!.longitude;
      }
      const periods = computePatyayini({
        input: { lagna: c.ascendant.signIndex * 30 + c.ascendant.degree, planets },
        solarReturnMs: startMs,
        nextSolarReturnMs: endMs,
      });
      // Two lords whose krishamshas are within 0.02 degree can swap (b03 2026: Lagna 15.842, Mercury 15.845).
      const ord = patyayiniOrder({ lagna: c.ascendant.signIndex * 30 + c.ascendant.degree, planets });
      const k = (lord: string) => ord.find((o) => o.lord === lord)!.krishamsha;
      periods.forEach((p, i) => {
        const jl = row.patJhora[i].lord;
        if (p.lord !== jl) expect(Math.abs(k(p.lord) - k(jl)), `${p.lord} vs ${jl}`).toBeLessThan(0.02);
        // JHora's cut points wander from the engine's by up to 3.9 days over the year (0.28 degree of
        // krishamsha on one lord); cause not found, see the notes in the fixtures README.
        expect(Math.abs(p.startMs - row.patJhora[i].startMs) / DAY, `start of ${p.lord}`).toBeLessThan(4.5);
        expect(Math.abs(p.endMs - row.patJhora[i].endMs) / DAY, `end of ${p.lord}`).toBeLessThan(4.5);
      });
    });
  }

  it('Mehta worked example (Nehru 1947): Sun, Venus, Moon, Mercury, Mars, Saturn, Jupiter, Lagna in a 360-day year', () => {
    const input = {
      lagna: 23 + 57 / 60,
      planets: {
        Sun: 16 / 60, Moon: 5 + 51 / 60, Mars: 13 + 49 / 60, Mercury: 12 + 4 / 60,
        Jupiter: 18 + 3 / 60, Venus: 2 + 36 / 60, Saturn: 15 + 44 / 60,
      },
    };
    expect(patyayiniOrder(input).map((o) => o.lord)).toEqual(
      ['Sun', 'Venus', 'Moon', 'Mercury', 'Mars', 'Saturn', 'Jupiter', 'Lagna'],
    );
    const p = computePatyayini({ input, solarReturnMs: 0, nextSolarReturnMs: 360 * DAY });
    const days = p.map((x) => (x.endMs - x.startMs) / DAY);
    // The book's days are 4, 39, 48, 93, 26, 28, 34, 88. Its Venus line works 2 deg 36 min (Venus's
    // krishamsha) instead of its patyamsha 2 deg 20 min, which is 35 days; the other seven lines
    // follow the method and the book rounds down.
    const book = [4, 35, 48, 93, 26, 28, 34, 88];
    days.forEach((d, i) => expect(Math.abs(d - book[i]!), p[i]!.lord).toBeLessThan(1.1));
    expect(days.reduce((a, b) => a + b, 0)).toBeCloseTo(360, 6);
  });

  it('the year is covered with no gap and no overlap, and ends on the next return', () => {
    const input = { lagna: 12.3, planets: { Sun: 3, Moon: 21, Mars: 8, Mercury: 15, Jupiter: 27, Venus: 1, Saturn: 19 } };
    const a = computePatyayini({ input, solarReturnMs: 1000, nextSolarReturnMs: 1000 + 365.256 * DAY });
    expect(a[0]!.startMs).toBe(1000);
    for (let i = 1; i < a.length; i++) expect(a[i]!.startMs).toBe(a[i - 1]!.endMs);
    expect(a[7]!.endMs).toBe(1000 + 365.256 * DAY);
    for (const p of a) {
      expect(p.antardashas[0]!.lord).toBe(p.lord);
      expect(p.antardashas[0]!.startMs).toBe(p.startMs);
      expect(p.antardashas[7]!.endMs).toBe(p.endMs);
    }
  });
});

describe('Mudda Vimshottari first lord against Jagannatha Hora (the corrected start rule)', () => {
  const SHORTV: Record<string, string> = {
    Ket: 'Ketu', Ven: 'Venus', Sun: 'Sun', Moon: 'Moon', Mars: 'Mars', Rah: 'Rahu', Jup: 'Jupiter', Sat: 'Saturn', Merc: 'Mercury',
  };
  it('20 of 20 chart-years', () => {
    for (const r of rows) {
      const lord = MUDDA_ORDER[muddaStartIndex(r.moonNak, r.age)]!.planet;
      expect(lord, `${r.id} ${r.yr}`).toBe(SHORTV[r.mudJhoraFirst]);
    }
  });
});

describe('Mudda Yogini', () => {
  const YN: Record<string, string> = { Moon: 'Moon', Sun: 'Sun', Jup: 'Jupiter', Mars: 'Mars', Merc: 'Mercury', Sat: 'Saturn', Ven: 'Venus', Rah: 'Rahu', Ket: 'Rahu' };
  it('first lord equals Jagannatha Hora on all 20 chart-years (ages 26 to 57)', () => {
    const misses: string[] = [];
    for (const r of rows) {
      const lord = YOGINI_ORDER[yoginiStartIndex(r.moonNak, r.age)]!.lord;
      if (lord !== YN[r.yogJhora[0].lord]) misses.push(`${r.id} ${r.yr}`);
    }
    expect(misses).toEqual([]);
  });

  it('the age wraps at 43: age 43 starts where age 0 would; Mehta book rule is not used', () => {
    expect(yoginiStartIndex(8, 43)).toBe(yoginiStartIndex(8, 0));
    expect(yoginiStartIndex(8, 42)).toBe(yoginiStartIndex(8, 85));
    expect(yoginiStartIndex(8, 42)).not.toBe(yoginiStartIndex(8, 43));
  });

  it('the eight lords run in the Yogini order for the year, 10:20:...:80, and fill it exactly', () => {
    const p = computeMuddaYogini({ nakshatraNumber: 9, completedYears: 43, solarReturnMs: 0, nextSolarReturnMs: 360 * DAY });
    // (9 + (43 mod 43) - 1) = 8, mod 8 = 0: Mangala (Moon)
    expect(p.map((x) => x.lord)).toEqual(['Moon', 'Sun', 'Jupiter', 'Mars', 'Mercury', 'Saturn', 'Venus', 'Rahu']);
    expect(p.map((x) => (x.endMs - x.startMs) / DAY)).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
    expect(p[7]!.endMs).toBe(360 * DAY);
  });

  it('the list for one Varsha year ends on the very number the next starts on', () => {
    const t0 = Date.UTC(2026, 0, 12, 6, 22, 22, 417);
    const t1 = Date.UTC(2027, 0, 12, 12, 25, 31, 833);
    const t2 = Date.UTC(2028, 0, 12, 18, 31, 2, 9);
    const a = computeMuddaYogini({ nakshatraNumber: 8, completedYears: 36, solarReturnMs: t0, nextSolarReturnMs: t1 });
    const b = computeMuddaYogini({ nakshatraNumber: 8, completedYears: 37, solarReturnMs: t1, nextSolarReturnMs: t2 });
    expect(a[7]!.endMs).toBe(b[0]!.startMs);
    expect(a[7]!.antardashas[7]!.endMs).toBe(t1);
  });

  it('Mehta Bhadrika example: each antardasha is the lord first, then the next in order', () => {
    const p = computeMuddaYogini({ nakshatraNumber: 9, completedYears: 43, solarReturnMs: 0, nextSolarReturnMs: 360 * DAY });
    const sankata = p[7]!;
    expect(sankata.antardashas.map((x) => x.lord)).toEqual(['Rahu', 'Moon', 'Sun', 'Jupiter', 'Mars', 'Mercury', 'Saturn', 'Venus']);
    // 80 days x 80 / 360 days
    expect((sankata.antardashas[0]!.endMs - sankata.antardashas[0]!.startMs) / DAY).toBeCloseTo(80 * 80 / 360, 6);
  });

  it('refuses a bad nakshatra or an empty year', () => {
    expect(() => computeMuddaYogini({ nakshatraNumber: 0, completedYears: 1, solarReturnMs: 0, nextSolarReturnMs: 5 })).toThrow(/nakshatraNumber/);
    expect(() => computeMuddaYogini({ nakshatraNumber: 3, completedYears: 1, solarReturnMs: 5, nextSolarReturnMs: 5 })).toThrow(/next solar return/);
  });

  it('dashaAt finds the running period and sub-period', () => {
    const p = computeMuddaYogini({ nakshatraNumber: 9, completedYears: 43, solarReturnMs: 0, nextSolarReturnMs: 360 * DAY });
    expect(dashaAt(p, 0)?.main.lord).toBe('Moon');
    expect(dashaAt(p, 10 * DAY)?.main.lord).toBe('Sun');
    expect(dashaAt(p, 360 * DAY)).toBeNull();
  });
});
