// C0: Gandanta (BPHS ch. 92) checked by an independent restatement of the verse, swept over the whole zodiac,
// plus the 10 gold charts. JHora does not show Gandanta (fixtures/jhora b*.natal.json), so the written source decides.
//   Nakshatra: last 2 ghatikas of Revati, Ashlesha, Jyeshtha and first 2 of Ashwini, Magha, Moola (60 ghatikas = 13d20m).
//   Abhukta Moola (verse 5): last 6 ghatikas of Jyeshtha, first 8 of Moola.
//   Tithi: last 2 ghatikas of a Purna tithi (5, 10, 15) and first 2 of a Nanda tithi (1, 6, 11) (60 ghatikas = 12 deg).
//   Lagna: last and first half ghatika of the junction signs (60 ghatikas = 30 deg).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { detectGandanta } from '../src/lib/astro-engine/doshas/gandanta.js';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { zoneOffsetMs } from '../src/lib/astro-engine/varshphal/calendar-year.js';
import { TEST_BIRTHS } from './fixtures/varshik/births.js';

const NAK = 360 / 27;
const n360 = (x: number) => ((x % 360) + 360) % 360;

function expectedMoon(lon: number) {
  const idx = Math.floor(lon / NAK), off = lon - idx * NAK;
  const g = NAK / 60; // one ghatika of a nakshatra
  const ending = [8, 17, 26].includes(idx) && off >= NAK - 2 * g;
  const starting = [0, 9, 18].includes(idx) && off < 2 * g;
  const abhukta = (idx === 17 && off >= NAK - 6 * g) || (idx === 18 && off < 8 * g);
  return { present: ending || starting, abhukta };
}
function expectedTithi(sun: number, moon: number) {
  const elong = n360(moon - sun);
  const n = Math.floor(elong / 12) + 1; // 1..30
  const inPaksha = ((n - 1) % 15) + 1;
  const off = elong - (n - 1) * 12, g = 12 / 60;
  return { present: ([5, 10, 15].includes(inPaksha) && off >= 12 - 2 * g) || ([1, 6, 11].includes(inPaksha) && off < 2 * g) };
}
function expectedLagna(asc: number) {
  const sign = Math.floor(asc / 30), off = asc - sign * 30, g = 30 / 60;
  return { present: ([3, 7, 11].includes(sign) && off >= 30 - 0.5 * g) || ([4, 8, 0].includes(sign) && off < 0.5 * g) };
}
const stub = (sun: number, moon: number, asc: number): any => ({
  planets: [{ planet: 'Sun', longitude: sun }, { planet: 'Moon', longitude: moon }],
  ascendant: { signIndex: Math.floor(asc / 30), degree: asc % 30 },
});

describe('Gandanta against the verse (independent restatement)', () => {
  it('Moon and Abhukta Moola: swept over the whole zodiac', () => {
    let hits = 0;
    for (let lon = 0.00123; lon < 360; lon += 0.0137) {
      const r = detectGandanta(stub(100, lon, 10), { timeKnown: true });
      const e = expectedMoon(lon);
      expect(r.moon!.present, `moon ${lon}`).toBe(e.present);
      expect(r.abhuktaMoola, `abhukta ${lon}`).toBe(e.abhukta);
      if (e.present) hits++;
    }
    expect(hits).toBeGreaterThan(150); // the sweep really does enter the zones (6 zones of 0.44 deg)
  });

  it('Tithi: swept over a whole lunar month', () => {
    let hits = 0;
    for (let el = 0.00123; el < 360; el += 0.0137) {
      const sun = 40;
      const r = detectGandanta(stub(sun, n360(sun + el), 10), { timeKnown: true });
      const e = expectedTithi(sun, n360(sun + el));
      expect(r.tithi!.present, `tithi ${el}`).toBe(e.present);
      if (e.present) hits++;
    }
    expect(hits).toBeGreaterThan(200);
  });

  it('Lagna: swept over the whole zodiac', () => {
    let hits = 0;
    for (let a = 0.00123; a < 360; a += 0.0137) {
      const r = detectGandanta(stub(100, 200, a), { timeKnown: true });
      const e = expectedLagna(a);
      expect(Boolean(r.lagna?.present), `lagna ${a}`).toBe(e.present);
      if (e.present) hits++;
    }
    expect(hits).toBeGreaterThan(20);
  });

  it('the 10 gold charts: detector equals the restatement on their own Moon, Sun and Lagna', async () => {
    for (const b of TEST_BIRTHS.filter((x) => !['b11', 'b12'].includes(x.id))) {
      const [y, mo, d] = b.date.split('-').map(Number) as [number, number, number];
      const [h, mi] = b.time.split(':').map(Number) as [number, number];
      const wall = Date.UTC(y, mo - 1, d, h, mi);
      let utc = wall - zoneOffsetMs(wall, b.timezone);
      utc = wall - zoneOffsetMs(utc, b.timezone);
      const c = await calculateChart(y, mo, d, h, mi, (wall - utc) / 3_600_000, b.latitude, b.longitude, 'lahiri', 'W');
      const moon = c.planets.find((p) => p.planet === 'Moon')!.longitude, sun = c.planets.find((p) => p.planet === 'Sun')!.longitude;
      const asc = c.ascendant.signIndex * 30 + c.ascendant.degree;
      const r = detectGandanta(c, { timeKnown: true });
      expect(r.moon!.present, `${b.id} moon`).toBe(expectedMoon(moon).present);
      expect(r.tithi!.present, `${b.id} tithi`).toBe(expectedTithi(sun, moon).present);
      expect(Boolean(r.lagna?.present), `${b.id} lagna`).toBe(expectedLagna(asc).present);
    }
    // JHora shows no Gandanta flag on any of them, so there is nothing further to match.
    for (const f of fs.readdirSync(new URL('./fixtures/jhora/', import.meta.url)).filter((n) => /natal/.test(n))) {
      const j = JSON.parse(fs.readFileSync(new URL(`./fixtures/jhora/${f}`, import.meta.url), 'utf8'));
      expect(String(j.gandanta)).toMatch(/not shown by JHora/);
    }
  });
});
