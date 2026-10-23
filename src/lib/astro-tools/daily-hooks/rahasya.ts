// =============================================================================
// Kundli Rahasya — 17 scrolls about one chart (pure)
// =============================================================================
// Every scroll is built only from the stored chart: planet positions, the Ashtakavarga tables, the
// Vimshottari periods. Nothing is guessed. Each returns a fixed payload (facts + a Why list); the
// words are plain English sentences made from those facts, and the facts stay in the payload so the
// app can write them in another language later.
//
// Houses here are whole-sign counted from the Ascendant sign. With no exact birth time the Ascendant
// is unknown, so the Moon sign stands in for it ("Moon chart") and the scrolls that depend on houses
// carry a badge saying so. The Ascendant is never guessed.
//
// The scroll list is Aroha's own (17 topics). Two names the product spec used were corrected: the sign
// direction in scroll 6 is not "Digbala" (that is a planet's strength), and scroll 17 speaks about
// temperament, not the body or health.
// =============================================================================

import { SIGN_LORDS, ZODIAC_SIGNS } from '@aroha-astrology/shared';
import { signDignity } from '../../astro-engine/rules/dignity.js';
import { calculateAtmakaraka } from '../../astro-engine/charts/jaiminiPoints.js';
import { calculateD9 } from '../../astro-engine/charts/divisionalCharts.js';

export const SCROLL_COUNT = 17;

export interface ScrollPlanet {
  planet: string;
  longitude: number;
  signIndex: number;
  signDegree: number;
  nakshatra: string;
  nakshatraPada: number;
  nakshatraLord?: string;
  isRetrograde: boolean;
}

export interface ScrollChart {
  planets: ScrollPlanet[];
  ascendant: { signIndex: number; degree: number; nakshatra?: string } | null;
  /** True when the Ascendant rests on an exact birth time. */
  exactTime: boolean;
  /** 12 bindus per planet (Bhinna) and the Sarva totals, indexed by sign 0-11. */
  bhinna: { planet: string; bindus: number[] }[];
  sarva: number[];
  dasha: {
    mahadasha: { planet: string; startDate: string; endDate: string } | null;
    antardasha: { planet: string; startDate: string; endDate: string } | null;
  };
  asOf: string;
}

export interface ScrollFact {
  label: string;
  value: string;
}

export interface Scroll {
  n: number;
  id: string;
  title: string;
  headline: string;
  facts: ScrollFact[];
  /** Short evidence lines: the planets, degrees, bindus or dasha behind the headline. */
  why: string[];
  /** 'moon-chart' when the Moon sign stood in for the Ascendant. */
  badge: 'moon-chart' | null;
}

export const SCROLL_IDS = [
  'lagna', 'moon', 'sun', 'gathering', 'strongest-planet', 'sign-direction', 'mahadasha', 'antardasha',
  'house-strength', 'jupiter', 'saturn', 'navamsa', 'atmakaraka', 'karakamsha', 'nodes', 'indu-lagna', 'energy',
] as const;

export const SCROLL_TITLES = [
  'Your Ascendant', 'Your Moon', 'Your Sun', 'Where your planets gather', 'Your strongest planet',
  'Your sign direction', 'Your main period', 'Your sub-period', 'Your strongest and quietest houses', 'Where Jupiter sits',
  'Where Saturn sits', 'Your Navamsa', 'Your soul planet', 'Your Karakamsha', 'Your Rahu-Ketu axis', 'Your wealth point',
  'Energy and temperament',
];

const SIGN = (i: number): string => ZODIAC_SIGNS[((i % 12) + 12) % 12] as string;
const ord = (n: number): string => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
const deg = (d: number): string => `${Math.floor(d)}°${String(Math.round((d % 1) * 60)).padStart(2, '0')}′`;
const MAIN = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
const ELEMENT_OF = ['fire', 'earth', 'air', 'water'];
const DIRECTION_OF_ELEMENT: Record<string, string> = { fire: 'East', earth: 'South', air: 'West', water: 'North' };
const QUALITY_OF = ['movable', 'fixed', 'dual'];

/** The kalas the classical Indu Lagna sum uses: only the seven grahas carry one. */
export const INDU_KALAS: Record<string, number> = { Sun: 30, Moon: 16, Mars: 6, Mercury: 8, Jupiter: 10, Venus: 12, Saturn: 1 };

const planet = (c: ScrollChart, name: string): ScrollPlanet => {
  const p = c.planets.find((x) => x.planet === name);
  if (!p) throw new Error(`chart has no ${name}`);
  return p;
};

/** The Ascendant sign, or the Moon sign standing in for it. */
export function lagnaSignOf(c: ScrollChart): { signIndex: number; moonChart: boolean } {
  if (c.exactTime && c.ascendant) return { signIndex: c.ascendant.signIndex, moonChart: false };
  return { signIndex: planet(c, 'Moon').signIndex, moonChart: true };
}

/** Whole-sign house (1-12) of a sign counted from the lagna sign. */
export const houseOf = (lagna: number, signIndex: number): number => ((signIndex - lagna + 12) % 12) + 1;

/** Indu Lagna: kalas of the 9th lord from the Lagna and of the 9th lord from the Moon, added, divided by 12, remainder counted from the Moon sign. */
export function induLagna(lagnaSign: number, moonSign: number): { signIndex: number; kalas: number; lord9FromLagna: string; lord9FromMoon: string; remainder: number } {
  const lord9L = SIGN_LORDS[SIGN(lagnaSign + 8) as keyof typeof SIGN_LORDS] as string;
  const lord9M = SIGN_LORDS[SIGN(moonSign + 8) as keyof typeof SIGN_LORDS] as string;
  const kalas = (INDU_KALAS[lord9L] ?? 0) + (INDU_KALAS[lord9M] ?? 0);
  const rem = kalas % 12 === 0 ? 12 : kalas % 12;
  return { signIndex: (moonSign + rem - 1) % 12, kalas, lord9FromLagna: lord9L, lord9FromMoon: lord9M, remainder: rem };
}

const dignityWord = (name: string, signIndex: number): string => {
  const d = signDignity(name as never, signIndex);
  return d === 'own' ? 'in its own sign' : d === 'exalted' ? 'exalted' : d === 'debilitated' ? 'debilitated' : d === 'friend' ? 'in a friend\'s sign' : d === 'enemy' ? 'in a rival\'s sign' : 'in a neutral sign';
};

const bindusAt = (c: ScrollChart, name: string, signIndex: number): number | null =>
  c.bhinna.find((b) => b.planet === name)?.bindus[signIndex] ?? null;

const kalas = (n: number): string => `${n} ${n === 1 ? 'kala' : 'kalas'}`;
const fmtDate = (iso: string): string => iso.slice(0, 10);
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

type Builder = (c: ScrollChart) => Omit<Scroll, 'n' | 'id' | 'title' | 'badge'>;

const BUILDERS: Builder[] = [
  // 1 lagna
  (c) => {
    const { signIndex, moonChart } = lagnaSignOf(c);
    const lord = SIGN_LORDS[SIGN(signIndex) as keyof typeof SIGN_LORDS] as string;
    const lp = planet(c, lord === 'Rahu' || lord === 'Ketu' ? 'Moon' : lord);
    const lh = houseOf(signIndex, lp.signIndex);
    const head = moonChart
      ? `Your birth time is not exact, so your Moon sign ${SIGN(signIndex)} stands in for the Ascendant.`
      : `Your Ascendant is ${SIGN(signIndex)}${c.ascendant ? ` at ${deg(c.ascendant.degree % 30)}` : ''}.`;
    return {
      headline: head,
      facts: [
        { label: moonChart ? 'Stand-in Ascendant' : 'Ascendant', value: SIGN(signIndex) },
        { label: 'Ruled by', value: lord },
        { label: `${lord} sits in`, value: `${SIGN(lp.signIndex)}, house ${lh}` },
      ],
      why: [`${lord} rules ${SIGN(signIndex)}`, `${lord} is placed in ${SIGN(lp.signIndex)} (${ord(lh)} house) ${dignityWord(lord, lp.signIndex)}`],
    };
  },
  // 2 moon
  (c) => {
    const m = planet(c, 'Moon');
    return {
      headline: `Your Moon is in ${SIGN(m.signIndex)} at ${deg(m.signDegree)}, in the ${m.nakshatra} nakshatra, pada ${m.nakshatraPada}.`,
      facts: [
        { label: 'Moon sign (rashi)', value: SIGN(m.signIndex) },
        { label: 'Nakshatra', value: `${m.nakshatra}, pada ${m.nakshatraPada}` },
        { label: 'Nakshatra lord', value: m.nakshatraLord ?? '' },
      ],
      why: [`Moon at ${deg(m.signDegree)} ${SIGN(m.signIndex)}`, `${m.nakshatra} is ruled by ${m.nakshatraLord ?? 'its lord'}, which sets where your planetary periods begin`],
    };
  },
  // 3 sun
  (c) => {
    const s = planet(c, 'Sun');
    const { signIndex } = lagnaSignOf(c);
    const h = houseOf(signIndex, s.signIndex);
    return {
      headline: `Your Sun is in ${SIGN(s.signIndex)} at ${deg(s.signDegree)}, ${dignityWord('Sun', s.signIndex)}, in your ${ord(h)} house.`,
      facts: [
        { label: 'Sun sign (Vedic)', value: SIGN(s.signIndex) },
        { label: 'House', value: String(h) },
        { label: 'Dignity', value: dignityWord('Sun', s.signIndex) },
      ],
      why: [`Sun at ${deg(s.signDegree)} ${SIGN(s.signIndex)}`, `${SIGN(s.signIndex)} is the ${ord(h)} sign counted from your ${lagnaSignOf(c).moonChart ? 'Moon sign' : 'Ascendant'}`],
    };
  },
  // 4 gathering
  (c) => {
    const { signIndex } = lagnaSignOf(c);
    const by: Record<number, string[]> = {};
    for (const p of c.planets) (by[houseOf(signIndex, p.signIndex)] ??= []).push(p.planet);
    const entries = Object.entries(by).map(([h, ps]) => ({ h: Number(h), ps }));
    const most = Math.max(...entries.map((e) => e.ps.length));
    const crowded = entries.filter((e) => e.ps.length === most).sort((a, b) => a.h - b.h);
    const empty = Array.from({ length: 12 }, (_, i) => i + 1).filter((h) => !by[h]);
    const first = crowded[0]!;
    return {
      headline: most >= 2
        ? `Most of your planets gather in house ${first.h}: ${first.ps.join(', ')}.`
        : 'Your planets are spread out: no house holds more than one.',
      facts: [
        { label: most >= 2 ? 'Busiest house' : 'Spread', value: most >= 2 ? `House ${first.h} (${first.ps.length} planets)` : 'one planet per house at most' },
        { label: 'Empty houses', value: empty.length ? empty.join(', ') : 'none' },
      ],
      why: crowded.map((e) => `House ${e.h} holds ${e.ps.join(', ')}`).concat(empty.length ? [`Houses ${empty.join(', ')} hold no planet`] : []),
    };
  },
  // 5 strongest planet by bindus in its own sign
  (c) => {
    const rows = MAIN.map((name) => {
      const p = planet(c, name);
      return { name, sign: p.signIndex, bindus: bindusAt(c, name, p.signIndex) ?? 0 };
    }).sort((a, b) => b.bindus - a.bindus || MAIN.indexOf(a.name) - MAIN.indexOf(b.name));
    const top = rows[0]!;
    return {
      headline: `${top.name} stands strongest by Ashtakavarga: ${top.bindus} of 8 bindus in ${SIGN(top.sign)}, where it sits.`,
      facts: rows.slice(0, 3).map((r) => ({ label: r.name, value: `${r.bindus} bindus in ${SIGN(r.sign)}` })),
      why: rows.map((r) => `${r.name}: ${r.bindus}/8 in ${SIGN(r.sign)}`),
    };
  },
  // 6 sign direction (fire East, earth South, air West, water North)
  (c) => {
    const { signIndex } = lagnaSignOf(c);
    const element = ELEMENT_OF[signIndex % 4]!;
    const quality = QUALITY_OF[signIndex % 3]!;
    return {
      headline: `${SIGN(signIndex)} is ${element === 'air' || element === 'earth' ? 'an' : 'a'} ${element} sign facing ${DIRECTION_OF_ELEMENT[element]}, and a ${quality} sign.`,
      facts: [
        { label: 'Element', value: element },
        { label: 'Sign direction', value: DIRECTION_OF_ELEMENT[element]! },
        { label: 'Quality', value: quality },
      ],
      why: ['Fire signs face East, earth South, air West and water North', `${SIGN(signIndex)} is ${element} and ${quality}`],
    };
  },
  // 7 mahadasha
  (c) => {
    const md = c.dasha.mahadasha;
    if (!md) return { headline: 'Your main period could not be read from this chart.', facts: [], why: [] };
    const left = daysBetween(c.asOf, md.endDate);
    return {
      headline: `You are in the ${md.planet} Mahadasha, until ${fmtDate(md.endDate)}.`,
      facts: [
        { label: 'Main period', value: md.planet },
        { label: 'Began', value: fmtDate(md.startDate) },
        { label: 'Ends', value: fmtDate(md.endDate) },
        { label: 'Time left', value: `${(left / 365.25).toFixed(1)} years` },
      ],
      why: [`Vimshottari period of ${md.planet}`, `${fmtDate(md.startDate)} to ${fmtDate(md.endDate)}`],
    };
  },
  // 8 antardasha
  (c) => {
    const ad = c.dasha.antardasha;
    const md = c.dasha.mahadasha;
    if (!ad || !md) return { headline: 'Your sub-period could not be read from this chart.', facts: [], why: [] };
    const left = daysBetween(c.asOf, ad.endDate);
    return {
      headline: `Inside ${md.planet}, you are in the ${ad.planet} sub-period until ${fmtDate(ad.endDate)}.`,
      facts: [
        { label: 'Sub-period', value: `${md.planet}-${ad.planet}` },
        { label: 'Ends', value: fmtDate(ad.endDate) },
        { label: 'Days left', value: String(Math.max(left, 0)) },
      ],
      why: [`${ad.planet} sub-period of ${md.planet}`, `${fmtDate(ad.startDate)} to ${fmtDate(ad.endDate)}`],
    };
  },
  // 9 house strength by Sarva bindus
  (c) => {
    const { signIndex } = lagnaSignOf(c);
    const rows = Array.from({ length: 12 }, (_, i) => ({ house: i + 1, sign: (signIndex + i) % 12, bindus: c.sarva[(signIndex + i) % 12] ?? 0 }));
    const sorted = [...rows].sort((a, b) => b.bindus - a.bindus || a.house - b.house);
    const hi = sorted[0]!;
    const lo = sorted[sorted.length - 1]!;
    return {
      headline: `House ${hi.house} (${SIGN(hi.sign)}) holds the most bindus, ${hi.bindus}; house ${lo.house} (${SIGN(lo.sign)}) the fewest, ${lo.bindus}.`,
      facts: [
        { label: 'Strongest', value: `House ${hi.house}, ${hi.bindus} bindus` },
        { label: 'Quietest', value: `House ${lo.house}, ${lo.bindus} bindus` },
        { label: 'Average', value: '28 per sign' },
      ],
      why: ['Sarva Ashtakavarga adds every planet\'s bindus per sign; the average is 28', ...sorted.slice(0, 3).map((r) => `House ${r.house}: ${r.bindus}`)],
    };
  },
  // 10 jupiter, 11 saturn
  (c) => slowPlanet(c, 'Jupiter', 'growth and learning'),
  (c) => slowPlanet(c, 'Saturn', 'discipline and patience'),
  // 12 navamsa
  (c) => {
    const { signIndex, moonChart } = lagnaSignOf(c);
    const moon = planet(c, 'Moon');
    const sun = planet(c, 'Sun');
    const lagnaNav = !moonChart && c.ascendant ? calculateD9(c.ascendant.signIndex * 30 + (c.ascendant.degree % 30)) : null;
    const facts: ScrollFact[] = [
      { label: 'Moon in Navamsa', value: SIGN(calculateD9(moon.longitude)) },
      { label: 'Sun in Navamsa', value: SIGN(calculateD9(sun.longitude)) },
    ];
    if (lagnaNav !== null) facts.unshift({ label: 'Ascendant in Navamsa', value: SIGN(lagnaNav) });
    return {
      headline: lagnaNav !== null
        ? `Your Navamsa (D9) Ascendant is ${SIGN(lagnaNav)}, with the Moon in ${SIGN(calculateD9(moon.longitude))}.`
        : `Your Moon falls in ${SIGN(calculateD9(moon.longitude))} in the Navamsa (D9); the Navamsa Ascendant needs an exact birth time.`,
      facts,
      why: ['The Navamsa splits each sign into nine parts of 3°20′', `Birth sign reference: ${SIGN(signIndex)}`],
    };
  },
  // 13 atmakaraka
  (c) => {
    const ak = calculateAtmakaraka(c.planets.map((p) => ({ planet: p.planet, longitude: p.longitude })) as never);
    if (!ak) return { headline: 'Your soul planet could not be read.', facts: [], why: [] };
    const p = planet(c, ak);
    return {
      headline: `${ak} is your Atmakaraka, the planet at the highest degree in its sign: ${deg(p.signDegree)} ${SIGN(p.signIndex)}.`,
      facts: [{ label: 'Atmakaraka', value: ak }, { label: 'Degree', value: `${deg(p.signDegree)} ${SIGN(p.signIndex)}` }],
      why: ['Jaimini astrology names the planet with the highest degree among the seven grahas as the soul significator'],
    };
  },
  // 14 karakamsha
  (c) => {
    const ak = calculateAtmakaraka(c.planets.map((p) => ({ planet: p.planet, longitude: p.longitude })) as never);
    if (!ak) return { headline: 'Your Karakamsha could not be read.', facts: [], why: [] };
    const p = planet(c, ak);
    const sign = calculateD9(p.longitude);
    return {
      headline: `Your Karakamsha is ${SIGN(sign)}: the Navamsa sign of ${ak}, your Atmakaraka.`,
      facts: [{ label: 'Karakamsha', value: SIGN(sign) }, { label: 'From', value: `${ak} at ${deg(p.signDegree)} ${SIGN(p.signIndex)}` }],
      why: [`${ak} is the Atmakaraka`, `Its Navamsa sign is ${SIGN(sign)}`],
    };
  },
  // 15 nodes
  (c) => {
    const { signIndex } = lagnaSignOf(c);
    const r = planet(c, 'Rahu');
    const kSign = (r.signIndex + 6) % 12;
    return {
      headline: `Rahu sits in your ${ord(houseOf(signIndex, r.signIndex))} house (${SIGN(r.signIndex)}) and Ketu opposite, in the ${ord(houseOf(signIndex, kSign))} (${SIGN(kSign)}).`,
      facts: [
        { label: 'Rahu', value: `${SIGN(r.signIndex)}, house ${houseOf(signIndex, r.signIndex)}` },
        { label: 'Ketu', value: `${SIGN(kSign)}, house ${houseOf(signIndex, kSign)}` },
      ],
      why: ['Rahu and Ketu are always exactly opposite', `Rahu at ${deg(r.signDegree)} ${SIGN(r.signIndex)}`],
    };
  },
  // 16 indu lagna
  (c) => {
    const { signIndex } = lagnaSignOf(c);
    const moon = planet(c, 'Moon');
    const il = induLagna(signIndex, moon.signIndex);
    const h = houseOf(signIndex, il.signIndex);
    return {
      headline: `Your Indu Lagna, the wealth point, is ${SIGN(il.signIndex)}, your ${ord(h)} house.`,
      facts: [
        { label: 'Indu Lagna', value: `${SIGN(il.signIndex)}, house ${h}` },
        { label: '9th lord from Lagna', value: `${il.lord9FromLagna} (${kalas(INDU_KALAS[il.lord9FromLagna] ?? 0)})` },
        { label: '9th lord from Moon', value: `${il.lord9FromMoon} (${kalas(INDU_KALAS[il.lord9FromMoon] ?? 0)})` },
      ],
      why: [
        `${kalas(il.kalas)} in all, divided by 12 leaves ${il.remainder}`,
        `Counted from the Moon sign ${SIGN(moon.signIndex)}, that lands on ${SIGN(il.signIndex)}`,
      ],
    };
  },
  // 17 energy and temperament
  (c) => {
    const { signIndex } = lagnaSignOf(c);
    const counts: Record<string, number> = { fire: 0, earth: 0, air: 0, water: 0 };
    for (const name of MAIN) counts[ELEMENT_OF[planet(c, name).signIndex % 4]!]!++;
    counts[ELEMENT_OF[signIndex % 4]!]!++;
    const order = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = order[0]!;
    const low = order[order.length - 1]!;
    const TEMPER: Record<string, string> = {
      fire: 'you tend to start things quickly and like momentum',
      earth: 'you tend to prefer steady, practical steps',
      air: 'you tend to think things through and like to talk them over',
      water: 'you tend to feel your way through things and value closeness',
    };
    return {
      headline: `Your chart leans ${top[0]} (${top[1]} of 8 points), so ${TEMPER[top[0]]}. This is a reflection on temperament, not a statement about health.`,
      facts: order.map(([el, n]) => ({ label: el, value: String(n) })),
      why: ['The seven grahas and the Ascendant sign are counted by element', `${low[0]} is the quietest element, with ${low[1]}`],
    };
  },
];

function slowPlanet(c: ScrollChart, name: 'Jupiter' | 'Saturn', theme: string) {
  const p = planet(c, name);
  const { signIndex } = lagnaSignOf(c);
  const h = houseOf(signIndex, p.signIndex);
  const b = bindusAt(c, name, p.signIndex);
  return {
    headline: `${name} is in ${SIGN(p.signIndex)}${p.isRetrograde ? ' (retrograde)' : ''}, your ${ord(h)} house, ${dignityWord(name, p.signIndex)}. It speaks of ${theme}.`,
    facts: [
      { label: 'Sign', value: `${SIGN(p.signIndex)} at ${deg(p.signDegree)}` },
      { label: 'House', value: String(h) },
      { label: 'Bindus in sign', value: b === null ? 'n/a' : `${b} of 8` },
    ],
    why: [`${name} at ${deg(p.signDegree)} ${SIGN(p.signIndex)} in the ${p.nakshatra} nakshatra`, ...(b === null ? [] : [`${b} bindus in its own Ashtakavarga`])],
  };
}

/** Scrolls whose content depends on houses, so they carry the Moon-chart badge when the Ascendant is unknown. */
const NEEDS_HOUSES = new Set([1, 3, 4, 9, 10, 11, 15, 16, 17]);

export function buildScroll(n: number, c: ScrollChart): Scroll {
  if (!Number.isInteger(n) || n < 1 || n > SCROLL_COUNT) throw new Error(`scroll ${n} does not exist`);
  const body = BUILDERS[n - 1]!(c);
  return {
    n,
    id: SCROLL_IDS[n - 1]!,
    title: SCROLL_TITLES[n - 1]!,
    badge: NEEDS_HOUSES.has(n) && lagnaSignOf(c).moonChart ? 'moon-chart' : null,
    ...body,
  };
}
