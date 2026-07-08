// =============================================================================
// LLM Dispatcher
// Routes requests to Groq (primary) or NIM (fallback/structured)
// based on the model tier and key availability.
// =============================================================================

import { type LLMRequestOptions } from '../../config/llm.js';
import * as groqClient from './groq-client.js';
import * as nimClient from './nim-client.js';
import { logger } from '../logger.js';

/**
 * Buffered generation with provider routing.
 * STRUCTURED → NIM always (Mixtral-8x22B)
 * CONVERSATIONAL / ROUTING → Groq primary, NIM fallback.
 */
export async function generate(opts: LLMRequestOptions): Promise<string> {
  if (opts.profile.modelTier === 'structured') {
    return await nimClient.generate(opts);
  }

  try {
    return await groqClient.generate(opts);
  } catch (err) {
    if (err instanceof groqClient.AllGroqKeysExhaustedError) {
      logger.warn({ err, profile: opts.profile.name }, 'Groq exhausted — falling back to NIM');
    } else {
      logger.error(
        { err, profile: opts.profile.name },
        'Groq unexpected error — falling back to NIM',
      );
    }
    return await nimClient.generate(opts);
  }
}

/**
 * Streaming generation with provider routing.
 * CONVERSATIONAL → Groq primary, NIM fallback.
 */
export async function* stream(opts: LLMRequestOptions): AsyncGenerator<string, void, unknown> {
  if (opts.profile.modelTier === 'structured') {
    yield* nimClient.stream(opts);
    return;
  }

  try {
    yield* groqClient.stream(opts);
    return;
  } catch (err) {
    if (err instanceof groqClient.AllGroqKeysExhaustedError) {
      logger.warn(
        { err, profile: opts.profile.name },
        'Groq exhausted (streaming) — falling back to NIM',
      );
    } else {
      logger.error(
        { err, profile: opts.profile.name },
        'Groq unexpected error (streaming) — falling back to NIM',
      );
    }
    // Fallback
  }
  yield* nimClient.stream(opts);
}
