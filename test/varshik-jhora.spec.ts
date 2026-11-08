// C0: the engine against real Jagannatha Hora output (fixtures/jhora/<id>.partial.json).
// Each Varsha chart is cast at JHora's own return instant, so the Sun-longitude convention gap
// (JHora: mean equinox, geometric; engine: nutated, to match Drik Panchang) stays out of it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { computeAllSahams } from '../src/lib/astro-engine/varshphal/sahams.js';
import { computeMuntha } from '../src/lib/astro-engine/varshphal/muntha.js';
import { getAstroDay, dayContextAt } from '../src/lib/astro-engine/rules/day.js';
import { TEST_BIRTHS, inputsFor } from './fixtures/varshik/births.js';

const dir = new URL('./fixtures/jhora/', import.meta.url);
// JHora differences nobody has explained yet (none at the moment).
const KNOWN: string[] = [];
const files = fs.readdirSync(dir).filter((f) => /^b\d+\.partial\.json$/.test(f));
const SIGNS = ['Ar', 'Ta', 'Ge', 'Cn', 'Le', 'Vi', 'Li', 'Sc', 'Sg', 'Cp', 'Aq', 'Pi'];
const parse = (s: string) => {
  const m = s.match(/^(\d+) (\w\w) (\d+)' ([\d.]+)"/)!;
  return SIGNS.indexOf(m[2]!) * 30 + +m[1]! + +m[3]! / 60 + +m[4]! / 3600;
};
const diff = (a: number, b: number) => ((((a - b + 540) % 360) + 360) % 360) - 180;
/** "2026-01-12 11:52:22 IST (+05:30)" -> UT Date. */
function returnUtc(s: string): Date {
  const m = s.match(/^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d).*\(([+-])(\d\d):(\d\d)\)/)!;
  const off = (m[7] === '-' ? -1 : 1) * (+m[8]! * 60 + +m[9]!) * 60_000;
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!) - off);
}

for (const f of files) {
  const fx = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
  const birth = TEST_BIRTHS.find((b) => b.id === fx.id)!;
  describe.each(['2026', '2027'])(`${fx.id} Varsha %s against JHora`, (yr) => {
    const rec = fx.varsha[yr];
    it('Lagna, Muntha sign and all Sahams match within 0.05 degrees', async () => {
      if (!rec?.sahams?.values) return; // this year is not recorded yet
      const t = returnUtc(rec.solarReturnLocal);
      const c = await calculateChart(
        t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(),
        t.getUTCMinutes() + t.getUTCSeconds() / 60, 0, birth.latitude, birth.longitude, 'lahiri', 'W',
      );
      expect(Math.abs(diff(c.ascendant.signIndex * 30 + c.ascendant.degree, parse(rec.varshaLagnaSidereal)))).toBeLessThan(0.05);

      const inp = await inputsFor(birth);
      const muntha = computeMuntha(+yr - +birth.date.slice(0, 4), inp.natalAscSignIndex, c.ascendant.signIndex);
      expect(SIGNS[muntha.signIndex], 'Muntha sign').toBe(rec.muntha.longitudeSidereal.match(/^\d+ (\w\w)/)[1]);

      // Tri-Pataki placements: each planet's sign equals the engine's (skip a planet within 0.05 deg of a sign edge).
      const tp = rec.triPataki?.placements as Record<string, string> | undefined;
      if (tp) {
        const wrong: string[] = [];
        const lonOf = (n: string) => (n === 'Asc' ? c.ascendant.signIndex * 30 + c.ascendant.degree : c.planets.find((q) => q.planet === n)!.longitude);
        for (const [name, val] of Object.entries(tp)) {
          const lon = lonOf(name);
          const edge = Math.min(lon % 30, 30 - (lon % 30));
          if (edge < 0.05) continue;
          const jh = String(val).slice(0, 2);
          if (SIGNS[Math.floor(lon / 30)] !== jh) wrong.push(`${name}: engine ${SIGNS[Math.floor(lon / 30)]}, JHora ${jh}`);
        }
        expect(wrong, `${fx.id} ${yr} Tri-Pataki`).toEqual([]);
      }

      const astroDay = await getAstroDay(t, birth.latitude, birth.longitude, birth.longitude / 15);
      const isDay = dayContextAt(astroDay!, t)!.isDay;
      const off: string[] = [];
      for (const s of computeAllSahams(c, isDay)) {
        const name = s.name.split(' ')[0]!;
        const jhora = rec.sahams.values[name === 'Pardesh' ? 'Paradesa' : name];
        if (Math.abs(diff(s.longitude, parse(jhora))) >= 0.05) off.push(`${fx.id} ${yr} ${name}`);
      }
      expect(off).toEqual(KNOWN.filter((k) => k.startsWith(`${fx.id} ${yr} `)));
    }, 30_000);
  });
}
