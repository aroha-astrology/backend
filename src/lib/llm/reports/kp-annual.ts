// =============================================================================
// KP Year Ahead report — LLM narrative
// =============================================================================
// Up to 4 bounded calls, run in parallel and checkpointed (same resumable idiom
// as marriage/numerology — see SectionGenerationProgress):
//
//   call 1  year_at_a_glance · kp_blueprint · dasha_story · transit_triggers
//   call 2  career_money · love_family · health_wellbeing · home_travel_learning
//   call 3  month_by_month (exactly 12 paragraphs) · guidance_remedies · closing_note
//   call 4  your_questions — only when the reader asked something; one paragraph
//           per question, in the order asked. Always LAST so the id list is
//           append-only (see config/report-sections.ts).
//
// Every judgement arrives as a GIVEN fact from astro-engine/reports/kp-annual.ts;
// the model only explains it. No score or number is ever produced — the facts
// carry plain-word tones and the shared <report_facts> guard forbids numbers.
//
// Death and self-harm: questions were screened at purchase, the prompt repeats
// the rule, and every paragraph the model returns is passed through the
// content-policy output filter — a tripped sentence is dropped, never shown.
// =============================================================================

import { generate } from '../gemini-client.js';
import { REPORT_PROFILE, REPORT_TRANSLATION_PROFILE } from '../../../config/llm.js';
import { cleanJsonString } from '../horoscope.js';
import { classifyAssistantOutput } from '../../content-policy.js';
import { reportFactsMessage } from './report-facts-message.js';
import {
  monthLabel,
  type KpAnnualScores,
  type KpAreaYear,
  type KpMonth,
} from '../../astro-engine/reports/kp-annual.js';
import type {
  ReportSection,
  SectionGenerationProgress,
} from '../../../modules/reports/report-generator.types.js';

const AREA_LABEL: Record<string, string> = {
  career: 'Career & work',
  money: 'Money & gains',
  love: 'Love & marriage',
  health: 'Health & energy',
  home: 'Home, property & vehicles',
  travel: 'Travel & foreign links',
  learning: 'Learning, exams & higher studies',
  family: 'Family & children',
  general: 'Wishes & overall direction',
};

const HOUSE_MEANING: Record<number, string> = {
  1: 'self, body and vitality',
  2: 'family, savings and speech',
  3: 'courage, short trips, siblings and communication',
  4: 'home, mother, property, vehicles and basic education',
  5: 'children, romance, creativity and recovery',
  6: 'service, daily work, competition, loans and minor ailments',
  7: 'marriage, partnerships and clients',
  8: 'sudden changes, obstacles and hidden matters',
  9: 'fortune, father, higher learning and long journeys',
  10: 'career, status and profession',
  11: 'gains, wishes fulfilled, friends and elder siblings',
  12: 'expenses, foreign lands, rest and letting go',
};

const VOICE_RULE = `VOICE — this is what makes the report worth paying for:
- Write like a warm, wise family astrologer sitting with the reader over chai — kind, specific and honest, never dramatic or fear-based.
- Make it RELATABLE: tie each point to real everyday life in India — an appraisal cycle, a job switch, a family function, an EMI, a festival season, a wedding in the family, exam results, a house-hunting weekend, a long-pending conversation with a parent. Pick examples that fit the facts; never invent a fact about the reader's life.
- Always name the actual months ("from November to January") using the month labels given — the reader wants to know WHEN.
- Second person ("you"), short sentences, one idea per sentence. Each paragraph 2-4 sentences.
- Tendency language ("this favours", "expect", "a good window to"), never guarantees.
- Never state or invent a score, percentage, rating or number of any kind other than calendar months and years.
- KP words (sub lord, star lord, cusp, dasha, bhukti) may appear, but EVERY time explain in the same sentence what it means in plain words.`;

const SAFETY_RULE = `SAFETY — absolute, overrides everything:
- Never mention, predict, hint at or discuss death, lifespan, longevity, maraka, accidents that end life, terminal illness, suicide or self-harm — for the reader or anyone else. The 8th house means only "sudden changes, obstacles and hidden matters" here.
- Health: speak only about energy, rest, routine, stress, check-ups and recovery. Never name a disease, never predict a diagnosis, never replace a doctor.
- Money: general behavioural guidance only — never recommend specific investments, stocks, crypto, loans or products.
- Never tell the reader a question is illegal.`;

const GROUNDING_RULE =
  'Every KP judgement below — each life area\'s promise (strong / steady / slow), each month\'s tone (peak / active / quiet), the running dasha lords, the best windows, the transits and the Ruling Planets — is a GIVEN FACT from a deterministic KP engine. Explain them; never recompute, upgrade or contradict them. A "slow" promise is not a "no": it means the matter builds with patience and effort. A "quiet" month is a time to consolidate, not a bad month.';

const JSON_SHAPE =
  'Return STRICT JSON only, no markdown fences: {"sections": [{"heading": string, "hook": string, "paragraphs": string[]}]}. `hook` is ONE short, striking sentence that sums the section up (under 16 words).';

function base(): string {
  return `You are writing a paid "KP Year Ahead" report for a mobile astrology app. It reads the reader's next 12 months using Krishnamurti Paddhati (KP): the sub lord of each house cusp shows what the chart PROMISES, the running dasha, bhukti and antara lords show WHEN it opens up, and the slow planets' transits confirm the timing.

${GROUNDING_RULE}
${VOICE_RULE}
${SAFETY_RULE}
${JSON_SHAPE}`;
}

function call1Prompt(): string {
  return `${base()}

Write EXACTLY 4 sections, in this order:
1. Heading close to "Your Year At A Glance" — 2 paragraphs. The big picture of these 12 months: which life areas carry the strongest promise, which months stand out, and the one theme that ties the year together. End on something the reader can feel good about.
2. Heading close to "Your KP Blueprint" — 2 paragraphs. Explain simply that in KP the sub lord of a house cusp decides whether that area delivers, then walk through what the given promises say (strong, steady, slow areas). If any cusp is flagged as sensitive to birth time, mention gently that the reading of that area depends on the birth time being accurate.
3. Heading close to "The Planetary Period You Are In" — 2 paragraphs. The running dasha, bhukti and antara lords at the start of the year, what they mean for daily life, and each bhukti change that falls inside the year (with its month) as a turning point.
4. Heading close to "Big Transits This Year" — 1-2 paragraphs. Jupiter, Saturn, Rahu and Ketu through the year — which areas of life (by natal house meaning) they are moving through and which months they change gear.`;
}

function call2Prompt(): string {
  return `${base()}

Write EXACTLY 4 sections, in this order. For each, use the given promise, peak/active months and best window for that area; if an area has no peak month, say plainly it is a steady-build year for it and give the most active months instead.
1. Heading close to "Career & Money" — 2-3 paragraphs covering the career and money areas: when to push for growth, a switch or a raise, when to consolidate, and one practical money habit that suits the year.
2. Heading close to "Love, Marriage & Family" — 2 paragraphs covering the love and family areas: the warmest months for relationships, marriage talks or family plans, and how to handle the quieter stretches.
3. Heading close to "Health & Energy" — 1-2 paragraphs covering the health area and any months flagged "rest": when energy runs high, when to slow down, and simple routines (sleep, walks, check-ups). Follow the SAFETY rule strictly.
4. Heading close to "Home, Travel & Learning" — 2 paragraphs covering the home, travel and learning areas: property or vehicle plans, trips or foreign links, exams and courses.`;
}

function call3Prompt(): string {
  return `${base()}

Write EXACTLY 3 sections, in this order:
1. Heading close to "Month By Month" — EXACTLY 12 paragraphs, one per report month, in order. Start each paragraph with the month's label followed by a colon (e.g. "Oct 2026:"). Use that month's focus area, its peak/active areas, its running lords and any "spending" or "rest" flag. 2-3 sentences each, each one a concrete, doable nudge for that month.
2. Heading close to "Simple Remedies & Rituals" — 2 paragraphs of gentle, inexpensive KP-style remedies tied to the Ruling Planets and the running bhukti lord: the weekday to honour, a simple prayer or mantra, a colour, an act of charity or service. Never costly rituals, never fear.
3. Heading close to "A Note For Your Year" — 1 paragraph: a warm, encouraging close that reminds the reader their choices and effort shape how this year's promises land.`;
}

function call4Prompt(count: number): string {
  return `${base()}

The reader asked ${count} question${count === 1 ? '' : 's'} when ordering this report. Write EXACTLY 1 section with heading close to "Answers To Your Questions" and EXACTLY ${count} paragraph${count === 1 ? '' : 's'} — one per question, in the order asked. Each paragraph 3-5 sentences: begin with a direct, honest answer in one sentence (using the given promise), then the WHEN (best window and peak months by name), then one practical step. Do not repeat the question text. If a question asks for something astrology cannot responsibly answer (a guaranteed outcome, another person's private choices), say kindly what the chart CAN show and answer that.`;
}

function ordinal(n: number): string {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}

function monthLabels(scores: KpAnnualScores): string[] {
  return scores.months.map((m) => monthLabel(m.mid));
}

function monthsText(ixs: number[], labels: string[]): string {
  return ixs.length ? ixs.map((i) => labels[i]).join(', ') : 'none';
}

/** Report months start on the purchase day, so each window end is named by the month holding
 * most of its days — the same midpoint naming the month list uses. */
function shiftDays(isoDate: string, days: number): string {
  return new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function windowText(w: KpAreaYear['bestWindow']): string {
  return w
    ? `${monthLabel(shiftDays(w.start, 15))} to ${monthLabel(shiftDays(w.end, -15))} (lords: ${w.lords.join(', ')})`
    : 'none';
}

function areaLine(a: KpAreaYear, labels: string[]): string {
  const houses = a.houses.map((h) => `${h} (${HOUSE_MEANING[h]})`).join(', ');
  return `${AREA_LABEL[a.key]}: promise ${a.promise.toUpperCase()} — ${ordinal(a.principalCusp)} cusp sub lord ${a.cuspSubLord} (in the star of ${a.cuspSubLordStar}) signifies houses ${a.cuspSubLordSignifies.join(', ') || 'none'}; needed houses ${houses}${a.cuspNearBoundary ? '; cusp is near a sub boundary (birth-time sensitive)' : ''}. Peak months: ${monthsText(a.peakMonths, labels)}. Active months: ${monthsText(a.activeMonths, labels)}. Best window: ${windowText(a.bestWindow)}.`;
}

function monthLine(m: KpMonth, label: string): string {
  const peak = Object.entries(m.tones)
    .filter(([, t]) => t === 'peak')
    .map(([k]) => AREA_LABEL[k]);
  const active = Object.entries(m.tones)
    .filter(([, t]) => t === 'active')
    .map(([k]) => AREA_LABEL[k]);
  return `${label} (${m.start} to ${m.end}): dasha ${m.dasha.md} / bhukti ${m.dasha.ad} / antara ${m.dasha.pd}; focus ${AREA_LABEL[m.focus]}; peak: ${peak.join(', ') || 'none'}; active: ${active.join(', ') || 'none'}${m.care ? `; flag: ${m.care === 'spending' ? 'spending — keep expenses in check' : 'rest — pace yourself'}` : ''}.`;
}

export function buildKpFacts(scores: KpAnnualScores): string {
  const labels = monthLabels(scores);
  const lines: string[] = [];
  lines.push(
    `Report window: ${monthLabel(scores.window.start)} to ${monthLabel(scores.window.end)} (${scores.window.start} to ${scores.window.end}). KP ayanamsa, ${scores.engine.houseSystem} houses${scores.engine.highLatitude ? ' (equal houses used: Placidus is unreliable at this latitude)' : ''}.`,
  );
  lines.push(
    `Ascendant: ${scores.ascendant.sign}, star ${scores.ascendant.nakshatra} (star lord ${scores.ascendant.starLord}, sub lord ${scores.ascendant.subLord}). Moon: ${scores.moon.sign}, ${scores.moon.nakshatra} (star lord ${scores.moon.starLord}, sub lord ${scores.moon.subLord}).`,
  );
  if (scores.sensitiveCusps.length) {
    lines.push(
      `Birth-time sensitive cusps (sub lord could change with a few minutes' difference): ${scores.sensitiveCusps.join(', ')}.`,
    );
  }
  lines.push('LIFE AREAS:');
  for (const a of scores.areas) lines.push(`- ${areaLine(a, labels)}`);
  if (scores.dashaNow) {
    lines.push(
      `Running at the start: dasha ${scores.dashaNow.md}, bhukti ${scores.dashaNow.ad} (until ${scores.dashaNow.adEnds}), antara ${scores.dashaNow.pd}.`,
    );
  }
  lines.push(
    scores.dashaShifts.length
      ? `Bhukti changes inside the year: ${scores.dashaShifts.map((s) => `${s.date} → ${s.md}/${s.ad}`).join('; ')}.`
      : 'No bhukti change inside the year — one steady chapter.',
  );
  lines.push(
    `Planet significations (houses each planet can deliver): ${scores.planets.map((p) => `${p.planet} ${p.signifies.join('/') || '-'}`).join('; ')}.`,
  );
  lines.push(
    `Ruling Planets at the start of the year: ${scores.rulingPlanets.map((r) => `${r.planet} (${r.role.toLowerCase().replace(/_/g, ' ')})`).join(', ')}.`,
  );
  lines.push('MONTHS:');
  scores.months.forEach((m, i) => lines.push(`- ${monthLine(m, labels[i]!)}`));
  lines.push('SLOW TRANSITS (month: planet sign/star → natal house):');
  scores.months.forEach((m, i) =>
    lines.push(
      `- ${labels[i]}: ${m.transits.map((t) => `${t.planet} in ${t.sign}/${t.nakshatra} (star lord ${t.starLord}, sub lord ${t.subLord}) → house ${t.natalHouse}${t.retrograde ? ' retrograde' : ''}`).join('; ')}`,
    ),
  );
  return lines.join('\n');
}

function buildQuestionFacts(scores: KpAnnualScores): string {
  const labels = monthLabels(scores);
  return scores.questions
    .map(
      (q, i) =>
        `Question ${i + 1}: "${q.question}"\n  Topic: ${AREA_LABEL[q.topic]}. Judged from the ${ordinal(q.principalCusp)} cusp sub lord ${q.cuspSubLord}, which signifies houses ${q.cuspSubLordSignifies.join(', ') || 'none'} (needed: ${q.houses.join(', ')}). Promise: ${q.promise.toUpperCase()}. Peak months: ${monthsText(q.peakMonths, labels)}. Active months: ${monthsText(q.activeMonths, labels)}. Best window: ${windowText(q.bestWindow)}.`,
    )
    .join('\n');
}

const SECTIONS_SCHEMA = {
  type: 'object',
  properties: {
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          hook: { type: 'string' },
          paragraphs: { type: 'array', items: { type: 'string' } },
        },
        required: ['heading', 'paragraphs'],
      },
    },
  },
  required: ['sections'],
} as const;

/** Drops any sentence the content-policy output filter blocks. */
export function scrubPolicy(text: string): string {
  if (!classifyAssistantOutput(text).blocked) return text;
  return text
    .split(/(?<=[.!?।])\s+/)
    .filter((s) => !classifyAssistantOutput(s).blocked)
    .join(' ')
    .trim();
}

export function parseKpSections(raw: string): ReportSection[] | null {
  try {
    const data = JSON.parse(cleanJsonString(raw)) as { sections?: unknown };
    if (!Array.isArray(data.sections) || data.sections.length === 0) return null;
    const out: ReportSection[] = [];
    for (const entry of data.sections) {
      const e = entry as { heading?: unknown; hook?: unknown; paragraphs?: unknown };
      if (typeof e.heading !== 'string' || !e.heading.trim() || !Array.isArray(e.paragraphs)) {
        return null;
      }
      const paragraphs = e.paragraphs
        .filter((p): p is string => typeof p === 'string')
        .map((p) => scrubPolicy(p.trim()))
        .filter((p) => p.length > 0);
      if (paragraphs.length === 0) return null;
      const hook = typeof e.hook === 'string' && e.hook.trim() ? scrubPolicy(e.hook.trim()) : '';
      out.push({ heading: e.heading.trim(), ...(hook ? { hook } : {}), paragraphs });
    }
    return out;
  } catch {
    return null;
  }
}

async function runCall(
  system: string,
  facts: string,
  scores: KpAnnualScores & { planetCondition?: string[]; vakriFacts?: string[] },
  user: string,
  expectSections: number,
  expectParagraphs?: { index: number; count: number },
): Promise<ReportSection[]> {
  const raw = await generate({
    profile: REPORT_PROFILE,
    responseSchema: SECTIONS_SCHEMA,
    messages: [
      { role: 'system', content: system },
      reportFactsMessage(facts, scores.planetCondition, scores.vakriFacts),
      { role: 'user', content: user },
    ],
  });
  const parsed = parseKpSections(raw);
  if (!parsed || parsed.length !== expectSections) {
    throw new Error(
      `kp_annual narrative returned ${parsed ? `${parsed.length} sections` : 'unparseable JSON'} (expected ${expectSections})`,
    );
  }
  if (expectParagraphs) {
    const got = parsed[expectParagraphs.index]!.paragraphs.length;
    if (got !== expectParagraphs.count) {
      throw new Error(
        `kp_annual section ${expectParagraphs.index} returned ${got} paragraphs (expected ${expectParagraphs.count})`,
      );
    }
  }
  return parsed;
}

export async function generateKpAnnualNarrative(
  scores: KpAnnualScores & { planetCondition?: string[]; vakriFacts?: string[] },
  progress?: SectionGenerationProgress,
): Promise<ReportSection[]> {
  if (!scores.months || scores.months.length !== 12) {
    throw new Error('kp_annual: KP chart could not be computed (missing birth place or chart)');
  }
  const facts = buildKpFacts(scores);
  const existing = progress?.existingGroups ?? [];
  const calls: Array<() => Promise<ReportSection[]>> = [
    () => runCall(call1Prompt(), facts, scores, 'Write the first four sections.', 4),
    () => runCall(call2Prompt(), facts, scores, 'Write the life-area sections.', 4),
    () =>
      runCall(call3Prompt(), facts, scores, 'Write the month-by-month and closing sections.', 3, {
        index: 0,
        count: 12,
      }),
  ];
  if (scores.questions.length > 0) {
    const qFacts = `${facts}\nREADER'S QUESTIONS:\n${buildQuestionFacts(scores)}`;
    calls.push(() =>
      runCall(
        call4Prompt(scores.questions.length),
        qFacts,
        scores,
        "Answer the reader's questions.",
        1,
        { index: 0, count: scores.questions.length },
      ),
    );
  }
  // Parallel, with checkpoints: existingGroups[i] is the i-th group a previous attempt saved,
  // so only a contiguous prefix of successes is persisted — a later group saved past a gap
  // would be spliced back in at the wrong position on the next retry.
  const results = await Promise.allSettled(
    calls.map((call, i) => (i < existing.length ? Promise.resolve(existing[i]!) : call())),
  );
  const groups: ReportSection[][] = [];
  let failure: Error | null = null;
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    if (r.status === 'rejected') {
      failure ??= r.reason instanceof Error ? r.reason : new Error(String(r.reason));
      continue;
    }
    if (failure) continue;
    groups.push(r.value);
    if (i >= existing.length) await progress?.onGroupComplete(r.value);
  }
  if (failure) throw failure;
  return groups.flat();
}

export async function translateKpAnnualNarrative(
  sections: ReportSection[],
  targetLanguage: string,
): Promise<ReportSection[]> {
  // Same split as generation, so the 12-paragraph month section never shares a call.
  const groups = [
    sections.slice(0, 4),
    sections.slice(4, 8),
    sections.slice(8, 11),
    sections.slice(11),
  ];
  const translated = await Promise.all(
    groups.map(async (group) => {
      if (group.length === 0) return [];
      const raw = await generate({
        profile: REPORT_TRANSLATION_PROFILE,
        responseSchema: SECTIONS_SCHEMA,
        messages: [
          {
            role: 'user',
            content: `Translate the following report sections into the language "${targetLanguage}". Keep the exact same JSON structure ({"sections": [{"heading": string, "hook": string, "paragraphs": string[]}]}), the same number of sections and the same number of paragraphs in each. ONLY translate the human-readable text; keep planet names recognisable and keep month names as months.\n\nOriginal Content:\n${JSON.stringify({ sections: group }, null, 2)}`,
          },
        ],
      });
      const parsed = parseKpSections(raw);
      if (!parsed || parsed.length !== group.length) {
        throw new Error(
          `kp_annual translation returned unparseable JSON (target=${targetLanguage})`,
        );
      }
      return parsed.map((s, i) => ({ ...s, ...(group[i]!.id ? { id: group[i]!.id } : {}) }));
    }),
  );
  return translated.flat();
}
