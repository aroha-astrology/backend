// =============================================================================
// LLM Dispatcher
// Groq only. NIM support is disabled (commented out) app-wide — see the
// commented-out import/fallback branches below to re-enable it later.
// =============================================================================

import { type LLMRequestOptions } from '../../config/llm.js';
import * as groqClient from './groq-client.js';
// import * as nimClient from './nim-client.js';
import { logger } from '../logger.js';

/**
 * Buffered generation — Groq only.
 */
export async function generate(opts: LLMRequestOptions): Promise<string> {
  return groqClient.generate(opts);
  // Previously: fell back to NIM when Groq was exhausted/erroring.
  // try {
  //   return await groqClient.generate(opts);
  // } catch (err) {
  //   if (err instanceof groqClient.AllGroqKeysExhaustedError) {
  //     logger.warn({ err, profile: opts.profile.name }, 'Groq exhausted — falling back to NIM');
  //   } else {
  //     logger.error(
  //       { err, profile: opts.profile.name },
  //       'Groq unexpected error — falling back to NIM',
  //     );
  //   }
  //   return await nimClient.generate(opts);
  // }
}

/**
 * Streaming generation — Groq only.
 */
export async function* stream(opts: LLMRequestOptions): AsyncGenerator<string, void, unknown> {
  yield* groqClient.stream(opts);
  // Previously: fell back to NIM when Groq was exhausted/erroring.
  // try {
  //   yield* groqClient.stream(opts);
  //   return;
  // } catch (err) {
  //   if (err instanceof groqClient.AllGroqKeysExhaustedError) {
  //     logger.warn(
  //       { err, profile: opts.profile.name },
  //       'Groq exhausted (streaming) — falling back to NIM',
  //     );
  //   } else {
  //     logger.error(
  //       { err, profile: opts.profile.name },
  //       'Groq unexpected error (streaming) — falling back to NIM',
  //     );
  //   }
  // }
  // yield* nimClient.stream(opts);
}
