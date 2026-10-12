// =============================================================================
// Voice Call Recap
// =============================================================================
// A finished voice call is saved to Chat History as its transcript. A
// transcript of a ten-minute call is a long read, so the list also shows a few
// sentences on what the call was about. This writes them: one cheap,
// non-streaming call after the call has ended, never in the caller's way.
// =============================================================================

import { generate } from './llm/gemini-client.js';
import { CALL_RECAP_PROFILE } from '../config/llm.js';
import { logger } from './logger.js';

export interface CallTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** A call shorter than this has nothing worth summing up: the greeting and a goodbye. */
const MIN_TURNS = 2;
/**
 * The most transcript handed to the model. An hour-long call is far under
 * this; the limit only bounds the cost of a pathological one. The end of a
 * call is kept, because that is where the answers the member came for are.
 */
const MAX_TRANSCRIPT_CHARS = 60_000;
/** The list shows two or three lines; anything longer was not a recap. */
const MAX_RECAP_CHARS = 600;

const PROMPT_INSTRUCTIONS = `Below is the transcript of a voice call between a member and a Vedic astrologer. The transcript was made by speech recognition, so some words are misheard; read through that.

Write a short note for the member's own call history saying what the call was about: what they asked, and what they were told. Keep every specific date, month or period the astrologer named, exactly as said. Address the member as "you".

Rules:
- 2 or 3 short sentences, under 60 words in total.
- Write in the language the member spoke during the call, in that language's own script.
- Plain text only: no headings, no bullet points, no quotation marks around the note.
- Only what was actually said. Do not add advice, predictions or remedies of your own.
- If the call held no real conversation (only greetings, silence or noise), reply with exactly: NONE`;

/**
 * What the call was about, in a few sentences, or null when there was nothing
 * to say or the model call failed. Never throws: a call that has already ended
 * must not be affected by its recap.
 */
export async function summarizeCall(transcript: CallTurn[], userId: string): Promise<string | null> {
  if (transcript.length < MIN_TURNS || !transcript.some((t) => t.role === 'user')) return null;

  const text = transcript
    .map((t) => `${t.role === 'user' ? 'Member' : 'Astrologer'}: ${t.content}`)
    .join('\n')
    .slice(-MAX_TRANSCRIPT_CHARS);

  try {
    const raw = await generate({
      profile: CALL_RECAP_PROFILE,
      messages: [{ role: 'user', content: `${PROMPT_INSTRUCTIONS}\n\nTranscript:\n${text}` }],
      userId,
    });
    const recap = raw.trim();
    if (!recap || recap.toUpperCase() === 'NONE') return null;
    return recap.slice(0, MAX_RECAP_CHARS);
  } catch (err) {
    logger.warn({ err }, 'voice call recap failed — the call is saved without one');
    return null;
  }
}
