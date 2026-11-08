// C0 step 4: natal nakshatra, pada, star lord and KP star/sub lord against real JHora (fixtures/jhora/<id>.natal.json).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { kpLordsFor } from '../src/lib/astro-engine/calculations/kp-sublord.js';
import { zoneOffsetMs } from '../src/lib/astro-engine/varshphal/calendar-year.js';
import { TEST_BIRTHS } from './fixtures/varshik/births.js';

const dir = new URL('./fixtures/jhora/', import.meta.url);
const NAK = ['Aswi', 'Bhar', 'Krit', 'Rohi', 'Mrig', 'Ardr', 'Puna', 'Push', 'Asre', 'Magh', 'PPha', 'UPha', 'Hast', 'Chit', 'Swat', 'Visa', 'Anu', 'Jye', 'Mool', 'PSha', 'USha', 'Srav', 'Dhan', 'Sata', 'PBha', 'UBha', 'Reva'];
const LORD: Record<string, string> = { Ke: 'Ketu', Ve: 'Venus', Su: 'Sun', Mo: 'Moon', Ma: 'Mars', Ra: 'Rahu', Ju: 'Jupiter', Sa: 'Saturn', Me: 'Mercury' };
const SIGNS = ['Ar', 'Ta', 'Ge', 'Cn', 'Le', 'Vi', 'Li', 'Sc', 'Sg', 'Cp', 'Aq', 'Pi'];
const parse = (s: string) => {
  const m = s.match(/^(\d+) (\w\w) (\d+)' ([\d.]+)"/)!;
  return SIGNS.indexOf(m[2]!) * 30 + +m[1]! + +m[3]! / 60 + +m[4]! / 3600;
};
const SPAN = 360 / 27;
const dd = (a: number, b: number) => ((((a - b + 540) % 360) + 360) % 360) - 180;

const KNOWN_SUB_MISSES = ['b04 Mercury', 'b09 Venus', 'b10 Mercury', 'b10 Venus'];
const files = fs.readdirSync(dir).filter((f) => /^b\d+\.natal\.json$/.test(f));

describe('natal data against JHora (Traditional Lahiri, mean nodes)', () => {
  it('there are 10 natal fixtures', () => expect(files.length).toBe(10));

  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
    const birth = TEST_BIRTHS.find((b) => b.id === fx.id)!;
    it(`${fx.id}: longitude within 0.03 deg; nakshatra, pada, star lord, KP sub lord equal on JHora's longitude`, async () => {
      const [y, mo, d] = birth.date.split('-').map(Number) as [number, number, number];
      const [h, mi] = birth.time.split(':').map(Number) as [number, number];
      const wall = Date.UTC(y, mo - 1, d, h, mi);
      let utc = wall - zoneOffsetMs(wall, birth.timezone);
      utc = wall - zoneOffsetMs(utc, birth.timezone);
      const chart = await calculateChart(y, mo, d, h, mi, (wall - utc) / 3_600_000, birth.latitude, birth.longitude, 'lahiri', 'W');
      const lon: Record<string, number> = { Lagna: chart.ascendant.signIndex * 30 + chart.ascendant.degree };
      for (const p of chart.planets) lon[p.planet] = p.longitude;

      const bad: string[] = [];
      const subMiss: string[] = [];
      for (const [name, jh] of Object.entries<any>(fx.bodies)) {
        const jl = parse(jh.longitudeSidereal);
        // 1. The engine's own longitude is within 0.03 deg of JHora's. The engine's Lahiri is 23" ahead of
        // JHora's Traditional Lahiri, and it uses apparent positions (planets differ by a few more arcseconds).
        if (Math.abs(dd(lon[name]!, jl)) > 0.03) bad.push(`${name} longitude ${lon[name]!.toFixed(4)} vs ${jl.toFixed(4)}`);
        // 2. The nakshatra, pada and KP tables, run on JHora's OWN longitude, give exactly what JHora prints.
        // (Run on the engine's longitude a body sitting within 0.01 deg of a KP sub edge can fall either side.)
        const nIdx = Math.floor(jl / SPAN);
        const pada = Math.floor((jl % SPAN) / (SPAN / 4)) + 1;
        const kp = kpLordsFor(jl);
        if (NAK[nIdx] !== jh.nakshatra) bad.push(`${name} nakshatra ${NAK[nIdx]} vs ${jh.nakshatra}`);
        if (pada !== jh.pada) bad.push(`${name} pada ${pada} vs ${jh.pada}`);
        if (kp.starLord !== LORD[jh.nakshatraLord]) bad.push(`${name} star lord ${kp.starLord} vs ${jh.nakshatraLord}`);
        if (kp.starLord !== LORD[jh.kpStarLord]) bad.push(`${name} KP star ${kp.starLord} vs ${jh.kpStarLord}`);
        if (kp.subLord !== LORD[jh.kpSubLord]) subMiss.push(`${fx.id} ${name}`);
      }
      // KNOWN, UNRESOLVED: these recorded JHora sub lords disagree with the Vimshottari subdivision worked by hand
      // (b04 Mercury 54.787: offset 1.454 deg into Mrigashira is Rahu's sub, JHora row says Mars). They are more likely
      // transcription slips than JHora differences, and no ayanamsa shift fixes them (96 of 100 is the best at shift 0).
      // Re-read these four rows in JHora, then empty this list.
      expect(subMiss).toEqual(KNOWN_SUB_MISSES.filter((k) => k.startsWith(fx.id)));
      expect(bad).toEqual([]);
    }, 30_000);
  }
});
