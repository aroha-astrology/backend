export const runtime = 'nodejs';
export const maxDuration = 10;

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * GET /api/voice/quota
 *
 * Proxies ElevenLabs GET /v1/user/subscription so the chat page can pre-check
 * quota before starting a voice call. Returns { ok, remaining, total, lowQuota }.
 *
 * - `lowQuota` is true when fewer than 5,000 characters remain — the client
 *   surfaces a warning before the call so the user isn't caught mid-sentence
 *   by a voice downgrade. (Strict mode would end the call rather than swap.)
 * - The ElevenLabs API key is read server-side only — never exposed to the client.
 */

const LOW_QUOTA_THRESHOLD = 5000;
const CACHE_TTL_MS = 30_000;

let cached: { fetchedAt: number; payload: QuotaPayload } | null = null;

interface QuotaPayload {
  ok: boolean;
  remaining: number;
  total: number;
  lowQuota: boolean;
}

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json<QuotaPayload>(
        { ok: false, remaining: 0, total: 0, lowQuota: true },
        { status: 200 },
      );
    }

    // Short cache so 100 simultaneous call-starts don't hammer ElevenLabs.
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return NextResponse.json(cached.payload);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': apiKey },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return NextResponse.json<QuotaPayload>(
        { ok: false, remaining: 0, total: 0, lowQuota: true },
        { status: 200 },
      );
    }

    const data = await res.json() as {
      character_count?: number;
      character_limit?: number;
    };
    const used = data.character_count ?? 0;
    const total = data.character_limit ?? 0;
    const remaining = Math.max(0, total - used);
    const lowQuota = remaining < LOW_QUOTA_THRESHOLD;

    const payload: QuotaPayload = { ok: true, remaining, total, lowQuota };
    cached = { fetchedAt: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (err) {
    console.error('[voice/quota] error:', err);
    return NextResponse.json<QuotaPayload>(
      { ok: false, remaining: 0, total: 0, lowQuota: true },
      { status: 200 },
    );
  }
}
