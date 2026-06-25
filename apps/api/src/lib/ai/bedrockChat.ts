import { getAvailableAPIKeys, fetchWithKeyFallback } from '@/lib/ai/aiProvider';

const NIM_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

function getNimModel(): string {
  return process.env.NVIDIA_NIM_MODEL || 'mistralai/mistral-nemotron';
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function bedrockChatComplete(
  system: string,
  messages: ChatMessage[],
  maxTokens = 1500,
): Promise<string> {
  const keys = getAvailableAPIKeys();
  return fetchWithKeyFallback(keys, async (apiKey) => {
    const res = await fetch(NIM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getNimModel(),
        messages: [{ role: 'system', content: system }, ...messages],
        max_tokens: maxTokens,
        temperature: 0.85,
      }),
    });
    if (!res.ok) throw new Error(`NIM error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? '';
  }, 'chat-complete');
}

export async function* bedrockChatStream(
  system: string,
  messages: ChatMessage[],
  maxTokens = 1500,
): AsyncGenerator<string> {
  const keys = getAvailableAPIKeys();

  // 45s timeout — fires before Vercel's 60s maxDuration so we get a real error
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  let res: Response;
  try {
    res = await fetchWithKeyFallback(keys, async (apiKey) => {
      const r = await fetch(NIM_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: getNimModel(),
          messages: [{ role: 'system', content: system }, ...messages],
          max_tokens: maxTokens,
          temperature: 0.85,
          stream: true,
        }),
        signal: controller.signal,
      });
      if (!r.ok || !r.body) throw new Error(`NIM stream error ${r.status}`);
      return r;
    }, 'chat-stream');
  } finally {
    clearTimeout(timeout);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.replace(/^data:\s*/, '');
      if (!trimmed || trimmed === '[DONE]') continue;
      try {
        const parsed = JSON.parse(trimmed) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const token = parsed.choices?.[0]?.delta?.content;
        if (token) yield token;
      } catch {
        // skip malformed SSE line
      }
    }
  }
}
