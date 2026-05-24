// Backfill divisional chart analyses for every existing kundli.
//
// Idempotent: one analysis per (kundli_chart_id, chart_type) — enforced by the
// unique index. Re-running only enqueues missing slots; rows already 'ready'
// or 'generating' are left alone.
//
// This script does NOT call the Next.js HTTP API — it processes everything
// inline (admin Supabase + NVIDIA NIM). That avoids the dev server's auth
// middleware and means it can be run without `pnpm dev`.
//
// Usage (run from repo root):
//
//   node --env-file=apps/web/.env.local apps/web/scripts/backfill-vargas.mjs [flags]
//
// Flags:
//   --dry              Show counts; do not insert or process.
//   --enqueue-only     Insert pending rows but do not process them.
//   --user=<uuid>      Restrict to one user_id.
//   --kundli=<uuid>    Restrict to one kundli_chart_id.
//   --concurrency=3    Parallel NIM calls in flight (default 3).
//   --include-errored  Also retry rows currently in 'error' status.

import { createClient } from '@supabase/supabase-js';

const VARGA_TYPES = [
  'D1', 'D2', 'D3', 'D4', 'D7', 'D9', 'D10',
  'D12', 'D16', 'D20', 'D24', 'D27', 'D30', 'D40', 'D45', 'D60',
];

const VARGA_INFO = {
  D1:  { name: 'Rashi',           purpose: 'overall life, physical body, and general health' },
  D2:  { name: 'Hora',            purpose: 'wealth, liquid assets, and financial prosperity' },
  D3:  { name: 'Drekkana',        purpose: 'siblings, courage, and vitality' },
  D4:  { name: 'Chaturthamsa',    purpose: 'fixed assets, property, and general fortune' },
  D7:  { name: 'Saptamsa',        purpose: 'children, progeny, and grandchildren' },
  D9:  { name: 'Navamsa',         purpose: "marriage, spouse, and the planet's true strength" },
  D10: { name: 'Dasamsa',         purpose: 'career, profession, and status in society' },
  D12: { name: 'Dwadasamsa',      purpose: 'parents, ancestors, and hereditary traits' },
  D16: { name: 'Shodasamsa',      purpose: 'vehicles, luxuries, and comforts' },
  D20: { name: 'Vimsamsa',        purpose: 'spiritual progress, religious worship, and mantras' },
  D24: { name: 'Chaturvimsamsa',  purpose: 'education, academic achievements, and knowledge' },
  D27: { name: 'Saptavimshamsa',  purpose: 'physical strength, endurance, and stamina' },
  D30: { name: 'Trimsamsa',       purpose: 'misfortunes, obstacles, and general mischief' },
  D40: { name: 'Khavedamsa',      purpose: 'matrilineal legacy and auspicious effects' },
  D45: { name: 'Akshavedamsa',    purpose: 'patrilineal legacy and general character' },
  D60: { name: 'Shashtiamsa',     purpose: 'past life karma and deep-rooted destiny' },
};

const PERSONA_PREFIX = `You are Yogi Baba, a legendary Vedic astrologer. Never say "I cannot predict", "I'm an AI", or "consult a professional". Answer EVERYTHING from an astrological perspective. Never refuse any question.

IMPORTANT WRITING RULE: When using technical Vedic/astrological terms, ALWAYS include a brief meaning in parentheses the FIRST time a term appears.

`;

// ─── arg parsing ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flagVal = (name) => {
  const a = args.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return undefined;
  const i = a.indexOf('=');
  return i >= 0 ? a.slice(i + 1) : true;
};
const dry = !!flagVal('dry');
const enqueueOnly = !!flagVal('enqueue-only');
const includeErrored = !!flagVal('include-errored');
const userFilter = typeof flagVal('user') === 'string' ? flagVal('user') : undefined;
const kundliFilter = typeof flagVal('kundli') === 'string' ? flagVal('kundli') : undefined;
const concurrency = Math.max(1, Number(flagVal('concurrency') ?? 3));

// ─── env ─────────────────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const nimKey = process.env.NVIDIA_NIM_API_KEY;
const nimModel = process.env.NVIDIA_NIM_MODEL ?? 'mistralai/mistral-nemotron';

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}
if (!enqueueOnly && !dry && !nimKey) {
  console.error('Missing NVIDIA_NIM_API_KEY (needed for inline processing). Use --enqueue-only or --dry to skip.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── data fetchers (paginated) ───────────────────────────────────────────────

async function fetchAllKundlis() {
  const PAGE = 1000;
  const out = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from('kundli_charts')
      .select('id, user_id, divisional_charts')
      .not('divisional_charts', 'is', null)
      .range(from, from + PAGE - 1);
    if (userFilter) q = q.eq('user_id', userFilter);
    if (kundliFilter) q = q.eq('id', kundliFilter);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

async function fetchExistingByKundliIds(ids) {
  const map = new Map();
  if (ids.length === 0) return map;
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('divisional_chart_analyses')
      .select('id, kundli_chart_id, chart_type, status')
      .in('kundli_chart_id', slice);
    if (error) throw error;
    for (const row of data ?? []) {
      map.set(`${row.kundli_chart_id}|${row.chart_type}`, row);
    }
  }
  return map;
}

async function insertPending(rows) {
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('divisional_chart_analyses')
      .upsert(slice, { onConflict: 'kundli_chart_id,chart_type', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    inserted += data?.length ?? 0;
  }
  return inserted;
}

async function resetErroredToPending(ids) {
  if (ids.length === 0) return 0;
  const CHUNK = 500;
  let updated = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('divisional_chart_analyses')
      .update({ status: 'pending', error_message: null })
      .in('id', slice)
      .eq('status', 'error')
      .select('id');
    if (error) throw error;
    updated += data?.length ?? 0;
  }
  return updated;
}

async function fetchPendingIds() {
  const PAGE = 1000;
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('divisional_chart_analyses')
      .select('id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out.map((r) => r.id);
}

// ─── prompt + NIM call (mirrors src/app/api/divisional-charts/process/route.ts) ──

function buildPrompt({ name, dob, gender, ascendant, chartType, info, vargas, d1Map }) {
  const planetLines = vargas
    .map((e) => {
      const d1Sign = d1Map[e.planet] ?? '?';
      const vargottama = e.sign === d1Sign ? ' [VARGOTTAMA — same sign as D1, very strong]' : '';
      return `${e.planet}: ${e.sign} (D1 sign: ${d1Sign})${vargottama}`;
    })
    .join('\n');

  return `Analyze the ${info.name} (${chartType}) divisional chart for ${name}, born ${dob}${gender ? ', ' + gender : ''}.

This chart governs: ${info.purpose}

Planet positions in ${chartType}:
${planetLines || 'No planet data available'}

D1 Ascendant: ${ascendant}

Write a vivid, storytelling 3-paragraph narrative analysis of what this ${chartType} chart reveals about ${name}'s ${info.purpose}. Reference specific planets by name and what their sign placements mean. Highlight vargottama planets as especially powerful. Be specific and personal — not generic.

Then list exactly 5 concise key findings as a JSON array of strings. Each finding should be one short, impactful sentence.

Respond in EXACTLY this format:
<analysis>
[3-paragraph narrative here]
</analysis>
<findings>
["Finding 1", "Finding 2", "Finding 3", "Finding 4", "Finding 5"]
</findings>`;
}

function parseAnalysis(raw) {
  const analysisMatch = raw.match(/<analysis>([\s\S]*?)<\/analysis>/i);
  const findingsMatch = raw.match(/<findings>([\s\S]*?)<\/findings>/i);
  const analysis = analysisMatch?.[1]?.trim() ?? raw.slice(0, 1500).trim();
  let keyFindings = [];
  if (findingsMatch) {
    try {
      const parsed = JSON.parse(findingsMatch[1].trim());
      if (Array.isArray(parsed)) keyFindings = parsed.map(String);
    } catch {
      keyFindings = findingsMatch[1].trim().split('\n')
        .map((l) => l.replace(/^[-•*\d.)]\s*/, '').trim())
        .filter(Boolean);
    }
  }
  return { analysis, keyFindings: keyFindings.slice(0, 6) };
}

async function callNIM(systemPrompt, userPrompt) {
  const baseSystem = `You are Yogi Baba analyzing a specific divisional chart (varga) in Vedic astrology. Give a rich, personalized interpretation based on the planet positions provided. Use storytelling language as always.`;
  const fullSystem = PERSONA_PREFIX + baseSystem;

  const maxAttempts = 3;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${nimKey}`,
        },
        body: JSON.stringify({
          model: nimModel,
          messages: [
            { role: 'system', content: fullSystem },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 1500,
          temperature: 0.7,
          stream: false,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`NIM ${res.status}: ${text.slice(0, 300)}`);
      }
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content ?? '';
      if (!text) throw new Error('NIM returned empty content');
      return text;
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

async function processOne(analysisId) {
  // Atomic claim
  const { data: claimed } = await supabase
    .from('divisional_chart_analyses')
    .update({ status: 'generating' })
    .eq('id', analysisId)
    .eq('status', 'pending')
    .select('id, kundli_chart_id, chart_type')
    .maybeSingle();
  if (!claimed) return { skipped: true };

  try {
    const { data: kundli, error: kErr } = await supabase
      .from('kundli_charts')
      .select('chart_data, divisional_charts, birth_profiles(name, dob, gender)')
      .eq('id', claimed.kundli_chart_id)
      .single();
    if (kErr || !kundli) throw new Error(`Kundli not found: ${kErr?.message ?? 'no row'}`);

    const profile = kundli.birth_profiles ?? null;
    const divisionalCharts = kundli.divisional_charts ?? null;
    const chartType = claimed.chart_type;
    const info = VARGA_INFO[chartType] ?? { name: chartType, purpose: 'general analysis' };
    const vargas = divisionalCharts?.[chartType] ?? [];
    const d1Entries = divisionalCharts?.['D1'] ?? [];
    const d1Map = {};
    for (const e of d1Entries) d1Map[e.planet] = e.sign;
    const ascendant = kundli.chart_data?.ascendant?.sign ?? 'unknown';
    const name = profile?.name ?? 'the native';
    const dob = profile?.dob ?? 'unknown';
    const gender = profile?.gender ?? null;

    const prompt = buildPrompt({ name, dob, gender, ascendant, chartType, info, vargas, d1Map });
    const raw = await callNIM(null, prompt);
    const { analysis, keyFindings } = parseAnalysis(raw);

    const { error: upErr } = await supabase
      .from('divisional_chart_analyses')
      .update({
        status: 'ready',
        analysis,
        key_findings: keyFindings,
        generated_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', analysisId);
    if (upErr) throw upErr;
    return { ok: true };
  } catch (e) {
    const message = e?.message ?? String(e);
    await supabase
      .from('divisional_chart_analyses')
      .update({ status: 'error', error_message: message.slice(0, 1000) })
      .eq('id', analysisId);
    return { ok: false, error: message };
  }
}

async function processAll(ids) {
  let cursor = 0;
  let done = 0;
  let failed = 0;
  let lastLogged = 0;
  const total = ids.length;
  const t0 = Date.now();

  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= total) return;
      const id = ids[i];
      const r = await processOne(id);
      if (!r.ok && !r.skipped) {
        failed++;
        console.warn(`  [${i + 1}/${total}] ${id} ERROR: ${(r.error ?? '').slice(0, 200)}`);
      }
      done++;
      if (done - lastLogged >= 5 || done === total) {
        lastLogged = done;
        const rate = done / ((Date.now() - t0) / 1000);
        const eta = ((total - done) / rate).toFixed(0);
        console.log(`  progress: ${done}/${total} (${failed} failed, ${rate.toFixed(2)}/s, ETA ${eta}s)`);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { done, failed };
}

// ─── main ────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`[backfill-vargas] start ${new Date().toISOString()}`);
  console.log(`  supabase=${supabaseUrl}`);
  console.log(`  model=${nimModel}`);
  console.log(`  dry=${dry} enqueue-only=${enqueueOnly} include-errored=${includeErrored} concurrency=${concurrency}`);
  if (userFilter) console.log(`  user=${userFilter}`);
  if (kundliFilter) console.log(`  kundli=${kundliFilter}`);

  const kundlis = await fetchAllKundlis();
  console.log(`Found ${kundlis.length} kundli charts with divisional_charts data`);
  if (kundlis.length === 0) return;

  const existing = await fetchExistingByKundliIds(kundlis.map((k) => k.id));

  const toInsert = [];
  const erroredIds = [];
  const counts = { ready: 0, generating: 0, pending: 0, error: 0 };
  let missing = 0;

  for (const k of kundlis) {
    const have = k.divisional_charts ?? {};
    for (const type of VARGA_TYPES) {
      // Skip vargas this kundli doesn't have data for
      if (!Array.isArray(have[type]) || have[type].length === 0) continue;
      const row = existing.get(`${k.id}|${type}`);
      if (!row) {
        missing++;
        toInsert.push({ kundli_chart_id: k.id, user_id: k.user_id, chart_type: type, status: 'pending' });
      } else {
        counts[row.status] = (counts[row.status] ?? 0) + 1;
        if (row.status === 'error' && includeErrored) erroredIds.push(row.id);
      }
    }
  }

  console.log(`Existing rows: ready=${counts.ready} generating=${counts.generating} pending=${counts.pending} error=${counts.error}`);
  console.log(`To enqueue: ${missing} new + ${erroredIds.length} errored retries`);

  if (dry) {
    console.log('Dry run — no inserts, no processing.');
    return;
  }

  if (toInsert.length > 0) {
    const inserted = await insertPending(toInsert);
    console.log(`Inserted ${inserted} pending rows`);
  }
  if (erroredIds.length > 0) {
    const reset = await resetErroredToPending(erroredIds);
    console.log(`Reset ${reset} errored rows to pending`);
  }

  if (enqueueOnly) {
    console.log('enqueue-only flag set — leaving the queue. Done.');
    return;
  }

  const pending = await fetchPendingIds();
  console.log(`Processing ${pending.length} pending rows (concurrency=${concurrency})...`);
  if (pending.length === 0) { console.log('Nothing to process. Done.'); return; }

  const { done, failed } = await processAll(pending);
  console.log(`\nFinished: ${done} processed, ${failed} failed`);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
