// =============================================================================
// LLM Dispatcher
// Routes requests to Groq (primary) or NIM (safety-net fallback) — NIM only
// kicks in once Groq is genuinely exhausted/erroring, never for normal
// traffic. Re-enabled after Groq showed real quota exhaustion in production
// (Retry-After values of 20-30+ minutes) with no fallback to absorb it.
// =============================================================================

import { type LLMRequestOptions } from '../../config/llm.js';
import * as groqClient from './groq-client.js';
import * as nimClient from './nim-client.js';
import { logger } from '../logger.js';

/**
 * Buffered generation with provider routing.
 * EVERYTHING → Groq primary, NIM fallback.
 */
export async function generate(opts: LLMRequestOptions): Promise<string> {
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
 * EVERYTHING → Groq primary, NIM fallback.
 */
export async function* stream(opts: LLMRequestOptions): AsyncGenerator<string, void, unknown> {
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
