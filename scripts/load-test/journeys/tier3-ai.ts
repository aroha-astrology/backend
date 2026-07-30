import { type Journey } from '../lib/http.js';

const QUESTIONS = [
  'What does my career look like in the next year?',
  'When will I get married?',
  'What remedies should I do for Saturn?',
];

/**
 * Single AI chat turn. Deliberately not part of the ramp/plateau — the
 * per-user astro-llm limiter (20/min) makes throughput a non-question here;
 * what matters is p95 latency under a handful of concurrent Gemini calls.
 * fetch's res.text() drains the SSE stream to completion, so latency here is
 * genuinely end-to-end (time to full reply), not time-to-first-byte.
 */
export async function runTier3Journey(j: Journey, vu: number): Promise<void> {
  const question = QUESTIONS[vu % QUESTIONS.length]!;
  await j.post('/v1/chat', { message: question, locale: 'en', history: [] });
}
