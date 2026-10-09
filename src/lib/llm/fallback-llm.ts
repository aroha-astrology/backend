// =============================================================================
// Free fallback LLM providers (NVIDIA NIM, then OpenRouter)
// =============================================================================
// Tried by gemini-client.ts when every Gemini FREE key is cooling down, right
// before it would start billing the paid reserve. Order: NVIDIA's own hosted API
// (about 40 req/min, no daily cap), then OpenRouter's free tier (50 req/day per
// account unless credits were ever bought). Both serve the same Nemotron model.
//
// Scope is deliberately narrow: only the profiles in FALLBACK_LLM_PROFILES
// (chat by default; reports are opt-in), only plain-text messages (no images), and a JSON reply is
// only accepted if it actually parses. Anything that does not qualify returns
// null and the caller carries on exactly as before.
//
// Cooldowns are process-local: this tier is rare overflow, so a worker that
// learns a key is rate limited simply stops asking for a minute; it does not
// need the Redis coordination the Gemini pool uses.

import { env } from '../../config/env.js';
import type { ChatMessage, GenerationProfile } from '../../config/llm.js';
import { logger } from '../logger.js';

interface Provider {
  id: 'nvidia' | 'openrouter';
  baseUrl: string;
  model: string;
  keys: readonly string[];
  /** Whether the endpoint accepts response_format: json_object. */
  nativeJson: boolean;
}

export interface FallbackResult {
  content: string;
  model: string;
  provider: Provider['id'];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens?: number };
  durationMs: number;
}

export interface FallbackRequest {
  profile: GenerationProfile;
  /** Already passed through mergeSystemMessages(). */
  messages: ChatMessage[];
  responseSchema?: Record<string, unknown> | undefined;
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
}

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_COOLDOWN_MS = 60_000;
const DAILY_COOLDOWN_MS = 6 * 60 * 60 * 1000;
// The model reasons before it answers and those tokens count against max_tokens,
// so a profile sized for a plain reply can come back empty without headroom.
const REASONING_HEADROOM_TOKENS = 2_000;
const MAX_COMPLETION_TOKENS = 16_000;

// Env fields are read defensively: several specs replace `env` with a small
// hand-built object that predates these settings.
function envList(name: string): readonly string[] {
  const value = (env as unknown as Record<string, unknown>)[name];
  return Array.isArray(value) ? (value as string[]) : [];
}

function envString(name: string, fallback: string): string {
  const value = (env as unknown as Record<string, unknown>)[name];
  return typeof value === 'string' && value ? value : fallback;
}

function providers(): Provider[] {
  const list: Provider[] = [];
  const nvidiaKeys = envList('NVIDIA_API_KEYS');
  if (nvidiaKeys.length > 0) {
    list.push({
      id: 'nvidia',
      baseUrl: NVIDIA_BASE_URL,
      model: envString('FALLBACK_NVIDIA_MODEL', 'nvidia/nemotron-3-ultra-550b-a55b'),
      keys: nvidiaKeys,
      nativeJson: true,
    });
  }
  const openRouterKeys = envList('OPENROUTER_API_KEYS');
  if (openRouterKeys.length > 0) {
    list.push({
      id: 'openrouter',
      baseUrl: OPENROUTER_BASE_URL,
      model: envString('FALLBACK_OPENROUTER_MODEL', 'nvidia/nemotron-3-ultra-550b-a55b:free'),
      keys: openRouterKeys,
      // The free Nemotron route does not advertise response_format, so JSON is
      // requested in the prompt and verified after the fact instead.
      nativeJson: false,
    });
  }
  return list;
}

const cooldownUntil = new Map<string, number>(); // `${provider}:${keyIndex}` -> epoch ms

function isCoolingDown(id: string, index: number): boolean {
  const until = cooldownUntil.get(`${id}:${index}`);
  return until !== undefined && until > Date.now();
}

function cool(id: string, index: number, ms: number): void {
  cooldownUntil.set(`${id}:${index}`, Date.now() + ms);
}

// SWITCHED OFF 2026-10-09: the owner did not like the Nemotron answers (slower than
// Gemini, ignored the Baba Ji tone). The code and tests are kept for later; set
// this to true and un-skip test/gemini-client-fallback.spec.ts to bring it back.
const FALLBACK_ENABLED = false;

/** True when this call may use the fallback tier at all. Cheap and synchronous. */
export function fallbackEligible(profile: GenerationProfile, messages: ChatMessage[]): boolean {
  if (!FALLBACK_ENABLED) return false;
  if (!envList('FALLBACK_LLM_PROFILES').includes(profile.name)) return false;
  if (messages.some((m) => typeof m.content !== 'string')) return false; // images / parts
  return providers().length > 0;
}

/** Pulls the JSON object out of a reply that may carry fences or a preamble. */
function extractJson(text: string): string | null {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  const candidate = cleaned.slice(start, end + 1);
  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    return null;
  }
}

function withJsonInstruction(
  messages: ChatMessage[],
  schema: Record<string, unknown> | undefined,
): ChatMessage[] {
  const note =
    'Reply with exactly one valid JSON object and nothing else: no markdown fences, no commentary.' +
    (schema ? ` The object must match this JSON schema: ${JSON.stringify(schema)}` : '');
  const copy = messages.map((m) => ({ ...m }));
  const first = copy.find((m) => m.role === 'system' && typeof m.content === 'string');
  if (first) {
    first.content = `${first.content as string}\n\n${note}`;
    return copy;
  }
  return [{ role: 'system', content: note }, ...copy];
}

interface CompletionBody {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens?: number };
}

/**
 * Asks each configured provider in turn, each of its keys in turn, and returns
 * the first usable reply. Never throws: any failure is logged and skipped, and
 * `null` means "no fallback answer, carry on with the normal path".
 */
export async function tryFallbackProviders(req: FallbackRequest): Promise<FallbackResult | null> {
  const wantJson = req.profile.jsonMode;
  const messages = wantJson ? withJsonInstruction(req.messages, req.responseSchema) : req.messages;
  const maxTokens = Math.min(
    req.profile.maxTokens + REASONING_HEADROOM_TOKENS,
    MAX_COMPLETION_TOKENS,
  );

  for (const provider of providers()) {
    for (let index = 0; index < provider.keys.length; index++) {
      if (req.signal?.aborted) return null;
      if (isCoolingDown(provider.id, index)) continue;

      const startedAt = Date.now();
      const ac = new AbortController();
      const onAbort = () => ac.abort();
      req.signal?.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => ac.abort(), req.timeoutMs ?? DEFAULT_TIMEOUT_MS);

      try {
        const body: Record<string, unknown> = {
          model: provider.model,
          messages,
          temperature: req.profile.temperature,
          max_tokens: maxTokens,
          stream: false,
        };
        if (wantJson && provider.nativeJson) body.response_format = { type: 'json_object' };
        // Live-measured 2026-10-09: the same chat question took 7 s with thinking
        // off and between 7 s and 91 s with it on (a shared free pool), which
        // overruns the request budget. Reports keep thinking on; they have the
        // time budget and benefit from it.
        if (!wantJson && provider.id === 'nvidia') {
          body.chat_template_kwargs = { enable_thinking: false };
        }

        const response = await fetch(`${provider.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${provider.keys[index]}`,
          },
          body: JSON.stringify(body),
          signal: ac.signal,
        });
        const text = await response.text();

        if (response.status === 429) {
          const daily = /per.?day|daily/i.test(text);
          cool(provider.id, index, daily ? DAILY_COOLDOWN_MS : DEFAULT_COOLDOWN_MS);
          logger.warn(
            { provider: provider.id, keyIndex: index, daily },
            'Fallback LLM key rate limited, cooling down',
          );
          continue;
        }
        if (response.status === 401 || response.status === 403) {
          // A rejected key will not start working in a minute; stop asking for a while.
          cool(provider.id, index, DAILY_COOLDOWN_MS);
          logger.warn(
            { provider: provider.id, keyIndex: index, status: response.status },
            'Fallback LLM key rejected',
          );
          continue;
        }
        if (!response.ok) {
          logger.warn(
            { provider: provider.id, status: response.status, body: text.slice(0, 200) },
            'Fallback LLM error',
          );
          continue;
        }

        let data: CompletionBody;
        try {
          data = JSON.parse(text) as CompletionBody;
        } catch {
          logger.warn({ provider: provider.id }, 'Fallback LLM returned a non-JSON body');
          continue;
        }
        const raw = data.choices?.[0]?.message?.content ?? '';
        let content = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        if (wantJson) {
          const json = extractJson(content);
          if (json === null) {
            logger.warn(
              { provider: provider.id, finish: data.choices?.[0]?.finish_reason },
              'Fallback LLM reply was not valid JSON, discarding',
            );
            continue;
          }
          content = json;
        }
        if (!content) {
          logger.warn({ provider: provider.id }, 'Fallback LLM returned an empty reply');
          continue;
        }

        logger.info(
          { provider: provider.id, model: provider.model, profile: req.profile.name },
          'Served by free fallback LLM',
        );
        return {
          content,
          model: provider.model,
          provider: provider.id,
          ...(data.usage ? { usage: data.usage } : {}),
          durationMs: Date.now() - startedAt,
        };
      } catch (err) {
        if (req.signal?.aborted) return null;
        logger.warn({ err, provider: provider.id }, 'Fallback LLM request failed');
      } finally {
        clearTimeout(timer);
        req.signal?.removeEventListener('abort', onAbort);
      }
    }
  }
  return null;
}

/** Test seam. */
export function __resetFallbackForTests(): void {
  cooldownUntil.clear();
}
