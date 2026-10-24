// =============================================================================
// Oxion — an OpenAI-compatible gateway (https://oxionai.com/v1)
// =============================================================================
// One key, many models (Gemini, GPT, Claude, Kimi ...). Palmistry can run on it instead of the
// Google keys: Admin -> Features -> "Palm — vision model" / "Palm — interpretation model" lists
// the "oxion:<model>" ids next to the Gemini ones. No key = Oxion is off: a pick falls back to the
// Gemini default instead of failing (see palm-llm.ts and palm.service.ts).
//
// A plain HTTP client with no retries of its own (a vision call takes 6-20 s, and the caller
// already has a fallback), and no key in any log line or error message.
// =============================================================================

import { env } from '../../config/env.js';
import type { ChatMessage } from '../../config/llm.js';
import { logger } from '../logger.js';
import { insertAiUsage } from '../../modules/admin/ai-usage.repo.js';
import { isOxionModel, oxionModelId } from '../../config/oxion-models.js';

export { isOxionModel } from '../../config/oxion-models.js';

const DEFAULT_BASE_URL = 'https://oxionai.com/v1';
const DEFAULT_TIMEOUT_MS = 240_000;

function oxionKey(): string | undefined {
  // The owner pasted the key into backend/.env as `oxionai`; OXION_API_KEY is the proper name.
  const raw = process.env.OXION_API_KEY ?? process.env.oxionai;
  const key = raw?.trim().replace(/^"|"$/g, '');
  return key || undefined;
}

function oxionBaseUrl(): string {
  const raw =
    (env as unknown as Record<string, unknown>).OXION_BASE_URL ?? process.env.OXION_BASE_URL;
  return (typeof raw === 'string' && raw ? raw : DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/** Whether Oxion can be called at all (the key is set on this server). */
export function oxionConfigured(): boolean {
  return Boolean(oxionKey());
}

export type OxionFailure = 'not_configured' | 'timeout' | 'http' | 'empty';

export class OxionError extends Error {
  constructor(
    public readonly kind: OxionFailure,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'OxionError';
  }
}

export interface OxionChat {
  /** "oxion:claude-sonnet-5" (or the bare id). */
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  /** Completion ceiling. Thinking models spend part of it reasoning, so size it with headroom. */
  maxTokens: number;
  /** Ask for a JSON object (response_format json_object). */
  json?: boolean;
  /** ai_usage attribution. */
  agent: string;
  userId?: string | null;
  timeoutMs?: number;
}

interface OxionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** One chat completion. Throws OxionError — the caller decides whether to fall back to Gemini. */
export async function oxionChat(req: OxionChat): Promise<{ text: string; model: string }> {
  const key = oxionKey();
  if (!key) throw new OxionError('not_configured', 'OXION_API_KEY is not set');
  const model = isOxionModel(req.model) ? oxionModelId(req.model) : req.model;
  const startedAt = Date.now();

  let res: Response;
  try {
    res = await fetch(`${oxionBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: req.messages,
        max_tokens: req.maxTokens,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(req.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut =
      err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new OxionError(
      timedOut ? 'timeout' : 'http',
      timedOut ? 'Oxion timed out' : 'Oxion request failed',
    );
  }

  const body = await res.text();
  if (!res.ok) {
    // The body can echo the request; keep only its status and a short, key-free head.
    logger.warn({ status: res.status, model, head: body.slice(0, 200) }, 'oxion: non-200');
    throw new OxionError('http', `Oxion answered ${res.status}`, res.status);
  }
  let parsed: OxionResponse;
  try {
    parsed = JSON.parse(body) as OxionResponse;
  } catch {
    throw new OxionError('empty', 'Oxion returned a non-JSON body');
  }
  const text = parsed.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new OxionError('empty', 'Oxion returned an empty answer');
  }

  void insertAiUsage({
    userId: req.userId ?? null,
    agent: req.agent,
    model: `oxion:${model}`,
    tier: 'paid',
    tokensIn: parsed.usage?.prompt_tokens ?? 0,
    tokensOut: parsed.usage?.completion_tokens ?? 0,
    durationMs: Date.now() - startedAt,
  }).catch((err: unknown) => logger.warn({ err }, 'ai_usage insert failed'));

  return { text, model: `oxion:${model}` };
}
