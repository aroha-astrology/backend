import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getAvailableAPIKeys } from '@/lib/ai/aiProvider';

interface KeyHealth {
  slot: string;
  preview: string;
  status: 'ok' | 'dead' | 'degraded' | 'rate_limited' | 'unreachable';
  httpStatus?: number;
  latencyMs?: number;
  error?: string;
}

function sanitize(key: string): string {
  return key.replace(/^﻿/, '').trim();
}

function maskKey(key: string): string {
  if (!key) return '<empty>';
  if (key.length <= 12) return `${key.slice(0, 3)}…${key.slice(-3)}`;
  return `${key.slice(0, 6)}…${key.slice(-6)}`;
}

async function probeKey(key: string, model: string): Promise<Omit<KeyHealth, 'slot' | 'preview'>> {
  const started = Date.now();
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        temperature: 0,
        stream: false,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const latencyMs = Date.now() - started;
    if (res.ok) {
      return { status: 'ok', httpStatus: res.status, latencyMs };
    }
    const errText = (await res.text().catch(() => res.statusText)).slice(0, 220);
    if (res.status === 401 || res.status === 403) {
      return { status: 'dead', httpStatus: res.status, latencyMs, error: errText };
    }
    if (res.status === 429) {
      return { status: 'rate_limited', httpStatus: res.status, latencyMs, error: errText };
    }
    if (res.status === 500 && /inference-connection|Inference connection error/i.test(errText)) {
      return { status: 'degraded', httpStatus: res.status, latencyMs, error: errText };
    }
    if (res.status === 400 && /DEGRADED/i.test(errText)) {
      return { status: 'degraded', httpStatus: res.status, latencyMs, error: errText };
    }
    if (res.status === 404 && /Not found for account/i.test(errText)) {
      return { status: 'dead', httpStatus: res.status, latencyMs, error: errText };
    }
    // 410 Gone: NVIDIA removed the model from the catalog (end-of-life).
    // Same class of failure as DEGRADED — key cannot recover; only switching
    // models can. Surfaces clearly in the admin dashboard so the operator
    // knows to update NVIDIA_NIM_MODEL.
    if (res.status === 410) {
      return { status: 'degraded', httpStatus: res.status, latencyMs, error: errText };
    }
    return { status: 'unreachable', httpStatus: res.status, latencyMs, error: errText };
  } catch (e) {
    return {
      status: 'unreachable',
      latencyMs: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// GET /api/admin/nim-health
// Probes every configured NVIDIA NIM key against the primary text model and
// reports which keys are alive, expired, rate-limited, or hitting a degraded
// model endpoint. Admin-only.
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: caller } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!caller?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const primaryModel = process.env.NVIDIA_NIM_MODEL ?? 'mistralai/mistral-nemotron';

  // Probe every configured slot — same dynamic scan getAvailableAPIKeys uses.
  // Intentionally bypasses the in-process deadKeys filter so admin can see the
  // true state of every configured key, not just the surviving ones.
  const MAX_NUMBERED_SLOT = 20;
  const slots: Array<{ slot: string; key?: string }> = [
    { slot: 'NVIDIA_NIM_API_KEY', key: process.env.NVIDIA_NIM_API_KEY },
  ];
  for (let i = 2; i <= MAX_NUMBERED_SLOT; i++) {
    const name = `NVIDIA_NIM_API_KEY_${i}`;
    if (process.env[name]) slots.push({ slot: name, key: process.env[name] });
  }
  slots.push({ slot: 'NVIDIA_NIM_REPORT_API_KEY', key: process.env.NVIDIA_NIM_REPORT_API_KEY });

  const results: KeyHealth[] = await Promise.all(
    slots.map(async ({ slot, key }) => {
      if (!key) return { slot, preview: '<unset>', status: 'dead', error: 'env var not set' } as KeyHealth;
      const clean = sanitize(key);
      const probe = await probeKey(clean, primaryModel);
      return { slot, preview: maskKey(clean), ...probe };
    }),
  );

  const summary = {
    primaryModel,
    runtimeKeyCount: getAvailableAPIKeys().length,
    ok: results.filter(r => r.status === 'ok').length,
    dead: results.filter(r => r.status === 'dead').length,
    degraded: results.filter(r => r.status === 'degraded').length,
    rate_limited: results.filter(r => r.status === 'rate_limited').length,
    unreachable: results.filter(r => r.status === 'unreachable').length,
  };

  return NextResponse.json({ summary, results });
}
