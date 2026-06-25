/**
 * Fallback for the LLM synthesis step.
 *
 * /api/tarot calls the LLM only for `summary[3]` and `overall_message`.
 * When that call fails, returns malformed JSON, or fails the output policy
 * check, the route swaps in the deterministic summary/overall built by
 * `buildDeterministicReading()` (in `interpret.ts`).
 *
 * This module exists as a separate file so the API route can import the
 * fallback path independently of the primary path.
 */

import type { DeterministicReading } from './interpret';

export interface SynthesisFallback {
  summary: [string, string, string];
  overall_message: string;
}

export function buildSynthesisFallback(reading: DeterministicReading): SynthesisFallback {
  return {
    summary: reading.summary,
    overall_message: reading.overall_message,
  };
}
