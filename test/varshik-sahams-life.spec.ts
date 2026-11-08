// C2: the life Sahams against Jagannatha Hora (fixtures/jhora/<id>.partial.json), cast at JHora's return instant.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { LIFE_RULES, rogaLongitude, computeLifeSahams } from '../src/lib/astro-engine/varshphal/sahams-life.js';
import { sahamLongitude, computeAllSahams } from '../src/lib/astro-engine/varshphal/sahams.js';
import { getAstroDay, dayContextAt } from '../src/lib/astro-engine/rules/day.js';
import { TEST_BIRTHS } from './fixtures/varshik/births.js';

const dir = new URL('./fixtures/jhora/', import.meta.url);
const SG = ['Ar', 'Ta', 'Ge', 'Cn', 'Le', 'Vi', 'Li', 'Sc', 'Sg', 'Cp', 'Aq', 'Pi'];
const lon = (s: string) => {
  const m = s.match(/^(\d+) (\w\w) (\d+)' ([\d.]+)"/)!;
  return SG.indexOf(m[2]!) * 30 + +m[1]! + +m[3]! / 60 + +m[4]! / 3600;
};
/** Our key -> the name JHora prints. */
const JHORA_NAME: Record<string, string> = {
  yasha: 'Yasas', mitra: 'Mitra', mahatmya: 'Mahatmya', asha: 'Asha', samartha: 'Samartha',
  bhratri: 'Bhratru', gaurava: 'Gaurava', pitru: 'Pitru', matru: 'Matru', jeeva: 'Jeeva', karma: 'Karma',
  sastra: 'Sastra', bandhu: 'Bandhu', vanik: 'Vanik', sraddha: 'Sraddha', preeti: 'Preeti',
  vyapara: 'Vyapara', shatru: 'Satru', jalapatha: 'Jalapatana', labha: 'Labha',
};
const off = (s: string) => {
  const m = s.match(/\(([+-])(\d\d):(\d\d)\)/)!;
  return (m[1] === '-' ? -1 : 1) * (+m[2]! * 60 + +m[3]!);
};
const toMs = (l: string, o: number) => {
  const m = l.match(/^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)/)!;
  return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!) - o * 60_000;
};
const gap = (a: number, b: number) => Math.abs((((a - b + 540) % 360) + 360) % 360 - 180);

const files = fs.readdirSync(dir).filter((f) => /^b\d+\.partial\.json$/.test(f));
describe.each(files)('%s', (f) => {
  const fx = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
  const birth = TEST_BIRTHS.find((b) => b.id === fx.id)!;
  it.each(['2026', '2027'])('all 21 life Sahams equal JHora within 0.05 degree in %s', async (yr) => {
    const rec = fx.varsha[yr];
    const t = new Date(toMs(rec.solarReturnLocal, off(rec.solarReturnLocal)));
    const c = await calculateChart(
      t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(),
      t.getUTCMinutes() + t.getUTCSeconds() / 60, 0, birth.latitude, birth.longitude, 'lahiri', 'W',
    );
    const ad = await getAstroDay(t, birth.latitude, birth.longitude, birth.longitude / 15);
    const isDay = ad ? dayContextAt(ad, t).isDay : true;
    for (const [key, jname] of Object.entries(JHORA_NAME)) {
      const ours = sahamLongitude((LIFE_RULES as Record<string, any>)[key], c, isDay);
      expect(gap(ours, lon(rec.sahams.values[jname])), `${key} (${jname})`).toBeLessThan(0.05);
    }
    expect(gap(rogaLongitude(c), lon(rec.sahams.values.Roga)), 'Roga').toBeLessThan(0.05);
  });
});

describe('what never comes out', () => {
  it('no Saham named for death, and none of the misfortune ones, in either list', async () => {
    const c = await calculateChart(2026, 1, 12, 6, 22, 0, 28.6, 77.2, 'lahiri', 'W');
    const names = [...computeAllSahams(c, true), ...computeLifeSahams(c, true)].map((s) => s.name.toLowerCase());
    for (const banned of ['mrityu', 'mrithyu', 'apamrityu', 'death', 'kali', 'santapa', 'jadya', 'bandhana', 'paradara']) {
      expect(names.some((n) => n.includes(banned)), banned).toBe(false);
    }
    expect(names.length).toBe(8 + 21);
  });
});
