export const runtime = 'nodejs';
export const maxDuration = 300; // 10 minutes

// Called by the Colab worker — runs all AI calls and saves content to Supabase.
// PDF rendering is done separately by /api/reports/render after this completes.

import { NextResponse } from 'next/server';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { buildGroundTruth } from '@/lib/ai/groundTruth';
import type { GroundTruthInput } from '@/lib/ai/groundTruth';
import { buildYogiBabaSystem, buildLangDirective, PROMPTS, MAX_TOKENS } from '@/lib/ai/reportPrompts';
import { enqueueEnrichmentJobs, kickQueueDrain } from '@/lib/insights/enqueue';
import { generatePersonalDaily } from '@/lib/horoscope/personalDailyGenerate';

// =============================================================================
// Concurrency limiter — fire at most N calls at once (avoids NIM rate limits)
// =============================================================================

function createLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = () => {
        active++;
        fn().then(resolve, reject).finally(() => {
          active--;
          if (queue.length > 0) queue.shift()!();
        });
      };
      if (active < concurrency) run();
      else queue.push(run);
    });
  };
}

// =============================================================================
// JSON Parsing Utilities
// =============================================================================

function repairJson(raw: string): string {
  let s = raw.replace(/,\s*([}\]])/g, '$1');
  s = s.replace(/(?<=:\s*"[^"]*)\n(?=[^"]*")/g, '\\n');
  s = s.replace(/"([^"]*?)(?<!\\)"(?=[^:,\]\}\s])/g, '"$1\\"');
  const opens = (s.match(/{/g) ?? []).length;
  const closes = (s.match(/}/g) ?? []).length;
  const openBrackets = (s.match(/\[/g) ?? []).length;
  const closeBrackets = (s.match(/\]/g) ?? []).length;
  s = s.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"{}[\]]*$/, '');
  for (let i = 0; i < openBrackets - closeBrackets; i++) s += ']';
  for (let i = 0; i < opens - closes; i++) s += '}';
  return s;
}

function parseAIJson(msg: { content: Array<{ type: string; text: string }> }, label: string): Record<string, string> {
  const textBlock = msg.content.find((c) => c.type === 'text');
  if (!textBlock) { console.error(`[process] No text block for: ${label}`); return {}; }
  let raw = textBlock.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const start = raw.indexOf('{');
  if (start > 0) raw = raw.slice(start);
  const end = raw.lastIndexOf('}');
  if (end !== -1 && end < raw.length - 1) raw = raw.slice(0, end + 1);

  try { return JSON.parse(raw); } catch { /* try repair */ }
  try {
    const repaired = repairJson(raw);
    return JSON.parse(repaired);
  } catch { /* try extraction */ }

  const extracted: Record<string, string> = {};
  const keyMatch = raw.matchAll(/"([^"]+?)"\s*:\s*"((?:[^"\\]|\\.)*)"/g);
  for (const m of keyMatch) extracted[m[1]] = m[2].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  if (Object.keys(extracted).length > 0) return extracted;

  console.error(`[process] All parse attempts failed for ${label}`);
  return {};
}

function safe(val: unknown, fallback = ''): string {
  if (val === null || val === undefined || val === '') return fallback;
  return String(val) || fallback;
}

// =============================================================================
// Main handler
// =============================================================================

// REPORTS_DISABLED: AI processing temporarily disabled.
// Remove the stub below and restore the real POST to re-enable.
export async function POST(_request: Request) {
  return NextResponse.json(
    { success: false, error: 'Report processing is temporarily disabled.' },
    { status: 503 },
  );
}

/* REPORTS_DISABLED_START
export async function POST(request: Request) {
  const internalKey = request.headers.get('x-internal-key');
  const expectedKey = process.env.INTERNAL_PROCESS_KEY;
  if (!expectedKey || internalKey !== expectedKey) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createAdminSupabase();
  // TODO when re-enabling: drop the dedicated apiKeyPool and call into the
  // shared pool via getAvailableAPIKeys() + fetchWithKeyFallback (per 2026-05-22
  // design — all keys share one least-busy pool, isolation removed).
  const apiKeyPool = [
    process.env.NVIDIA_NIM_REPORT_API_KEY,
    process.env.NVIDIA_NIM_API_KEY,
  ].filter((k): k is string => Boolean(k));
  let reportId = '';

  try {
    const body = await request.json() as { report_id: string; user_id: string };
    reportId = body.report_id;

    // Atomic claim — only proceed if status is still 'pending'
    const { data: claimed } = await supabase
      .from('generated_reports')
      .update({ status: 'generating' })
      .eq('id', reportId)
      .eq('status', 'pending')
      .select('id')
      .single();

    if (!claimed) {
      console.log(`[process] ${reportId} already claimed — skipping`);
      return NextResponse.json({ success: false, error: 'Already processing' }, { status: 409 });
    }

    const { data: report } = await supabase
      .from('generated_reports')
      .select('metadata, subject_name, subject_dob, subject_gender, user_id, chart_id, report_type')
      .eq('id', reportId)
      .single();

    if (!report) throw new Error('Report record not found');

    const { metadata, subject_name: name, subject_dob: dob, subject_gender: gender } = report as {
      metadata: Record<string, unknown>; subject_name: string; subject_dob: string; subject_gender: string; user_id: string; chart_id: string | null; report_type: string;
    };
    const reportChartId  = (report as Record<string, unknown>).chart_id  as string | null;
    const reportUserId   = (report as Record<string, unknown>).user_id   as string;
    const reportType     = (report as Record<string, unknown>).report_type as string;

    const chartData = metadata.chartData as Record<string, unknown>;
    const dashaData = metadata.dashaData as Record<string, unknown>;
    const yogaData = metadata.yogaData as Array<Record<string, unknown>>;
    const doshaData = metadata.doshaData as Record<string, unknown>;
    const shadbala = metadata.shadbala as Record<string, unknown>;
    const ashtakavarga = metadata.ashtakavarga as Record<string, unknown>;
    const profileData = metadata.profileData as Record<string, unknown>;

    const planets = (chartData?.planets ?? []) as Array<Record<string, unknown>>;
    const houses = (chartData?.houses ?? []) as Array<Record<string, unknown>>;
    const ascendant = (chartData?.ascendant ?? {}) as Record<string, unknown>;

    // -------------------------------------------------------------------------
    // Build Ground Truth
    // -------------------------------------------------------------------------
    const gtInput: GroundTruthInput = {
      name, dob,
      tob: safe(profileData?.tob),
      pob: safe(profileData?.pob),
      gender,
      chartData: {
        planets: planets.map(p => ({
          name: String(p.planet ?? p.name ?? ''),
          sign: String(p.sign ?? ''),
          degree: Number(p.signDegree ?? p.degree ?? 0),
          nakshatra: String(p.nakshatra ?? ''),
          pada: Number(p.nakshatraPada ?? p.pada ?? 0),
          house: Number(p.house ?? 0),
          isRetrograde: Boolean(p.isRetrograde),
        })),
        houses: houses.map(h => ({
          house: Number(h.house ?? 0),
          sign: String(h.sign ?? ''),
          lord: String(h.lord ?? ''),
        })),
        ascendant: {
          sign: String(ascendant.sign ?? ''),
          degree: Number(ascendant.degree ?? 0),
          lord: String(ascendant.lord ?? ''),
        },
      },
      dashaData: dashaData ?? {},
      yogaData: yogaData ?? [],
      doshaData: doshaData ?? {},
      shadbala: shadbala ?? {},
      ashtakavarga: ashtakavarga ?? {},
    };

    const groundTruth = buildGroundTruth(gtInput);

    // -------------------------------------------------------------------------
    // Context helpers
    // -------------------------------------------------------------------------
    const ascCtx = `Ascendant: ${safe(ascendant.sign)} ${Number(ascendant.degree ?? 0).toFixed(1)}° Lord: ${safe(ascendant.lord)}`;
    const moonP = gtInput.chartData.planets.find(p => p.name === 'Moon');
    const moonCtx = moonP ? `Moon: ${moonP.sign} ${moonP.degree.toFixed(1)}° H${moonP.house} Nak: ${moonP.nakshatra}` : '';
    const sunP = gtInput.chartData.planets.find(p => p.name === 'Sun');
    const sunCtx = sunP ? `Sun: ${sunP.sign} ${sunP.degree.toFixed(1)}° H${sunP.house}` : '';

    function planetCtx(names: string[]): string {
      return names.map(n => {
        const p = gtInput.chartData.planets.find(pp => pp.name === n);
        if (!p) return '';
        const d = groundTruth.planetDignities[n];
        return `${n}: ${p.sign} ${p.degree.toFixed(1)}° H${p.house} ${p.nakshatra} P${p.pada}${p.isRetrograde ? ' (R)' : ''} [${d?.status ?? 'Neutral'}]`;
      }).filter(Boolean).join('\n');
    }

    function houseCtx(start: number, end: number): string {
      const lines: string[] = [];
      for (let i = start; i <= end; i++) {
        const ha = groundTruth.houseAnalysis[i];
        if (!ha) continue;
        lines.push(`H${i} (${ha.significance.split(',')[0]}): ${ha.sign} Lord=${ha.lord} in H${ha.lordHouse}${ha.planets.length ? ' Planets: ' + ha.planets.join(',') : ''}`);
      }
      return lines.join('\n');
    }

    // -------------------------------------------------------------------------
    // Punchy eye-catching system prompt (no storytelling — bold insights, crisp points)
    // -------------------------------------------------------------------------
    const reportLanguage = (metadata.language as string) || 'en';
    const langDirective = buildLangDirective(reportLanguage);
    const yogiBabaSystem = buildYogiBabaSystem(langDirective);

    const aiContent: Record<string, string> = {};

    async function aiCall(label: string, prompt: string, ctx: string, maxTokens = 1400, apiKey?: string): Promise<Record<string, string>> {
      console.log(`[process] Starting: ${label}`);
      try {
        const result = await createAIMessage({
          max_tokens: maxTokens,
          system: yogiBabaSystem + ctx,
          messages: [{ role: 'user', content: prompt }],
          jsonMode: true,
          ...(apiKey ? { apiKey } : {}),
        });
        const parsed = parseAIJson(result, label);
        console.log(`[process] Done: ${label} (${Object.keys(parsed).length} keys)`);
        return parsed;
      } catch (err) {
        console.error(`[process] ${label} failed:`, err);
        return {};
      }
    }

    // -------------------------------------------------------------------------
    // Build all 20 calls — fire in parallel with concurrency cap of 12
    // -------------------------------------------------------------------------
    const currentYear = new Date().getFullYear();
    const dashaCtx = `Current: ${groundTruth.currentDasha.mahadasha} Mahadasha (${groundTruth.currentDasha.mahaStart}–${groundTruth.currentDasha.mahaEnd}), ${groundTruth.currentDasha.antardasha} Antardasha (${groundTruth.currentDasha.antarStart}–${groundTruth.currentDasha.antarEnd})`;
    const careerCtx = `${houseCtx(10, 10)}\n${houseCtx(2, 2)}\n${houseCtx(11, 11)}\nProfessions: ${groundTruth.careerIndicators.professions.join(', ')}\n${groundTruth.careerIndicators.businessVsService}`;
    const yogasCtx = groundTruth.detectedYogas.slice(0, 10).map((y, i) => `yoga_${i}: ${y.name} (${y.type}, ${y.strength}): ${y.planets}`).join('\n');
    const yogaKeys = groundTruth.detectedYogas.slice(0, 10).map((_, i) => `"yoga_${i}":"..."`).join(',');

    await supabase.from('generated_reports').update({ error_message: 'AI generation in progress — all sections running in parallel…' }).eq('id', reportId);

    const limit = createLimiter(12);

    type CallDef = {
      label: string;
      prompt: string;
      ctx: string;
      maxTokens: number;
      merge: (res: Record<string, string>) => void;
    };

    const calls: CallDef[] = [
      // ── Core identity ────────────────────────────────────────────────────────
      {
        label: 'summary',
        maxTokens: MAX_TOKENS.summary,
        ctx: `Name: ${name}\n${ascCtx}\n${moonCtx}\n${sunCtx}\nKeywords: ${groundTruth.personalityKeywords.join(', ')}\nElement: ${groundTruth.ascendantTraits.element}\nYogas found: ${groundTruth.detectedYogas.length}`,
        prompt: PROMPTS.summary(),
        merge: (res) => Object.assign(aiContent, res),
      },
      {
        label: 'personality',
        maxTokens: MAX_TOKENS.personality,
        ctx: `${ascCtx}\n${moonCtx}\n${sunCtx}\n${houseCtx(4, 4)}\nTraits: ${groundTruth.ascendantTraits.appearance.join(', ')}`,
        prompt: PROMPTS.personality(),
        merge: (res) => Object.assign(aiContent, res),
      },
      {
        label: 'nakshatra',
        maxTokens: MAX_TOKENS.nakshatra,
        ctx: `${ascCtx}\n${moonCtx}\n${sunCtx}\nLagna Nak: ${gtInput.chartData.planets.find(p => p.name === 'Moon')?.nakshatra ?? ''}`,
        prompt: PROMPTS.nakshatra(),
        merge: (res) => Object.assign(aiContent, res),
      },
      // ── Planets ──────────────────────────────────────────────────────────────
      {
        label: 'planets_smm',
        maxTokens: MAX_TOKENS.planets_smm,
        ctx: planetCtx(['Sun', 'Moon', 'Mars']),
        prompt: PROMPTS.planets_smm(),
        merge: (res) => { for (const [k, v] of Object.entries(res)) aiContent[`planet_${k}`] = v; },
      },
      {
        label: 'planets_mjv',
        maxTokens: MAX_TOKENS.planets_mjv,
        ctx: planetCtx(['Mercury', 'Jupiter', 'Venus']),
        prompt: PROMPTS.planets_mjv(),
        merge: (res) => { for (const [k, v] of Object.entries(res)) aiContent[`planet_${k}`] = v; },
      },
      {
        label: 'planets_srk',
        maxTokens: MAX_TOKENS.planets_srk,
        ctx: planetCtx(['Saturn', 'Rahu', 'Ketu']),
        prompt: PROMPTS.planets_srk(),
        merge: (res) => { for (const [k, v] of Object.entries(res)) aiContent[`planet_${k}`] = v; },
      },
      // ── Houses ───────────────────────────────────────────────────────────────
      {
        label: 'houses_1_6',
        maxTokens: MAX_TOKENS.houses_1_6,
        ctx: houseCtx(1, 6),
        prompt: PROMPTS.houses_1_6(),
        merge: (res) => Object.assign(aiContent, res),
      },
      {
        label: 'houses_7_12',
        maxTokens: MAX_TOKENS.houses_7_12,
        ctx: houseCtx(7, 12),
        prompt: PROMPTS.houses_7_12(),
        merge: (res) => Object.assign(aiContent, res),
      },
      // ── Yogas & Doshas ───────────────────────────────────────────────────────
      {
        label: 'yogas',
        maxTokens: MAX_TOKENS.yogas,
        ctx: `${ascCtx}\n${moonCtx}`,
        prompt: PROMPTS.yogas(yogaKeys, yogasCtx),
        merge: (res) => Object.assign(aiContent, res),
      },
      {
        label: 'doshas',
        maxTokens: MAX_TOKENS.doshas,
        ctx: `${ascCtx}\n${moonCtx}\n${planetCtx(['Mars', 'Rahu', 'Ketu', 'Saturn', 'Sun'])}`,
        prompt: PROMPTS.doshas(),
        merge: (res) => Object.assign(aiContent, res),
      },
      // ── Life areas ───────────────────────────────────────────────────────────
      {
        label: 'dasha',
        maxTokens: MAX_TOKENS.dasha,
        ctx: `${dashaCtx}\n${ascCtx}\n${moonCtx}`,
        prompt: PROMPTS.dasha(),
        merge: (res) => Object.assign(aiContent, res),
      },
      {
        label: 'career',
        maxTokens: MAX_TOKENS.career,
        ctx: careerCtx,
        prompt: PROMPTS.career(),
        merge: (res) => Object.assign(aiContent, res),
      },
      {
        label: 'marriage',
        maxTokens: MAX_TOKENS.marriage,
        ctx: `${houseCtx(7, 7)}\n${houseCtx(5, 5)}\nPartner sign: ${groundTruth.marriageIndicators.partnerSign}\n${planetCtx(['Venus', 'Jupiter'])}`,
        prompt: PROMPTS.marriage(),
        merge: (res) => Object.assign(aiContent, res),
      },
      {
        label: 'health',
        maxTokens: MAX_TOKENS.health,
        ctx: `${houseCtx(6, 6)}\n${houseCtx(8, 8)}\n${houseCtx(1, 1)}\nConstitution: ${groundTruth.healthIndicators.constitution}\nVulnerable: ${groundTruth.healthIndicators.vulnerableSystems.join(', ')}`,
        prompt: PROMPTS.health(),
        merge: (res) => Object.assign(aiContent, res),
      },
      {
        label: 'spiritual',
        maxTokens: MAX_TOKENS.spiritual,
        ctx: `${houseCtx(9, 9)}\n${houseCtx(12, 12)}\n${planetCtx(['Rahu', 'Ketu', 'Jupiter'])}`,
        prompt: PROMPTS.spiritual(),
        merge: (res) => Object.assign(aiContent, res),
      },
      // ── Forecasts ────────────────────────────────────────────────────────────
      {
        label: 'transits',
        maxTokens: MAX_TOKENS.transits,
        ctx: `${ascCtx}\n${moonCtx}\nYear: ${currentYear}\n${dashaCtx}`,
        prompt: PROMPTS.transits(currentYear),
        merge: (res) => Object.assign(aiContent, res),
      },
      {
        label: 'remedies',
        maxTokens: MAX_TOKENS.remedies,
        ctx: `${ascCtx}\n${moonCtx}\n${planetCtx(['Saturn', 'Rahu', 'Ketu', 'Mars'])}\nChallenges: ${groundTruth.personalityKeywords.slice(0, 5).join(', ')}`,
        prompt: PROMPTS.remedies(),
        merge: (res) => Object.assign(aiContent, res),
      },
      {
        label: 'lucky',
        maxTokens: MAX_TOKENS.lucky,
        ctx: `${ascCtx}\n${moonCtx}\nElement: ${groundTruth.ascendantTraits.element}`,
        prompt: PROMPTS.lucky(),
        merge: (res) => Object.assign(aiContent, res),
      },
      {
        label: 'yearly_predictions',
        maxTokens: MAX_TOKENS.yearly_predictions,
        ctx: `${dashaCtx}\n${ascCtx}\n${moonCtx}\nUpcoming dashas: ${groundTruth.currentDasha.mahadasha}`,
        prompt: PROMPTS.yearly_predictions(currentYear),
        merge: (res) => Object.assign(aiContent, res),
      },
      {
        label: 'conclusion',
        maxTokens: MAX_TOKENS.conclusion,
        ctx: `${ascCtx}\n${moonCtx}\nYogas: ${groundTruth.detectedYogas.map(y => y.name).join(', ')}\nElement: ${groundTruth.ascendantTraits.element}`,
        prompt: PROMPTS.conclusion(),
        merge: (res) => Object.assign(aiContent, res),
      },
    ];

    // Round-robin each call across the available API keys (1 or 2).
    // Index `i % pool.length` keeps the split even and deterministic.
    console.log(`[process] Using ${apiKeyPool.length} NIM key(s) for ${calls.length} calls`);
    await Promise.all(calls.map((c, i) => {
      const key = apiKeyPool.length > 0 ? apiKeyPool[i % apiKeyPool.length] : undefined;
      return limit(() => aiCall(c.label, c.prompt, c.ctx, c.maxTokens, key).then(c.merge));
    }));

    // Save AI content to DB
    await supabase.from('generated_reports').update({
      ai_content: aiContent,
      status: 'ai_ready',
      error_message: `All AI calls complete — rendering PDF…`,
    }).eq('id', reportId);

    console.log(`[process] Done — ${Object.keys(aiContent).length} keys saved. Triggering render…`);

    // Fan-out: enqueue one feature_enrich job per feature surface so every
    // screen auto-upgrades from lite_ai → report_enriched content.
    if (reportChartId) {
      const { FEATURES_FOR_TIER } = await import('@/lib/ai/reportPrompts');
      const tier = reportType.includes('premium') ? 'premium'
        : reportType.includes('standard') ? 'standard'
        : 'basic';
      const features = FEATURES_FOR_TIER[tier] ?? FEATURES_FOR_TIER.basic;
      const enriched = await enqueueEnrichmentJobs(supabase, {
        reportId,
        chartId:  reportChartId,
        userId:   reportUserId,
        language: reportLanguage,
        features,
      });
      kickQueueDrain();
      console.log(`[process] Enqueued ${enriched} enrichment jobs for tier=${tier}`);
    }

    // Pre-warm personal daily reading so dashboard section appears instantly
    if (reportChartId && reportUserId) {
      generatePersonalDaily(supabase, {
        userId: reportUserId,
        chartId: reportChartId,
        reportId,
        language: reportLanguage,
      }).catch(e => console.warn('[process] personal daily pre-warm failed:', e instanceof Error ? e.message : e));
    }

    // Trigger PDF render
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const renderKey = process.env.INTERNAL_PROCESS_KEY;
    if (!renderKey) throw new Error('INTERNAL_PROCESS_KEY not configured — cannot trigger render');
    try {
      const renderRes = await fetch(`${appUrl}/api/reports/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': renderKey },
        body: JSON.stringify({ report_id: reportId, user_id: (report as Record<string, unknown>).user_id }),
      });
      const renderJson = await renderRes.json() as { success?: boolean; error?: string };
      console.log(`[process] Render result:`, renderJson);
    } catch (renderErr) {
      console.error('[process] Render failed:', renderErr);
    }

    return NextResponse.json({ success: true, keys: Object.keys(aiContent).length });
  } catch (error) {
    console.error('[process] Error:', error);
    if (reportId) {
      await supabase.from('generated_reports').update({
        status: 'error',
        error_message: error instanceof Error ? error.message : String(error),
      }).eq('id', reportId);
    }
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
REPORTS_DISABLED_END */
