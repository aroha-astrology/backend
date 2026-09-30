// =============================================================================
// Omnirush — OpenAI models through the owner's HomeSpace ask endpoint
// =============================================================================
// HomeSpace runs a sandboxed Omnirush agent CLI (GPT-6 family) on its own EC2
// and exposes it to its owner at POST /api/v1/private/ask: a prompt, an
// optional system prompt, an optional single image, an optional JSON schema,
// and a model id ("gpt-6-astra", optionally with ":low" etc. for effort). The
// answer comes back as `{ answer, model, seconds }` — `answer` is already
// parsed JSON when a schema was sent.
//
// Everything here is a plain HTTP client: no retries of its own (a run takes
// 40-120 s, so a blind retry doubles an already long wait — callers fall back
// to Gemini instead), and no token accounting (the endpoint reports none;
// calls are paid from Omnirush's grant, so ai_usage records them as 'free').
// =============================================================================

import { env } from '../../config/env.js';
import { logger } from '../logger.js';
import { insertAiUsage } from '../../modules/admin/ai-usage.repo.js';

export { isOmnirushModel } from '../../config/omnirush-models.js';

/** Whether Omnirush can be called at all (the token is set on this server). */
export function omnirushConfigured(): boolean {
  return Boolean(env.OMNIRUSH_ASK_TOKEN);
}

export type OmnirushFailure =
  | 'not_configured'
  | 'busy'
  | 'timeout'
  | 'unavailable'
  | 'bad_answer'
  | 'http';

export class OmnirushError extends Error {
  constructor(
    public readonly kind: OmnirushFailure,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'OmnirushError';
  }
}

export interface OmnirushAsk {
  prompt: string;
  system?: string;
  model: string;
  /** A JSON schema; the answer then comes back as parsed JSON. */
  schema?: Record<string, unknown>;
  image?: { bytes: Buffer; mime: 'image/jpeg' | 'image/png' | 'image/webp' };
  /** ai_usage attribution. */
  agent: string;
  userId?: string | null;
  /** The endpoint gives up at 270 s and nginx at 300 s; waiting longer is pointless. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface OmnirushAnswer<T> {
  answer: T;
  model: string;
  seconds: number;
}

const DEFAULT_TIMEOUT_MS = 290_000;

/**
 * One Omnirush run. Throws OmnirushError — the caller decides whether to fall back to Gemini.
 * The token never appears in a log line or an error message.
 */
export async function askOmnirush<T = unknown>(ask: OmnirushAsk): Promise<OmnirushAnswer<T>> {
  const token = env.OMNIRUSH_ASK_TOKEN;
  if (!token) throw new OmnirushError('not_configured', 'OMNIRUSH_ASK_TOKEN is not set');

  const form = new FormData();
  form.append('prompt', ask.prompt);
  if (ask.system) form.append('system', ask.system);
  form.append('model', ask.model);
  if (ask.schema) form.append('schema', JSON.stringify(ask.schema));
  if (ask.image) {
    const ext = ask.image.mime.split('/')[1];
    form.append(
      'image',
      new Blob([new Uint8Array(ask.image.bytes)], { type: ask.image.mime }),
      `image.${ext}`,
    );
  }

  const timeout = AbortSignal.timeout(ask.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = ask.signal ? AbortSignal.any([ask.signal, timeout]) : timeout;
  const startedAt = Date.now();

  let res: Response;
  try {
    res = await fetch(env.OMNIRUSH_ASK_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal,
    });
  } catch (err) {
    const timedOut = timeout.aborted;
    throw new OmnirushError(
      timedOut ? 'timeout' : 'http',
      timedOut ? 'Omnirush did not answer in time' : `Omnirush request failed: ${String(err)}`,
    );
  }

  const text = await res.text();
  if (!res.ok) {
    // 429 = busy or out of this week's grant, 504 = the run timed out, 503 = not signed in.
    const kind: OmnirushFailure =
      res.status === 429
        ? 'busy'
        : res.status === 504
          ? 'timeout'
          : res.status === 503
            ? 'unavailable'
            : res.status === 502 && text.includes('NOT_JSON')
              ? 'bad_answer'
              : 'http';
    throw new OmnirushError(
      kind,
      `Omnirush answered ${res.status}: ${text.slice(0, 300)}`,
      res.status,
    );
  }

  let body: { answer?: unknown; model?: unknown; seconds?: unknown };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    throw new OmnirushError('bad_answer', 'Omnirush reply was not JSON');
  }
  if (body.answer === undefined || body.answer === null) {
    throw new OmnirushError('bad_answer', 'Omnirush reply had no answer');
  }
  if (ask.schema && typeof body.answer !== 'object') {
    throw new OmnirushError('bad_answer', 'Omnirush answer was not the requested JSON');
  }

  const durationMs = Date.now() - startedAt;
  const model = typeof body.model === 'string' ? body.model : ask.model;
  void insertAiUsage({
    userId: ask.userId ?? null,
    agent: ask.agent,
    model: `omnirush:${ask.model}`,
    // Paid from Omnirush's grant, not per token: the admin cost report must count it as ₹0.
    tier: 'free',
    tokensIn: 0,
    tokensOut: 0,
    durationMs,
  }).catch((err: unknown) => logger.warn({ err }, 'ai_usage insert failed (omnirush)'));

  return {
    answer: body.answer as T,
    model,
    seconds: typeof body.seconds === 'number' ? body.seconds : Math.round(durationMs / 100) / 10,
  };
}
