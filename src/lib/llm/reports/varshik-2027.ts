// =============================================================================
// Varshik Rashifal 2027: the narrative (5 checkpointed LLM calls)
// =============================================================================
// Same resumable idiom as kp_annual / marriage / numerology (SectionGenerationProgress): each
// finished call is saved, so a retry only repays for the call that failed.
//
//   call 1  the shape of the year     welcome letter, 2027 at a glance, Year Lord and Muntha,
//                                     the two Varsha charts, the big sky moves
//   call 2  planets and areas         planet by planet, 9 doshas, yogas, 7 life areas, the
//                                     timing pages (map, rhythm, sky calendar, when to act,
//                                     golden windows)
//   call 3  months 1 to 6             5 paragraphs each (the month at a glance, what to do and
//   call 4  months 7 to 12            what to hold, career and money, love and health, a remedy)
//   call 5  Chapter V and VI          simple remedies, the relief page, the closing letter, and
//                                     up to 5 question pages from the reader's own facts
//
// EVERY JUDGEMENT IS A GIVEN FACT. The month tiers, the dates, the dasha lords, the windows and
// the houses come from VarshikFacts; the model explains them and adds no number, date or
// placement. Its output is then checked (verify-claims.ts: dates, houses, signs, lords, polarity,
// persona, fear and death words, AI tells) and a failing call is regenerated ONCE with the hits
// listed. Whatever still fails is cut sentence by sentence; AI tells that survive are flagged in
// the saved report. Each call must also cover everything it owns (every month, area, dosha...)
// before it is checkpointed, so a gap can never reach the reader.
//
// VOICE. The prompt carries the humanizer rules as a style block (VARSHIK_STYLE_BLOCK), and the
// plan's tone rules: Baba Ji is a calm, kind family astrologer who respects the reader. Rust
// months are rest and preparation, never danger. No certainties, no fear words, no death or
// illness, no diagnoses, no stocks or amounts, no products, no technology names.
// =============================================================================

import { NAKSHATRAS } from '@aroha-astrology/shared';
import { generate } from '../gemini-client.js';
import { HUMAN_VOICE_RULE } from '../human-voice.js';
import { REPORT_PROFILE, REPORT_TRANSLATION_PROFILE } from '../../../config/llm.js';
import { TIER_TOKENS, AREAS, VARSHIK_NAKSHATRA, type Tier } from '../../../config/varshik-weights.js';
import { cleanJsonString } from '../horoscope.js';
import { classifyAssistantOutput } from '../../content-policy.js';
import { logger } from '../../logger.js';
import { reportFactsMessage } from './report-facts-message.js';
import {
  MONTH_NAMES,
  NINE_PLANETS,
  TIER_MEANING,
} from '../../astro-engine/reports/varshik-labels.js';
import {
  coverageProblems,
  dayMonth,
  yogaBaseName,
  type VarshikFacts,
} from '../../astro-engine/reports/varshik-facts.js';
import {
  buildFactIndex,
  checkVarshikSection,
  crossSectionOpeningHits,
  dropFlaggedSentences,
  hitsAsPromptLines,
  type TextHit,
} from './verify-claims.js';
import { deathHits, fearHits } from './report-text-checks.js';
import {
  ReportGenerationAbort,
  type ReportSection,
  type SectionGenerationProgress,
} from '../../../modules/reports/report-generator.types.js';

// -----------------------------------------------------------------------------
// Fixed copy and the prompt rules
// -----------------------------------------------------------------------------

/** Headings are fixed copy (humanized once, translated in Sprint 7), never written by the model. */
export const VARSHIK_HEADINGS: Record<string, string> = {
  welcome_letter: 'A letter from Baba Ji',
  year_at_a_glance: '{Y} at a glance',
  year_lord_muntha: 'Your Year Lord and Muntha',
  two_varsha_years: 'Your two Varsha charts',
  big_sky_moves: 'The big sky moves',
  planet_by_planet: 'Planet by planet',
  doshas: 'Doshas in your {Y}',
  yogas: 'Yogas on your side',
  area_love: 'Love',
  area_career: 'Career',
  area_money: 'Money',
  area_health: 'Health',
  area_family: 'Family',
  area_growth: 'Growth',
  area_travel: 'Travel',
  timing_map: 'Your timing map',
  year_rhythm: 'The rhythm of the year',
  sky_calendar: 'Sky calendar {Y}',
  when_to_act: 'When to act',
  golden_windows: 'Golden windows and key dates',
  birth_stars: 'Your birth stars',
  three_flags: "The year's three flags",
  your_stars_2027: 'Your stars in {Y}',
  simple_remedies: 'Simple remedies',
  what_changes: 'What you have been through, and what changes',
  closing_letter: 'A closing note from Baba Ji',
  ...Object.fromEntries(MONTH_NAMES.map((m, i) => [`month_${String(i + 1).padStart(2, '0')}`, m])),
};

/** The humanizer rules written out for this report (the plan's "Voice and tone", layer 2). */
export const VARSHIK_STYLE_BLOCK = `STYLE. Write the way a calm, kind family astrologer talks to one person he respects.
- Say each point plainly and concretely. Short sentences. Vary the length. Use "you".
- Never write "not X but Y", "it is not X, it is Y", "less about X, more about Y" or "X rather than Y". Say what is true and stop. Never write "serves as" or "stands as": say "is".
- No groups of three by habit. Use as many items as the facts give.
- No one-line closer that repeats the paragraph, no wise saying, no blessing at the end of a section. End on the last concrete fact or piece of advice.
- No staged openers ("Here is the thing", "Let us dive in"). Start with the point.
- Join clauses with commas and full stops. Do not use dashes of any kind.
- Never use these words: delve, tapestry, journey, navigate, embrace, unlock, testament, landscape, vibrant, profound, pivotal, crucial, intricate, realm, beacon, myriad, seamless, holistic, plethora.
- No inflated claims and no sales language ("transformative", "powerful", "the future looks bright"). No bold, no headings inside paragraphs, no lists unless the instruction asks for one.
- Do not start more than two sentences in a section with the same two words.`;

const TONE_BLOCK = `TONE.
- The labels TIER_GO, TIER_STEADY, TIER_WEIGH and TIER_HOLD are private labels for you. Never write them, never write the word "tier", and never name a colour. Say it in plain words: "a strong month", "a steady month", "a mixed month", "a quiet month".
- Warm and steady. Practical advice tied to real dates. Speak to "you".
- A month marked TIER_HOLD is a quiet month: write it as rest, patience and preparation. Never as danger, and never advise starting, signing, launching or committing in it.
- A month marked TIER_GO is a strong month: never advise holding off or delaying in it.
- TIER_STEADY: move ahead with care. TIER_WEIGH: weigh each step and keep options open.
- No certainties. Never "you will get married in March". Say "March is your strongest window for this".
- Words the reader never sees: tabahi, disaster, anhoni, curse, doom, danger, fatal.
- Sanskrit words (Muntha, Varsha, Mudda, Saham, Year Lord) get a short plain gloss the first time they appear in a section, and plain words after that.
- Remedies are simple and free or cheap: a lamp, a walk, a call to an elder, feeding birds, a weekday habit. Never a paid puja, a gemstone, a product, or a "must do".`;

const SAFETY_BLOCK = `SAFETY. These rules override everything else.
- Never mention, predict or hint at death, lifespan, accidents, serious or terminal illness, divorce, pregnancy loss, legal trouble or self-harm, for the reader or anyone else. Hard houses are "sudden changes, obstacles and hidden matters".
- Health: speak only of rest, routine, sleep, stress and check-ups. Never name a disease, never diagnose, never replace a doctor.
- Money: general habits only. Never name a stock, a fund, crypto, a loan or an amount, and never promise a return.
- Assume nothing about the reader's life beyond the lines that begin "What the reader told us". If they have not told us they have a partner, children, a job or a business, do not write as if they do.
- Never mention AI, a model, a provider, an app's own machinery, or the word "generated". Baba Ji is a guide, not software.`;

const GROUNDING_BLOCK = `GROUNDING. Everything below the instructions is a GIVEN FACT from the calculation.
- Use only the dates, houses, signs, planets, dasha lords and months that appear in the facts. Never work a date out, never recall one from memory, never add one.
- Name months and dates the way the facts write them ("12 March"). Never state a score, a percentage or any number of points.
- A planet is "in your 7th house" only when the facts place it there. A dasha lord rules only the dates the facts give.
- Explain the facts. Never upgrade, soften or contradict a tier.`;

const JSON_BLOCK =
  'Return STRICT JSON only, no markdown fences: {"sections": [{"id": string, "paragraphs": string[]}]}. Return the sections in the order asked, with exactly the ids and exactly the number of paragraphs asked for each. Plain text in every paragraph.';

/** The prompt prose is written for 2027. For another report year the static prose moves with it (2026 -> year-1, 2028 -> year+1); the facts never go through this. */
export function yearize(text: string, year: number): string {
  if (year === 2027) return text;
  return text.replace(/\b(2026|2027|2028)\b/g, (m) => String(year + Number(m) - 2027));
}

function baseSystem(): string {
  return `You are writing "Varshik Rashifal 2027", a paid personal year report for a mobile astrology app, in the voice of Baba Ji. It reads calendar year 2027 (1 January to 31 December) from the reader's birth chart and two Varsha (solar return) charts.

${GROUNDING_BLOCK}
${VARSHIK_STYLE_BLOCK}
${HUMAN_VOICE_RULE}
${TONE_BLOCK}
${SAFETY_BLOCK}
${C5_CALENDAR_RULES}
${JSON_BLOCK}`;
}

/** C5: house references, eclipse classes and the no-muhurat periods, for every call. */
const C5_CALENDAR_RULES = `HOUSES, ECLIPSES AND MUHURAT:
- Every house a moving planet stands in names what it is counted from, as the facts give it: "the 6th from your Lagna", "the 3rd from your Moon". Never a bare "6th house" for a moving planet. Sade Sati and Dhaiya are always counted from the Moon.
- An eclipse marked Grahan may be read for the reader, with its local times and its Sutak exactly as given. An eclipse marked Upachchaya (penumbral) or not visible is a plain marker in the sky: give its date and type, say it brings no Sutak, and never tie it to a house, a person or an outcome.
- Never write Sutak for an eclipse the facts do not give a Sutak for.
- When the eclipse times are an India-wide summary, say "across India" and name the cities; never present them as the reader's own place.
- A wedding, commitment or move into a new home never gets a window inside a no-muhurat period the facts list for it. Say the period plainly with its dates. Where the facts say "traditionally no muhurat", you may say so; where they say "this report keeps it clear", say that instead and never claim a panchang forbids it.`;

const CLOSURE_WORDS: Record<string, string> = {
  shukra_asta: 'Venus is combust (Shukra Asta)',
  guru_asta: 'Jupiter is combust (Guru Asta)',
  kharmas: 'the Sun is in Sagittarius or Pisces (Kharmas)',
  chaturmas: 'Chaturmas',
};

const CLOSED_EVENT_WORDS: Record<string, string> = {
  marriage: 'wedding',
  commit_relationship: 'engagement or commitment',
  move_home: 'move-in (griha pravesh)',
};

function closureLines(d: VarshikFacts['scores']['decisionTable'][number]): string {
  if (!d.closed) return '';
  const ev = CLOSED_EVENT_WORDS[d.key] ?? 'start';
  const parts = d.closures.map((c, i) => {
    const how = d.ruleSource[i] === 'panchang' ? `traditionally no ${ev} muhurat` : `this report keeps ${ev} dates clear of it`;
    return `${CLOSURE_WORDS[c.reason]} from ${dayMonth(c.from)} to ${dayMonth(c.to)}: ${how}`;
  });
  const open = d.openSpans.map((sp) => (sp.from === sp.to ? dayMonth(sp.from) : `${dayMonth(sp.from)} to ${dayMonth(sp.to)}`)).join(' and ');
  return `; no-muhurat periods: ${parts.join('; ')}${open ? `; the open days inside the best stretch: ${open}` : ''}`;
}

function eclipseWords(e: VarshikFacts['skyEvents'][number], f: VarshikFacts): string {
  const x = e.eclipse;
  const body = e.kind === 'eclipse-solar' ? 'solar' : 'lunar';
  if (!x) return `${body} eclipse`;
  const place = f.reader.eclipsePlace.scope === 'india' ? `across ${f.reader.eclipsePlace.name}` : `from the reader's current home (${f.reader.eclipsePlace.name})`;
  if (x.class === 'not_visible') {
    return `${x.subtype} ${body} eclipse, NOT visible ${place}: no Sutak; a plain marker, not a personal trigger, name no house for it`;
  }
  if (x.class === 'upachchaya') {
    return `penumbral ${body} eclipse (Upachchaya, penumbral magnitude ${(x.penumbralMagnitude ?? 0).toFixed(2)}): only a faint shading of the Moon, no Sutak; a plain marker, not a personal trigger, name no house for it`;
  }
  const seen = x.places
    .filter((p) => p.visible)
    .map((p) => `${p.name} ${p.from} to ${p.to}${p.magnitude !== null && body === 'solar' ? ` (${Math.round(p.magnitude * 100)}% of the Sun covered)` : ''}`)
    .join(', ');
  const sutak = x.sutak.map((st) => `${st.place} from ${st.from.slice(11)}${st.from.slice(0, 10) !== e.date ? ` on ${dayMonth(st.from.slice(0, 10))}` : ''}`).join(', ');
  return `${x.subtype} ${body} eclipse globally, seen as a Grahan ${place}: ${seen}. Sutak (${body === 'solar' ? 12 : 9} hours before it begins): ${sutak}`;
}

// -----------------------------------------------------------------------------
// Rendering the facts for the prompt (words, never scores)
// -----------------------------------------------------------------------------

const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];

const ANSWER_WORDS: Record<string, Record<string, string>> = {
  relationship: {
    single: 'they are single',
    partnered: 'they are in a relationship (not married)',
    married: 'they are married',
    previously_married: 'they were married before and are not now',
  },
  occupation: {
    student: 'they are a student',
    working: 'they work in a job',
    business: 'they run a business',
    seeking_work: 'they are looking for work',
    homemaker: 'they run a home',
    retired: 'they are retired',
  },
  children: {
    none: 'they have no children and are not planning any',
    planning: 'they have no children yet and hope to',
    have: 'they have children',
  },
  mainDecision: {
    job_change: 'the biggest decision they face in {Y} is a change of job',
    start_business: 'the biggest decision they face in {Y} is starting a business',
    relationship: 'the biggest decision they face in {Y} is about a relationship',
    move_or_travel: 'the biggest decision they face in {Y} is a move or a long trip',
    money: 'the biggest decision they face in {Y} is about money',
    health: 'the biggest decision they face in {Y} is about their health routine',
    study: 'the biggest decision they face in {Y} is about study or an exam',
    nothing_specific: 'they have no single big decision in mind for {Y}',
  },
  livingWith: {
    alone: 'they live alone',
    partner: 'they live with their partner or spouse',
    parents: 'they live with their parents',
    joint_family: 'they live in a joint or extended family',
    friends_or_others: 'they live with friends or others, not family',
  },
  home: {
    own: 'they own the home they live in',
    rented: 'they live in a rented home',
    family_home: 'they live in the family home',
    buying_or_building: 'they plan to buy or build a home',
  },
  moneyFocus: {
    saving: 'their money focus for {Y} is saving',
    investing: 'their money focus for {Y} is investing',
    clearing_debt: 'their money focus for {Y} is clearing a loan or debt',
    earning_more: 'their money focus for {Y} is earning more',
    big_purchase: 'their money focus for {Y} is a big purchase',
    nothing_specific: 'they have no particular money goal for {Y}',
  },
  travelPlan: {
    abroad: 'they plan to travel abroad in {Y}',
    within_india: 'they plan to travel within India in {Y}',
    none: 'they do not plan any long travel in {Y}',
  },
  studyPlan: {
    exam: 'they are preparing for an exam in {Y}',
    course: 'they are doing a course or studies in {Y}',
    none: 'they are not studying or preparing for an exam in {Y}',
  },
  practice: {
    daily: 'they keep a daily spiritual practice',
    sometimes: 'they keep a spiritual practice now and then',
    never: 'they do not keep a spiritual practice, so suggest only simple everyday remedies and never ritual duties',
  },
};

const DRIVER_WORDS: Array<[RegExp, (m: RegExpExecArray) => string]> = [
  [/^varshaChart$/, () => 'the Varsha chart for the year'],
  [/^yearLord:(\w+)$/, (m) => `the Year Lord ${m[1]}`],
  [/^muntha:(\w+)$/, (m) => `the Muntha lord ${m[1]}`],
  [/^mudda:(\w+)$/, (m) => `the ${m[1]} Mudda period`],
  [/^natalDasha:(\w+)$/, (m) => `the natal dasha lord ${m[1]}`],
  [/^transit:(\w+)$/, (m) => `${m[1]} moving through the sky`],
  [/^sadeSati:Saturn$/, () => "Saturn's position counted from the natal Moon (the Sade Sati and Dhaiya count)"],
  [/^saham:(\w+)$/, (m) => `a Saham window triggered by ${m[1]}`],
  [/^gochar:(\w+)$/, (m) => `${m[1]} counted from your natal Moon`],
  [/^moorti:(\w+)$/, (m) => `the Moorti of ${m[1]}'s last sign change`],
  [/^tara:(\w+)$/, (m) => `the star ${m[1]} stands in, counted from your birth star`],
  [/^sensitive:(\w+)$/, (m) => `${m[1]} crossing a sensitive star`],
  [/^starLord:(\w+)$/, (m) => `the lord of the star ${m[1]} stands in`],
  [/^kakshya:(\w+)$/, (m) => `the kakshya ${m[1]} stands in`],
  [/^yogini:(\w+)$/, (m) => `the ${m[1]} Mudda Yogini period`],
  [/^patyayini:(\w+)$/, (m) => `the ${m[1]} Patyayini period`],
  [/^tajikaExtra$/, () => 'the further yogas of the Varsha chart'],
  [/^lifeSaham$/, () => 'the Sahams of everyday life in the Varsha chart'],
];

function driverText(key: string): string | null {
  for (const [re, f] of DRIVER_WORDS) {
    const m = re.exec(key);
    if (m) return f(m);
  }
  return null;
}

const monthName = (m: number): string => MONTH_NAMES[m]!;
const monthList = (ms: number[]): string => (ms.length ? ms.map(monthName).join(', ') : 'none');
const tierToken = (t: Tier): string => TIER_TOKENS[t];

function strengthWord(v: number | null): string {
  if (v === null) return 'not rated';
  return v >= 14 ? 'strong' : v >= 8 ? 'moderate' : 'weak';
}

const FAST_PLANETS = new Set(['Sun', 'Moon', 'Mars', 'Mercury', 'Venus']);

/** How a planet moves through the houses, without a list of seventeen. */
export function transitWords(planet: string, houses: number[]): string {
  if (houses.length === 0) return 'its path through the houses is not listed';
  const last = houses[houses.length - 1]!;
  if (FAST_PLANETS.has(planet) || houses.length > 5) {
    return `moves quickly, passing through ${houses.length > 8 ? 'most of your twelve houses' : `${houses.length} of your houses`} in the year and ending it in your ${ORD[last]} house`;
  }
  return `moves through your ${houses.map((h) => ORD[h]).join(', ')} house${houses.length > 1 ? 's' : ''} in turn`;
}

function planetLine(p: VarshikFacts['birth']['planets'][number]): string {
  const flags = [p.retrograde ? 'retrograde' : '', p.combust ? 'combust' : ''].filter(Boolean).join(', ');
  return `${p.planet}: ${p.sign}, your ${ORD[p.house]} house, ${p.nakshatra} pada ${p.pada}, ${p.dignity} sign${flags ? `, ${flags}` : ''}`;
}

export function renderReader(f: VarshikFacts): string {
  const lines: string[] = [];
  lines.push(`Reader: ${f.reader.name ?? 'the reader'}.`);
  for (const [k, v] of Object.entries(f.reader.answers)) {
    const w = ANSWER_WORDS[k]?.[v]?.split('{Y}').join(String(f.year));
    if (w) lines.push(`What the reader told us: ${w}.`);
  }
  if (Object.keys(f.reader.answers).length === 0) {
    lines.push('The reader answered none of the questions: assume nothing about their partner, children, home, work, money or plans.');
  }
  return lines.join('\n');
}

export function renderCommon(f: VarshikFacts): string {
  const lines: string[] = [renderReader(f)];
  lines.push(
    `Report window: 1 January to 31 December ${f.year}. The birth chart reads from a ${f.birth.lagna.sign} Lagna at ${f.birth.lagna.degree} degrees (${f.birth.lagna.nakshatra}). The natal dasha balance at birth was ${f.dashas.balance.planet}.`,
  );
  lines.push('BIRTH CHART:');
  for (const p of f.birth.planets) lines.push(`- ${planetLine(p)}`);
  lines.push('VARSHA CHARTS:');
  f.varsha.forEach((v, i) => {
    const rules =
      f.varsha.length === 2
        ? i === 0
          ? `rules from 1 January until ${dayMonth(v.endsAt.slice(0, 10))} ${f.year}`
          : `rules from ${dayMonth(v.startsAt.slice(0, 10))} ${f.year} to the end of the year`
        : 'rules the whole year';
    lines.push(
      `- The ${v.targetYear} Varsha chart (solar return ${v.startsAt}, ${v.isDayReturn ? 'a day' : 'a night'} return) ${rules}. Varsha Lagna ${v.lagna}. Year Lord ${v.yearLord}${v.wonByMunthaTiebreak ? ' (chosen because the Muntha lord won the tie)' : ''}. Muntha in ${v.muntha.sign}, the Varsha ${ORD[v.muntha.house]} house, lord ${v.muntha.lord}, ${v.muntha.auspicious ? 'a supportive house' : 'a demanding house'}. Panchadhikari: ${v.panchadhikari.map((c) => `${c.role} ${c.planet}`).join('; ')}. Strength of the seven planets in this chart: ${Object.entries(v.panchavargi).map(([p, n]) => `${p} ${strengthWord(n)}`).join(', ')}.`,
    );
  });
  return lines.join('\n');
}

function monthTierLines(f: VarshikFacts): string {
  return f.scores.months
    .map((c, m) => `${monthName(m)}: ${tierToken(c.tier)} (${TIER_MEANING[c.tier]})`)
    .join('\n');
}

function whyLines(f: VarshikFacts, m: number): string {
  const w = f.scores.why[m]!;
  const part = (ds: typeof w.lifting) =>
    ds.map((d) => driverText(d.key)).filter((x): x is string => !!x).join('; ') || 'nothing in particular';
  return `lifting: ${part(w.lifting)}. weighing: ${part(w.weighing)}.`;
}

function eventLine(e: VarshikFacts['skyEvents'][number], f?: VarshikFacts): string {
  const where = `the ${ORD[e.natalHouse]} from your Lagna and the ${ORD[e.moonHouse]} from your Moon, the ${ORD[e.varshaHouse]} in your Varsha chart`;
  switch (e.kind) {
    case 'ingress':
      return `${dayMonth(e.date)}: ${e.planet} enters ${e.sign}${e.fromSign ? ` from ${e.fromSign}` : ''} (${where})`;
    case 'station-retrograde':
      return `${dayMonth(e.date)}: ${e.planet} turns retrograde in ${e.sign} (${where})`;
    case 'station-direct':
      return `${dayMonth(e.date)}: ${e.planet} turns direct in ${e.sign} (${where})`;
    case 'combust-in':
      return `${dayMonth(e.date)}: ${e.planet} goes combust (too close to the Sun) in ${e.sign} (${where})`;
    case 'combust-out':
      return `${dayMonth(e.date)}: ${e.planet} comes out of combustion in ${e.sign} (${where})`;
    case 'eclipse-solar':
    case 'eclipse-lunar':
      return e.eclipse?.personalTrigger
        ? `${dayMonth(e.date)}: ${f ? eclipseWords(e, f) : 'eclipse'}; in ${e.sign} (${where})`
        : `${dayMonth(e.date)}: ${f ? eclipseWords(e, f) : 'eclipse'}; in ${e.sign}`;
  }
}

function windowPhrase(w: { fromDate: string; toDate: string; peakDate: string }): string {
  return w.fromDate === w.toDate ? dayMonth(w.fromDate) : `${dayMonth(w.fromDate)} to ${dayMonth(w.toDate)}`;
}

const WEEKDAY_OF: Record<string, string> = {
  Sun: 'Sunday',
  Moon: 'Monday',
  Mars: 'Tuesday',
  Mercury: 'Wednesday',
  Jupiter: 'Thursday',
  Venus: 'Friday',
  Saturn: 'Saturday',
  Rahu: 'Saturday',
  Ketu: 'Tuesday',
};

const DECISION_WORDS: Record<string, string> = {
  new_work: 'a new job or a change at work',
  business_launch: 'starting or growing a business',
  money_move: 'a significant money decision',
  commit_relationship: 'committing to a relationship',
  marriage: 'marriage talks',
  family_planning: 'planning for a child',
  move_home: 'moving home',
  travel_abroad: 'a long trip or time abroad',
  study_exam: 'study or an exam',
  health_routine: 'starting a health routine',
  family_time: 'time and plans with family',
};

const AREA_TOPIC: Record<string, { houses: string; saham: string | null }> = {
  love: { houses: 'the 5th and 7th houses: romance, partnership', saham: 'Vivaha' },
  career: { houses: 'the 10th and 6th houses: work, standing, daily effort', saham: 'Rajya' },
  money: { houses: 'the 2nd and 11th houses: savings and gains', saham: 'Artha' },
  health: { houses: 'the 1st and 6th houses: energy, routine, rest', saham: null },
  family: { houses: 'the 4th and 2nd houses: home, elders, children', saham: 'Putra' },
  growth: { houses: 'the 5th and 9th houses: learning, belief, purpose', saham: 'Vidya' },
  travel: { houses: 'the 3rd, 9th and 12th houses: journeys and foreign links', saham: 'Pardesh' },
};

// -----------------------------------------------------------------------------
// The five calls: what each owns and what it is told
// -----------------------------------------------------------------------------

/** The prompt writes every two-word star with a space ("Uttara Bhadrapada"); the facts keep one word. */
export function spaceStars(text: string): string {
  let out = text;
  for (const n of NAKSHATRAS) {
    const spaced = n.replace(/([a-z])([A-Z])/g, '$1 $2');
    if (spaced !== n) out = out.split(n).join(spaced);
  }
  return out;
}

export interface CallSpec {
  /** The report year (2027 when absent). */
  year?: number;
  /** Section ids this call writes, in order. */
  ids: string[];
  /** Exact paragraph count per id (null = 1 or more). */
  counts: Record<string, number | null>;
  instructions: string;
  facts: string;
  user: string;
}

const AREA_IDS = AREAS.map((a) => `area_${a}`);
const MONTH_IDS = MONTH_NAMES.map((_, i) => `month_${String(i + 1).padStart(2, '0')}`);

export const STARS_IDS = ['birth_stars', 'three_flags', 'your_stars_2027'];
export const CALL1_IDS = ['welcome_letter', 'year_at_a_glance', 'year_lord_muntha', 'two_varsha_years', 'big_sky_moves'];
export const CALL2_IDS = [
  'planet_by_planet',
  'doshas',
  'yogas',
  ...AREA_IDS,
  'timing_map',
  'year_rhythm',
  'sky_calendar',
  'when_to_act',
  'golden_windows',
];

function call1(f: VarshikFacts): CallSpec {
  const peaks = monthList(f.scores.peakMonths);
  const slow = f.ashtakavarga.transits
    .filter((t) => t.month === 0 || t.month === 5 || t.month === 11)
    .map((t) => `${monthName(t.month)}: ${t.planet} in ${t.sign}, the ${ORD[t.natalHouse]} from your Lagna and the ${ORD[t.moonHouse]} from your Moon`)
    .join('\n');
  const slowEvents = f.skyEvents
    .filter((e) => ['Saturn', 'Jupiter', 'Rahu', 'Ketu'].includes(e.planet) && e.kind !== 'combust-in' && e.kind !== 'combust-out')
    .map((e) => eventLine(e, f))
    .join('\n');
  const sade = f.doshas.filter((d) => d.key === 'sadeSati' || d.key === 'dhaiya');
  const facts = `${renderCommon(f)}
THE YEAR:
Overall tone of ${f.year}: ${tierToken(f.scores.overall.tier)} (${TIER_MEANING[f.scores.overall.tier]}).
Strongest three months: ${peaks}. The quietest month, best for rest: ${monthName(f.scores.restMonth)}.
Month by month:
${monthTierLines(f)}
SLOW PLANETS (mid-month position, counted from the birth Lagna and from the natal Moon sign):
${slow}
Slow planet events:
${slowEvents || 'none'}
SADE SATI AND DHAIYA (counted from the natal Moon sign only):
${sade.map((d) => `- ${d.label}: ${d.status === 'present' ? `running in ${f.year}, awake in ${monthList(d.activeMonths)}` : `not running in ${f.year}`}. ${d.cancellations.join('; ')}`).join('\n')}`;
  return {
    ids: CALL1_IDS,
    counts: { welcome_letter: 3, year_at_a_glance: 3, year_lord_muntha: 3, two_varsha_years: 2, big_sky_moves: 3 },
    facts,
    instructions: `Write EXACTLY these 5 sections, with these ids, in this order.
1. welcome_letter: 3 paragraphs, a short personal letter from Baba Ji. Greet the reader by name the way an elder would, name the Year Lord of the Varsha chart that rules most of 2027 with a plain gloss, and say in plain words what the year asks of them and one thing to look forward to. Write it as a letter, warm and specific, not as a summary of the report. Do not sign it; the signature is added separately.
2. year_at_a_glance: 3 paragraphs. The overall tone of the year in words (use the tone given, never a number), the three strongest months, the quietest month as a time for rest, and the one idea that ties the year together.
3. year_lord_muntha: 3 paragraphs. Explain the Year Lord (the planet that leads the year) and the Muntha (a point that moves one sign each year and shows where the year's attention goes), then what they mean for this reader from their houses in the Varsha chart. If the Muntha house is demanding, say so kindly and say what helps.
4. two_varsha_years: 2 paragraphs. Two Varsha charts touch 2027: say which rules until the solar return and which after, with the dates, and what changes at the handover.
5. big_sky_moves: 3 paragraphs. Saturn, Jupiter, Rahu and Ketu by house through the year, naming the months they change house; give each house as counted from your Lagna and from your Moon, as listed. Then Sade Sati and Dhaiya, counted from the Moon sign, only as the facts state them: calm wording.`,
    user: 'Write the five opening sections of the report.',
  };
}

function call2(f: VarshikFacts): CallSpec {
  const eclipseDates = f.skyEvents.filter((e) => e.kind.startsWith('eclipse')).map((e) => dayMonth(e.date));
  const planets = f.scores.planetImpact
    .map(
      (p) =>
        `- ${p.planet}: natal ${p.natalHouse ? `${ORD[p.natalHouse]} house` : 'house not rated'}; Varsha ${p.varshaHouses.map((h) => (h ? ORD[h] : '-')).join(' and ')} house; ${transitWords(p.planet, p.transitHouses)}; roles: ${p.roles.join(', ') || 'none'}; effect on the year: ${p.effect}; helps most in ${monthName(p.bestMonth)}, weighs most in ${monthName(p.hardMonth)}; its strongest pull is on ${p.topArea.area} (put that in your own words, differently for each planet); strength in the Varsha chart: ${strengthWord(p.strength)}`,
    )
    .join('\n');
  const doshas = f.doshas
    .map(
      (d) =>
        `- ${d.label}: ${d.status === 'present' ? 'present' : d.status === 'cancelled' ? `formed but cancelled (${d.cancellations.join('; ')})` : 'not in the chart'}. ${d.status === 'not_present' ? '' : `Awake in: ${monthList(d.activeMonths)}${d.activeMonths.length ? ` because ${[...new Set(Object.values(d.because).flat())].join(', ')}` : ''}. `}It touches ${d.touches}. Simple remedy: ${d.remedy}`,
    )
    .join('\n');
  const yogas = f.yogas
    .filter((y) => y.months.length > 0)
    .map((y) => `- ${y.source === 'natal' ? yogaBaseName(y.name) : y.name} (${y.source === 'natal' ? 'in your birth chart' : 'in the Varsha chart'}): delivers in ${monthList(y.months)}${y.reason ? `; spoiled by ${y.reason}` : ''}`)
    .join('\n');
  const areas = AREAS.map((a) => {
    const row = f.scores.timingMap[a]!;
    const order = row.map((c, m) => ({ m, s: c.score })).sort((x, y) => y.s - x.s || x.m - y.m);
    const best = order.slice(0, 2).map((o) => o.m).sort((x, y) => x - y);
    const hold = order.slice(-2).map((o) => o.m).sort((x, y) => x - y);
    const w = f.scores.answerWindows[a]!;
    const sahamName = AREA_TOPIC[a]!.saham;
    const saham = sahamName ? f.varsha[f.varsha.length - 1]!.sahams.find((s) => s.name.includes(sahamName)) : null;
    return `- ${a}: whole-year tone ${tierToken(f.scores.areaOverall[a]!.tier)}. Reads ${AREA_TOPIC[a]!.houses}. Best months: ${monthList(best)}. Quietest months: ${monthList(hold)}. ${w.weak ? `No strong window opens this year; the calmest stretch is ${windowPhrase(w.best)}.` : `Best window: ${windowPhrase(w.best)}.`}${saham ? ` Its Saham (${saham.name}) sits in the Varsha ${ORD[saham.house]} house.` : ''}\n  Month tones: ${row.map((c, m) => `${monthName(m).slice(0, 3)} ${tierToken(c.tier)}`).join(', ')}`;
  }).join('\n');
  const mudda = f.varsha
    .flatMap((v) => v.mudda.map((p) => ({ ...p, y: v.targetYear })))
    .filter((p) => p.to >= `${f.year}-01-01` && p.from <= `${f.year}-12-31`)
    .map((p) => `- ${p.lord} Mudda period of the ${p.y} chart: ${dayMonth(p.from)}${p.from < `${f.year}-01-01` ? ` ${f.year - 1}` : ''} to ${dayMonth(p.to)}${p.to > `${f.year}-12-31` ? ` ${f.year + 1}` : ''}`)
    .join('\n');
  const strongSaham = [...f.sahamWindows]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 8)
    .map((w) => `- ${w.saham} Saham touched by ${w.planet}${w.roles.length ? ` (${w.roles.join(', ')})` : ''}: ${dayMonth(w.from)} to ${dayMonth(w.to)}, exact on ${w.exact.map(dayMonth).join(', ') || 'no single day'}`)
    .join('\n');
  const events = f.skyEvents.map((e) => eventLine(e, f));
  const decisions = f.scores.decisionTable
    .map((d) => `- ${DECISION_WORDS[d.key] ?? d.key}${d.isMain ? ' (the reader\'s own big decision)' : ''}: best stretch ${monthName(d.best.from)}${d.best.to !== d.best.from ? ` to ${monthName(d.best.to)}` : ''} (${tierToken(d.best.tier)}); hold off in ${monthList(d.hold)}${closureLines(d)}`)
    .join('\n');
  const grahanCount = f.skyEvents.filter((e) => e.eclipse?.class === 'grahan').length;
  const golden = Object.entries(f.scores.answerWindows)
    .filter(([k, w]) => (AREAS as readonly string[]).includes(k) && !w.weak)
    .sort((a, b) => b[1].best.score - a[1].best.score)
    .map(([k, w]) => `- ${k}: ${windowPhrase(w.best)}, peak on ${dayMonth(w.best.peakDate)} (${tierToken(w.best.tier)})`)
    .join('\n');
  const fest = f.calendar.festivals
    .filter((x) => x.importance === 'major')
    .map((x) => `${dayMonth(x.date)}: ${x.name}`)
    .join('; ');
  const facts = `${renderCommon(f)}
PLANETS:
${planets}
DOSHAS (all ${f.doshas.length}, each must get its own paragraph in this order: ${f.doshas.map((d) => d.label).join(', ')}):
${doshas}
YOGAS THAT DELIVER IN ${f.year} (use these exact names):
${yogas || 'none'}
SEVEN AREAS:
${areas}
MONTH TONES, ALL AREAS:
${monthTierLines(f)}
MUDDA PERIODS:
${mudda}
STRONGEST SAHAM WINDOWS:
${strongSaham || 'none'}
SKY EVENTS ${f.year}:
${events.join('\n')}
DECISIONS FOR THIS READER:
${decisions}
BEST WINDOW PER AREA:
${golden || 'none'}
MAJOR FESTIVALS: ${fest}`;
  return {
    ids: CALL2_IDS,
    counts: {
      planet_by_planet: 9,
      doshas: f.doshas.length,
      yogas: null,
      ...Object.fromEntries(AREA_IDS.map((id) => [id, 2])),
      timing_map: 2,
      year_rhythm: 2,
      sky_calendar: 2,
      when_to_act: 2,
      golden_windows: 2,
    },
    facts,
    instructions: `Write EXACTLY these sections, with these ids, in this order.
1. planet_by_planet: EXACTLY 9 paragraphs, one per planet in this order: ${NINE_PLANETS.join(', ')}. Each starts with the planet's name. 2 sentences: where it moves in the reader's year and what it does for them, using the effect, best month and hard month given. Word each planet differently: no two paragraphs may use the same sentence frame.
2. doshas: EXACTLY ${f.doshas.length} paragraphs in this order: ${f.doshas.map((d) => d.label).join(', ')}. Each starts with the dosha's name. State its status plainly. A dosha that is not in the chart gets one short line saying it was checked and is not in the chart. One that is present or cancelled gets the months it is awake, what it touches, and its simple remedy. Calm words, no fear.
3. yogas: 4 to 7 paragraphs. First the natal yogas from the birth chart that deliver in 2027, strongest first: each paragraph may cover up to three related yogas, and every natal yoga listed must be named by its base name exactly as written without the bracket (for example "Raja Yoga", "Budhaditya Yoga"), with the months it delivers and what that gives the reader. Then one paragraph for the Tajika yogas of the Varsha chart that rules early 2027 and one for the chart that takes over, naming each Tajika kind that appears (Ithasala, Ishrafa, Nakta, Yamaya, Kamboola, Radda) with its planets and months. A Radda is a promise that is spoiled for the reason given: say so gently. If nothing is listed, write 1 paragraph saying so plainly.
4. area_love, area_career, area_money, area_health, area_family, area_growth, area_travel: each EXACTLY 2 paragraphs. First: how this area reads across 2027 and its best window. Second: what it means for THIS reader given what they told us, the best months to act and the quiet months to rest in. Never write about a partner, children or a job the reader did not tell us about.
5. timing_map: 2 paragraphs reading the 7 by 12 map of months and areas: where the green months gather and where the quiet ones do.
6. year_rhythm: 2 paragraphs on the shape of the year: the Mudda periods in order with their dates, and the Saham windows that add a push.
7. sky_calendar: 2 paragraphs. The first paragraph names ALL ${eclipseDates.length} eclipses of 2027, none left out and none merged (${eclipseDates.join(', ')}), each with its date and its type as the facts give it. Say the number of eclipses as ${eclipseDates.length}. ${grahanCount > 0 ? `Only ${grahanCount === 1 ? 'one is a visible Grahan' : `${grahanCount} are visible Grahans`}: for ${grahanCount === 1 ? 'it' : 'each'}, give the house it falls in (from your Lagna and your Moon), the local times and the Sutak exactly as listed.` : 'None is a visible Grahan, so no Sutak applies this year: say so once.'} Every Upachchaya (penumbral) or unseen eclipse gets its date, its type and "no Sutak", and nothing more. The second paragraph covers the retrogrades and stations that matter most for this reader.
8. when_to_act: 2 paragraphs. Using the decisions given for this reader only, say when to move on each and when to hold. The reader's own big decision comes first. For a wedding, an engagement or commitment, or a move into a new home, name each no-muhurat period listed for it with its dates, in plain words, and give the open days inside its best stretch.
9. golden_windows: 2 paragraphs naming the best windows with their dates and any major festival that falls inside one.`,
    user: 'Write the planet, dosha, yoga, area and timing sections.',
  };
}

function starsCall(f: VarshikFacts): CallSpec {
  const st = f.stars;
  const bs = st.birthStar;
  const row = (r: (typeof st.table)[number]): string => {
    const bits = [`${r.point}: ${r.nakshatra} pada ${r.pada}, star lord ${r.starLord} (in the ${ORD[r.starLordHouse]} house${r.starLordRules.length ? `, rules the ${r.starLordRules.map((h) => ORD[h]).join(' and ')}` : ''}), nature ${r.nature}, deity ${r.deity}, symbol ${r.symbol}, meaning "${r.shakti}", KP sub lord ${r.kpSubLord}`];
    bits.push(`counted from the birth star it is ${taraWords(r.tara)}`);
    if (r.special) bits.push(`also a sensitive star: ${specialWords(r.special)}`);
    if (r.gandanta.present) bits.push(`a Gandanta point, the ${r.gandanta.part} of the junction: a sensitive spot in the chart, to be spoken of calmly`);
    return `- ${bits.join('; ')}`;
  };
  const dl = st.dashaLords
    .map((d) => `- ${d.planet} (${d.roles.join(', ')}): in ${d.nakshatra}, star lord ${d.starLord} in the ${ORD[d.starLordHouse]} house, KP sub lord ${d.subLord}`)
    .join('\n');
  const last = f.varsha[f.varsha.length - 1]!;
  const pat = f.varsha.map((v) => `- ${v.targetYear} chart, Patyayini (shown by the week only): ${v.extra.patyayini.map((p) => `${p.lord} from the ${p.fromWeek} to the ${p.toWeek}`).join('; ')}`).join('\n');
  const yog = f.varsha.map((v) => `- ${v.targetYear} chart, Mudda Yogini: ${v.extra.muddaYogini.map((p) => `${p.lord} (${p.yogini}) ${dayMonth(p.from)} to ${dayMonth(p.to)}`).join('; ')}`).join('\n');
  const mud = f.varsha.map((v) => `- ${v.targetYear} chart, Mudda: ${v.mudda.map((p) => `${p.lord} ${dayMonth(p.from)} to ${dayMonth(p.to)}`).join('; ')}`).join('\n');
  const flags = f.varsha.map((v) => `- ${v.targetYear} chart: ${v.extra.triPataki.lines.join(' ')}`).join('\n');
  const slow = st.segments
    .filter((s) => (STAR_PLANETS_SLOW as readonly string[]).includes(s.planet))
    .map((s) => (s.enters ? starMoveLine(f, s) : `${s.planet} begins the year in ${s.nakshatra} until ${dayMonth(s.to)}: ${taraWords(s.tara)}`))
    .join('\n');
  const moorti = st.moorti
    .filter((x) => (STAR_PLANETS_SLOW as readonly string[]).includes(x.planet) || x.planet === 'Mars')
    .map((x) => `- ${x.planet} enters ${x.toSign} on ${dayMonth(x.date)}: ${x.plain}`)
    .join('\n');
  const wheel = Array.from({ length: 9 }, (_, i) => i + 1)
    .map((n) => {
      const t = taraRowsOf(n);
      return `${n}: ${t}`;
    })
    .join('; ');
  const facts = `${renderCommon(f)}
BIRTH STAR: ${bs.name}, pada ${bs.pada}, number ${bs.number} of 27, star lord ${bs.lord}, in ${bs.sign}.
BIRTH STARS OF THE NINE PLANETS AND THE LAGNA:
${st.table.map(row).join('\n')}
PLANETS IN STARS THAT STAND OUT: ${st.planetInStar.filter((p) => p.inOwnStar || p.gandanta).map((p) => `${p.planet} in ${p.nakshatra}${p.inOwnStar ? ' (its own star)' : ''}${p.gandanta ? ' (a Gandanta point)' : ''}`).join('; ') || 'none'}.
PLANETS IN A TESTING STAR FROM THE BIRTH STAR: ${st.navatara.weakened.map((w) => `${w.planet}, ${taraWords(w.tara)}`).join('; ') || 'none'}.
PLANETS AND LAGNA IN AN EMPHASISED STAR: ${st.navatara.emphasised.map((e) => `${e.point}, ${specialWords(e.special)}`).join('; ') || 'none'}.
STARS OF THE LORDS THAT RUN IN ${f.year}:
${dl}
THE RUNNING DASHA SYSTEMS (three, side by side):
${mud}
${yog}
${pat}
TRI-PATAKI FLAGS (words only, no score):
${flags}
THE TARA WHEEL, counted from the birth star (1 is the birth star itself): ${wheel}
SLOW PLANETS THROUGH THE STARS IN ${f.year}, WITH DATES:
${slow}
MOORTI OF SIGN CHANGES:
${moorti || 'none'}
The Year Lord of the ${last.targetYear} chart is ${last.yearLord}.`;
  return {
    ids: STARS_IDS,
    counts: { birth_stars: 4, three_flags: 3, your_stars_2027: 4 },
    facts,
    instructions: `Write EXACTLY these 3 sections, with these ids, in this order.
1. birth_stars: EXACTLY 4 paragraphs. First: the reader's birth star ${bs.name}, its pada, its lord and what the star stands for (deity, symbol, meaning), in plain words. Second: the Lagna and the Sun, each in its star, and what the star lord's house adds. Third: the planets that stand out (a planet in its own star, a Gandanta point if any, a planet in a testing or an emphasised star), kindly; if none stand out, say the stars sit evenly. Fourth: the stars of the lords that run in 2027 (${st.dashaLords.map((d) => d.planet).join(', ')}), each named with its star and what its star lord's house adds. A Gandanta point is "a sensitive junction point where one sign ends and the next begins", never a defect.
2. three_flags: EXACTLY 3 paragraphs. First: the Tri-Pataki flags of each Varsha chart, as the facts word them (who touches the Lagna and who touches the Moon), supportive and testing planets named plainly, no score and no verdict. Second: the Mudda period and the Mudda Yogini period running together through 2027, with dates, and what it means when they point the same way or differ. Third: the Patyayini period, only by the week as given ("the 2nd week of March"), never as an exact day, with a short plain gloss of the three systems the first time each appears.
3. your_stars_2027: EXACTLY 4 paragraphs. First: how the Tara wheel works in plain words (every star is counted from the birth star; the 2nd, 4th, 6th, 8th and 9th are friendly, the others ask for care), using the meanings given. Second: Saturn and Jupiter through the stars with every date given, saying what each star means for this reader. Third: Rahu and Ketu the same way, then Mars if it appears. Fourth: the sensitive-star crossings and the Moorti of the sign changes, each with its date. Say a hard, draining star or stretch as exactly that and never use its classical name.
Use only the dates, stars and meanings in the facts.`,
    user: 'Write the birth stars page, the three flags page and the stars of 2027 page.',
  };
}

const withSpacedStars = (spec: CallSpec): CallSpec => ({ ...spec, facts: spaceStars(spec.facts), instructions: spaceStars(spec.instructions) });
const withYear = (f: VarshikFacts) => (spec: CallSpec): CallSpec => ({ ...spec, year: f.year });

function taraRowsOf(n: number): string {
  const t = VARSHIK_NAKSHATRA.tara[n]!;
  return n === 7 ? t.plain : `${t.name}, ${t.plain}`;
}

type StarTara = VarshikFacts['stars']['segments'][number]['tara'];
type StarSpecial = NonNullable<VarshikFacts['stars']['segments'][number]['special']>;

/** Tara 7 is never named: it is "a hard, draining star". */
export const taraWords = (t: StarTara): string => (t.number === 7 ? t.plain : `${t.name}, ${t.plain}`);
/** The 22nd star (Vainashika) is never named either: it is "a hard, draining stretch". */
export const specialWords = (s: StarSpecial): string => (s.number === 22 ? s.plain : `${s.name}, ${s.plain}`);
const GOCHAR_PLAIN = {
  good: 'a favourable house from your Moon',
  blocked: 'a favourable house from your Moon, but something stands in its way',
  relieved: 'an unfavourable house from your Moon that is eased',
  hard: 'an unfavourable house from your Moon',
} as const;
export const STAR_PLANETS_SLOW = ['Saturn', 'Jupiter', 'Rahu', 'Ketu'] as const;

/** One star move as a fact line: the planet, the date it enters, the star, what the star means for this reader. */
function starMoveLine(f: VarshikFacts, seg: VarshikFacts['stars']['segments'][number]): string {
  const bits = [taraWords(seg.tara)];
  if (seg.special) bits.push(`a sensitive star of the reader's chart: ${specialWords(seg.special)}`);
  if (seg.natalPointsHere.length) bits.push(`the star of the reader's own natal ${seg.natalPointsHere.join(' and ')}`);
  if (seg.starLordHouse) bits.push(`its star lord ${seg.starLord} sits in the reader's ${ORD[seg.starLordHouse]} house`);
  return `${seg.planet} moves into ${seg.nakshatra} on ${dayMonth(seg.from)}${seg.retro ? ' (moving backwards)' : ''}: ${bits.join('; ')}`;
}

function monthStarLines(f: VarshikFacts, m: number): string {
  const mm = String(m + 1).padStart(2, '0');
  const inMonth = (d: string): boolean => d.slice(0, 7) === `${f.year}-${mm}`;
  const moves = f.stars.segments
    .filter((s) => s.enters && inMonth(s.from) && (s.planet === 'Mars' || (STAR_PLANETS_SLOW as readonly string[]).includes(s.planet)))
    .map((s) => starMoveLine(f, s));
  const moorti = f.stars.moorti
    .filter((x) => inMonth(x.date) && (x.planet === 'Mars' || (STAR_PLANETS_SLOW as readonly string[]).includes(x.planet)))
    .map((x) => `${x.planet} enters ${x.toSign} on ${dayMonth(x.date)}: ${x.plain}`);
  const stand = f.stars.monthStars[m]!.rows
    .filter((r) => (STAR_PLANETS_SLOW as readonly string[]).includes(r.planet))
    .map((r) => `${r.planet} in ${r.nakshatra} stands in your ${ORD[r.houseFromMoon]} house from your Moon, ${GOCHAR_PLAIN[r.verdict]}`);
  return `   STAR MOVES THIS MONTH (name each with its date in paragraph 1 or 2, in plain words): ${moves.join(' | ') || 'none'}
   MOORTI OF SIGN CHANGES: ${moorti.join(' | ') || 'none'}
   MID-MONTH, FROM THE MOON: ${stand.join(' | ')}`;
}

function monthFacts(f: VarshikFacts, m: number): string {
  const mm = String(m + 1).padStart(2, '0');
  const first = `${f.year}-${mm}-01`;
  const last = `${f.year}-${mm}-${String(new Date(Date.UTC(f.year, m + 1, 0)).getUTCDate()).padStart(2, '0')}`;
  const mudda = f.varsha
    .flatMap((v) =>
      v.mudda.flatMap((p) => {
        const subs = p.antar
          .filter((a) => a.to >= first && a.from <= last)
          .map((a) => `${p.lord}-${a.lord} from ${dayMonth(a.from)} to ${dayMonth(a.to)}`);
        return subs.length ? [`${v.targetYear} chart, ${p.lord} Mudda period (${dayMonth(p.from)} to ${dayMonth(p.to)}): ${subs.join('; ')}`] : [];
      }),
    )
    .join('\n   ');
  const dasha = f.dashas.pratyantar2027
    .filter((d) => d.to >= first && d.from <= last)
    .map((d) => `Maha ${d.maha}, Antar ${d.antar}, Pratyantar ${d.praty}: ${dayMonth(d.from)} to ${dayMonth(d.to)}`)
    .join('\n   ');
  const slice = f.varsha.find((v) => v.startsAt.slice(0, 10) <= last && v.endsAt.slice(0, 10) >= first) ?? f.varsha[0]!;
  const chartNote =
    f.varsha.length === 2 && f.varsha[0]!.endsAt.slice(0, 10) >= first && f.varsha[0]!.endsAt.slice(0, 10) <= last
      ? `the ${f.varsha[0]!.targetYear} Varsha chart rules until ${dayMonth(f.varsha[0]!.endsAt.slice(0, 10))}, then the ${f.varsha[1]!.targetYear} chart takes over`
      : `the ${slice.targetYear} Varsha chart rules the whole month`;
  const sahams = f.sahamWindows
    .filter((w) => w.to >= first && w.from <= last)
    .map((w) => `${w.saham} Saham touched by ${w.planet}: ${dayMonth(w.from)} to ${dayMonth(w.to)}${w.exact.length ? `, exact on ${w.exact.map(dayMonth).join(', ')}` : ''}`)
    .join('\n   ');
  const events = f.skyEvents.filter((e) => e.month === m).map((e) => eventLine(e, f)).join('\n   ');
  const fest = f.calendar.festivals.filter((x) => x.month === m).map((x) => `${dayMonth(x.date)}: ${x.name}`).join('; ');
  const doshaAwake = f.doshas.filter((d) => d.activeMonths.includes(m)).map((d) => d.label).join(', ');
  const areaTiers = AREAS.map((a) => `${a} ${tierToken(f.scores.timingMap[a]![m]!.tier)}`).join(', ');
  const monthFirst = `${f.year}-${String(m + 1).padStart(2, '0')}-01`;
  const monthLast = `${f.year}-${String(m + 1).padStart(2, '0')}-${String(new Date(Date.UTC(f.year, m + 1, 0)).getUTCDate()).padStart(2, '0')}`;
  const closedHere = f.calendar.closures.filter((c) => c.to >= monthFirst && c.from <= monthLast);
  const decisions = [
    ...f.scores.decisionTable
      .filter((d) => d.hold.includes(m) || (d.best.from <= m && m <= d.best.to))
      .map((d) => `${DECISION_WORDS[d.key] ?? d.key}: ${d.hold.includes(m) ? 'a month to hold off' : 'inside the best stretch'}`),
    ...(f.scores.decisionTable.some((d) => d.closed) && closedHere.length
      ? [`no wedding, engagement or move-in window while ${closedHere.map((c) => `${CLOSURE_WORDS[c.reason]} (${dayMonth(c.from)} to ${dayMonth(c.to)})`).join(', ')}`]
      : []),
  ].join('; ');
  const lords = [...new Set(f.dashas.pratyantar2027.filter((d) => d.to >= first && d.from <= last).map((d) => d.antar))];
  const weekday = lords[0] ? WEEKDAY_OF[lords[0]] : null;
  return `${monthName(m).toUpperCase()}:
 - tone: ${tierToken(f.scores.months[m]!.tier)} (${TIER_MEANING[f.scores.months[m]!.tier]}). ${whyLines(f, m)}
 - Varsha chart in force: ${chartNote}. Varsha Lagna ${slice.lagna}, Year Lord ${slice.yearLord}.
 - Mudda: ${mudda || 'none'}
 - natal dasha: ${dasha || 'none'}
 - Saham windows: ${sahams || 'none'}
 - area tones: ${areaTiers}
 - decisions: ${decisions || 'none flagged'}
 - sky events: ${events || 'none'}
 - festivals: ${fest || 'none'}
 - doshas awake: ${doshaAwake || 'none'}
${monthStarLines(f, m)}
 - a free weekday habit can follow the running Antar lord${lords[0] ? ` ${lords[0]}, whose day is ${weekday}` : ''}`;
}

function monthCall(f: VarshikFacts, first: number): CallSpec {
  const ids = MONTH_IDS.slice(first, first + 6);
  const months = ids.map((_, i) => first + i);
  const facts = `${renderCommon(f)}
ALL MONTH TONES:
${monthTierLines(f)}
MONTHS TO WRITE:
${months.map((m) => monthFacts(f, m)).join('\n')}`;
  return {
    ids,
    counts: Object.fromEntries(ids.map((id) => [id, 5])),
    facts,
    instructions: `Write EXACTLY ${ids.length} sections, with these ids in this order: ${ids.join(', ')}. Each section is one month and has EXACTLY 5 paragraphs, each 2 to 4 sentences:
1. The month at a glance: its tone in words, the Varsha chart and the Mudda lord in force with their dates, and the one or two dates that matter (a station, a Saham peak, a festival).
2. Living the month: what to do and what to hold, tied to the tone. In a TIER_HOLD month this is rest, patience and preparation. Name every star move listed under STAR MOVES THIS MONTH with its date, in plain words, for example "Saturn moves into your 10th star from 3 May: work asks for patience and steady effort". Use the meaning given for the star, never invent one. Where the mid-month lines say a planet stands in an unfavourable house from your Moon, say it gently as a stretch that asks for patience. The Moorti lines may be mentioned in one sentence.
3. Career and money: notes written for THIS reader's work and situation (see "What the reader told us"). General money habits only.
4. Love and health: written for this reader's real situation. Health is rest, routine and check-ups only.
5. One remedy, dated: a free, simple act on a named weekday in this month, linked to the running Antar lord. One sentence of why, one of how.
Use only the dates in that month's facts.
VARIETY. These months must not read alike. Open each paragraph differently from the same paragraph in the other months. Mention the reader's situation (single, student, married, retired, a job, a child) only where it changes the advice, never as a stock phrase in every month, and never start paragraph 4 with "As a" or "Because you are". Vary the remedy: a different act, place or time of day each month.`,
    user: `Write ${monthName(months[0]!)} to ${monthName(months[months.length - 1]!)}.`,
  };
}

// -----------------------------------------------------------------------------
// Parsing, one call, and the regenerate loop
// -----------------------------------------------------------------------------

const SECTIONS_SCHEMA = {
  type: 'object',
  properties: {
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, paragraphs: { type: 'array', items: { type: 'string' } } },
        required: ['id', 'paragraphs'],
      },
    },
  },
  required: ['sections'],
} as const;

const VARSHIK_PROFILE = { ...REPORT_PROFILE, name: 'report-varshik', maxTokens: 16000 };

/**
 * A background job nobody waits on, and its biggest call writes about 15 sections: the default
 * 60 s per attempt and 90 s in all (gemini-client.ts) cut it off. Same override the palm scan uses.
 */
const CALL_TIMING = { timeoutMs: 180_000, totalBudgetMs: 480_000 } as const;

/** Drops any sentence the content-policy output filter blocks (same rule as kp_annual). */
export function scrubPolicy(text: string): string {
  if (!classifyAssistantOutput(text).blocked) return text;
  return text
    .split(/(?<=[.!?।])\s+/)
    .filter((s) => !classifyAssistantOutput(s).blocked)
    .join(' ')
    .trim();
}

export interface RawSection {
  id: string;
  paragraphs: string[];
  topic?: string;
}

export function parseVarshikSections(raw: string): RawSection[] | null {
  try {
    const data = JSON.parse(cleanJsonString(raw)) as { sections?: unknown };
    if (!Array.isArray(data.sections) || data.sections.length === 0) return null;
    const out: RawSection[] = [];
    for (const entry of data.sections) {
      const e = entry as { id?: unknown; paragraphs?: unknown; topic?: unknown };
      if (typeof e.id !== 'string' || !Array.isArray(e.paragraphs)) return null;
      const paragraphs = e.paragraphs
        .filter((p): p is string => typeof p === 'string')
        .map((p) => scrubPolicy(p.trim()))
        .filter((p) => p.length > 0);
      out.push({ id: e.id, paragraphs, ...(typeof e.topic === 'string' ? { topic: e.topic } : {}) });
    }
    return out;
  } catch {
    return null;
  }
}

/** Structure problems for one call's output: wrong ids, wrong counts, empty paragraphs. */
function structureProblems(spec: CallSpec, parsed: RawSection[] | null): string[] {
  if (!parsed) return ['the JSON could not be read'];
  const problems: string[] = [];
  if (parsed.length !== spec.ids.length) {
    problems.push(`expected ${spec.ids.length} sections, got ${parsed.length}`);
  }
  spec.ids.forEach((id, i) => {
    const got = parsed[i];
    if (!got || got.id !== id) {
      problems.push(`section ${i + 1} should have id "${id}"`);
      return;
    }
    const want = spec.counts[id];
    if (want != null && got.paragraphs.length !== want) {
      problems.push(`section ${id} should have exactly ${want} paragraphs, it has ${got.paragraphs.length}`);
    }
    if (got.paragraphs.length === 0) problems.push(`section ${id} is empty`);
  });
  return problems;
}

export async function askOnce(spec: CallSpec, note: string | null): Promise<RawSection[] | null> {
  const raw = await generate({
    ...CALL_TIMING,
    profile: VARSHIK_PROFILE,
    responseSchema: SECTIONS_SCHEMA,
    messages: [
      { role: 'system', content: yearize(`${baseSystem()}\n\n${spec.instructions}`, spec.year ?? 2027) },
      // The facts go in as DATA. No planetCondition: those lines are as of today and name the
      // natal chart only, and the facts above already hold everything this report may say.
      reportFactsMessage(spec.facts, [], [], 'varshik_rashifal_2027'),
      { role: 'user', content: note ? `${spec.user}\n\n${note}` : spec.user },
    ],
  });
  return parseVarshikSections(raw);
}

export interface TextFlag {
  section: string;
  rule: string;
  text: string;
}

interface CheckedCall {
  sections: ReportSection[];
  flags: TextFlag[];
}

/**
 * Words the model keeps using after being told not to ("serves as", "journeys", from the S3 open items).
 * They are swapped by rule before the checks run, so no flag is left. The swaps keep the sentence grammatical.
 */
export function scrubTells(text: string): string {
  const keepCase = (from: string, to: string): string => (from[0] === from[0]!.toUpperCase() ? to[0]!.toUpperCase() + to.slice(1) : to);
  return text
    .replace(/\b(serves|served|stands|stood) as\b/gi, (m, v: string) => keepCase(m, /^(serves|stands)$/i.test(v) ? 'is' : 'was'))
    .replace(/\bjourneys\b/gi, (m) => keepCase(m, 'trips'))
    .replace(/\bjourney\b/gi, (m) => keepCase(m, 'trip'));
}

function toSections(parsed: RawSection[], year = 2027): ReportSection[] {
  return parsed.map((s) => ({
    id: s.id,
    heading: (VARSHIK_HEADINGS[s.id] ?? s.topic ?? s.id).split('{Y}').join(String(year)),
    paragraphs: s.paragraphs.map(scrubTells),
  }));
}

function hitsOf(sections: ReportSection[], facts: VarshikFacts): Map<string, TextHit[]> {
  const index = buildFactIndex(facts);
  const out = new Map<string, TextHit[]>();
  for (const s of sections) {
    const h = checkVarshikSection(s, facts, index);
    if (h.length > 0) out.set(s.id ?? s.heading, h);
  }
  // Months in one call must not open alike (cheap, no model).
  for (const [id, extra] of crossSectionOpeningHits(sections.filter((x) => /^month_/.test(x.id ?? '')))) {
    out.set(id, [...(out.get(id) ?? []), ...extra]);
  }
  return out;
}

const countHits = (m: Map<string, TextHit[]>): number => [...m.values()].reduce((n, h) => n + h.length, 0);

/**
 * One call with its checks. The first answer is checked; if it has structure problems, coverage
 * gaps or text hits, the call is asked ONCE more with the problems listed, and the better of the
 * two answers is kept. What still fails is then cut sentence by sentence (everything except the AI
 * tells), and the AI tells that remain are returned as flags. A call that still has a structure or
 * coverage gap throws: it is never checkpointed.
 */
export async function runCheckedCall(
  spec: CallSpec,
  facts: VarshikFacts,
  ask: (note: string | null) => Promise<RawSection[] | null> = (note) => askOnce(spec, note),
): Promise<CheckedCall> {
  const only = new Set(spec.ids);
  const evaluate = (parsed: RawSection[] | null) => {
    const structure = structureProblems(spec, parsed);
    if (structure.length > 0 || !parsed) return { structure, coverage: [] as string[], hits: new Map<string, TextHit[]>(), sections: null as ReportSection[] | null };
    const sections = toSections(parsed, facts.year);
    return {
      structure,
      coverage: coverageProblems(facts, sections, only),
      hits: hitsOf(sections, facts),
      sections,
    };
  };
  const score = (e: ReturnType<typeof evaluate>): number =>
    e.structure.length * 1000 + e.coverage.length * 100 + countHits(e.hits);

  let best = evaluate(await ask(null));
  if (score(best) > 0) {
    const lines: string[] = [];
    if (best.structure.length) lines.push(`Structure problems:\n${best.structure.map((p) => `- ${p}`).join('\n')}`);
    if (best.coverage.length) lines.push(`Missing coverage:\n${best.coverage.map((p) => `- ${p}`).join('\n')}`);
    for (const [id, hits] of best.hits) lines.push(`Section ${id}:\n${hitsAsPromptLines(hits)}`);
    const second = evaluate(
      await ask(
        `Your first answer failed these checks. Write the whole answer again, fixing every one of them, keeping everything that was fine:\n${lines.join('\n')}`,
      ),
    );
    if (score(second) <= score(best)) best = second;
  }
  if (!best.sections || best.structure.length > 0) {
    throw new Error(`varshik_rashifal_2027 call (${spec.ids[0]}...) structure: ${best.structure.join('; ')}`);
  }
  if (best.coverage.length > 0) {
    throw new Error(`varshik_rashifal_2027 call (${spec.ids[0]}...) coverage: ${best.coverage.join('; ')}`);
  }

  // Cut what can be cut, flag what cannot.
  const flags: TextFlag[] = [];
  const cut: string[] = [];
  const cleaned = best.sections.map((s) => {
    const hits = best.hits.get(s.id ?? s.heading) ?? [];
    for (const h of hits) {
      flags.push({ section: s.id ?? s.heading, rule: h.rule, text: h.text.slice(0, 240) });
      if (!h.rule.startsWith('ai-tell:')) cut.push(`[${h.rule}] ${h.text.slice(0, 160)}`);
    }
    return hits.length > 0 ? dropFlaggedSentences(s, hits) : s;
  });
  // A cut that emptied a paragraph changes a count: check coverage once more on what we keep.
  const after = coverageProblems(facts, cleaned, only);
  if (after.length > 0) {
    throw new Error(`varshik_rashifal_2027 call (${spec.ids[0]}...) lost text to the checks: ${after.join('; ')}. Cut: ${cut.slice(0, 4).join(' | ')}`);
  }
  return { sections: cleaned, flags: flags.filter((x) => x.rule.startsWith('ai-tell:')) };
}

// -----------------------------------------------------------------------------
// Chapter VI: the reader's questions, the relief page, the closing letter
// -----------------------------------------------------------------------------

/** Topics that are never chosen as a question, even when a stored fact mentions one. */
const BANNED_TOPIC_RE =
  /\b(?:death|die[sd]?|dying|dead|passed away|funeral|lifespan|longevity|suicid\w*|accident\w*|crash\w*|tumou?rs?|chemo\w*|surgery|operation|hospital\w*|diagnos\w*|terminal|serious illness|heart (?:attack|problem)|stroke|diabetes|miscarriage|stillbirth|abortion|pregnancy loss|court|lawsuit|legal case|litigation|police|arrest\w*|custody|divorce\w*|sued?)\b/i;

export interface QuestionProposal {
  factIds: string[];
  key: string;
  topic: string;
}

/** Keeps a proposal only when it is traceable to a real fact (or the main-decision answer) and an engine key. */
export function acceptProposals(raw: unknown, facts: VarshikFacts, max = 5): QuestionProposal[] {
  if (!Array.isArray(raw)) return [];
  const factById = new Map(facts.reader.facts.map((x) => [x.id, x.fact]));
  const hasMain = !!facts.reader.answers.mainDecision && facts.reader.answers.mainDecision !== 'nothing_specific';
  const keys = new Set(Object.keys(facts.scores.answerWindows));
  const out: QuestionProposal[] = [];
  const seenKeys = new Set<string>();
  for (const item of raw) {
    const p = item as { factIds?: unknown; key?: unknown; topic?: unknown };
    if (!Array.isArray(p.factIds) || typeof p.key !== 'string' || typeof p.topic !== 'string') continue;
    const ids = p.factIds.filter((x): x is string => typeof x === 'string');
    const topic = p.topic.trim();
    if (!topic || topic.length > 80) continue;
    if (!keys.has(p.key) || seenKeys.has(p.key)) continue;
    // Traceable: every id is a real fact id (or the main-decision answer), and at least one is given.
    if (ids.length === 0) continue;
    if (!ids.every((id) => factById.has(id) || (id === 'MAIN' && hasMain))) continue;
    // Never a banned topic: not in the question, and not in any fact it came from.
    const linkedText = ids.map((id) => factById.get(id) ?? '').join(' ');
    // "cancer" the illness is lower case; "Cancer" is the zodiac sign.
    const cancer = /\bcancer\b/;
    if (BANNED_TOPIC_RE.test(topic) || BANNED_TOPIC_RE.test(linkedText)) continue;
    if (cancer.test(topic) || cancer.test(linkedText)) continue;
    if (deathHits([topic]).length || fearHits([topic]).length) continue;
    seenKeys.add(p.key);
    out.push({ factIds: ids, key: p.key, topic });
    if (out.length >= max) break;
  }
  return out;
}

const PROPOSE_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          factIds: { type: 'array', items: { type: 'string' } },
          key: { type: 'string' },
          topic: { type: 'string' },
        },
        required: ['factIds', 'key', 'topic'],
      },
    },
  },
  required: ['questions'],
} as const;

function proposeFacts(f: VarshikFacts): string {
  const lines: string[] = [renderReader(f)];
  if (f.reader.facts.length > 0) {
    lines.push("THINGS THE READER HAS MENTIONED (each has an id):");
    for (const x of f.reader.facts) lines.push(`${x.id}: ${x.fact}`);
  }
  const main = f.reader.answers.mainDecision;
  if (main && main !== 'nothing_specific') {
    lines.push(`MAIN: ${ANSWER_WORDS.mainDecision![main]}. Use the id MAIN for it.`);
  }
  lines.push('ENGINE KEYS you may choose from (each has a dated window already computed):');
  lines.push(
    Object.keys(f.scores.answerWindows)
      .map((k) => `${k}${DECISION_WORDS[k] ? ` (${DECISION_WORDS[k]})` : ''}`)
      .join(', '),
  );
  return lines.join('\n');
}

export async function proposeQuestions(
  f: VarshikFacts,
  ask: (messages: Array<{ role: 'system' | 'user'; content: string }>) => Promise<string> = (messages) =>
    generate({ ...CALL_TIMING, profile: VARSHIK_PROFILE, responseSchema: PROPOSE_SCHEMA, messages }),
): Promise<QuestionProposal[]> {
  const hasMain = !!f.reader.answers.mainDecision && f.reader.answers.mainDecision !== 'nothing_specific';
  if (f.reader.facts.length === 0 && !hasMain) return [];
  const raw = await ask([
    {
      role: 'system',
      content: `You choose which real questions a reader is facing, for the last chapter of their year report. Choose at most 5. Each must come from something the reader actually mentioned (cite its id, or MAIN) and must match one engine key. Choose only a decision they are weighing or something they are worried about: plain background (where they live, who is at home, what they do) is not a question. Fewer than five is fine; two good questions beat five thin ones. Never invent a worry. Never choose death, illness, accidents, legal matters, divorce or pregnancy loss, even if a fact mentions one: skip it. Give each a short plain topic (under 10 words, no dashes), phrased gently, as a heading the reader would be glad to see. Return STRICT JSON: {"questions": [{"factIds": string[], "key": string, "topic": string}]}.`,
    },
    { role: 'system', content: `<data>\n${proposeFacts(f)}\n</data>` },
    { role: 'user', content: 'Choose the questions.' },
  ]);
  try {
    const data = JSON.parse(cleanJsonString(raw)) as { questions?: unknown };
    return acceptProposals(data.questions, f);
  } catch {
    return [];
  }
}

/** Replaces {window} and {next} with the engine's own dates; appends one sentence if missing. */
/** The window as it reads in a sentence: "between 23 June and 29 July". */
function windowBetween(w: { fromDate: string; toDate: string }): string {
  return w.fromDate === w.toDate ? `on ${dayMonth(w.fromDate)}` : `between ${dayMonth(w.fromDate)} and ${dayMonth(w.toDate)}`;
}

export function fillWindowTokens(
  paragraphs: string[],
  w: { best: { fromDate: string; toDate: string; peakDate: string }; then: { fromDate: string; toDate: string; peakDate: string } | null; weak: boolean },
): string[] {
  const win = windowBetween(w.best);
  const next = w.then ? windowBetween(w.then) : null;
  let used = false;
  const out = paragraphs.map((p) => {
    let q = p;
    if (q.includes('{window}')) used = true;
    q = q.replace(/\{window\}/g, win);
    q = next ? q.replace(/\{next\}/g, next) : q.replace(/\s*[^.!?]*\{next\}[^.!?]*[.!?]/g, '');
    return q.replace(/\{[a-z]+\}/g, '').replace(/\s{2,}/g, ' ').trim();
  });
  if (!used) {
    out.splice(Math.min(1, out.length), 0, w.weak ? `The steadiest stretch for this falls ${win}.` : `The best window for this falls ${win}.`);
  }
  return out;
}

function reliefFacts(f: VarshikFacts): string {
  const r = f.scores.relief;
  const ev = (e: (typeof r.ahead)[number]) => `${dayMonth(e.date)} ${e.date.slice(0, 4)}: ${e.detail}${e.temporary ? ' (a step back that comes round again)' : ''}`;
  const lines: string[] = [];
  lines.push(
    `LOOK BACK (${dayMonth(r.lookbackFrom)} ${r.lookbackFrom.slice(0, 4)} to ${dayMonth(r.lookbackTo)} ${r.lookbackTo.slice(0, 4)}): ${r.wasHard ? 'the chart shows a heavier stretch' : 'the chart shows no especially heavy stretch'}. Days Sade Sati or Dhaiya ran: ${r.saturnDamperDays}.`,
  );
  for (const e of r.lookback) lines.push(`- ${e.effect === 'hard' ? 'weighed' : 'eased'}: ${ev(e)}`);
  if (r.varsha2026) {
    lines.push(
      `The ${f.year - 1} Varsha year (ended ${dayMonth(r.varsha2026.endedOn)} ${f.year}): Year Lord ${r.varsha2026.yearLord}, Muntha in the Varsha ${ORD[r.varsha2026.munthaHouse]} house (${r.varsha2026.munthaAuspicious ? 'a supportive house' : 'a demanding house'}).`,
    );
  }
  lines.push('TURNING POINTS AHEAD, soonest first:');
  for (const e of r.ahead.slice(0, 14)) lines.push(`- ${e.effect === 'relief' ? 'eases' : 'weighs'}: ${ev(e)}`);
  lines.push(
    r.reliefInYear
      ? `Relief arrives inside ${f.year}. The first is: ${r.nextRelief ? ev(r.nextRelief) : 'see the list'}.`
      : `No real relief arrives inside ${f.year}. Say so gently. The next turning point is: ${r.nextReliefBeyondYear ? ev(r.nextReliefBeyondYear) : 'beyond the dates the chart reaches'}. Name what makes the wait easier.`,
  );
  return lines.join('\n');
}

/** The dated star facts a Chapter VI answer may lean on: friendly stars for the slow planets and the sensitive crossings. */
function chapterSixStars(f: VarshikFacts): string {
  const slow = (STAR_PLANETS_SLOW as readonly string[]);
  const sens = f.stars.sensitive
    .filter((s) => slow.includes(s.planet) && s.enters)
    .map((s) => {
      const seg = f.stars.segments.find((x) => x.planet === s.planet && x.from === s.from)!;
      return `- ${starMoveLine(f, seg)}`;
    });
  const friendly = f.stars.segments
    .filter((s) => slow.includes(s.planet) && s.enters && s.tara.good)
    .map((s) => `- ${s.planet} enters ${s.nakshatra} on ${dayMonth(s.from)}: ${taraWords(s.tara)}`);
  return `STAR DATES A QUESTION PAGE MAY USE (only these; say hard stretches as "a stretch that asks for patience" and never name the 7th tara or the 22nd star):
Sensitive crossings:
${sens.join('\n') || '- none'}
Friendly stars entered by the slow planets:
${friendly.join('\n') || '- none'}`;
}

function remedyFacts(f: VarshikFacts): string {
  const v = f.varsha[f.varsha.length - 1]!;
  const awake = f.doshas.filter((d) => d.status !== 'not_present' && d.activeMonths.length > 0);
  return `Year Lord ${v.yearLord} (${WEEKDAY_OF[v.yearLord] ?? 'its weekday'}); Muntha lord ${v.muntha.lord} (${WEEKDAY_OF[v.muntha.lord] ?? 'its weekday'}).
Doshas awake in ${f.year}: ${awake.map((d) => `${d.label} (simple remedy: ${d.remedy})`).join('; ') || 'none'}.`;
}

interface QuestionPlan {
  proposal: QuestionProposal;
  window: NonNullable<VarshikFacts['scores']['answerWindows'][string]>;
}

function call5(f: VarshikFacts, plans: QuestionPlan[]): CallSpec {
  const qIds = plans.map((_, i) => `question_${i + 1}`);
  const ids = ['simple_remedies', 'what_changes', 'closing_letter', ...qIds];
  const factText = new Map(f.reader.facts.map((x) => [x.id, x.fact]));
  const qFacts = plans
    .map((p, i) => {
      const lines = p.proposal.factIds
        .map((id) => (id === 'MAIN' ? ANSWER_WORDS.mainDecision![f.reader.answers.mainDecision!]!.split('{Y}').join(String(f.year)) : (factText.get(id) ?? '')))
        .join(' | ');
      const w = p.window;
      return `QUESTION ${i + 1} (${qIds[i]}): topic "${p.proposal.topic}". What the reader told us: ${lines}. Engine key ${p.proposal.key}: ${w.weak ? `the calmest stretch is ${windowPhrase(w.best)} (${tierToken(w.best.tier)}); NO strong window opens in ${f.year}, so say gently that this is the steadiest stretch and that a better one lies beyond this year` : `best window ${windowPhrase(w.best)} (${tierToken(w.best.tier)})`}${w.then ? `; a second window follows: ${windowPhrase(w.then)}` : ''}.`;
    })
    .join('\n');
  const facts = `${renderCommon(f)}
${remedyFacts(f)}
PEAK MONTHS: ${monthList(f.scores.peakMonths)}. QUIETEST MONTH: ${monthName(f.scores.restMonth)}.
${reliefFacts(f)}
${chapterSixStars(f)}
${plans.length ? `READER'S QUESTIONS:\n${qFacts}` : 'The reader gave no questions: write only the first three sections.'}`;
  const counts: Record<string, number | null> = { simple_remedies: 3, what_changes: 4, closing_letter: 2 };
  for (const id of qIds) counts[id] = 3;
  return {
    ids,
    counts,
    facts,
    instructions: `Write EXACTLY ${ids.length} sections, with these ids in this order: ${ids.join(', ')}.
1. simple_remedies: EXACTLY 3 paragraphs, one simple free remedy each, drawn from the Year Lord, the Muntha lord and a dosha that is awake (if none is awake, from the Year Lord's weekday and the quietest month). Name the weekday and say how to do it in one or two sentences. No product, no cost, no "must".
2. what_changes: EXACTLY 4 paragraphs. First, the hard stretch of the recent past, read from the look-back facts, named gently and specifically (dasha changes, Saturn or Rahu and Ketu over key houses, Sade Sati or Dhaiya, the 2026 Varsha year); if the chart shows no heavy stretch say that plainly and kindly. Second and third, the dated turning points that bring relief, using only the dates given. Fourth, what makes the way easier. If no relief arrives inside 2027, say so gently, name the next turning point with its date, and say what helps meanwhile.
3. closing_letter: EXACTLY 2 paragraphs, a short closing note from Baba Ji. Name the Year Lord and the strongest months once. Do not sign it; the signature is added separately.
${plans.length ? `4. ${qIds.join(', ')}: each EXACTLY 3 paragraphs for its question: (a) what the reader may be going through, named gently and specifically without repeating their private words back too bluntly; (b) when it eases: write the sentence as you like but put the exact text {window} where the dated window belongs (it expands to words like "between 12 March and 4 April", so write "it eases {window}", never "during {window}"), and {next} the same way for the second window if one is given. Never write a date yourself in this paragraph. (c) one or two practical steps that help meanwhile. If it fits, one sentence in paragraph (a) or (c) may use a dated star crossing from "STAR DATES A QUESTION PAGE MAY USE", worded gently.
These question pages are extra gentle: no negative statements except something the reader genuinely needs to know, said kindly together with what helps. Never use the words never, impossible, unfortunately or worst.` : ''}`,
    user: plans.length ? 'Write the remedies, the relief page, the closing note and the question pages.' : 'Write the remedies, the relief page and the closing note.',
  };
}

// -----------------------------------------------------------------------------
// The whole narrative
// -----------------------------------------------------------------------------

export interface VarshikNarrative {
  sections: ReportSection[];
  flags: TextFlag[];
}

/** The independent calls of a Varshik report, run in parallel and saved in this order. */
const PARALLEL_CALLS: ReadonlyArray<(f: VarshikFacts) => CallSpec> = [
  call1,
  call2,
  (f) => monthCall(f, 0),
  (f) => monthCall(f, 6),
  starsCall,
];

/**
 * How many checkpointed groups a Varshik report is written in: the parallel calls, then the last call
 * (Chapter V and VI) that needs the chosen questions. The waiting screen's progress total reads this, so
 * adding a call can never leave the "x of N" count behind (reports.service generatingDto).
 */
export const VARSHIK_TEXT_GROUPS = PARALLEL_CALLS.length + 1;

export async function generateVarshikNarrative(
  facts: VarshikFacts,
  progress?: SectionGenerationProgress,
  /** Test seam: replaces the model for every call. */
  askFor?: (spec: CallSpec) => (note: string | null) => Promise<RawSection[] | null>,
  proposeAsk?: Parameters<typeof proposeQuestions>[1],
): Promise<VarshikNarrative> {
  const existing = progress?.existingGroups ?? [];
  const flags: TextFlag[] = [];

  // Calls 1 to 4 are independent, so they run in parallel; the checkpoint contract is that only a
  // contiguous prefix of successes is saved, so each waits its turn to save (see kp_annual).
  const specs = PARALLEL_CALLS.map((build) => build(facts)).map(withSpacedStars).map(withYear(facts));
  const first = await Promise.allSettled(
    specs.map((spec, i) =>
      i < existing.length ? Promise.resolve(existing[i]!) : runCheckedCall(spec, facts, askFor?.(spec)),
    ),
  );
  const groups: ReportSection[][] = [];
  let failure: Error | null = null;
  for (let i = 0; i < first.length; i++) {
    const r = first[i]!;
    if (r.status === 'rejected') {
      failure ??= r.reason instanceof Error ? r.reason : new Error(String(r.reason));
      continue;
    }
    if (failure) continue;
    const value = r.value;
    const sections = Array.isArray(value) ? value : value.sections;
    if (!Array.isArray(value)) flags.push(...value.flags);
    groups.push(sections);
    if (i >= existing.length) await progress?.onGroupComplete(sections);
  }
  if (failure) throw failure;

  // Call 5 (Chapter V and VI) needs the questions chosen first.
  let group5: ReportSection[];
  if (existing.length > PARALLEL_CALLS.length) {
    group5 = existing[PARALLEL_CALLS.length]!;
  } else {
    const proposals = await proposeQuestions(facts, proposeAsk).catch((err: unknown) => {
      logger.warn({ err }, 'varshik: choosing the reader questions failed, skipping them');
      return [] as QuestionProposal[];
    });
    const plans: QuestionPlan[] = proposals
      .map((proposal) => ({ proposal, window: facts.scores.answerWindows[proposal.key]! }))
      .filter((p) => !!p.window);
    const spec5 = withYear(facts)(withSpacedStars(call5(facts, plans)));
    const done = await runCheckedCall(spec5, facts, askFor?.(spec5));
    flags.push(...done.flags);
    group5 = done.sections.map((s) => {
      const m = /^question_(\d)$/.exec(s.id ?? '');
      if (!m) return s;
      const plan = plans[Number(m[1]) - 1]!;
      return {
        ...s,
        heading: plan.proposal.topic,
        paragraphs: fillWindowTokens(s.paragraphs, plan.window),
        uiData: {
          key: plan.proposal.key,
          factIds: plan.proposal.factIds,
          windowFrom: plan.window.best.fromDate,
          windowTo: plan.window.best.toDate,
          peak: plan.window.best.peakDate,
          tier: plan.window.best.tier,
          weak: plan.window.weak,
          next: plan.window.then ? { from: plan.window.then.fromDate, to: plan.window.then.toDate } : null,
        },
      };
    });
    await progress?.onGroupComplete(group5);
  }
  groups.push(group5);

  const sections = groups.flat();
  // The safety net over the whole report: the contract says a gap never ships.
  const problems = coverageProblems(facts, sections);
  if (problems.length > 0) {
    throw new ReportGenerationAbort(`varshik coverage: ${problems.slice(0, 10).join('; ')}`);
  }
  return { sections, flags };
}

// -----------------------------------------------------------------------------
// Translation (translate-on-read; the English above has already been checked)
// -----------------------------------------------------------------------------

const TRANSLATE_SCHEMA = {
  type: 'object',
  properties: {
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, heading: { type: 'string' }, paragraphs: { type: 'array', items: { type: 'string' } } },
        required: ['heading', 'paragraphs'],
      },
    },
  },
  required: ['sections'],
} as const;

const TONE_NOTE =
  'Keep the voice of a calm, kind family astrologer who respects the reader. In Hindi use the respectful "aap" form throughout and the matching polite forms in every other language. Keep planet names, the words Muntha, Varsha, Mudda, Saham and Year Lord recognisable, keep every date and month as written, and never add or drop a sentence.';

export function chunkForTranslation(sections: ReportSection[], maxSections = 5): ReportSection[][] {
  const chunks: ReportSection[][] = [];
  for (let i = 0; i < sections.length; i += maxSections) chunks.push(sections.slice(i, i + maxSections));
  return chunks;
}

export async function translateVarshikNarrative(
  sections: ReportSection[],
  targetLanguage: string,
): Promise<ReportSection[]> {
  const chunks = chunkForTranslation(sections);
  const out = await Promise.all(
    chunks.map(async (chunk) => {
      const raw = await generate({
        profile: REPORT_TRANSLATION_PROFILE,
        responseSchema: TRANSLATE_SCHEMA,
        messages: [
          {
            role: 'user',
            content: `Translate the following report sections into the language "${targetLanguage}". ${TONE_NOTE}\nKeep the exact same JSON structure ({"sections": [{"heading": string, "paragraphs": string[]}]}), the same number of sections and the same number of paragraphs in each. ONLY translate the human-readable text.\n\nOriginal Content:\n${JSON.stringify({ sections: chunk.map((s) => ({ heading: s.heading, paragraphs: s.paragraphs })) }, null, 2)}`,
          },
        ],
      });
      try {
        const parsed = (JSON.parse(cleanJsonString(raw)) as { sections?: Array<{ heading?: unknown; paragraphs?: unknown }> }).sections;
        if (!Array.isArray(parsed) || parsed.length !== chunk.length) throw new Error('count');
        return parsed.map((t, i) => {
          const src = chunk[i]!;
          const paragraphs = Array.isArray(t.paragraphs) ? t.paragraphs.filter((p): p is string => typeof p === 'string') : [];
          if (typeof t.heading !== 'string' || paragraphs.length !== src.paragraphs.length) throw new Error('shape');
          return {
            ...src,
            heading: t.heading.trim() || src.heading,
            paragraphs: paragraphs.map((p) => scrubPolicy(p.trim())),
          };
        });
      } catch {
        throw new Error(`varshik_rashifal_2027 translation returned an unusable answer (target=${targetLanguage})`);
      }
    }),
  );
  return out.flat();
}

