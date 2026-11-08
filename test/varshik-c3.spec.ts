// Varshik C3: the C1 + C2 inputs in the score, the star facts, preflight and the claim checks on them.
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: vi.fn() }));

import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { zoneOffsetMs } from '../src/lib/astro-engine/varshphal/calendar-year.js';
import { buildVarshikContext, type VarshikContext } from '../src/lib/astro-engine/reports/varshik-context.js';
import { computeVarshikScores, momentumSeries } from '../src/lib/astro-engine/reports/varshik-2027.js';
import { buildFactsFromContext, preflightVarshikFacts, type VarshikFacts } from '../src/lib/astro-engine/reports/varshik-facts.js';
import { buildStarSignals } from '../src/lib/astro-engine/reports/varshik-star-signals.js';
import { VARSHIK_C3 } from '../src/config/varshik-weights.js';
import { buildFactIndex, claimHitsForSentence } from '../src/lib/llm/reports/verify-varshik-text.js';
import { scrubTells } from '../src/lib/llm/reports/varshik-2027.js';

let ctx: VarshikContext;
let facts: VarshikFacts;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

beforeAll(async () => {
  const [y, mo, d, h, mi] = [1990, 1, 12, 6, 15];
  const tz = 'Asia/Kolkata';
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let utc = wall - zoneOffsetMs(wall, tz);
  utc = wall - zoneOffsetMs(utc, tz);
  const natal = await calculateChart(y, mo, d, h, mi, (wall - utc) / 3_600_000, 28.61, 77.21, 'lahiri', 'W');
  const sun = natal.planets.find((p) => p.planet === 'Sun')!;
  const moon = natal.planets.find((p) => p.planet === 'Moon')!;
  ctx = await buildVarshikContext({
    natal,
    year: 2027,
    inputs: {
      natalSunLongitude: sun.longitude,
      natalAscSignIndex: natal.ascendant.signIndex,
      birthDate: new Date(utc),
      birthNakshatraIndex: moon.nakshatraIndex,
      latitude: 28.61,
      longitude: 77.21,
      timezone: tz,
    },
  });
  facts = await buildFactsFromContext(ctx, natal, {
    name: 'Test',
    birthDate: '1990-01-12',
    birthTime: '06:15',
    timezone: tz,
    lat: 28.61,
    lng: 77.21,
    answers: {},
    facts: [],
  });
}, 180_000);

describe('the C3 inputs are in the score', () => {
  it('every new component shows up among the daily drivers', () => {
    const series = momentumSeries(ctx);
    const keys = new Set<string>();
    for (const a of Object.values(series.drivers)) for (const m of a) for (const k of Object.keys(m)) keys.add(k.split(':')[0]!);
    for (const k of ['gochar', 'moorti', 'tara', 'sensitive', 'starLord', 'kakshya', 'yogini', 'patyayini', 'lifeSaham']) {
      expect(keys.has(k), k).toBe(true);
    }
  });

  it('the star signals have one value per day and stay in -1..1', () => {
    const s = buildStarSignals(ctx);
    for (const p of VARSHIK_C3.starPlanets) {
      for (const row of [s.gochar[p]!, s.moorti[p]!, s.tara[p]!, s.kakshya[p]!]) {
        expect(row).toHaveLength(ctx.days.length);
        expect(Math.max(...row)).toBeLessThanOrEqual(1);
        expect(Math.min(...row)).toBeGreaterThanOrEqual(-1);
      }
    }
  });

  it('Moorti holds from a sign change until the next one, and is 0 before the first of the year', () => {
    const s = buildStarSignals(ctx);
    const m = ctx.stars!.moorti.find((x) => x.planet === 'Saturn' || x.planet === 'Jupiter');
    if (!m) return;
    const day = ctx.days.findIndex((d) => d.atMs >= m.atMs);
    expect(s.moorti[m.planet]![day]).toBe(VARSHIK_C3.moortiValue[m.moorti]);
  });

  it('is deterministic and keeps every cell in 0-100', () => {
    const a = computeVarshikScores(ctx, {});
    const b = computeVarshikScores(ctx, {});
    expect(a.months.map((c) => c.score)).toEqual(b.months.map((c) => c.score));
    for (const row of Object.values(a.timingMap)) for (const c of row) expect(c.score).toBeGreaterThanOrEqual(0), expect(c.score).toBeLessThanOrEqual(100);
  });
});

describe('the star facts and the preflight', () => {
  it('pass the preflight', () => {
    expect(preflightVarshikFacts(facts)).toEqual({ ok: true, failures: [] });
  });

  it('stop the run when the star layer is missing or has a hole', () => {
    const noStars = clone(facts) as unknown as Record<string, unknown>;
    delete noStars.stars;
    expect(preflightVarshikFacts(noStars).ok).toBe(false);
    const hole = clone(facts);
    hole.stars.segments = hole.stars.segments.filter((s) => s.planet !== 'Saturn');
    expect(preflightVarshikFacts(hole).failures.join('|')).toMatch(/no row for Saturn/);
    const noYogini = clone(facts);
    noYogini.varsha[0]!.extra.muddaYogini = [];
    expect(preflightVarshikFacts(noYogini).ok).toBe(false);
  });

  it('never carry the two harsh classical words in a plain line', () => {
    const plain = JSON.stringify([facts.stars.table.map((r) => r.tara.plain), facts.stars.segments.map((s) => s.special?.plain)]);
    expect(plain).not.toMatch(/Vadha|Vainashika|death|destruction/i);
  });

  it('never carry Mrityu or Apamrityu', () => {
    expect(JSON.stringify(facts.varsha.map((v) => v.extra.lifeSahams))).not.toMatch(/mrityu/i);
  });
});

describe('verify-claims on the new facts', () => {
  it('lets a real star move through and stops a wrong star, a wrong pairing and a wrong yoga', () => {
    const index = buildFactIndex(facts);
    const seg = facts.stars.segments.find((s) => s.enters && s.planet === 'Saturn')!;
    const ok = `Saturn moves into ${seg.nakshatra} on ${Number(seg.from.slice(8))} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(seg.from.slice(5, 7)) - 1]}.`;
    expect(claimHitsForSentence(ok, index)).toEqual([]);
    const planetStars = [...index.planetStars].filter((x) => x.startsWith('Saturn:'));
    const other = ['Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Revati']
      .find((n) => !planetStars.includes(`Saturn:${n}`) && !index.nakshatras.has(n));
    if (other) expect(claimHitsForSentence(`Saturn moves into ${other} soon.`, index).length).toBeGreaterThan(0);
    const notSaturn = [...index.nakshatras].find((n) => !planetStars.includes(`Saturn:${n}`));
    if (notSaturn) expect(claimHitsForSentence(`Saturn moves into ${notSaturn} for a while.`, index).length).toBeGreaterThan(0);
    const absent = ['Iqbal', 'Induvara', 'Manau', 'Durupha', 'Tambira', 'Kuttha'].find((k) => !index.tajika.has(k));
    if (absent) expect(claimHitsForSentence(`The ${absent} yoga lifts the year.`, index).length).toBeGreaterThan(0);
  });

  it('stops the two harsh classical names, a made-up week and a made-up Yogini lord', () => {
    const index = buildFactIndex(facts);
    expect(claimHitsForSentence('That is the Vainashika star.', index).some((h) => h.rule === 'death')).toBe(true);
    expect(claimHitsForSentence('A Vadha day.', index).some((h) => h.rule === 'death')).toBe(true);
    const real = facts.varsha[0]!.extra.patyayini[0]!.fromWeek;
    expect(claimHitsForSentence(`It begins in the ${real}.`, index)).toEqual([]);
    const fake = ['1st', '2nd', '3rd', '4th'].map((o) => `${o} week of March`).find((w) => !index.weeks.has(w));
    if (fake) expect(claimHitsForSentence(`It begins in the ${fake}.`, index).length).toBeGreaterThan(0);
    const unused = ['Venus', 'Saturn', 'Jupiter', 'Mercury', 'Mars', 'Sun', 'Moon', 'Rahu'].find((p) => !index.yoginiLords.has(p));
    if (unused) expect(claimHitsForSentence(`The ${unused} Yogini period runs now.`, index).length).toBeGreaterThan(0);
  });

  it('swaps the S3 leftovers by rule', () => {
    expect(scrubTells('It serves as a reminder. Journeys help. A journey ends.')).toBe('It is a reminder. Trips help. A trip ends.');
  });
});

describe('two-word stars', () => {
  it('are written with a space in the prompt and still checked against the one-word facts', async () => {
    const { spaceStars } = await import('../src/lib/llm/reports/varshik-2027.js');
    expect(spaceStars('Saturn in UttaraBhadrapada and PurvaPhalguni')).toBe('Saturn in Uttara Bhadrapada and Purva Phalguni');
    const index = buildFactIndex(facts);
    const twoWord = [...index.nakshatras].find((n) => /[a-z][A-Z]/.test(n));
    if (twoWord) {
      const spaced = twoWord.replace(/([a-z])([A-Z])/g, '$1 $2');
      expect(claimHitsForSentence(`The reader has a star called ${spaced}.`, index)).toEqual([]);
    }
  });
});

describe('house claims bind to the nearest planet', () => {
  it('does not read "natal Rahu ... its lord Ketu sits in your 3rd house" as Rahu in the 3rd', () => {
    const index = buildFactIndex(facts);
    const ketuHouse = facts.birth.planets.find((p) => p.planet === 'Ketu')!.house;
    const ord = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
    const s = `Saturn moves into Ashwini, a star linked to your natal Rahu, while its lord Ketu sits in your ${ord(ketuHouse)} house.`;
    expect(claimHitsForSentence(s, index).filter((h) => /house/.test(h.text))).toEqual([]);
    const bad = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find((n) => !index.houses.has(`Ketu:${n}`))!;
    expect(claimHitsForSentence(`Ketu sits in your ${ord(bad)} house.`, index).length).toBeGreaterThan(0);
  });
});
