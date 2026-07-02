// =============================================================================
// Chat History Compaction
// =============================================================================
// The chat endpoint is stateless per request — the client carries the
// conversation forward. Left unbounded, that history grows every turn and
// gets re-sent (and re-read by the LLM) in full, which both slows generation
// (timeout risk) and makes the model more likely to lose track of what it
// already knows or asked ("lost in the middle"). Once history passes a
// threshold, fold everything except the most recent turns into a short
// running summary via one cheap non-streaming call, so the prompt handed to
// the chat model stays a small, bounded size no matter how long the
// conversation runs.
// =============================================================================

import { generate } from './llm/nim-client.js';
import { CHAT_SUMMARY_PROFILE } from '../config/llm.js';
import { logger } from './logger.js';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface CompactionResult {
  /** Turns to send verbatim this request. */
  recentHistory: ChatTurn[];
  /** Running summary covering everything before `recentHistory`. */
  summary: string;
  /** Whether `summary` changed this turn (client should persist the new value). */
  changed: boolean;
}

/** Turns always kept verbatim, most recent first-in-order. */
const KEEP_RECENT = 4;
/** Only compact once the raw history is meaningfully larger than what we'd keep anyway. */
const COMPACT_THRESHOLD = 8;

export async function compactHistory(
  history: ChatTurn[],
  incomingSummary: string | undefined,
): Promise<CompactionResult> {
  if (history.length <= COMPACT_THRESHOLD) {
    return { recentHistory: history, summary: incomingSummary ?? '', changed: false };
  }

  const toFold = history.slice(0, history.length - KEEP_RECENT);
  const recentHistory = history.slice(-KEEP_RECENT);

  const transcript = toFold
    .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
    .join('\n');

  const prompt = `You are compacting a conversation between a user and a Vedic astrology AI assistant into a short running summary for context in later turns.

Preserve: any facts the user has stated about themselves or their question (so they are never asked again), which topics have already been answered, and any clarifying questions already asked. Do not restate astrological reasoning or predictions verbatim — just note the conclusion reached. Write it as plain prose, under 120 words.

${incomingSummary ? `Existing summary:\n${incomingSummary}\n\n` : ''}New turns to fold in:
${transcript}`;

  try {
    const summary = await generate({
      profile: CHAT_SUMMARY_PROFILE,
      messages: [{ role: 'user', content: prompt }],
    });
    return { recentHistory, summary: summary.trim(), changed: true };
  } catch (err) {
    logger.warn(
      { err },
      'chat history compaction failed — passing full history through uncompacted for this turn',
    );
    // Best-effort: losing the user's context is worse than one slow/long
    // turn, so fall through with the untrimmed history rather than drop it.
    return { recentHistory: history, summary: incomingSummary ?? '', changed: false };
  }
}
