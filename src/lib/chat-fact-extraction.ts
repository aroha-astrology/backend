// =============================================================================
// Per-Turn Fact Extraction
// =============================================================================
// Extracts durable personal facts (relationships, occupation, life events,
// health concerns, goals) from a single chat exchange — runs after every
// turn, unlike chat-compaction.ts's summary folding which only kicks in once
// a conversation gets long. Facts are worth capturing from a user's very
// first message, so this has no turn-count gate.
// =============================================================================

import { generate } from './llm/gemini-client.js';
import { FACT_EXTRACTION_PROFILE } from '../config/llm.js';
import { logger } from './logger.js';
import type { UserFact, NewUserFact } from '../modules/astro/user-facts.repo.js';

const PROMPT_INSTRUCTIONS = `You are extracting durable, personally-significant facts from a single exchange between a user and a Vedic astrology AI assistant.

Extract facts worth remembering across future conversations — relationships, occupation, life events, health concerns, goals. Never include astrological conclusions, transient questions, or anything already derivable from the birth chart. Return an empty array if nothing durable was shared.

Each fact is an object {"fact": string, "followUpQuestion": string | null}. Only set followUpQuestion when the fact is naturally incomplete AND there is one obvious, non-intrusive next detail worth knowing later — for example "planning to conceive after starting a new job" naturally invites "Did the new job start yet?", and "is married" naturally invites "When did they get married?". Leave followUpQuestion null for facts that are already complete on their own or where any follow-up would feel intrusive or speculative.`;

/**
 * Extracts new durable facts from one chat exchange, given what's already
 * known about the user so the model doesn't re-extract near-duplicates
 * (e.g. a second "is married" fact worded slightly differently).
 */
export async function extractTurnFacts(
  userMessage: string,
  assistantReply: string,
  existingFacts: UserFact[],
  userId: string,
): Promise<NewUserFact[]> {
  const knownFactsBlock =
    existingFacts.length > 0
      ? `Facts already known about this user — do not repeat these or extract a near-duplicate restating the same thing:\n${existingFacts.map((f) => `- ${f.fact}`).join('\n')}\n\n`
      : '';

  const prompt = `${PROMPT_INSTRUCTIONS}

${knownFactsBlock}Exchange:
User: ${userMessage}
Assistant: ${assistantReply}

Respond with ONLY a JSON object of the exact shape {"facts": {"fact": string, "followUpQuestion": string | null}[]} — no markdown fences, no other text.`;

  try {
    const raw = await generate({
      profile: FACT_EXTRACTION_PROFILE,
      messages: [{ role: 'user', content: prompt }],
      userId,
    });
    return parseFacts(raw);
  } catch (err) {
    logger.warn({ err }, 'per-turn fact extraction failed — skipping this turn');
    return [];
  }
}

function parseFacts(raw: string): NewUserFact[] {
  try {
    const obj = JSON.parse(raw) as { facts?: unknown };
    if (!Array.isArray(obj.facts)) return [];
    return obj.facts.map(parseFact).filter(isNewUserFact);
  } catch {
    return [];
  }
}

function parseFact(item: unknown): NewUserFact | null {
  if (typeof item !== 'object' || item === null) return null;
  const { fact, followUpQuestion } = item as { fact?: unknown; followUpQuestion?: unknown };
  if (typeof fact !== 'string') return null;
  return {
    fact,
    followUpQuestion: typeof followUpQuestion === 'string' ? followUpQuestion : null,
  };
}

function isNewUserFact(f: NewUserFact | null): f is NewUserFact {
  return f !== null;
}
