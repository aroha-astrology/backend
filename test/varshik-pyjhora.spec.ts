// C0: the engine against PyJHora on the 10 gold charts plus 300 seeded synthetic charts.
// Needs PyJHora (memory pyjhora-runnable). Set PYJHORA_PYTHON to the Python 3.11 that has it;
// without that the whole file is skipped. JHora is the referee: where PyJHora and JHora disagree,
// JHora wins and the difference is pinned below as KNOWN, not treated as an engine bug.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { computeVarshphal } from '../src/lib/astro-engine/varshphal/index.js';
import { computeAllSahams } from '../src/lib/astro-engine/varshphal/sahams.js';
import { zoneOffsetMs } from '../src/lib/astro-engine/varshphal/calendar-year.js';
import { getAstroDay, dayContextAt } from '../src/lib/astro-engine/rules/day.js';
import { TEST_BIRTHS } from './fixtures/varshik/births.js';

const PY = process.env.PYJHORA_PYTHON;
const here = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(here, '..', 'scripts', 'pyjhora', 'run_pyjhora.py');
const JHORA_DIR = path.join(here, 'fixtures', 'jhora');

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
// [zone, latMin, latMax, lngMin, lngMax]; India is weighted 3:1:1.
const ZONES = [
  ['Asia/Kolkata', 8, 35, 68, 97], ['Asia/Kolkata', 8, 35, 68, 97], ['Asia/Kolkata', 8, 35, 68, 97],
  ['Europe/London', 50, 58, -5, 1], ['America/New_York', 25, 47, -84, -71],
] as const;
const dd = (a: number, b: number) => ((((a - b + 540) % 360) + 360) % 360) - 180;
const jhoraReturnMs = (s: string) => {
  const m = s.match(/^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d).*\(([+-])(\d\d):(\d\d)\)/)!;
  return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!) - (m[7] === '-' ? -1 : 1) * (+m[8]! * 60 + +m[9]!) * 60_000;
};

interface Chart { id: string; date: string; time: string; lat: number; lng: number; zone: string; targetYear: number; offsetHours: number; birthUtcMs: number }

function buildCharts(): Chart[] {
  const raw: Omit<Chart, 'offsetHours' | 'birthUtcMs'>[] = [];
  for (const b of TEST_BIRTHS.filter((x) => !['b11', 'b12'].includes(x.id))) {
    for (const y of [2026, 2027]) raw.push({ id: b.id, date: b.date, time: b.time, lat: b.latitude, lng: b.longitude, zone: b.timezone, targetYear: y });
  }
  const r = rng(20261108);
  const p2 = (n: number) => String(n).padStart(2, '0');
  for (let i = 0; i < 300; i++) {
    const z = ZONES[Math.floor(r() * ZONES.length)]!;
    const year = 1950 + Math.floor(r() * 61), mo = 1 + Math.floor(r() * 12), da = 1 + Math.floor(r() * 28);
    const hh = Math.floor(r() * 24), mi = Math.floor(r() * 60);
    raw.push({
      id: `s${String(i).padStart(3, '0')}`, date: `${year}-${p2(mo)}-${p2(da)}`, time: `${p2(hh)}:${p2(mi)}`,
      lat: +(z[1] + r() * (z[2] - z[1])).toFixed(2), lng: +(z[3] + r() * (z[4] - z[3])).toFixed(2), zone: z[0], targetYear: 2027,
    });
  }
  return raw.map((c) => {
    const [y, mo, d] = c.date.split('-').map(Number) as [number, number, number];
    const [h, mi] = c.time.split(':').map(Number) as [number, number];
    const wall = Date.UTC(y, mo - 1, d, h, mi);
    let utc = wall - zoneOffsetMs(wall, c.zone);
    utc = wall - zoneOffsetMs(utc, c.zone);
    return { ...c, offsetHours: (wall - utc) / 3_600_000, birthUtcMs: utc };
  });
}

interface Row {
  id: string; yr: number; retDiffS: number; lagnaDiff: number; dayAgree: boolean;
  sah: Record<string, number>; pyReturnMs: number;
}

async function compare(): Promise<Row[]> {
  const charts = buildCharts();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pyjhora-'));
  const inFile = path.join(dir, 'in.json'), outFile = path.join(dir, 'out.json');
  fs.writeFileSync(inFile, JSON.stringify(charts.map((c) => ({ id: c.id, date: c.date, time: c.time, lat: c.lat, lng: c.lng, tz: c.offsetHours, targetYear: c.targetYear }))));
  execFileSync(PY!, [RUNNER, inFile, outFile], { stdio: 'ignore' });
  const py = JSON.parse(fs.readFileSync(outFile, 'utf8')) as any[];
  const rows: Row[] = [];
  for (let i = 0; i < charts.length; i++) {
    const c = charts[i]!, p = py[i];
    if (p.chartError || p.fatal) throw new Error(`PyJHora failed on ${c.id} ${c.targetYear}: ${p.chartError ?? p.fatal}`);
    const [y, mo, d] = c.date.split('-').map(Number) as [number, number, number];
    const [h, mi] = c.time.split(':').map(Number) as [number, number];
    const natal = await calculateChart(y, mo, d, h, mi, c.offsetHours, c.lat, c.lng, 'lahiri', 'W');
    const vp = await computeVarshphal({
      natalSunLongitude: natal.planets.find((q) => q.planet === 'Sun')!.longitude, natalAscSignIndex: natal.ascendant.signIndex,
      birthDate: new Date(c.birthUtcMs), targetYear: c.targetYear, latitude: c.lat, longitude: c.lng,
    });
    // Cast the engine's chart at PyJHora's own return instant, so the Sun-convention gap stays out of it.
    const t = new Date(p.returnUtcMs);
    const ch = await calculateChart(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(),
      t.getUTCMinutes() + t.getUTCSeconds() / 60 + t.getUTCMilliseconds() / 60_000, 0, c.lat, c.lng, 'lahiri', 'W');
    const ad = await getAstroDay(t, c.lat, c.lng, c.lng / 15);
    const dc = ad ? dayContextAt(ad, t) : null;
    const isDay = dc ? dc.isDay : !p.night;
    const eng: Record<string, number> = {};
    for (const s of computeAllSahams(ch, isDay)) eng[s.name.split(' ')[0]!] = s.longitude;
    rows.push({
      id: c.id, yr: c.targetYear, pyReturnMs: p.returnUtcMs,
      retDiffS: (vp.solarReturn.exactAt.getTime() - p.returnUtcMs) / 1000,
      lagnaDiff: dd(ch.ascendant.signIndex * 30 + ch.ascendant.degree, p.lagna),
      dayAgree: isDay === !p.night,
      sah: Object.fromEntries(Object.entries(p.sahams as Record<string, number>).map(([k, v]) => [k, dd(eng[k]!, v)])),
    });
  }
  return rows;
}

/** A Saham difference that is neither "equal" nor "exactly 30 degrees apart" (the +30 boundary rule). */
const odd = (r: Row, name: string) => {
  const d = Math.abs(r.sah[name]!);
  return d >= 0.15 && Math.abs(d - 30) >= 0.15;
};

describe.skipIf(!PY)('engine against PyJHora (gold charts + 300 synthetic)', () => {
  let rows: Row[] = [];
  const ready = (async () => {
    if (PY) rows = await compare();
  })();

  it('PyJHora against real JHora on the gold charts: known +10-15 s on the return', async () => {
    await ready;
    for (const f of fs.readdirSync(JHORA_DIR).filter((n) => /^b\d+\.partial\.json$/.test(n))) {
      const fx = JSON.parse(fs.readFileSync(path.join(JHORA_DIR, f), 'utf8'));
      for (const yr of [2026, 2027]) {
        const row = rows.find((r) => r.id === fx.id && r.yr === yr);
        if (!row || !fx.varsha[yr]?.solarReturnLocal) continue;
        const dSec = (row.pyReturnMs - jhoraReturnMs(fx.varsha[yr].solarReturnLocal)) / 1000;
        expect(Math.abs(dSec), `${fx.id} ${yr} PyJHora - JHora return, seconds`).toBeLessThanOrEqual(25);
      }
    }
  });

  it('return time: engine is within 15 minutes of PyJHora (nutation and aberration convention), bar PyJHora year-skips', async () => {
    await ready;
    const skips = rows.filter((r) => Math.abs(r.retDiffS) > 300 * 86_400);
    // Known PyJHora quirk: when an old birth's true return falls a day or more after the calendar
    // anniversary, it jumps a whole year. The engine's Sun is back on its natal degree (S1 tests).
    expect(skips.map((r) => r.id)).toEqual(['s067', 's279']);
    for (const r of rows.filter((x) => !skips.includes(x))) expect(Math.abs(r.retDiffS), `${r.id} ${r.yr}`).toBeLessThan(15 * 60);
  });

  it('Varsha Lagna at the same instant: within 0.01 degrees on every chart', async () => {
    await ready;
    for (const r of rows) expect(Math.abs(r.lagnaDiff), `${r.id} ${r.yr}`).toBeLessThan(0.01);
  });

  it('Sahams Punya, Vidya, Rajya, Putra, Vivaha: equal to PyJHora, or exactly 30 degrees apart (the +30 boundary rule)', async () => {
    await ready;
    const usable = rows.filter((r) => r.dayAgree);
    for (const name of ['Punya', 'Vidya', 'Rajya', 'Putra', 'Vivaha']) {
      expect(usable.filter((r) => odd(r, name)).map((r) => `${r.id} ${r.yr}`), name).toEqual([]);
    }
  });

  it('Sahams Pardesh, Artha, Karyasiddhi: KNOWN to differ from PyJHora (JHora decides; the gold charts match JHora)', async () => {
    await ready;
    const usable = rows.filter((r) => r.dayAgree);
    // Measured on this seed: Pardesh 35, Karyasiddhi 23, Artha 35 of 319 outside "equal or 30 apart".
    const ceiling: Record<string, number> = { Pardesh: 40, Karyasiddhi: 30, Artha: 40 };
    for (const name of Object.keys(ceiling)) {
      expect(usable.filter((r) => odd(r, name)).length, name).toBeLessThanOrEqual(ceiling[name]!);
    }
  });
});
