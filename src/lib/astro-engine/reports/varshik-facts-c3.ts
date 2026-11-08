// =============================================================================
// Varshik C3: the star and Tajika facts that join VarshikFacts
// =============================================================================
// C1 and C2 built the nakshatra layer and the extra Tajika items. This file turns them into the
// zod schemas and the builders that varshik-facts.ts includes, so they sit inside the same
// completeness contract: a missing field fails the preflight, generation stops, the reader is
// refunded. The text may name only what is in these facts (verify-varshik-text.ts checks it).
//
// No death wording. Tara 7 and the 22nd star are carried by name for the checks, but their
// `plain` line is "a hard, draining star / stretch", and the prompts forbid the two names.
// =============================================================================

import { z } from 'zod';
import { NAKSHATRAS, ZODIAC_SIGNS } from '@aroha-astrology/shared';
import type { ChartData } from '@aroha-astrology/shared';
import { VARSHIK_C3, VARSHIK_NAKSHATRA as N } from '../../../config/varshik-weights.js';
import { BALA_PLANETS, dwadashavargiyaBala, harshaBala } from '../varshphal/annual-balas.js';
import { computeExtraTajikaYogas } from '../varshphal/tajika-yogas-extra.js';
import { computeLifeSahams } from '../varshphal/sahams-life.js';
import { weekLabel } from '../varshphal/annual-dashas.js';
import type { VarshaYearSlice } from '../varshphal/calendar-year.js';
import {
  TRIPATAKI_JOINS,
  readTriPataki,
  triPatakiPlacements,
  VEDHA_ON_MOON_THEME,
  type NatalSigns,
  type PatakiBody,
} from '../varshphal/tri-pataki.js';
import { buildBirthStarFacts } from './varshik-birth-stars.js';
import { dailyRowsOf } from './varshik-star-signals.js';
import { EXTRA_YOGA_PLAIN, TAJIKA_LABEL } from './varshik-labels.js';
import type { VarshikContext } from './varshik-context.js';

const fin = z.number().finite();
const str = z.string().min(1);
const sign = z.string().min(3);
const month = z.number().int().min(0).max(11);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const r2 = (x: number): number => Math.round(x * 100) / 100;

const taraZ = z.object({ number: z.number().int().min(1).max(9), name: str, good: z.boolean(), plain: str });
const specialZ = z.object({ number: z.number().int().min(1).max(28), name: str, plain: str });

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

export const starsZ = z.object({
  birthStar: z.object({ name: str, number: z.number().int().min(1).max(27), pada: z.number().int().min(1).max(4), lord: str, sign }),
  /** 9 planets and the Lagna, in this order: Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, Rahu, Ketu, Lagna. */
  table: z
    .array(
      z.object({
        point: str,
        sign,
        house: z.number().int().min(1).max(12),
        nakshatra: str,
        pada: z.number().int().min(1).max(4),
        starLord: str,
        starLordHouse: z.number().int().min(0).max(12),
        starLordRules: z.array(z.number().int().min(1).max(12)),
        navamsaSign: sign,
        gana: str,
        deity: str,
        symbol: str,
        nature: str,
        shakti: str,
        kpStarLord: str,
        kpSubLord: str,
        subLordHouse: z.number().int().min(0).max(12),
        gandanta: z.object({ present: z.boolean(), part: z.string().nullable(), degrees: fin.nullable() }),
        tara: taraZ,
        special: specialZ.nullable(),
      }),
    )
    .length(10),
  navatara: z.object({
    weakened: z.array(z.object({ planet: str, tara: taraZ })),
    emphasised: z.array(z.object({ point: str, special: specialZ })),
  }),
  planetInStar: z
    .array(
      z.object({
        planet: str,
        nakshatra: str,
        pada: z.number().int().min(1).max(4),
        starLord: str,
        starLordHouse: z.number().int().min(0).max(12),
        starLordRules: z.array(z.number().int().min(1).max(12)),
        inOwnStar: z.boolean(),
        subLord: str,
        subLordHouse: z.number().int().min(0).max(12),
        gandanta: z.boolean(),
      }),
    )
    .length(9),
  dashaLords: z
    .array(
      z.object({
        planet: str,
        roles: z.array(z.enum(['maha', 'antar', 'pratyantar', 'mudda'])).min(1),
        nakshatra: str,
        pada: z.number().int().min(1).max(4),
        starLord: str,
        starLordHouse: z.number().int().min(0).max(12),
        starLordRules: z.array(z.number().int().min(1).max(12)),
        subLord: str,
        subLordHouse: z.number().int().min(0).max(12),
        gandanta: z.boolean(),
      }),
    )
    .min(1),
  /** Every star the eight moving planets stand in during the year, with the dates. `enters` is false for the star a planet already stands in on 1 January. */
  segments: z
    .array(
      z.object({
        planet: str,
        from: isoDate,
        to: isoDate,
        enters: z.boolean(),
        retro: z.boolean(),
        nakshatra: str,
        tara: taraZ,
        special: specialZ.nullable(),
        starLord: str,
        starLordHouse: z.number().int().min(0).max(12),
        natalPointsHere: z.array(z.string()),
      }),
    )
    .min(1),
  /** The segments that are a special tara or a natal planet's star: the dated trigger days. */
  sensitive: z.array(
    z.object({
      planet: str,
      from: isoDate,
      to: isoDate,
      enters: z.boolean(),
      nakshatra: str,
      special: specialZ.nullable(),
      natalPointsHere: z.array(z.string()),
    }),
  ),
  /** The Moorti at each sign change of a planet: the metal of the entry, from the Moon's house then. */
  moorti: z.array(
    z.object({
      planet: str,
      date: isoDate,
      fromSign: str,
      toSign: str,
      moonHouse: z.number().int().min(1).max(12),
      moorti: z.enum(['swarna', 'rajata', 'tamra', 'loha']),
      metal: str,
      quality: str,
      plain: str,
    }),
  ),
  /** Mid-month position of Mars, Jupiter, Saturn, Rahu and Ketu from the natal Moon: house and the vedha verdict. */
  monthStars: z
    .array(
      z.object({
        month,
        rows: z
          .array(
            z.object({
              planet: str,
              nakshatra: str,
              tara: taraZ,
              houseFromMoon: z.number().int().min(1).max(12),
              verdict: z.enum(['good', 'blocked', 'relieved', 'hard']),
            }),
          )
          .length(5),
      }),
    )
    .length(12),
  sources: z.record(z.string(), z.string()),
});
export type StarFacts = z.infer<typeof starsZ>;

export const varshaExtraZ = z.object({
  /** Mudda Yogini and Patyayini for this Varsha year. Patyayini is by the week only. */
  muddaYogini: z.array(z.object({ lord: str, yogini: str, from: isoDate, to: isoDate })).min(1),
  patyayini: z.array(z.object({ lord: str, fromWeek: str, toWeek: str })).min(1),
  /** Harsha bala total (0-20) and its label; Dwadashavargiya score (0-12) with whether JHora's table was matched for that planet. */
  harsha: z.record(z.string(), z.object({ total: z.number().int().min(0).max(20), label: str })),
  dwadasha: z.record(z.string(), z.object({ score: z.number().int().min(0).max(12), checked: z.boolean() })),
  extraYogas: z.array(z.object({ kind: str, name: str, planets: z.array(z.string()), plain: str })),
  lifeSahams: z.array(z.object({ name: str, sign, house: z.number().int().min(1).max(12), lord: str, supported: z.boolean() })).min(19),
  /** Tri-Pataki (Mehta): who pierces the Lagna and the Moon; plain lines, no combined score. */
  triPataki: z.object({
    lines: z.array(str).min(2),
    onLagna: z.array(z.object({ body: str, nature: z.enum(['benefic', 'malefic']) })),
    onMoon: z.array(z.object({ body: str, nature: z.enum(['benefic', 'malefic']) })),
  }),
});
export type VarshaExtraFacts = z.infer<typeof varshaExtraZ>;

// -----------------------------------------------------------------------------
// Builders
// -----------------------------------------------------------------------------

export type DateFmt = (ms: number) => string;

const MOORTI_PLAIN: Record<string, string> = {
  swarna: 'a golden entry: very good for what this planet touches',
  rajata: 'a silver entry: good',
  tamra: 'a copper entry: middling, so give it time',
  loha: 'an iron entry: harder, so go gently',
};

const GOCHAR_WORD: Record<string, 'good' | 'blocked' | 'relieved' | 'hard'> = { g: 'good', b: 'blocked', r: 'relieved', h: 'hard' };

export function buildStarFacts(ctx: VarshikContext, fmt: DateFmt): StarFacts {
  const st = ctx.stars;
  if (!st) throw new Error('the star events were not built (ctx.stars is missing)');
  const bs = buildBirthStarFacts(ctx);
  const yearStart = ctx.dayStartMs[0]!;
  const yearEnd = ctx.dayStartMs[ctx.dayStartMs.length - 1]!;
  const tara = (t: { n: number; name: string; good: boolean; plain: string }) => ({ number: t.n, name: t.name, good: t.good, plain: t.plain });
  const special = (s: { n: number; name: string; plain: string } | null) => (s ? { number: s.n, name: s.name, plain: s.plain } : null);

  const segments = st.segments.map((s) => ({
    planet: s.planet,
    from: fmt(s.fromMs),
    to: fmt(Math.min(s.toMs, yearEnd) - 1),
    enters: s.fromMs > yearStart,
    retro: s.retroAtEntry,
    nakshatra: s.nakName,
    tara: tara(s.tara),
    special: special(s.special),
    starLord: s.starLord,
    starLordHouse: s.starLordRole.house,
    natalPointsHere: s.natalPointsHere,
  }));
  const sensitive = st.sensitive.map((s) => ({
    planet: s.planet,
    from: fmt(s.fromMs),
    to: fmt(Math.min(s.toMs, yearEnd) - 1),
    enters: s.fromMs > yearStart,
    nakshatra: s.nakName,
    special: special(s.special),
    natalPointsHere: s.natalPointsHere,
  }));

  const rows = dailyRowsOf(ctx);
  const monthStars: StarFacts['monthStars'] = [];
  for (let m = 0; m < 12; m++) {
    const first = ctx.monthOfDay.indexOf(m);
    const count = ctx.monthOfDay.filter((x) => x === m).length;
    const idx = first + Math.floor(count / 2);
    monthStars.push({
      month: m,
      rows: (['Mars', 'Jupiter', 'Saturn', 'Rahu', 'Ketu'] as const).map((planet) => {
        const r = rows[planet]!;
        const v = GOCHAR_WORD[r.verdict[idx]!];
        if (!v) throw new Error(`monthStars: no verdict for ${planet} in month ${m}`);
        const t = N.tara[r.tara[idx]!]!;
        return {
          planet,
          nakshatra: starName(r.nak[idx]!),
          tara: { number: r.tara[idx]!, name: t.name, good: t.good, plain: t.plain },
          houseFromMoon: r.house[idx]!,
          verdict: v,
        };
      }),
    });
  }

  return {
    birthStar: {
      name: st.birthStar.name,
      number: st.birthStar.index + 1,
      pada: st.birthStar.pada,
      lord: st.birthStar.lord,
      sign: ZODIAC_SIGNS[st.birthStar.moonSign]!,
    },
    table: bs.rows.map((r) => ({
      point: r.point,
      sign: r.sign,
      house: r.house,
      nakshatra: r.nakName,
      pada: r.pada,
      starLord: r.starLord,
      starLordHouse: r.starLordRole.house,
      starLordRules: r.starLordRole.rules,
      navamsaSign: r.navamsaSign,
      gana: r.gana,
      deity: r.deity,
      symbol: r.symbol,
      nature: r.nature,
      shakti: r.shakti.meaning,
      kpStarLord: r.kp.starLord,
      kpSubLord: r.kp.subLord,
      subLordHouse: r.subLordHouse,
      gandanta: { present: r.gandanta.present, part: r.gandanta.part, degrees: r.gandanta.degreesFromJunction },
      tara: tara(r.tara),
      special: special(r.special),
    })),
    navatara: {
      weakened: bs.navatara.weakened.map((w) => ({ planet: w.planet, tara: tara(w.tara) })),
      emphasised: bs.navatara.emphasised.map((e) => ({ point: e.point, special: special(e.special)! })),
    },
    planetInStar: bs.planetInStar.map((p) => ({
      planet: p.planet,
      nakshatra: p.nakName,
      pada: p.pada,
      starLord: p.starLord,
      starLordHouse: p.starLordHouse,
      starLordRules: p.starLordRules,
      inOwnStar: p.inOwnStar,
      subLord: p.subLord,
      subLordHouse: p.subLordHouse,
      gandanta: p.gandanta,
    })),
    dashaLords: bs.dashaLords.map((d) => ({
      planet: d.planet,
      roles: d.roles,
      nakshatra: d.nakName,
      pada: d.pada,
      starLord: d.starLord,
      starLordHouse: d.starLordHouse,
      starLordRules: d.starLordRules,
      subLord: d.subLord,
      subLordHouse: d.subLordHouse,
      gandanta: d.gandanta,
    })),
    segments,
    sensitive,
    moorti: st.moorti.map((m) => ({
      planet: m.planet,
      date: fmt(m.atMs),
      fromSign: m.fromSign,
      toSign: m.toSign,
      moonHouse: m.moonHouse,
      moorti: m.moorti,
      metal: m.metal,
      quality: m.quality,
      plain: MOORTI_PLAIN[m.moorti]!,
    })),
    monthStars,
    sources: st.sources,
  };
}

function starName(index: number): string {
  return NAKSHATRAS[index]!;
}

const NATAL_SIGN_BODIES: PatakiBody[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];

/** Everything a Varsha year adds in C2: the other two dashas, the balas, the extra yogas and Sahams, Tri-Pataki. */
export function buildVarshaExtraFacts(
  slice: VarshaYearSlice,
  natal: ChartData,
  tz: string,
  fmt: DateFmt,
): VarshaExtraFacts {
  const chart = slice.varshphal.solarReturn.chart;
  const isDay = slice.varshphal.solarReturn.isDayReturn;
  const harsha = harshaBala(chart, isDay);
  const dwad = dwadashavargiyaBala(chart);
  const yogiName = (lord: string): string =>
    ({ Moon: 'Mangala', Sun: 'Pingala', Jupiter: 'Dhanya', Mars: 'Bhramari', Mercury: 'Bhadrika', Saturn: 'Ulka', Venus: 'Siddha', Rahu: 'Sankata' })[lord] ?? lord;

  const natalSigns = Object.fromEntries(
    NATAL_SIGN_BODIES.map((b) => [b, natal.planets.find((p) => p.planet === b)!.signIndex]),
  ) as NatalSigns;
  const reading = readTriPataki(natalSigns, slice.completedYears, chart.ascendant.signIndex);
  const lines = [...reading.lines];

  return {
    muddaYogini: slice.muddaYogini.map((p) => ({ lord: p.lord, yogini: yogiName(p.lord), from: fmt(p.startMs), to: fmt(p.endMs) })),
    patyayini: slice.patyayini.map((p) => ({
      lord: p.lord,
      fromWeek: weekLabel(p.startMs, tz),
      toWeek: weekLabel(p.endMs - 1, tz),
    })),
    harsha: Object.fromEntries(BALA_PLANETS.map((b) => [b, { total: harsha[b].total, label: harsha[b].label }])),
    dwadasha: Object.fromEntries(BALA_PLANETS.map((b) => [b, { score: dwad[b].score, checked: VARSHIK_C3.annualBala.dwadashaVerified.includes(b) }])),
    extraYogas: computeExtraTajikaYogas(chart).map((y) => ({
      kind: y.kind,
      name: TAJIKA_LABEL[y.kind] ?? y.kind,
      planets: y.planets,
      plain: EXTRA_YOGA_PLAIN[y.kind] ?? '',
    })),
    lifeSahams: computeLifeSahams(chart, isDay).map((s) => ({
      name: s.name,
      sign: s.sign,
      house: s.houseFromVarshaAsc,
      lord: s.lord,
      supported: s.beneficSupported,
    })),
    triPataki: { lines, onLagna: reading.onLagna, onMoon: reading.onMoon },
  };
}

export { VEDHA_ON_MOON_THEME, r2 };
