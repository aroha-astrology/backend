// =============================================================================
// Varshik Rashifal 2027: the checks verify-claims.ts runs on the English text
// =============================================================================
// Runs on the ENGLISH text, before translate-on-read, so the translations come from checked
// English and none of this has to be rebuilt in 15 languages. No LLM call: everything below is a
// pure function of (the written sections, VarshikFacts), so it is cheap and repeatable.
//
//   claims    every date, house, sign, dasha lord, Year Lord and score number named in a sentence
//             must exist in VarshikFacts (the completeness contract, rule 3)
//   polarity  no "go" advice in a Rust month, no "hold" advice in a Dark Green month
//   persona   no partner, child or job talk the reader did not give us
//   words     fear words, death and harm words, and the AI-tell counter (report-text-checks.ts)
//   gentle    Chapter VI (the questions, the relief page, the closing letter) has no flat "no"
//
// The caller (lib/llm/reports/varshik-2027.ts) regenerates a failing call ONCE with the hits
// listed. Whatever still fails is handled by `dropFlaggedSentences` (every rule except the AI
// tells can be fixed by deleting the sentence) and the remaining AI tells are flagged in the
// saved report's `textFlags`, which the admin sees.
// =============================================================================

import { NAKSHATRAS } from '@aroha-astrology/shared';
import type { ReportSection } from '../../../modules/reports/report-generator.types.js';
import type { VarshikFacts } from '../../astro-engine/reports/varshik-facts.js';
import {
  MONTH_NAMES,
  NINE_PLANETS,
  SIGN_NAMES,
  TAJIKA_LABEL,
} from '../../astro-engine/reports/varshik-labels.js';
import {
  checkProse,
  isSentenceFixable,
  sentencesOf,
  type TextHit,
} from './report-text-checks.js';

export type { TextHit } from './report-text-checks.js';

// -----------------------------------------------------------------------------
// The fact index: every date, pair and lord the facts hold
// -----------------------------------------------------------------------------

export interface FactIndex {
  /** Every full date 'YYYY-MM-DD' in the facts. */
  dates: Set<string>;
  /** 'Planet:house' placements and lordships, from the natal and both Varsha charts and the sky. */
  houses: Set<string>;
  /** 'Planet:Sign' placements. */
  signs: Set<string>;
  /** 'maha:Planet', 'antar:Planet', 'pratyantar:Planet', 'mudda:Planet'. */
  lords: Set<string>;
  yearLords: Set<string>;
  /** How many eclipses the year holds, and how many times each planet turns retrograde. */
  eclipses: number;
  retrogrades: Record<string, number>;
  /** The report year. */
  year: number;
  /** C3: every star, 'Planet:Star' pairing, Tara name, star number, Tajika yoga, Saham, Yogini name and week label in the facts. */
  nakshatras: Set<string>;
  planetStars: Set<string>;
  /** C5: 'Planet:house' counted from the natal Moon sign (sky events, slow transits, Moon gochar). */
  moonHouses: Set<string>;
  /** C5: eclipse dates 'YYYY-MM-DD' by class. */
  eclipseClass: Map<string, 'grahan' | 'upachchaya' | 'not_visible'>;
  /** C5: the closures of the marriage, commitment and home-move rows. */
  closures: VarshikFacts['calendar']['closures'];
  /** C5: months (0-11) a closed row may never be told to go in (fewer than 7 open days). */
  closedMonths: Set<number>;
  taraNames: Set<string>;
  starNumbers: Set<number>;
  tajika: Set<string>;
  sahams: Set<string>;
  yoginiLords: Set<string>;
  patyayiniLords: Set<string>;
  yoginiNames: Set<string>;
  weeks: Set<string>;
}

const ISO = /^\d{4}-\d{2}-\d{2}/;
const SIGN_LORD: Record<string, string> = {
  Aries: 'Mars',
  Taurus: 'Venus',
  Gemini: 'Mercury',
  Cancer: 'Moon',
  Leo: 'Sun',
  Virgo: 'Mercury',
  Libra: 'Venus',
  Scorpio: 'Mars',
  Sagittarius: 'Jupiter',
  Capricorn: 'Saturn',
  Aquarius: 'Saturn',
  Pisces: 'Jupiter',
};

export function buildFactIndex(facts: VarshikFacts): FactIndex {
  const dates = new Set<string>();
  const houses = new Set<string>();
  const signs = new Set<string>();
  const lords = new Set<string>();
  const yearLords = new Set<string>();

  const addDate = (d: string | null | undefined): void => {
    if (d && ISO.test(d)) dates.add(d.slice(0, 10));
  };
  addDate(facts.window.start);
  addDate(facts.window.end);
  for (let m = 0; m < 12; m++) {
    const last = new Date(Date.UTC(facts.year, m + 1, 0)).getUTCDate();
    addDate(`${facts.year}-${String(m + 1).padStart(2, '0')}-01`);
    addDate(`${facts.year}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`);
  }
  const moonHouses = new Set<string>();
  const eclipseClass = new Map<string, 'grahan' | 'upachchaya' | 'not_visible'>();
  for (const e of facts.skyEvents) {
    addDate(e.date);
    houses.add(`${e.planet}:${e.natalHouse}`);
    houses.add(`${e.planet}:${e.varshaHouse}`);
    moonHouses.add(`${e.planet}:${e.moonHouse}`);
    if (e.eclipse) {
      eclipseClass.set(e.date, e.eclipse.class);
      for (const st of e.eclipse.sutak) {
        addDate(st.from.slice(0, 10));
        addDate(st.to.slice(0, 10));
      }
    }
    signs.add(`${e.planet}:${e.sign}`);
    if (e.fromSign) signs.add(`${e.planet}:${e.fromSign}`);
  }
  for (const f of facts.calendar.festivals) addDate(f.date);
  for (const w of facts.sahamWindows) {
    addDate(w.from);
    addDate(w.to);
    for (const d of w.exact) addDate(d);
  }

  const lagnaSign = facts.birth.lagna.signIndex;
  const houseLordships = (lagnaIndex: number): void => {
    for (let h = 1; h <= 12; h++) {
      const sign = SIGN_NAMES[(lagnaIndex + h - 1) % 12]!;
      houses.add(`${SIGN_LORD[sign]}:${h}`);
    }
  };
  houseLordships(lagnaSign);
  for (const p of facts.birth.planets) {
    houses.add(`${p.planet}:${p.house}`);
    signs.add(`${p.planet}:${p.sign}`);
  }
  for (const v of facts.varsha) {
    houseLordships(v.lagnaIndex);
    yearLords.add(v.yearLord);
    houses.add(`Muntha:${v.muntha.house}`);
    houses.add(`${v.muntha.lord}:${v.muntha.house}`);
    for (const p of v.planets) {
      houses.add(`${p.planet}:${p.house}`);
      signs.add(`${p.planet}:${p.sign}`);
    }
    for (const s of v.sahams) houses.add(`${s.name}:${s.house}`);
    for (const per of v.mudda) {
      addDate(per.from);
      addDate(per.to);
      lords.add(`mudda:${per.lord}`);
      for (const a of per.antar) {
        addDate(a.from);
        addDate(a.to);
        lords.add(`mudda:${a.lord}`);
      }
    }
    addDate(v.startsAt);
    addDate(v.endsAt);
  }
  for (const t of facts.ashtakavarga.transits) {
    houses.add(`${t.planet}:${t.natalHouse}`);
    signs.add(`${t.planet}:${t.sign}`);
  }
  for (const p of facts.scores.planetImpact) {
    if (p.natalHouse) houses.add(`${p.planet}:${p.natalHouse}`);
    for (const h of p.transitHouses) houses.add(`${p.planet}:${h}`);
    for (const h of p.varshaHouses) if (h > 0) houses.add(`${p.planet}:${h}`);
  }
  for (const a of facts.dashas.antar) {
    addDate(a.from);
    addDate(a.to);
    lords.add(`maha:${a.maha}`);
    lords.add(`antar:${a.antar}`);
  }
  for (const a of facts.dashas.pratyantar2027) {
    addDate(a.from);
    addDate(a.to);
    lords.add(`maha:${a.maha}`);
    lords.add(`antar:${a.antar}`);
    lords.add(`pratyantar:${a.praty}`);
  }
  for (const w of Object.values(facts.scores.answerWindows)) {
    for (const x of [w.best, w.then]) {
      if (!x) continue;
      addDate(x.fromDate);
      addDate(x.toDate);
      addDate(x.peakDate);
    }
  }
  const rel = facts.scores.relief;
  addDate(rel.lookbackFrom);
  addDate(rel.lookbackTo);
  addDate(rel.varsha2026?.endedOn);
  for (const e of [...rel.lookback, ...rel.ahead, rel.nextRelief, rel.nextReliefBeyondYear]) {
    if (e) addDate(e.date);
  }
  for (const e of [...rel.lookback, ...rel.ahead]) {
    // "Saturn moves from your 7th house to your 8th house": both houses are real facts.
    for (const m of e.detail.matchAll(/\b(Saturn|Jupiter|Rahu|Ketu)\b[^.]*?(\d{1,2})(?:st|nd|rd|th) house/g)) {
      houses.add(`${m[1]}:${m[2]}`);
    }
    for (const m of e.detail.matchAll(/\b(Saturn|Jupiter|Rahu|Ketu)\b[^.]*?to your (\d{1,2})(?:st|nd|rd|th) house/g)) {
      houses.add(`${m[1]}:${m[2]}`);
    }
    for (const m of e.detail.matchAll(/(Maha|Antar) (\w+) begins/g)) {
      lords.add(`${m[1]!.toLowerCase()}:${m[2]}`);
    }
  }

  // --- C3: the star layer, the other dashas, the yogas and Sahams --------------------------------
  const nakshatras = new Set<string>();
  const planetStars = new Set<string>();
  const taraNames = new Set<string>();
  const starNumbers = new Set<number>();
  const tajika = new Set<string>();
  const sahams = new Set<string>();
  const yoginiLords = new Set<string>();
  const patyayiniLords = new Set<string>();
  const yoginiNames = new Set<string>();
  const weeks = new Set<string>();
  const st = facts.stars;
  const seeStar = (planet: string, nak: string): void => {
    nakshatras.add(nak);
    planetStars.add(`${planet}:${nak}`);
  };
  const seeTara = (t: { number: number; name: string }): void => {
    taraNames.add(t.name);
    starNumbers.add(t.number);
  };
  nakshatras.add(st.birthStar.name);
  for (const r of st.table) {
    seeStar(r.point, r.nakshatra);
    seeTara(r.tara);
    if (r.special) seeTara(r.special);
    houses.add(`${r.starLord}:${r.starLordHouse}`);
    for (const h of r.starLordRules) houses.add(`${r.starLord}:${h}`);
    houses.add(`${r.kpSubLord}:${r.subLordHouse}`);
  }
  for (const w of st.navatara.weakened) seeTara(w.tara);
  for (const e of st.navatara.emphasised) seeTara(e.special);
  for (const p of st.planetInStar) seeStar(p.planet, p.nakshatra);
  for (const d of st.dashaLords) {
    seeStar(d.planet, d.nakshatra);
    houses.add(`${d.starLord}:${d.starLordHouse}`);
    houses.add(`${d.subLord}:${d.subLordHouse}`);
  }
  for (const s of st.segments) {
    seeStar(s.planet, s.nakshatra);
    seeTara(s.tara);
    if (s.special) seeTara(s.special);
    addDate(s.from);
    addDate(s.to);
    houses.add(`${s.starLord}:${s.starLordHouse}`);
  }
  for (const s of st.sensitive) {
    addDate(s.from);
    addDate(s.to);
  }
  for (const m of st.moorti) {
    addDate(m.date);
    signs.add(`${m.planet}:${m.toSign}`);
    signs.add(`${m.planet}:${m.fromSign}`);
  }
  for (const ms of st.monthStars) {
    for (const r of ms.rows) {
      seeStar(r.planet, r.nakshatra);
      seeTara(r.tara);
      houses.add(`${r.planet}:${r.houseFromMoon}`);
    }
  }
  for (const v of facts.varsha) {
    for (const y of v.tajikaYogas) tajika.add(TAJIKA_LABEL[y.kind] ?? y.kind);
    for (const y of v.extra.extraYogas) tajika.add(y.name);
    for (const s of [...v.sahams, ...v.extra.lifeSahams]) {
      sahams.add(s.name.split(/[\s(]/)[0]!);
      houses.add(`${s.name}:${s.house}`);
    }
    for (const p of v.extra.muddaYogini) {
      addDate(p.from);
      addDate(p.to);
      yoginiLords.add(p.lord);
      yoginiNames.add(p.yogini);
    }
    for (const p of v.extra.patyayini) {
      patyayiniLords.add(p.lord);
      weeks.add(p.fromWeek);
      weeks.add(p.toWeek);
    }
  }
  for (const y of facts.yogas) if (y.source === 'tajika') tajika.add(TAJIKA_LABEL[y.kind] ?? y.kind);
  for (const w of facts.sahamWindows) sahams.add(w.saham.split(/[\s(]/)[0]!);

  for (const t of facts.ashtakavarga.transits) moonHouses.add(`${t.planet}:${t.moonHouse}`);
  for (const ms of facts.stars.monthStars) for (const r of ms.rows) moonHouses.add(`${r.planet}:${r.houseFromMoon}`);
  for (const c of facts.calendar.closures) {
    addDate(c.from);
    addDate(c.to);
  }
  for (const d of facts.scores.decisionTable) for (const sp of d.openSpans) {
    addDate(sp.from);
    addDate(sp.to);
  }
  const closedMonths = new Set<number>();
  const closedDay = (iso: string) => facts.calendar.closures.some((c) => iso >= c.from && iso <= c.to);
  for (let m = 0; m < 12; m++) {
    const last = new Date(Date.UTC(facts.year, m + 1, 0)).getUTCDate();
    let open = 0;
    for (let d = 1; d <= last; d++) {
      if (!closedDay(`${facts.year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)) open++;
    }
    if (open < 7) closedMonths.add(m);
  }

  const retrogrades: Record<string, number> = {};
  for (const e of facts.skyEvents) {
    if (e.kind === 'station-retrograde') retrogrades[e.planet] = (retrogrades[e.planet] ?? 0) + 1;
  }
  const eclipses = facts.skyEvents.filter((e) => e.kind.startsWith('eclipse')).length;
  return {
    dates,
    houses,
    signs,
    lords,
    yearLords,
    eclipses,
    retrogrades,
    year: facts.year,
    nakshatras,
    planetStars,
    taraNames,
    starNumbers,
    tajika,
    sahams,
    yoginiLords,
    patyayiniLords,
    yoginiNames,
    weeks,
    moonHouses,
    eclipseClass,
    closures: facts.calendar.closures,
    closedMonths,
  };
}

// -----------------------------------------------------------------------------
// Claims
// -----------------------------------------------------------------------------

const PLANET_ALT = NINE_PLANETS.join('|');
const SIGN_ALT = SIGN_NAMES.join('|');
const MONTH_ALT = [
  ...MONTH_NAMES,
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Jun',
  'Jul',
  'Aug',
  'Sept',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
].join('|');
const monthNumber = (name: string): number => {
  const i = MONTH_NAMES.findIndex((m) => m.toLowerCase().startsWith(name.toLowerCase().slice(0, 3)));
  return i + 1;
};

const DATE_DM = new RegExp(
  `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_ALT})\\b(?:,?\\s+(\\d{4}))?`,
  'g',
);
const DATE_MD = new RegExp(`\\b(${MONTH_ALT})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\d)(?:,?\\s+(\\d{4}))?`, 'g');
// A planet binds to the house that follows it directly: no other planet or the Muntha may stand in the gap, or
// "Saturn enters Ashwini, linked to your natal Rahu, while its lord Ketu sits in your 3rd house" would read as Rahu in the 3rd.
const HOUSE_CLAIM = new RegExp(
  `\\b(${PLANET_ALT}|Muntha)\\b((?:(?!\\b(?:${PLANET_ALT}|Muntha)\\b)[^.!?]){0,45}?)\\b(\\d{1,2})(?:st|nd|rd|th) house\\b`,
  'g',
);
const SIGN_CLAIM = new RegExp(
  `\\b(Sun|Mars|Mercury|Jupiter|Venus|Saturn|Rahu|Ketu)\\b (?:is |sits |stands |moves |remains |will be |was |spends [a-z ]{0,20})?in (${SIGN_ALT})\\b`,
  'g',
);
const DASHA_CLAIM = new RegExp(
  `\\b(Maha|Antar|Mudda|Pratyantar)(?:dasha)?(?: lord)?(?: of| is| in)? (${PLANET_ALT})\\b|\\b(${PLANET_ALT}) (Maha|Antar|Mudda|Pratyantar)(?:dasha)?\\b`,
  'g',
);
const YEAR_LORD_CLAIM = new RegExp(
  `\\bYear Lord\\b[^.!?]{0,20}?\\b(?:is|:|will be)\\s+(${PLANET_ALT})\\b|\\b(${PLANET_ALT})\\b[^.!?]{0,20}?\\b(?:is|as|becomes)\\s+(?:your |the )?Year Lord\\b`,
  'g',
);
// --- C3 claims: stars, taras, yogas, Sahams, the other dashas, week labels --------------------------
// A star may be written "UttaraBhadrapada" (the facts) or "Uttara Bhadrapada" (the prompt asks for a space).
const NAK_ALT = [...NAKSHATRAS].sort((a, b) => b.length - a.length).map((n) => n.replace(/([a-z])([A-Z])/g, '$1\\s?$2')).join('|');
const nakKey = (written: string): string => written.replace(/\s+/g, '');
const NAK_NAMED = new RegExp(`\\b(${NAK_ALT})\\b`, 'g');
const STAR_PAIR = new RegExp(
  `\\b(Sun|Mercury|Venus|Mars|Jupiter|Saturn|Rahu|Ketu)\\b (?:moves into|moves to|enters|crosses|reaches|passes into|stands in|sits in|is in|moves through|begins the year in) (?:the star of |the star |the |your )?(${NAK_ALT})\\b`,
  'g',
);
const NTH_STAR = /\b(\d{1,2})(?:st|nd|rd|th) star\b/g;
/** Tara and special-tara names that can be checked (Karma and Mitra are common words and are left out). */
const TARA_NAMES = ['Janma', 'Sampat', 'Vipat', 'Kshema', 'Pratyari', 'Sadhaka', 'Parama Mitra', 'Jati', 'Desha', 'Sanghatika', 'Samudaya', 'Manasa', 'Abhisheka'];
const TARA_NAMED = new RegExp(`\\b(${TARA_NAMES.join('|')})\\b`, 'g');
/** The two classical names that never reach the reader. */
const HARSH_NAMES = /\b(?:Vadha|Vainashika)\b/i;
const TAJIKA_NAMES = [
  'Ithasala', 'Ishrafa', 'Nakta', 'Yamaya', 'Kamboola', 'Radda', 'Iqbal', 'Induvara', 'Manau', 'Gairi-Kamboola', 'Khallasara',
  'Duhphali-kuttha', 'Dutthottha-davira', 'Tambira', 'Kuttha', 'Durupha',
].sort((a, b) => b.length - a.length);
const TAJIKA_NAMED = new RegExp(`(?<![\\w-])(${TAJIKA_NAMES.join('|')})(?![\\w-])`, 'g');
const SAHAM_NAMED = /\b([A-Z][a-z]+) Saham\b/g;
const YOGINI_NAMES = ['Mangala', 'Pingala', 'Dhanya', 'Bhramari', 'Bhadrika', 'Ulka', 'Siddha', 'Sankata'];
const YOGINI_NAMED = new RegExp(`\\b(${YOGINI_NAMES.join('|')})\\b`, 'g');
const OTHER_DASHA = new RegExp(
  `\\b(Yogini|Patyayini)(?: period)?(?: of| is| in| lord)? (${PLANET_ALT})\\b|\\b(${PLANET_ALT}) (Yogini|Patyayini)\\b`,
  'g',
);
const WEEK_WORDS: Record<string, string> = { first: '1st', second: '2nd', third: '3rd', fourth: '4th', '1st': '1st', '2nd': '2nd', '3rd': '3rd', '4th': '4th' };
const WEEK_NAMED = new RegExp(`\\b(first|second|third|fourth|1st|2nd|3rd|4th) week of (${MONTH_NAMES.join('|')})\\b`, 'gi');

const COUNT_WORDS: Record<string, number> = {
  once: 1,
  twice: 2,
  'two times': 2,
  'three times': 3,
  'four times': 4,
  'five times': 5,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
};
const ECLIPSE_COUNT = /\b(one|two|three|four|five|six|seven|eight|[1-8])\s+(?:solar\s+and\s+lunar\s+|solar\s+or\s+lunar\s+)?eclipses\b/gi;
const RETRO_COUNT = /\b(once|twice|two times|three times|four times|five times)\b/i;
const ASPECT_WORDS = /\b(?:aspect\w*|looks? at|sees?|glances?|influenc\w*)\b/i;

/** Hits for one sentence against the facts. Empty when every named fact exists. */
export function claimHitsForSentence(sentence: string, index: FactIndex): TextHit[] {
  const hits: TextHit[] = [];
  const miss = (why: string): void => {
    hits.push({ rule: 'claim', text: `${why}: ${sentence}` });
  };

  for (const re of [DATE_DM, DATE_MD]) {
    for (const m of sentence.matchAll(new RegExp(re.source, 'g'))) {
      const [day, monthName, year] =
        re === DATE_DM
          ? [m[1]!, m[2]!, m[3]]
          : [m[2]!, m[1]!, m[3]];
      const mm = String(monthNumber(monthName)).padStart(2, '0');
      const dd = String(Number(day)).padStart(2, '0');
      if (Number(day) < 1 || Number(day) > 31) continue;
      // A date with a year must match in full. One without a year may be 2027 or an adjacent year
      // (a Mudda or dasha date from 2026 or 2028); never 2025 or 2029, which the facts give with their year.
      const known = year
        ? index.dates.has(`${year}-${mm}-${dd}`)
        : [-1, 0, 1].some((o) => index.dates.has(`${index.year + o}-${mm}-${dd}`));
      if (!known) miss(`the date ${day} ${monthName} is not in the facts`);
    }
  }

  if (!ASPECT_WORDS.test(sentence)) {
    for (const m of sentence.matchAll(new RegExp(HOUSE_CLAIM.source, 'g'))) {
      const planet = m[1]!;
      const house = Number(m[3]);
      // "the 3rd house from your Moon" is counted from the Moon sign: the C5 check below reads it.
      if (/^\s+(?:counted\s+)?from\s+(?:your|the)\s+(?:natal\s+)?Moon\b/i.test(sentence.slice(m.index! + m[0].length))) continue;
      if (house < 1 || house > 12) {
        miss(`${house}th house does not exist`);
      } else if (!index.houses.has(`${planet}:${house}`)) {
        miss(`${planet} in the ${house}th house is not in the facts`);
      }
    }
  }
  hits.push(...c5ClaimHits(sentence, index));

  for (const m of sentence.matchAll(new RegExp(SIGN_CLAIM.source, 'g'))) {
    if (!index.signs.has(`${m[1]}:${m[2]}`)) miss(`${m[1]} in ${m[2]} is not in the facts`);
  }

  for (const m of sentence.replace(/Mudda Yogini/gi, 'Yogini').matchAll(new RegExp(DASHA_CLAIM.source, 'g'))) {
    const level = (m[1] ?? m[4])!.toLowerCase();
    const planet = (m[2] ?? m[3])!;
    if (!index.lords.has(`${level}:${planet}`)) miss(`${level} ${planet} is not in the facts`);
  }

  // "Four eclipses" over a list of five: a count must match the facts.
  for (const m of sentence.matchAll(new RegExp(ECLIPSE_COUNT.source, 'gi'))) {
    const n = COUNT_WORDS[m[1]!.toLowerCase()] ?? Number(m[1]);
    if (n !== index.eclipses) miss(`the year holds ${index.eclipses} eclipses, not ${n}`);
  }
  // "Mercury turns retrograde three times": one planet in the sentence, a count that must match.
  if (/retrograde/i.test(sentence) && RETRO_COUNT.test(sentence)) {
    const planets = [...new Set([...sentence.matchAll(new RegExp(`\\b(${PLANET_ALT})\\b`, 'g'))].map((m) => m[1]!))];
    if (planets.length === 1) {
      const n = COUNT_WORDS[RETRO_COUNT.exec(sentence)![1]!.toLowerCase()]!;
      const real = index.retrogrades[planets[0]!] ?? 0;
      if (n !== real) miss(`${planets[0]} turns retrograde ${real} times in ${index.year}, not ${n}`);
    }
  }

  // --- C3 ---------------------------------------------------------------------------------------
  if (HARSH_NAMES.test(sentence)) hits.push({ rule: 'death', text: `a classical star name that must not reach the reader: ${sentence}` });
  for (const m of sentence.matchAll(NAK_NAMED)) {
    if (!index.nakshatras.has(nakKey(m[1]!))) miss(`the star ${m[1]} is not in the facts`);
  }
  for (const m of sentence.matchAll(STAR_PAIR)) {
    if (!index.planetStars.has(`${m[1]}:${nakKey(m[2]!)}`)) miss(`${m[1]} in ${m[2]} is not in the facts`);
  }
  for (const m of sentence.matchAll(NTH_STAR)) {
    if (!index.starNumbers.has(Number(m[1]))) miss(`a ${m[1]}th star is not in the facts`);
  }
  for (const m of sentence.matchAll(TARA_NAMED)) {
    if (!index.taraNames.has(m[1]!)) miss(`the tara ${m[1]} is not in the facts`);
  }
  for (const m of sentence.matchAll(TAJIKA_NAMED)) {
    if (!index.tajika.has(m[1]!)) miss(`the ${m[1]} yoga is not in the facts`);
  }
  for (const m of sentence.matchAll(SAHAM_NAMED)) {
    if (!index.sahams.has(m[1]!)) miss(`the ${m[1]} Saham is not in the facts`);
  }
  for (const m of sentence.matchAll(YOGINI_NAMED)) {
    if (!index.yoginiNames.has(m[1]!)) miss(`the Yogini ${m[1]} is not in the facts`);
  }
  for (const m of sentence.matchAll(OTHER_DASHA)) {
    const kind = (m[1] ?? m[4])!;
    const planet = (m[2] ?? m[3])!;
    const set = kind === 'Yogini' ? index.yoginiLords : index.patyayiniLords;
    if (!set.has(planet)) miss(`${kind} ${planet} is not in the facts`);
  }
  for (const m of sentence.matchAll(WEEK_NAMED)) {
    const label = `${WEEK_WORDS[m[1]!.toLowerCase()]} week of ${m[2]}`;
    if (!index.weeks.has(label)) miss(`the ${label} is not a Patyayini week in the facts`);
  }

  for (const m of sentence.matchAll(new RegExp(YEAR_LORD_CLAIM.source, 'g'))) {
    const planet = (m[1] ?? m[2])!;
    if (!index.yearLords.has(planet)) miss(`${planet} is not the Year Lord`);
  }
  return hits;
}

// -----------------------------------------------------------------------------
// C5: Lagna and Moon references, eclipse class and Sutak, the no-muhurat periods
// -----------------------------------------------------------------------------

// "6th from your Lagna", "the 3rd house from your Moon", "3rd from the Moon sign".
const REF_HOUSE = /\b(\d{1,2})(?:st|nd|rd|th)\s+(?:house\s+)?(?:counted\s+)?from\s+(?:your|the)\s+(?:natal\s+|birth\s+)?(Moon|Lagna|Ascendant)\b/gi;
// A planet name that is a reference ("from your Moon"), not the planet being placed.
const PLANET_TOKEN = new RegExp(`\\b(${NINE_PLANETS.join('|')})\\b`, 'g');
const TRANSIT_VERB = /\b(?:enters|moves (?:into|to)|shifts into|crosses into|transits|turns (?:retrograde|direct)|stations)\b/i;
const NTH_HOUSE_BARE = /\b(\d{1,2})(?:st|nd|rd|th) house\b(?!\s+(?:counted\s+)?from)/i;
const SUTAK = /\bsutak\b/i;
const NO_SUTAK = /\b(?:no|without)\s+sutak\b|\bsutak\s+(?:does not|doesn't|is not|isn't|will not|won't|need not|never)\b|\bnot\s+(?:a\s+)?sutak\b/i;
const TRIGGER_WORDS = /\b(?:trigger\w*|activat\w*|stirs?|shak\w+|jolts?|sets? off|sparks?|lights? up|falls? in your|lands? in your)\b/i;
const GRAHAN_WORD = /\bgrahan\b/i;
const NOT_GRAHAN = /\b(?:not\s+(?:a\s+)?(?:full\s+)?grahan|no\s+grahan|upachchaya)\b/i;
const CLOSED_EVENT = /\b(?:marri\w+|wedding|vivah|engage\w*|roka|commitment|griha pravesh|move (?:into|to) (?:a |your |the )?(?:new )?home|moving (?:in|home)|house[- ]?warming|new home)\b/i;
const CLOSED_GO = /\b(?:best|good|ideal|favourable|favorable|auspicious|open window|window opens|go ahead|green light|right time|strong (?:time|window|month))\b/i;
const CLOSED_NEG = /\b(?:no|not|avoid|hold|wait|after|until|once|outside|combust|asta|kharmas|chaturmas|closed)\b/i;

function isoOfDate(day: string, monthName: string, year: number): string {
  return `${year}-${String(monthNumber(monthName)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
}

function datesIn(sentence: string, year: number): string[] {
  const out: string[] = [];
  for (const m of sentence.matchAll(new RegExp(DATE_DM.source, 'g'))) out.push(isoOfDate(m[1]!, m[2]!, m[3] ? Number(m[3]) : year));
  for (const m of sentence.matchAll(new RegExp(DATE_MD.source, 'g'))) out.push(isoOfDate(m[2]!, m[1]!, m[3] ? Number(m[3]) : year));
  return out;
}

export function c5ClaimHits(sentence: string, index: FactIndex): TextHit[] {
  const hits: TextHit[] = [];
  const miss = (why: string): void => {
    hits.push({ rule: 'claim', text: `${why}: ${sentence}` });
  };

  // 1. Every "Nth from your Lagna / Moon" binds to the nearest planet before it that is not itself a reference.
  for (const m of sentence.matchAll(new RegExp(REF_HOUSE.source, 'gi'))) {
    const n = Number(m[1]);
    const ref = m[2]!.toLowerCase() === 'moon' ? 'moon' : 'lagna';
    let planet: string | null = null;
    for (const t of sentence.slice(0, m.index!).matchAll(new RegExp(PLANET_TOKEN.source, 'g'))) {
      const before = sentence.slice(Math.max(0, t.index! - 12), t.index!);
      if (/from\s+(?:your|the)\s+(?:natal\s+|birth\s+)?$/i.test(before)) continue;
      planet = t[1]!;
    }
    if (!planet) continue;
    if (n < 1 || n > 12) miss(`${n}th house does not exist`);
    else if (!(ref === 'moon' ? index.moonHouses : index.houses).has(`${planet}:${n}`)) {
      miss(`${planet} ${n}th from your ${ref === 'moon' ? 'Moon' : 'Lagna'} is not in the facts`);
    }
  }

  // 2. A transit house says which chart it counts from.
  if (TRANSIT_VERB.test(sentence) && NTH_HOUSE_BARE.test(sentence) && !/\b(?:Lagna|Ascendant|Moon|Varsha|birth chart|natal)\b/i.test(sentence)) {
    hits.push({ rule: 'claim', text: `say whether the house counts from your Lagna or your Moon: ${sentence}` });
  }

  // 3. Eclipses: Sutak only for a Grahan; an Upachchaya or unseen eclipse is a plain marker, never a trigger.
  const dates = datesIn(sentence, index.year);
  const named = dates.map((d) => index.eclipseClass.get(d)).filter((c): c is NonNullable<typeof c> => !!c);
  const hasGrahan = [...index.eclipseClass.values()].includes('grahan');
  if (SUTAK.test(sentence) && !NO_SUTAK.test(sentence)) {
    if (!hasGrahan) miss(`no eclipse this year is a visible Grahan, so no Sutak applies`);
    else if (named.some((c) => c !== 'grahan')) miss(`Sutak applies only to the visible Grahan`);
  }
  if (named.some((c) => c !== 'grahan')) {
    if (TRIGGER_WORDS.test(sentence) || /\b\d{1,2}(?:st|nd|rd|th) house\b/i.test(sentence)) {
      miss(`a penumbral or unseen eclipse is a plain marker, not a personal trigger`);
    }
    if (GRAHAN_WORD.test(sentence) && !NOT_GRAHAN.test(sentence) && !named.includes('grahan')) {
      miss(`a penumbral or unseen eclipse is not a Grahan`);
    }
  }

  // 4. No "go" for a wedding, commitment or home move inside Shukra/Guru Asta, Kharmas or Chaturmas.
  if (CLOSED_EVENT.test(sentence) && CLOSED_GO.test(sentence) && !CLOSED_NEG.test(sentence)) {
    for (const d of dates) {
      const c = index.closures.find((x) => d >= x.from && d <= x.to);
      if (c) miss(`${d} falls in ${c.reason.replace('_', ' ')} (${c.from} to ${c.to}): no wedding or move-in window there`);
    }
    for (let m = 0; m < 12; m++) {
      if (index.closedMonths.has(m) && new RegExp(`\\b${MONTH_NAMES[m]}\\b`).test(sentence)) {
        miss(`${MONTH_NAMES[m]} is closed to weddings and move-ins this year`);
      }
    }
  }
  return hits;
}

// -----------------------------------------------------------------------------
// Polarity: no "go" advice in a Rust month, no "hold" advice in a Dark Green month
// -----------------------------------------------------------------------------

const GO_RE =
  /\b(?:go ahead|push (?:ahead|forward|hard)|launch\w*|sign(?:ing)? (?:the|a|that|it)|commit(?:ting)? to|best (?:time|month|window)|ideal time|great time|perfect time|strongest (?:window|month)|make your move|take the leap|seize|now is the time|act (?:now|boldly|decisively)|start (?:the|that|a|your) (?:new |big )?(?:business|job|project|venture)|apply now|say yes|move ahead boldly)\b/i;
const HOLD_RE =
  /\b(?:hold off|wait (?:until|for)|avoid (?:signing|starting|launching|big|major)|postpone|delay (?:the|any|big|major)|put (?:it|this|that) off|step back|not the time|keep things small|don'?t rush|do not rush)\b/i;
const NEGATION = /\b(?:not|never|no|n't|avoid|hold off|rather than|instead of|without|isn't|wouldn't)\b/i;

type TierName = 'dark_green' | 'light_green' | 'amber' | 'rust';

function monthIndexIn(sentence: string): number | null {
  for (let i = 0; i < 12; i++) {
    if (new RegExp(`\\b${MONTH_NAMES[i]}\\b`).test(sentence)) return i;
  }
  return null;
}

function sectionMonth(id: string): number | null {
  const m = /^month_(\d{2})$/.exec(id);
  return m ? Number(m[1]) - 1 : null;
}

export function polarityHitsForSection(
  sectionId: string,
  paragraphs: string[],
  facts: VarshikFacts,
): TextHit[] {
  const hits: TextHit[] = [];
  const own = sectionMonth(sectionId);
  const area = /^area_(\w+)$/.exec(sectionId)?.[1];
  const tierOfMonth = (m: number): TierName => {
    if (area && facts.scores.timingMap[area]) return facts.scores.timingMap[area]![m]!.tier;
    return facts.scores.months[m]!.tier;
  };
  for (const p of paragraphs) {
    for (const s of sentencesOf(p)) {
      const m = monthIndexIn(s) ?? own;
      if (m === null) continue;
      const tier = tierOfMonth(m);
      if (tier === 'rust' && GO_RE.test(s) && !NEGATION.test(s)) {
        hits.push({ rule: 'polarity', text: `${MONTH_NAMES[m]} is a quiet (Rust) month but this reads as go advice: ${s}` });
      }
      if (tier === 'dark_green' && HOLD_RE.test(s) && !NEGATION.test(s.replace(HOLD_RE, ''))) {
        hits.push({ rule: 'polarity', text: `${MONTH_NAMES[m]} is a strong (Dark Green) month but this reads as hold advice: ${s}` });
      }
    }
  }
  return hits;
}

// -----------------------------------------------------------------------------
// Persona: nothing the reader did not tell us
// -----------------------------------------------------------------------------

const PARTNER_ANY =
  /\byour (?:partner|spouse|husband|wife|marriage|fianc[eé]e?|boyfriend|girlfriend|in-laws?|mother-in-law|father-in-law|better half|other half|wedding|engagement)\b|\bmarried life\b/i;
const PARTNER_MARRIED_ONLY =
  /\byour (?:husband|wife|marriage|in-laws?|mother-in-law|father-in-law)\b|\bmarried life\b/i;
const CHILD_OWN = /\byour (?:child|children|kids?|son|daughter|baby|toddler|teenager|little ones?)\b|\bparenting\b|\bnewborn\b/i;
const CHILD_PLANS =
  /\b(?:starting a family|growing your family|plans? for a baby|pregnan\w*|conceiv\w*|expecting a child|family planning)\b/i;
const JOB_EMPLOYEE =
  /\byour (?:boss|manager|employer|office|colleagues?|salary|appraisal|promotion|workplace|job|team lead)\b/i;
const JOB_BUSINESS = /\byour (?:clients?|customers?|shop|business|firm|staff|store)\b/i;

export function personaHitsForSection(
  paragraphs: string[],
  answers: VarshikFacts['reader']['answers'],
): TextHit[] {
  const hits: TextHit[] = [];
  const { relationship, occupation, children } = answers;
  const checks: Array<[RegExp, boolean, string]> = [
    [
      relationship === 'partnered' ? PARTNER_MARRIED_ONLY : PARTNER_ANY,
      relationship === 'married',
      'a partner the reader did not mention',
    ],
    [CHILD_OWN, children === 'have', 'children the reader did not mention'],
    [CHILD_PLANS, children === 'planning' || children === 'have', 'family plans the reader did not mention'],
    [JOB_EMPLOYEE, occupation === 'working', 'a workplace the reader did not mention'],
    [JOB_BUSINESS, occupation === 'business', 'a business the reader did not mention'],
  ];
  for (const p of paragraphs) {
    for (const s of sentencesOf(p)) {
      for (const [re, allowed, why] of checks) {
        if (!allowed && re.test(s)) hits.push({ rule: 'persona', text: `${why}: ${s}` });
      }
    }
  }
  return hits;
}

// -----------------------------------------------------------------------------
// Labels that must never reach the reader
// -----------------------------------------------------------------------------

/** The scorer's private tier labels, and the colour and tier words that go with them. */
// "a steady tone" is plain English and stays allowed; "weigh tone", "hold tone" and "go tone" only
// come from the model echoing a label.
const LEAKED_LABEL = /\bTIER_[A-Z]+\b|\b(?:tier|tiers|Rust|Amber|Dark Green|Light Green)\b|\b(?:go|weigh|hold) tone\b/;

export function leakedLabelHits(paragraphs: string[]): TextHit[] {
  const hits: TextHit[] = [];
  for (const p of paragraphs) {
    for (const s of sentencesOf(p)) {
      if (LEAKED_LABEL.test(s)) hits.push({ rule: 'claim', text: `an internal label reached the text: ${s}` });
    }
  }
  return hits;
}

/**
 * Month sections in one call must not open the same way: the same first three words opening the
 * same paragraph in three or more of them is an AI tell. Returns hits keyed by section id.
 */
export function crossSectionOpeningHits(
  sections: Array<Pick<ReportSection, 'id' | 'paragraphs'>>,
): Map<string, TextHit[]> {
  const out = new Map<string, TextHit[]>();
  const maxParas = Math.max(0, ...sections.map((s) => s.paragraphs.length));
  for (let i = 0; i < maxParas; i++) {
    const byKey = new Map<string, string[]>();
    for (const s of sections) {
      const words = (s.paragraphs[i] ?? '')
        .toLowerCase()
        .replace(/[^a-z\s']/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3);
      if (words.length < 3) continue;
      const key = words.join(' ');
      byKey.set(key, [...(byKey.get(key) ?? []), s.id ?? '']);
    }
    for (const [key, ids] of byKey) {
      if (ids.length < 3) continue;
      for (const id of ids.slice(1)) {
        out.set(id, [
          ...(out.get(id) ?? []),
          { rule: 'ai-tell:openings', text: `paragraph ${i + 1} opens "${key}" in ${ids.length} sections` },
        ]);
      }
    }
  }
  return out;
}

// -----------------------------------------------------------------------------
// Putting it together
// -----------------------------------------------------------------------------

/** Chapter VI is held to the gentle rule: the question pages, the relief page, the closing letter. */
export const isGentleSection = (id: string): boolean =>
  /^question_\d$/.test(id) || id === 'what_changes' || id === 'closing_letter';

export interface SectionHits {
  sectionId: string;
  hits: TextHit[];
}

/** Every check on one section. The hook counts as a paragraph. */
export function checkVarshikSection(
  section: Pick<ReportSection, 'id' | 'heading' | 'hook' | 'paragraphs'>,
  facts: VarshikFacts,
  index: FactIndex = buildFactIndex(facts),
): TextHit[] {
  const id = section.id ?? '';
  const paragraphs = [...(section.hook ? [section.hook] : []), ...section.paragraphs];
  const hits: TextHit[] = [
    ...checkProse(paragraphs, { gentle: isGentleSection(id) }),
    ...polarityHitsForSection(id, paragraphs, facts),
    ...personaHitsForSection(paragraphs, facts.reader.answers),
    ...leakedLabelHits(paragraphs),
  ];
  for (const p of paragraphs) {
    for (const s of sentencesOf(p)) hits.push(...claimHitsForSentence(s, index));
  }
  return hits;
}

export function checkVarshikSections(sections: ReportSection[], facts: VarshikFacts): SectionHits[] {
  const index = buildFactIndex(facts);
  return sections
    .map((s) => ({ sectionId: s.id ?? s.heading, hits: checkVarshikSection(s, facts, index) }))
    .filter((r) => r.hits.length > 0);
}

/**
 * Deletes every sentence a fixable hit points at (all rules except the AI tells). Returns the
 * cleaned section. A paragraph emptied by it is removed: the coverage check then fails the run
 * and the reader is refunded, instead of a gap reaching the page.
 */
export function dropFlaggedSentences<T extends Pick<ReportSection, 'paragraphs' | 'hook'>>(
  section: T,
  hits: TextHit[],
): T {
  const bad = new Set<string>();
  for (const h of hits) {
    if (!isSentenceFixable(h.rule)) continue;
    // The claim/persona/polarity hit text is "reason: sentence"; the word hits are the sentence.
    const sentence = h.text.includes(': ') && ['claim', 'persona', 'polarity'].includes(h.rule) ? h.text.slice(h.text.indexOf(': ') + 2) : h.text;
    bad.add(sentence.trim());
  }
  if (bad.size === 0) return section;
  const clean = (text: string): string =>
    sentencesOf(text)
      .filter((s) => !bad.has(s.trim()))
      .join(' ')
      .trim();
  const hook = section.hook !== undefined ? clean(section.hook) : undefined;
  return {
    ...section,
    ...(hook !== undefined ? { hook } : {}),
    paragraphs: section.paragraphs.map(clean).filter((p) => p.length > 0),
  };
}

/** One line per hit for the regenerate prompt. */
export function hitsAsPromptLines(hits: TextHit[]): string {
  return hits
    .slice(0, 12)
    .map((h) => `- [${h.rule}] ${h.text}`)
    .join('\n');
}
