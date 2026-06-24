import { SUPABASE_URL, SUPABASE_ANON_KEY, COOKIE_NAME } from '../config';

export interface SessionCookies {
  /** Full Cookie: header value — may contain one or more cookies */
  cookieHeader: string;
  accessToken: string;
}

function buildCookieValue(session: object): string {
  const json = JSON.stringify(session);
  const b64 = Buffer.from(json).toString('base64url');
  const value = `base64-${b64}`;

  // @supabase/ssr chunks if encodeURIComponent(value).length > 3180.
  // Typical sessions are ~1500 chars — well under the limit.
  const encoded = encodeURIComponent(value);
  if (encoded.length <= 3180) {
    return `${COOKIE_NAME}=${value}`;
  }

  // Chunked fallback (rare for normal sessions)
  const chunks: string[] = [];
  let remaining = value;
  let i = 0;
  while (remaining.length > 0) {
    const slice = remaining.slice(0, 3180);
    const name = i === 0 ? `${COOKIE_NAME}.0` : `${COOKIE_NAME}.${i}`;
    chunks.push(`${name}=${slice}`);
    remaining = remaining.slice(3180);
    i++;
  }
  return chunks.join('; ');
}

export async function signIn(email: string, password: string): Promise<SessionCookies> {
  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!r.ok) {
    const body = await r.text();
    throw new Error(`signIn failed ${r.status}: ${body}`);
  }

  const session = await r.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    expires_at?: number;
    token_type: string;
    user: object;
  };

  const cookieHeader = buildCookieValue(session);
  return { cookieHeader, accessToken: session.access_token };
}
