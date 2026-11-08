// C1: the nakshatra transit layer, the birth-star layer and Gandanta as the 9th dosha.
// Checks, by kind:
//   - rule tables pinned to the written sources (Phaladeepika ch. 26 v. 3-8 as read at siva.sh/phaladeepika/26,
//     vijayalur.com Tarabala and Moorti Nirnaya, shrifreedom.org Navatara) and their worked examples
//   - Tara against PyJHora thaaraabalam (60 instants x 27 birth stars), and the Moon's star against PyJHora
//     (skipped unless PYJHORA_PYTHON is set, like the other C0 checks)
//   - findNakshatraChanges now scans the last partial day
//   - one full reader (b04) through buildNakshatraTransits and buildBirthStarFacts
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { calculateChart, calculatePlanetPositions } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { buildVarshikContext, type VarshikContext } from '../src/lib/astro-engine/reports/varshik-context.js';
import {
  buildNakshatraTransits,
  gocharFromMoon,
  moortiOf,
  ring28Position,
  segmentsFromChanges,
  specialTaraOf,
  starAt,
  taraFromBirth,
  type NakshatraTransitFacts,
} from '../src/lib/astro-engine/reports/nakshatra-transits.js';
import { buildBirthStarFacts, type BirthStarFacts } from '../src/lib/astro-engine/reports/varshik-birth-stars.js';
import { DOSHA_KEYS, doshaActivityAll } from '../src/lib/astro-engine/reports/varshik-timing.js';
import { AUSPICIOUS_HOUSES, VEDHA_PAIRS, checkVipreetVedha } from '../src/lib/astro-tools/vedha.js';
import { findNakshatraChanges, jdFromDate } from '../src/lib/astro-tools/transit-events.js';
import { kpLordsFor } from '../src/lib/astro-engine/calculations/kp-sublord.js';
import { NAKSHATRAS, NAKSHATRA_INFO } from '@aroha-astrology/shared';
import { SBC_ENABLED } from '../src/config/varshik-weights.js';
import { TEST_BIRTHS, inputsFor } from './fixtures/varshik/births.js';

const PY = process.env.PYJHORA_PYTHON;
const here = path.dirname(fileURLToPath(import.meta.url));
const NAK = 360 / 27;

describe('tables against Phaladeepika ch. 26 (v. 3-8, siva.sh/phaladeepika/26)', () => {
  // Written out from the translation, pair by pair: good house -> vedha house.
  const TEXT: Record<string, Record<number, number>> = {
    Sun: { 11: 5, 3: 9, 10: 4, 6: 12 }, // v.3
    Moon: { 7: 2, 1: 5, 6: 12, 11: 8, 10: 4, 3: 9 }, // v.4
    Mars: { 3: 12, 11: 5, 6: 9 }, // v.5
    Saturn: { 3: 12, 11: 5, 6: 9 }, // v.5, "the same remark applies to Saturn"
    Mercury: { 2: 5, 4: 3, 6: 9, 8: 1, 10: 8, 11: 12 }, // v.6
    Jupiter: { 2: 12, 11: 8, 9: 10, 5: 4, 7: 3 }, // v.7
    Venus: { 1: 8, 2: 7, 3: 1, 4: 10, 5: 9, 8: 5, 9: 11, 11: 6, 12: 3 }, // v.8
  };
  for (const [planet, pairs] of Object.entries(TEXT)) {
    it(`${planet}: good houses and their vedha points`, () => {
      expect(VEDHA_PAIRS[planet]).toEqual(pairs);
      expect([...(AUSPICIOUS_HOUSES[planet] ?? [])].sort((a, b) => a - b)).toEqual(
        Object.keys(pairs).map(Number).sort((a, b) => a - b),
      );
    });
  }
  it('Rahu and Ketu take Mars\'s houses (Vedic Astrology Blog, Gochara and Vedha)', () => {
    expect(AUSPICIOUS_HOUSES.Rahu).toEqual(AUSPICIOUS_HOUSES.Mars);
    expect(AUSPICIOUS_HOUSES.Ketu).toEqual(AUSPICIOUS_HOUSES.Mars);
  });
});

describe('gochar from the natal Moon', () => {
  // Natal Moon in Aries (0). Jupiter in Gemini (2 -> house 3?) no: use house arithmetic directly.
  it('Jupiter in the 5th is good until a planet stands in the 4th (vedha)', () => {
    const clear = gocharFromMoon('Jupiter', { Jupiter: 4, Saturn: 8, Moon: 0 }, 0);
    expect(clear).toMatchObject({ house: 5, goodHouse: true, verdict: 'good' });
    const blocked = gocharFromMoon('Jupiter', { Jupiter: 4, Mars: 3, Moon: 0 }, 0);
    expect(blocked).toMatchObject({ verdict: 'blocked', blockedBy: ['Mars'] });
  });
  it('Sun and Saturn never block each other; Moon and Mercury never block each other', () => {
    // Sun in the 3rd (good), Saturn in its vedha point, the 9th.
    expect(gocharFromMoon('Sun', { Sun: 2, Saturn: 8, Moon: 0 }, 0).verdict).toBe('good');
    expect(gocharFromMoon('Saturn', { Saturn: 2, Sun: 8, Moon: 0 }, 0).verdict).toBe('good');
    // Mercury in the 2nd (good), the Moon in its vedha point, the 5th.
    expect(gocharFromMoon('Mercury', { Mercury: 1, Moon: 4 }, 0).verdict).toBe('good');
    // Mercury is blocked by anything else in the 5th.
    expect(gocharFromMoon('Mercury', { Mercury: 1, Venus: 4, Moon: 0 }, 0).verdict).toBe('blocked');
  });
  it('Rahu and Ketu cause no vedha (owner decision), but can be blocked', () => {
    expect(gocharFromMoon('Jupiter', { Jupiter: 4, Rahu: 3, Moon: 0 }, 0).verdict).toBe('good');
    expect(gocharFromMoon('Rahu', { Rahu: 2, Mars: 11, Moon: 0 }, 0).verdict).toBe('blocked'); // 3rd, vedha 12th
  });
  it('vipreet vedha: a planet in an unfavourable vedha point is relieved by one in the paired good house', () => {
    // Venus in the 7th (vedha point of the 2nd, which is good for Venus): a planet in the 2nd relieves it.
    expect(gocharFromMoon('Venus', { Venus: 6, Mars: 1, Moon: 0 }, 0)).toMatchObject({ house: 7, verdict: 'relieved', relievedBy: ['Mars'] });
    expect(gocharFromMoon('Venus', { Venus: 6, Moon: 0 }, 0).verdict).toBe('hard');
    // A house that is itself good for the planet is never read as a vedha point.
    expect(checkVipreetVedha('Venus', { Venus: 2, Mars: 11 }, 0).inVedhaPoint).toBe(false);
  });
});

describe('Tara (vijayalur.com Tarabala worked examples; shrifreedom.org Navatara)', () => {
  const idx = (n: string) => NAKSHATRAS.indexOf(n as never);
  it('the page\'s four examples', () => {
    expect(taraFromBirth(idx('Ashwini'), idx('Revati')).n).toBe(9);
    expect(taraFromBirth(idx('Revati'), idx('Ashwini')).n).toBe(2);
    expect(taraFromBirth(idx('Vishakha'), idx('Chitra')).n).toBe(8);
    expect(taraFromBirth(idx('Chitra'), idx('Vishakha')).n).toBe(3);
  });
  it('2, 4, 6, 8, 9 are good; 1, 3, 5, 7 are not; the three cycles of nine', () => {
    for (let i = 0; i < 27; i++) {
      const t = taraFromBirth(0, i);
      expect(t.n).toBe(((i + 1) % 9) || 9);
      expect(t.good).toBe([2, 4, 6, 8, 9].includes(t.n));
      expect(t.cycle).toBe(Math.floor(i / 9) + 1);
    }
  });
  it('no death wording in any Tara or special-tara line', () => {
    for (let n = 1; n <= 9; n++) {
      const t = taraFromBirth(0, n - 1);
      expect(`${t.name} ${t.plain}`).not.toMatch(/death|dead|die|kill|destroy|destruction|fatal/i);
    }
  });
});

describe('special taras on the 28-star ring', () => {
  const mid = (i: number) => i * NAK + NAK / 2;
  it('counts Abhijit as a star between Uttara Ashadha and Shravana', () => {
    expect(ring28Position(mid(20) - 5)).toBe(20); // Uttara Ashadha, before Abhijit
    expect(ring28Position(277)).toBe(21); // inside 276d40m-280d53m20s
    expect(ring28Position(mid(21) + 3)).toBe(22); // Shravana
    expect(ring28Position(mid(26))).toBe(27);
  });
  it('Karma is the 10th, Sanghatika the 16th, Samudaya the 18th; the 28th is the star before the birth star', () => {
    const birth = mid(3); // Rohini
    expect(specialTaraOf(birth, mid(3))?.name).toBe('Janma');
    expect(specialTaraOf(birth, mid(12))?.n).toBe(10); // Hasta is the 10th from Rohini
    expect(specialTaraOf(birth, mid(12))?.name).toBe('Karma');
    expect(specialTaraOf(birth, mid(2))?.name).toBe('Abhisheka'); // 28th = Krittika, the star before Rohini
    expect(specialTaraOf(birth, mid(4))).toBeNull(); // the 2nd is not special
  });
  it('only the owner\'s nine counts are special (the 7th and 19th are left out)', () => {
    const birth = mid(5);
    const got: number[] = [];
    for (let i = 0; i < 28; i++) {
      const lon = (birth + i * NAK) % 360; // walks the 27-star ring: counts skip the Abhijit slot
      const s = specialTaraOf(birth, lon);
      if (s) got.push(s.n);
    }
    for (const n of got) expect([1, 4, 10, 12, 16, 18, 22, 25, 28]).toContain(n);
    expect(got).not.toContain(7);
    expect(got).not.toContain(19);
  });
  it('Moorti table', () => {
    for (const h of [1, 6, 11]) expect(moortiOf(h).name).toBe('swarna');
    for (const h of [2, 5, 9]) expect(moortiOf(h).name).toBe('rajata');
    for (const h of [3, 7, 10]) expect(moortiOf(h).name).toBe('tamra');
    for (const h of [4, 8, 12]) expect(moortiOf(h).name).toBe('loha');
  });
});

describe('NAKSHATRA_INFO', () => {
  it('27 entries, every field present, no death wording', () => {
    expect(NAKSHATRA_INFO).toHaveLength(27);
    for (const [i, n] of NAKSHATRA_INFO.entries()) {
      expect(n.deity, `deity ${i}`).toBeTruthy();
      expect(n.symbol, `symbol ${i}`).toBeTruthy();
      expect(n.shakti.name && n.shakti.meaning, `shakti ${i}`).toBeTruthy();
      expect(JSON.stringify(n)).not.toMatch(/death|dead|funeral|destroy|destruction|kill/i);
    }
  });
  it('the nature groups have the sizes the Drik Panchang page gives', () => {
    const count = (k: string) => NAKSHATRA_INFO.filter((n) => n.nature === k).length;
    expect([count('sthira'), count('chara'), count('ugra'), count('mishra'), count('kshipra'), count('mridu'), count('tikshna')]).toEqual([4, 5, 5, 2, 3, 4, 4]);
  });
  it('Sarvatobhadra is off: the owner declined it', () => {
    expect(SBC_ENABLED).toBe(false);
  });
});

describe('findNakshatraChanges scans a window that is not a whole number of days', () => {
  it('finds a change in the last partial day', async () => {
    const from = new Date('2027-03-01T00:00:00Z');
    const all = await findNakshatraChanges(from, new Date('2027-03-20T00:00:00Z'), ['Sun', 'Mercury', 'Venus', 'Mars']);
    expect(all.length).toBeGreaterThan(0);
    const t = all[0]!;
    const start = new Date(t.exactAt.getTime() - 1.5 * 86_400_000);
    const end = new Date(t.exactAt.getTime() + 0.25 * 86_400_000); // 1.75 days long
    const got = await findNakshatraChanges(start, end, [t.planet]);
    expect(got.some((g) => Math.abs(g.exactAt.getTime() - t.exactAt.getTime()) < 120_000)).toBe(true);
  }, 60_000);
});

describe('segmentsFromChanges', () => {
  it('cuts a year into stretches that join up', () => {
    const segs = segmentsFromChanges('Saturn', 24, false, [{ atMs: 500, nak: 25, retro: false }, { atMs: 800, nak: 24, retro: true }], 0, 1000);
    expect(segs.map((s) => [s.fromMs, s.toMs, s.nak])).toEqual([[0, 500, 24], [500, 800, 25], [800, 1000, 24]]);
    expect(segs[2]!.retroAtEntry).toBe(true);
  });
});

describe.skipIf(!PY)('Tara and Moon star against PyJHora thaaraabalam', () => {
  it('60 instants in 2027 x 27 birth stars', async () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'thaara-')), 'th.json');
    execFileSync(PY!, [path.join(here, '..', 'scripts', 'pyjhora', 'thaara.py'), out], { stdio: 'ignore' });
    const rows = JSON.parse(fs.readFileSync(out, 'utf8')) as Array<{ jdUt: number; star: number; buckets: Record<string, number> }>;
    expect(rows.length).toBe(60);
    let compared = 0;
    for (const r of rows) {
      const moon = (await calculatePlanetPositions(r.jdUt)).find((p) => p.planet === 'Moon')!;
      // PyJHora is Lahiri mode 1 (23 arcsec behind the engine): skip instants within 0.05 deg of a star edge.
      const edge = Math.min(moon.longitude % NAK, NAK - (moon.longitude % NAK));
      if (edge < 0.05) continue;
      expect(moon.nakshatraIndex + 1, `Moon star at jd ${r.jdUt}`).toBe(r.star);
      for (let b = 1; b <= 27; b++) {
        const mine = taraFromBirth(b - 1, moon.nakshatraIndex).n; // 1..9
        const theirs = r.buckets[String(b)]!; // 0 = Parama Mitra (9), 1..8 as is
        expect(mine, `birth ${b}, jd ${r.jdUt}`).toBe(theirs === 0 ? 9 : theirs);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(1400);
  }, 120_000);
});

describe('one reader (b04) through the C1 layer', () => {
  let ctx: VarshikContext;
  let facts: NakshatraTransitFacts;
  let birth: BirthStarFacts;

  beforeAll(async () => {
    const b = TEST_BIRTHS.find((x) => x.id === 'b04')!;
    const inputs = await inputsFor(b);
    const [y, mo, d] = b.date.split('-').map(Number) as [number, number, number];
    const natal = await calculateChart(y, mo, d, 4, 30, 5.5, b.latitude, b.longitude, 'lahiri', 'W');
    ctx = await buildVarshikContext({ inputs, natal, year: 2027 });
    facts = await buildNakshatraTransits(ctx);
    birth = buildBirthStarFacts(ctx);
  }, 300_000);

  it('daily rows: nine planets, one entry per day, values in range', () => {
    expect(Object.keys(facts.daily).sort()).toEqual(['Jupiter', 'Ketu', 'Mars', 'Mercury', 'Moon', 'Rahu', 'Saturn', 'Sun', 'Venus']);
    for (const [p, r] of Object.entries(facts.daily)) {
      for (const arr of Object.values(r)) expect(arr.length, p).toBe(ctx.days.length);
      expect(r.nak.every((n) => n >= 0 && n <= 26)).toBe(true);
      expect(r.pada.every((n) => n >= 1 && n <= 4)).toBe(true);
      expect(r.tara.every((n) => n >= 1 && n <= 9)).toBe(true);
      expect(r.house.every((n) => n >= 1 && n <= 12)).toBe(true);
    }
    expect(facts.daily.Rahu!.bav.every((n) => n === -1)).toBe(true);
    expect(facts.daily.Jupiter!.bav.every((n) => n >= 0 && n <= 8)).toBe(true);
  });

  it('daily star equals the star of the day\'s longitude, and a segment covers each day\'s star', () => {
    for (const p of ['Sun', 'Jupiter', 'Mercury']) {
      ctx.days.forEach((d, i) => {
        const s = starAt(d.lon[p as 'Sun']!);
        expect(facts.daily[p]!.nak[i]).toBe(s.index);
        const seg = facts.segments.find((x) => x.planet === p && d.atMs >= x.fromMs && d.atMs < x.toMs)!;
        expect(seg, `${p} day ${i}`).toBeTruthy();
        expect(seg.nak, `${p} day ${i}`).toBe(s.index);
      });
    }
  });

  it('segments of each planet join end to end across the whole year', () => {
    const from = ctx.dayStartMs[0]!;
    const to = ctx.dayStartMs[ctx.dayStartMs.length - 1]!;
    for (const p of ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Rahu', 'Ketu']) {
      const segs = facts.segments.filter((s) => s.planet === p).sort((a, b) => a.fromMs - b.fromMs);
      expect(segs[0]!.fromMs).toBe(from);
      expect(segs[segs.length - 1]!.toMs).toBe(to);
      for (let i = 1; i < segs.length; i++) expect(segs[i]!.fromMs).toBe(segs[i - 1]!.toMs);
    }
    const sun = facts.segments.filter((s) => s.planet === 'Sun').length;
    expect(sun).toBeGreaterThanOrEqual(27); // the Sun crosses all 27 stars in a year
    expect(sun).toBeLessThanOrEqual(29);
  });

  it('Moon stretches: about 360 a year (13 orbits x 27 stars), joined, each with a Tara', () => {
    expect(facts.moonStars.length).toBeGreaterThan(350);
    expect(facts.moonStars.length).toBeLessThan(370);
    for (let i = 1; i < facts.moonStars.length; i++) expect(facts.moonStars[i]!.fromMs).toBe(facts.moonStars[i - 1]!.toMs);
  });

  it('Moorti: one row per planet sign change, the Moon\'s house agrees with the metal', () => {
    expect(facts.moorti.length).toBeGreaterThan(20);
    for (const m of facts.moorti) {
      expect(moortiOf(m.moonHouse).name).toBe(m.moorti);
      expect(m.planet).not.toBe('Moon');
    }
  });

  it('sensitive crossings: every special tara or natal-star hit is listed with dates', () => {
    for (const s of facts.sensitive) {
      expect(s.special !== null || s.natalPointsHere.length > 0).toBe(true);
      expect(s.toMs).toBeGreaterThan(s.fromMs);
    }
    expect(facts.sensitive.length).toBeGreaterThan(0);
  });

  it('birth stars: 10 rows, KP lords agree with kpLordsFor, star lord role has a house', () => {
    expect(birth.rows).toHaveLength(10);
    for (const r of birth.rows) {
      expect(r.kp).toEqual(kpLordsFor(r.longitude));
      expect(r.pada).toBeGreaterThanOrEqual(1);
      expect(r.starLordRole.house).toBeGreaterThanOrEqual(1);
      expect(r.deity).toBeTruthy();
    }
    const moon = birth.rows.find((r) => r.point === 'Moon')!;
    expect(moon.tara.n).toBe(1);
    expect(birth.rows.find((r) => r.point === 'Lagna')!.house).toBe(1);
  });

  it('natal Navatara never lists the Moon, and only taras 3, 5, 7 as weakened', () => {
    for (const w of birth.navatara.weakened) {
      expect(w.planet).not.toBe('Moon');
      expect([3, 5, 7]).toContain(w.tara.n);
    }
    for (const e of birth.navatara.emphasised) expect([1, 10, 16]).toContain(e.special.n);
  });

  it('the 2027 dasha lords all carry their stars and appear once', () => {
    const lords = birth.dashaLords.map((d) => d.planet);
    expect(new Set(lords).size).toBe(lords.length);
    expect(lords.length).toBeGreaterThanOrEqual(3);
    expect(birth.dashaLords.some((d) => d.roles.includes('mudda'))).toBe(true);
    expect(birth.dashaLords.some((d) => d.roles.includes('maha'))).toBe(true);
  });

  it('Gandanta is the ninth dosha, in every month', () => {
    expect(DOSHA_KEYS).toHaveLength(9);
    expect(DOSHA_KEYS[8]).toBe('gandanta');
    for (const m of doshaActivityAll(ctx)) {
      const g = m.items.find((i) => i.key === 'gandanta')!;
      expect(['present', 'not_present']).toContain(g.status);
    }
  });

  it('date check: Sun star changes equal an independent bisection on the same engine longitudes', async () => {
    // The independent Swiss run (mode 44) lives in varshik-sky-events-2027.spec.ts; here the dated rows are
    // checked against the longitude one minute either side of each change.
    for (const s of facts.segments.filter((x) => x.planet === 'Sun' && x.fromMs > ctx.dayStartMs[0]!)) {
      const before = (await calculatePlanetPositions(jdFromDate(new Date(s.fromMs - 90_000)))).find((p) => p.planet === 'Sun')!;
      const after = (await calculatePlanetPositions(jdFromDate(new Date(s.fromMs + 90_000)))).find((p) => p.planet === 'Sun')!;
      expect(before.nakshatraIndex).not.toBe(s.nak);
      expect(after.nakshatraIndex).toBe(s.nak);
    }
  }, 60_000);
});
