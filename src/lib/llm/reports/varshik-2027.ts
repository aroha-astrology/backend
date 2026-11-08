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

import { generate } from '../gemini-client.js';
import { HUMAN_VOICE_RULE } from '../human-voice.js';
import { REPORT_PROFILE, REPORT_TRANSLATION_PROFILE } from '../../../config/llm.js';
import { TIER_TOKENS, AREAS, type Tier } from '../../../config/varshik-weights.js';
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
  year_at_a_glance: '2027 at a glance',
  year_lord_muntha: 'Your Year Lord and Muntha',
  two_varsha_years: 'Your two Varsha charts',
  big_sky_moves: 'The big sky moves',
  planet_by_planet: 'Planet by planet',
  doshas: 'Doshas in your 2027',
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
  sky_calendar: 'Sky calendar 2027',
  when_to_act: 'When to act',
  golden_windows: 'Golden windows and key dates',
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

function baseSystem(): string {
  return `You are writing "Varshik Rashifal 2027", a paid personal year report for a mobile astrology app, in the voice of Baba Ji. It reads calendar year 2027 (1 January to 31 December) from the reader's birth chart and two Varsha (solar return) charts.

${GROUNDING_BLOCK}
${VARSHIK_STYLE_BLOCK}
${HUMAN_VOICE_RULE}
${TONE_BLOCK}
${SAFETY_BLOCK}
${JSON_BLOCK}`;
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
    job_change: 'the biggest decision they face in 2027 is a change of job',
    start_business: 'the biggest decision they face in 2027 is starting a business',
    relationship: 'the biggest decision they face in 2027 is about a relationship',
    move_or_travel: 'the biggest decision they face in 2027 is a move or a long trip',
    money: 'the biggest decision they face in 2027 is about money',
    health: 'the biggest decision they face in 2027 is about their health routine',
    study: 'the biggest decision they face in 2027 is about study or an exam',
    nothing_specific: 'they have no single big decision in mind for 2027',
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
    saving: 'their money focus for 2027 is saving',
    investing: 'their money focus for 2027 is investing',
    clearing_debt: 'their money focus for 2027 is clearing a loan or debt',
    earning_more: 'their money focus for 2027 is earning more',
    big_purchase: 'their money focus for 2027 is a big purchase',
    nothing_specific: 'they have no particular money goal for 2027',
  },
  travelPlan: {
    abroad: 'they plan to travel abroad in 2027',
    within_india: 'they plan to travel within India in 2027',
    none: 'they do not plan any long travel in 2027',
  },
  studyPlan: {
    exam: 'they are preparing for an exam in 2027',
    course: 'they are doing a course or studies in 2027',
    none: 'they are not studying or preparing for an exam in 2027',
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
    const w = ANSWER_WORDS[k]?.[v];
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
    `Report window: 1 January to 31 December 2027. The birth chart reads from a ${f.birth.lagna.sign} Lagna at ${f.birth.lagna.degree} degrees (${f.birth.lagna.nakshatra}). The natal dasha balance at birth was ${f.dashas.balance.planet}.`,
  );
  lines.push('BIRTH CHART:');
  for (const p of f.birth.planets) lines.push(`- ${planetLine(p)}`);
  lines.push('VARSHA CHARTS:');
  f.varsha.forEach((v, i) => {
    const rules =
      f.varsha.length === 2
        ? i === 0
          ? `rules from 1 January until ${dayMonth(v.endsAt.slice(0, 10))} 2027`
          : `rules from ${dayMonth(v.startsAt.slice(0, 10))} 2027 to the end of the year`
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

function eventLine(e: VarshikFacts['skyEvents'][number]): string {
  const where = `your ${ORD[e.natalHouse]} house, the ${ORD[e.varshaHouse]} in your Varsha chart`;
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
      return `${dayMonth(e.date)}: solar eclipse in ${e.sign} (${where})`;
    case 'eclipse-lunar':
      return `${dayMonth(e.date)}: lunar eclipse in ${e.sign} (${where})`;
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

export interface CallSpec {
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
    .map((t) => `${monthName(t.month)}: ${t.planet} in ${t.sign}, your ${ORD[t.natalHouse]} house`)
    .join('\n');
  const slowEvents = f.skyEvents
    .filter((e) => ['Saturn', 'Jupiter', 'Rahu', 'Ketu'].includes(e.planet) && e.kind !== 'combust-in' && e.kind !== 'combust-out')
    .map(eventLine)
    .join('\n');
  const sade = f.doshas.filter((d) => d.key === 'sadeSati' || d.key === 'dhaiya');
  const facts = `${renderCommon(f)}
THE YEAR:
Overall tone of 2027: ${tierToken(f.scores.overall.tier)} (${TIER_MEANING[f.scores.overall.tier]}).
Strongest three months: ${peaks}. The quietest month, best for rest: ${monthName(f.scores.restMonth)}.
Month by month:
${monthTierLines(f)}
SLOW PLANETS (mid-month position, house counted from the birth Lagna):
${slow}
Slow planet events:
${slowEvents || 'none'}
SADE SATI AND DHAIYA (counted from the natal Moon sign only):
${sade.map((d) => `- ${d.label}: ${d.status === 'present' ? `running in 2027, awake in ${monthList(d.activeMonths)}` : 'not running in 2027'}. ${d.cancellations.join('; ')}`).join('\n')}`;
  return {
    ids: CALL1_IDS,
    counts: { welcome_letter: 3, year_at_a_glance: 3, year_lord_muntha: 3, two_varsha_years: 2, big_sky_moves: 3 },
    facts,
    instructions: `Write EXACTLY these 5 sections, with these ids, in this order.
1. welcome_letter: 3 paragraphs, a short personal letter from Baba Ji. Greet the reader by name the way an elder would, name the Year Lord of the Varsha chart that rules most of 2027 with a plain gloss, and say in plain words what the year asks of them and one thing to look forward to. Write it as a letter, warm and specific, not as a summary of the report. Do not sign it; the signature is added separately.
2. year_at_a_glance: 3 paragraphs. The overall tone of the year in words (use the tone given, never a number), the three strongest months, the quietest month as a time for rest, and the one idea that ties the year together.
3. year_lord_muntha: 3 paragraphs. Explain the Year Lord (the planet that leads the year) and the Muntha (a point that moves one sign each year and shows where the year's attention goes), then what they mean for this reader from their houses in the Varsha chart. If the Muntha house is demanding, say so kindly and say what helps.
4. two_varsha_years: 2 paragraphs. Two Varsha charts touch 2027: say which rules until the solar return and which after, with the dates, and what changes at the handover.
5. big_sky_moves: 3 paragraphs. Saturn, Jupiter, Rahu and Ketu by house through the year, naming the months they change house. Then Sade Sati and Dhaiya, counted from the Moon sign, only as the facts state them: calm wording.`,
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
    .filter((p) => p.to >= '2027-01-01' && p.from <= '2027-12-31')
    .map((p) => `- ${p.lord} Mudda period of the ${p.y} chart: ${dayMonth(p.from)}${p.from < '2027-01-01' ? ' 2026' : ''} to ${dayMonth(p.to)}${p.to > '2027-12-31' ? ' 2028' : ''}`)
    .join('\n');
  const strongSaham = [...f.sahamWindows]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 8)
    .map((w) => `- ${w.saham} Saham touched by ${w.planet}${w.roles.length ? ` (${w.roles.join(', ')})` : ''}: ${dayMonth(w.from)} to ${dayMonth(w.to)}, exact on ${w.exact.map(dayMonth).join(', ') || 'no single day'}`)
    .join('\n');
  const events = f.skyEvents.map(eventLine);
  const decisions = f.scores.decisionTable
    .map((d) => `- ${DECISION_WORDS[d.key] ?? d.key}${d.isMain ? ' (the reader\'s own big decision)' : ''}: best stretch ${monthName(d.best.from)}${d.best.to !== d.best.from ? ` to ${monthName(d.best.to)}` : ''} (${tierToken(d.best.tier)}); hold off in ${monthList(d.hold)}`)
    .join('\n');
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
YOGAS THAT DELIVER IN 2027 (use these exact names):
${yogas || 'none'}
SEVEN AREAS:
${areas}
MONTH TONES, ALL AREAS:
${monthTierLines(f)}
MUDDA PERIODS:
${mudda}
STRONGEST SAHAM WINDOWS:
${strongSaham || 'none'}
SKY EVENTS 2027:
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
7. sky_calendar: 2 paragraphs. The first paragraph names ALL ${eclipseDates.length} eclipses of 2027, none left out and none merged (${eclipseDates.join(', ')}), each with its date and the house it falls in. Say the number of eclipses as ${eclipseDates.length}. The second paragraph covers the retrogrades and stations that matter most for this reader.
8. when_to_act: 2 paragraphs. Using the decisions given for this reader only, say when to move on each and when to hold. The reader's own big decision comes first.
9. golden_windows: 2 paragraphs naming the best windows with their dates and any major festival that falls inside one.`,
    user: 'Write the planet, dosha, yoga, area and timing sections.',
  };
}

function monthFacts(f: VarshikFacts, m: number): string {
  const mm = String(m + 1).padStart(2, '0');
  const first = `2027-${mm}-01`;
  const last = `2027-${mm}-${String(new Date(Date.UTC(2027, m + 1, 0)).getUTCDate()).padStart(2, '0')}`;
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
  const events = f.skyEvents.filter((e) => e.month === m).map(eventLine).join('\n   ');
  const fest = f.calendar.festivals.filter((x) => x.month === m).map((x) => `${dayMonth(x.date)}: ${x.name}`).join('; ');
  const doshaAwake = f.doshas.filter((d) => d.activeMonths.includes(m)).map((d) => d.label).join(', ');
  const areaTiers = AREAS.map((a) => `${a} ${tierToken(f.scores.timingMap[a]![m]!.tier)}`).join(', ');
  const decisions = f.scores.decisionTable
    .filter((d) => d.hold.includes(m) || (d.best.from <= m && m <= d.best.to))
    .map((d) => `${DECISION_WORDS[d.key] ?? d.key}: ${d.hold.includes(m) ? 'a month to hold off' : 'inside the best stretch'}`)
    .join('; ');
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
2. Living the month: what to do and what to hold, tied to the tone. In a TIER_HOLD month this is rest, patience and preparation.
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
      { role: 'system', content: `${baseSystem()}\n\n${spec.instructions}` },
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

function toSections(parsed: RawSection[]): ReportSection[] {
  return parsed.map((s) => ({
    id: s.id,
    heading: VARSHIK_HEADINGS[s.id] ?? s.topic ?? s.id,
    paragraphs: s.paragraphs,
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
    const sections = toSections(parsed);
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
      `The 2026 Varsha year (ended ${dayMonth(r.varsha2026.endedOn)} 2027): Year Lord ${r.varsha2026.yearLord}, Muntha in the Varsha ${ORD[r.varsha2026.munthaHouse]} house (${r.varsha2026.munthaAuspicious ? 'a supportive house' : 'a demanding house'}).`,
    );
  }
  lines.push('TURNING POINTS AHEAD, soonest first:');
  for (const e of r.ahead.slice(0, 14)) lines.push(`- ${e.effect === 'relief' ? 'eases' : 'weighs'}: ${ev(e)}`);
  lines.push(
    r.reliefInYear
      ? `Relief arrives inside 2027. The first is: ${r.nextRelief ? ev(r.nextRelief) : 'see the list'}.`
      : `No real relief arrives inside 2027. Say so gently. The next turning point is: ${r.nextReliefBeyondYear ? ev(r.nextReliefBeyondYear) : 'beyond the dates the chart reaches'}. Name what makes the wait easier.`,
  );
  return lines.join('\n');
}

function remedyFacts(f: VarshikFacts): string {
  const v = f.varsha[f.varsha.length - 1]!;
  const awake = f.doshas.filter((d) => d.status !== 'not_present' && d.activeMonths.length > 0);
  return `Year Lord ${v.yearLord} (${WEEKDAY_OF[v.yearLord] ?? 'its weekday'}); Muntha lord ${v.muntha.lord} (${WEEKDAY_OF[v.muntha.lord] ?? 'its weekday'}).
Doshas awake in 2027: ${awake.map((d) => `${d.label} (simple remedy: ${d.remedy})`).join('; ') || 'none'}.`;
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
        .map((id) => (id === 'MAIN' ? ANSWER_WORDS.mainDecision![f.reader.answers.mainDecision!]! : (factText.get(id) ?? '')))
        .join(' | ');
      const w = p.window;
      return `QUESTION ${i + 1} (${qIds[i]}): topic "${p.proposal.topic}". What the reader told us: ${lines}. Engine key ${p.proposal.key}: ${w.weak ? `the calmest stretch is ${windowPhrase(w.best)} (${tierToken(w.best.tier)}); NO strong window opens in 2027, so say gently that this is the steadiest stretch and that a better one lies beyond this year` : `best window ${windowPhrase(w.best)} (${tierToken(w.best.tier)})`}${w.then ? `; a second window follows: ${windowPhrase(w.then)}` : ''}.`;
    })
    .join('\n');
  const facts = `${renderCommon(f)}
${remedyFacts(f)}
PEAK MONTHS: ${monthList(f.scores.peakMonths)}. QUIETEST MONTH: ${monthName(f.scores.restMonth)}.
${reliefFacts(f)}
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
${plans.length ? `4. ${qIds.join(', ')}: each EXACTLY 3 paragraphs for its question: (a) what the reader may be going through, named gently and specifically without repeating their private words back too bluntly; (b) when it eases: write the sentence as you like but put the exact text {window} where the dated window belongs (it expands to words like "between 12 March and 4 April", so write "it eases {window}", never "during {window}"), and {next} the same way for the second window if one is given. Never write a date yourself in this paragraph. (c) one or two practical steps that help meanwhile.
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
  const specs = [call1(facts), call2(facts), monthCall(facts, 0), monthCall(facts, 6)];
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
  if (existing.length > 4) {
    group5 = existing[4]!;
  } else {
    const proposals = await proposeQuestions(facts, proposeAsk).catch((err: unknown) => {
      logger.warn({ err }, 'varshik: choosing the reader questions failed, skipping them');
      return [] as QuestionProposal[];
    });
    const plans: QuestionPlan[] = proposals
      .map((proposal) => ({ proposal, window: facts.scores.answerWindows[proposal.key]! }))
      .filter((p) => !!p.window);
    const spec5 = call5(facts, plans);
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

