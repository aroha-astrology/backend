import { BASE_URL } from '../config';

export interface UserClient {
  cookieHeader: string;
  post: (path: string, body: object) => Promise<{ status: number; data: unknown }>;
  get: (path: string) => Promise<{ status: number; data: unknown }>;
  stream: (path: string, body: object) => Promise<StreamResult>;
}

export interface StreamResult {
  status: number;
  firstTokenMs: number | null;
  fullMs: number;
  tokenCount: number;
  errorBody?: string;
}

export function createUserClient(cookieHeader: string): UserClient {
  const headers = {
    'Content-Type': 'application/json',
    Cookie: cookieHeader,
  };

  async function post(path: string, body: object) {
    const r = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    let data: unknown;
    try { data = await r.json(); } catch { data = null; }
    return { status: r.status, data };
  }

  async function get(path: string) {
    const r = await fetch(`${BASE_URL}${path}`, { headers });
    let data: unknown;
    try { data = await r.json(); } catch { data = null; }
    return { status: r.status, data };
  }

  async function stream(path: string, body: object): Promise<StreamResult> {
    const t0 = Date.now();
    const r = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!r.ok || !r.body) {
      const errorBody = await r.text().catch(() => '');
      return { status: r.status, firstTokenMs: null, fullMs: Date.now() - t0, tokenCount: 0, errorBody };
    }

    let firstTokenMs: number | null = null;
    let tokenCount = 0;
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.token) {
            if (firstTokenMs === null) firstTokenMs = Date.now() - t0;
            tokenCount++;
          }
        } catch { /* ignore malformed lines */ }
      }
    }

    return { status: r.status, firstTokenMs, fullMs: Date.now() - t0, tokenCount };
  }

  return { cookieHeader, post, get, stream };
}
