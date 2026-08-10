// =============================================================================
// Chain-of-verification for paid report narratives
// =============================================================================
// Everything else in the reports pipeline verifies NUMBERS: name-change checks
// the LLM's digits against the deterministic Chaldean calculation, baby-name
// pins the candidate list. Nothing checked the ASTROLOGICAL claims — a sentence
// like "Saturn in your 7th brings delays in marriage" was accepted verbatim
// whether or not Saturn was anywhere near the 7th.
//
// This is the standard second-pass mitigation: the model that wrote the prose
// is asked, separately and with no stake in the answer, whether each concrete
// claim is supported by the fact list. Unsupported sentences are DROPPED, never
// silently rewritten — a rewrite would be a second generation and could invent
// its own claims. Dropping is the only edit that cannot make things worse.
//
// Deliberately conservative: only sentences naming a planet AND a house/sign are
// checked. General guidance ("this is a period for patience") is unfalsifiable
// against a fact list and is always kept, because flagging it would delete the
// readable half of the report.
// =============================================================================

import { generate } from '../gemini-client.js';
import { REPORT_PROFILE } from '../../../config/llm.js';
import { cleanJsonString } from '../horoscope.js';
import { logger } from '../../logger.js';
import type { ReportSection } from '../../../modules/reports/report-generator.types.js';

const PLANETS = /\b(Sun|Moon|Mars|Mercury|Jupiter|Venus|Saturn|Rahu|Ketu|Lagna|Ascendant)\b/i;
const PLACEMENT =
  /\b(house|sign|Aries|Taurus|Gemini|Cancer|Leo|Virgo|Libra|Scorpio|Sagittarius|Capricorn|Aquarius|Pisces|nakshatra|dasha|retrograde|combust|exalt|debilitat)\b/i;

/**
 * True when a sentence makes a concrete, checkable astrological claim — it
 * names a body AND says something structural about it. Everything else is
 * advice or tone, which no fact list can adjudicate.
 */
export function isCheckableClaim(sentence: string): boolean {
  return PLANETS.test(sentence) && PLACEMENT.test(sentence);
}

/** Splits a paragraph into sentences, keeping their terminators. */
export function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    unsupported: {
      type: 'array',
      description: 'Indices of claims NOT supported by the given facts.',
      items: { type: 'integer' },
    },
  },
  required: ['unsupported'],
} as const;

function systemPrompt(): string {
  return [
    'You are a fact checker, not an astrologer and not an editor.',
    'You are given a numbered list of CLAIMS and a list of FACTS.',
    'For each claim, decide only this: is it supported by, or consistent with, the given facts?',
    'A claim is SUPPORTED if the facts state it, imply it, or are simply consistent with it.',
    'A claim is UNSUPPORTED only if the facts CONTRADICT it, or if it asserts a specific placement, dignity or dasha that appears nowhere in the facts.',
    'Be conservative: when in doubt, treat the claim as supported. Deleting good writing is worse than keeping a vague line.',
    'Never rewrite anything. Return ONLY the indices of unsupported claims as JSON: {"unsupported":[...]}.',
  ].join(' ');
}

/**
 * Drops narrative sentences that contradict the report's own facts.
 *
 * One extra LLM call per report, batching every checkable claim in the whole
 * narrative. Fails OPEN in every failure mode — an unparseable response, a
 * thrown call, or a suspiciously large flag set all return the sections
 * untouched. A verification pass must never be able to gut a report the user
 * has paid for.
 */
export async function verifyReportClaims(
  sections: ReportSection[],
  facts: string[],
): Promise<{ sections: ReportSection[]; dropped: number }> {
  if (facts.length === 0) return { sections, dropped: 0 };

  // Collect every checkable sentence with its address in the section tree.
  const claims: { section: number; paragraph: number; sentence: number; text: string }[] = [];
  sections.forEach((sec, si) => {
    sec.paragraphs.forEach((para, pi) => {
      splitSentences(para).forEach((sentence, ni) => {
        if (isCheckableClaim(sentence)) {
          claims.push({ section: si, paragraph: pi, sentence: ni, text: sentence });
        }
      });
    });
  });

  if (claims.length === 0) return { sections, dropped: 0 };

  let unsupported: number[];
  try {
    const raw = await generate({
      profile: REPORT_PROFILE,
      responseSchema: VERIFY_SCHEMA,
      messages: [
        { role: 'system', content: systemPrompt() },
        {
          role: 'system',
          content: `FACTS:\n${facts.join('\n')}\n\nCLAIMS:\n${claims
            .map((c, i) => `${i}. ${c.text}`)
            .join('\n')}`,
        },
        { role: 'user', content: 'Which claims are unsupported?' },
      ],
    });
    const parsed = JSON.parse(cleanJsonString(raw)) as { unsupported?: unknown };
    unsupported = Array.isArray(parsed.unsupported)
      ? parsed.unsupported.filter((n): n is number => Number.isInteger(n))
      : [];
  } catch (err) {
    logger.warn({ err }, 'report claim verification failed, keeping narrative as written');
    return { sections, dropped: 0 };
  }

  if (unsupported.length === 0) return { sections, dropped: 0 };

  // A verifier flagging most of the report is a broken verifier, not a broken
  // report. Refuse to act on it rather than hand the user a gutted narrative.
  if (unsupported.length > claims.length / 2) {
    logger.warn(
      { flagged: unsupported.length, total: claims.length },
      'report claim verification flagged more than half the claims; ignoring the whole pass',
    );
    return { sections, dropped: 0 };
  }

  const drop = new Set(unsupported.map((i) => claims[i]).filter(Boolean));
  const dropKeys = new Set([...drop].map((c) => `${c!.section}:${c!.paragraph}:${c!.sentence}`));

  const cleaned = sections.map((sec, si) => ({
    ...sec,
    paragraphs: sec.paragraphs
      .map((para, pi) =>
        splitSentences(para)
          .filter((_, ni) => !dropKeys.has(`${si}:${pi}:${ni}`))
          .join(' ')
          .trim(),
      )
      // A paragraph emptied entirely by the filter is removed rather than left
      // as a blank block in the rendered report.
      .filter((para) => para.length > 0),
  }));

  logger.info({ dropped: dropKeys.size, total: claims.length }, 'report claim verification');
  return { sections: cleaned, dropped: dropKeys.size };
}
