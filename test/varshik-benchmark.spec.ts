import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeCalendarYearVarshphal } from '../src/lib/astro-engine/varshphal/calendar-year.js';
import { computeTajikaYogas } from '../src/lib/astro-engine/varshphal/tajika-yogas.js';
import { panchavargiBala } from '../src/lib/astro-engine/varshphal/tajika.js';
import { TEST_BIRTHS, inputsFor } from './fixtures/varshik/births.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'varshik');
const snapshotPath = path.join(dir, 'engine-snapshot.json');
const jhoraPath = path.join(dir, 'jhora.json');
const round = (n: number) => Math.round(n * 1e6) / 1e6;

async function build(id: string) {
  const birth = TEST_BIRTHS.find((b) => b.id === id)!;
  const inputs = await inputsFor(birth);
  return { inputs, result: await computeCalendarYearVarshphal(inputs, 2027) };
}

describe('calendar-year Varshphal on the 12 test births (real ephemeris)', () => {
  for (const birth of TEST_BIRTHS) {
    it(`${birth.id} ${birth.place} ${birth.date}: windows, seam and the Sun back on its natal degree`, async () => {
      const { inputs, result } = await build(birth.id);
      const years = result.varshaYears;

      // 365 days of window, one or two Varsha years across it, together covering all of it.
      expect(years.length).toBeGreaterThanOrEqual(1);
      expect(years.length).toBeLessThanOrEqual(2);
      expect(years[0]!.clippedStartMs).toBe(result.windowStartMs);
      expect(years[years.length - 1]!.clippedEndMs).toBe(result.windowEndMs);
      expect((result.windowEndMs - result.windowStartMs) / 86_400_000).toBe(365);
      for (let i = 1; i < years.length; i++) {
        expect(years[i]!.startMs).toBe(years[i - 1]!.endMs);
        // The Mudda seam: one list ends on the number the next one starts on.
        expect(years[i - 1]!.mudda[8]!.endMs).toBe(years[i]!.mudda[0]!.startMs);
      }

      for (const y of years) {
        // The chart is cast at exactly the instant the periods are anchored to.
        expect(y.varshphal.solarReturn.exactAt.getTime()).toBe(y.startMs);
        expect(y.mudda[0]!.startMs).toBe(y.startMs);
        expect(y.mudda[8]!.endMs).toBe(y.endMs);
        // A Varsha year is a sidereal year, give or take the Sun's uneven speed.
        const length = (y.endMs - y.startMs) / 86_400_000;
        expect(length).toBeGreaterThan(365.0);
        expect(length).toBeLessThan(365.5);

        // The Sun is back on its natal longitude (1e-5 degrees is under a second of time).
        const sun = y.varshphal.solarReturn.chart.planets.find((p) => p.planet === 'Sun')!;
        let diff = Math.abs(sun.longitude - inputs.natalSunLongitude);
        if (diff > 180) diff = 360 - diff;
        expect(diff).toBeLessThan(1e-5);
      }
    }, 60_000);
  }
});

describe('engine snapshot (OUR numbers, not JHora: a guard against silent change)', () => {
  it('matches engine-snapshot.json', async () => {
    const out: Record<string, unknown> = {};
    for (const birth of TEST_BIRTHS) {
      const { result } = await build(birth.id);
      out[birth.id] = result.varshaYears.map((y) => {
        const vp = y.varshphal;
        return {
          targetYear: y.targetYear,
          startMs: y.startMs,
          endMs: y.endMs,
          isDayReturn: vp.solarReturn.isDayReturn,
          varshaLagna: round(vp.solarReturn.chart.ascendant.signIndex * 30 + vp.solarReturn.chart.ascendant.degree),
          yearLord: vp.varsheshwara.varsheshwara,
          sahams: Object.fromEntries(vp.sahams.map((s) => [s.name.split(' ')[0], round(s.longitude)])),
          muddaLords: y.mudda.map((m) => m.lord),
          yogas: computeTajikaYogas(vp.solarReturn.chart).map((g) => `${g.kind}:${g.planets.join('+')}`),
        };
      });
    }
    const snapshot = {
      source: 'ENGINE SNAPSHOT, NOT JHora. Rebuild with UPDATE_VARSHIK_SNAPSHOT=1 and read the diff.',
      births: out,
    };
    if (process.env.UPDATE_VARSHIK_SNAPSHOT === '1' || !fs.existsSync(snapshotPath)) {
      fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 1) + '\n');
    }
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(JSON.parse(fs.readFileSync(snapshotPath, 'utf8')));
  }, 180_000);
});

interface JhoraChart {
  id: string;
  targetYear: number;
  solarReturnUtc: string;
  varshaLagnaDeg: number;
  sahams: Record<string, number>;
  yearLord: string;
  panchavargi: Record<string, number>;
  mudda: Array<{ lord: string; startUtc: string }>;
  yogas: Array<{ kind: string; planets: string[] }>;
}

const jhora: { charts: JhoraChart[] } = fs.existsSync(jhoraPath)
  ? JSON.parse(fs.readFileSync(jhoraPath, 'utf8'))
  : { charts: [] };

describe('JHora benchmark (OPEN until jhora.json is recorded)', () => {
  const circ = (a: number, b: number) => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };

  if (jhora.charts.length === 0) {
    it.skip('no JHora output recorded yet: fill test/fixtures/varshik/jhora.json (see README.md)', () => {});
  }

  for (const j of jhora.charts) {
    it(`${j.id} ${j.targetYear} matches JHora within the plan's tolerances`, async () => {
      const { result } = await build(j.id);
      const y = result.varshaYears.find((v) => v.targetYear === j.targetYear)!;
      expect(y).toBeDefined();
      const vp = y.varshphal;

      expect(Math.abs(y.startMs - Date.parse(j.solarReturnUtc))).toBeLessThanOrEqual(2000);
      const lagna = vp.solarReturn.chart.ascendant.signIndex * 30 + vp.solarReturn.chart.ascendant.degree;
      expect(circ(lagna, j.varshaLagnaDeg)).toBeLessThanOrEqual(0.05);
      for (const [name, deg] of Object.entries(j.sahams)) {
        const ours = vp.sahams.find((s) => s.name.startsWith(name))!;
        expect(circ(ours.longitude, deg), `Saham ${name}`).toBeLessThanOrEqual(0.05);
      }
      expect(vp.varsheshwara.varsheshwara).toBe(j.yearLord);
      for (const [planet, value] of Object.entries(j.panchavargi)) {
        const p = panchavargiBala(planet as never, vp.solarReturn.chart);
        expect(p.vimsopaka, `Panchavargi ${planet}`).toBeCloseTo(value, 2);
      }
      expect(y.mudda.map((m) => ({ lord: m.lord, startMs: m.startMs }))).toEqual(
        j.mudda.map((m) => ({ lord: m.lord, startMs: Date.parse(m.startUtc) })),
      );
      const ours = computeTajikaYogas(vp.solarReturn.chart)
        .map((g) => `${g.kind}:${g.planets.join('+')}`)
        .sort();
      expect(ours).toEqual(j.yogas.map((g) => `${g.kind}:${g.planets.join('+')}`).sort());
    }, 60_000);
  }
});
