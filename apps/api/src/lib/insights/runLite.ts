import type { SupabaseClient } from '@supabase/supabase-js';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { buildGroundTruth } from '@/lib/ai/groundTruth';
import type { GroundTruthInput } from '@/lib/ai/groundTruth';
import { buildYogiBabaSystem, buildLangDirective, PROMPTS, LITE_CALLS } from '@/lib/ai/reportPrompts';
import { getAgeDemographic, buildToneOnly } from '@/lib/ai/toneRouting';
import { upsertFeatureInsight } from './cache';
import { buildDeterministicFallback } from './deterministicFallbacks';
import {
  mapShadbalaToAxes,
  GUNA_AXIS_LABELS,
  GUNA_AXIS_ORDER,
  type GunaAxisKey,
} from '@/lib/guna/mapShadbalaToAxes';
import type { PlanetShadbala } from '@aroha-astrology/shared';

const LITE_TIMEOUT_MS = 45_000;

interface LitePayload {
  chart_id: string;
  feature_key: string;
  language: string;
  params_hash: string;
  user_id: string;
}

/**
 * Run a single-call lite AI generation for one feature surface.
 * Fetches chart + profile data, builds ground truth, calls NIM once, and
 * writes source='lite_ai' to feature_insights.
 * On NIM failure: writes source='deterministic' with expires_at = now()+1h.
 */
export async function runLite(
  supabase: SupabaseClient,
  payload: LitePayload,
): Promise<{ ok: boolean; error?: string }> {
  const { chart_id, feature_key, language, params_hash, user_id } = payload;

  const liteCalls = LITE_CALLS[feature_key];
  if (!liteCalls || liteCalls.length === 0) {
    return { ok: false, error: `No lite call spec for feature: ${feature_key}` };
  }

  // ── Fetch chart + profile + user life-context (parallel) ─────────────────

  const [chartResult, userResult] = await Promise.all([
    supabase
      .from('kundli_charts')
      .select(`
        id, chart_data, dasha_data, yoga_data, dosha_data, shadbala, ashtakavarga, panchang_at_birth,
        birth_profiles ( name, dob, tob, pob, gender )
      `)
      .eq('id', chart_id)
      .single(),
    supabase
      .from('users')
      .select('profession, marital_status, financial_status, current_city')
      .eq('id', user_id)
      .maybeSingle(),
  ]);

  const { data: chart, error: chartErr } = chartResult;
  if (chartErr || !chart) {
    return { ok: false, error: `Chart not found: ${chartErr?.message ?? 'null'}` };
  }

  const profile = Array.isArray(chart.birth_profiles)
    ? chart.birth_profiles[0]
    : chart.birth_profiles as Record<string, string> | null;

  if (!profile) {
    return { ok: false, error: 'No birth profile linked to chart' };
  }

  // Life-context block — present-day reality the seeker shared, woven into
  // every reading so it speaks to their actual life, not abstractions.
  const userRow = userResult.data as {
    profession?: string | null;
    marital_status?: string | null;
    financial_status?: string | null;
    current_city?: string | null;
  } | null;

  const lifeCtxLines: string[] = [];

  // Age — derived from DOB, drives tone routing and life-stage relevance.
  const dobStr = (profile as { dob?: string | null })?.dob ?? null;
  const demographic = getAgeDemographic(dobStr);
  if (dobStr) {
    const birth = new Date(dobStr);
    if (!isNaN(birth.getTime())) {
      const now = new Date();
      let age = now.getFullYear() - birth.getFullYear();
      const hadBday = now.getMonth() > birth.getMonth() ||
        (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
      if (!hadBday) age -= 1;
      if (age >= 0 && age < 120) lifeCtxLines.push(`Age: ${age}`);
    }
  }
  if (userRow?.current_city)     lifeCtxLines.push(`Lives in: ${userRow.current_city}`);
  if (userRow?.profession)       lifeCtxLines.push(`Works as: ${userRow.profession}`);
  if (userRow?.marital_status) {
    const label: Record<string, string> = {
      single: 'Single', dating: 'Dating', engaged: 'Engaged',
      married: 'Married', separated_divorced: 'Separated/Divorced', widowed: 'Widowed',
    };
    lifeCtxLines.push(`Relationship: ${label[userRow.marital_status] ?? userRow.marital_status}`);
  }
  if (userRow?.financial_status && userRow.financial_status !== 'prefer_not_to_say') {
    const label: Record<string, string> = {
      tight: 'Money is tight', stable: 'Financially stable', comfortable: 'Financially comfortable',
    };
    lifeCtxLines.push(`Financial: ${label[userRow.financial_status] ?? userRow.financial_status}`);
  }
  const lifeCtxBlock = lifeCtxLines.length > 0
    ? `\n\nUSER PRESENT-DAY CONTEXT — for YOUR calibration only. Anchor advice to their actual life, but follow these HARD rules when writing:
- NEVER quote the user's profession, employer, city, or relationship status verbatim. Do not name specific job titles ("Software Engineering", "Product Manager", "Doctor") — abstract to the SECTOR or KIND of work ("technical and analytical work", "people-facing leadership", "creative crafts", "care and healing professions") and write as though the chart revealed it.
- NEVER invent project names, app names, company names, colleague names, or specific past incidents.
- Weave context naturally as patterns and dynamics — never as a readback of what the user told us.
${lifeCtxLines.join('\n')}`
    : '';

  // Age-tuned voice — peer/guru register, slang, examples shift with life stage.
  const toneBlock = buildToneOnly(demographic);

  // ── Build ground truth ────────────────────────────────────────────────────

  const chartData = (chart.chart_data ?? {}) as Record<string, unknown>;
  const planets = (chartData.planets ?? []) as Array<Record<string, unknown>>;
  const houses  = (chartData.houses  ?? []) as Array<Record<string, unknown>>;
  const asc     = (chartData.ascendant ?? {}) as Record<string, unknown>;

  const gtInput: GroundTruthInput = {
    name:   String(profile.name ?? ''),
    dob:    String(profile.dob ?? ''),
    tob:    String(profile.tob ?? ''),
    pob:    String(profile.pob ?? ''),
    gender: String(profile.gender ?? ''),
    chartData: {
      planets: planets.map(p => ({
        name:        String(p.planet ?? p.name ?? ''),
        sign:        String(p.sign ?? ''),
        degree:      Number(p.signDegree ?? p.degree ?? 0),
        nakshatra:   String(p.nakshatra ?? ''),
        pada:        Number(p.nakshatraPada ?? p.pada ?? 0),
        house:       Number(p.house ?? 0),
        isRetrograde: Boolean(p.isRetrograde),
      })),
      houses: houses.map(h => ({
        house: Number(h.house ?? 0),
        sign:  String(h.sign ?? ''),
        lord:  String(h.lord ?? ''),
      })),
      ascendant: {
        sign:   String(asc.sign ?? ''),
        degree: Number(asc.degree ?? 0),
        lord:   String(asc.lord ?? ''),
      },
    },
    dashaData:    (chart.dasha_data    ?? {}) as Record<string, unknown>,
    yogaData:     (chart.yoga_data     ?? []) as Array<Record<string, unknown>>,
    doshaData:    (chart.dosha_data    ?? {}) as Record<string, unknown>,
    shadbala:     (chart.shadbala      ?? {}) as Record<string, unknown>,
    ashtakavarga: (chart.ashtakavarga  ?? {}) as Record<string, unknown>,
    panchangAtBirth: (chart.panchang_at_birth ?? {}) as Record<string, unknown>,
  };

  const groundTruth = buildGroundTruth(gtInput);

  const shadbalaArr = (chart.shadbala as unknown as PlanetShadbala[] | null) ?? [];

  // ── Build context snippets (mirrors process/route.ts helpers) ────────────

  const ascCtx  = `Ascendant: ${asc.sign ?? ''} ${Number(asc.degree ?? 0).toFixed(1)}° Lord: ${asc.lord ?? ''}`;
  const moonP   = gtInput.chartData.planets.find(p => p.name === 'Moon');
  const moonCtx = moonP ? `Moon: ${moonP.sign} ${moonP.degree.toFixed(1)}° H${moonP.house} Nak: ${moonP.nakshatra}` : '';
  const sunP    = gtInput.chartData.planets.find(p => p.name === 'Sun');
  const sunCtx  = sunP ? `Sun: ${sunP.sign} ${sunP.degree.toFixed(1)}° H${sunP.house}` : '';
  const d       = groundTruth.currentDasha;
  const dashaCtx = `Current: ${d.mahadasha} Mahadasha (${d.mahaStart}–${d.mahaEnd}), ${d.antardasha} Antardasha (${d.antarStart}–${d.antarEnd})`;

  function planetCtx(names: string[]): string {
    return names.map(n => {
      const p = gtInput.chartData.planets.find(pp => pp.name === n);
      if (!p) return '';
      const dig = groundTruth.planetDignities[n];
      return `${n}: ${p.sign} ${p.degree.toFixed(1)}° H${p.house} ${p.nakshatra} P${p.pada}${p.isRetrograde ? ' (R)' : ''} [${dig?.status ?? 'Neutral'}]`;
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

  const currentYear = new Date().getFullYear();

  // ── Build context per feature ─────────────────────────────────────────────

  function buildCtx(): string {
    switch (feature_key) {
      case 'dasha_widget':
      case 'life_journey':
        return `${dashaCtx}\n${ascCtx}\n${moonCtx}\nUpcoming dashas: ${groundTruth.dashaTimeline.slice(0, 3).map(x => `${x.planet}(${x.start}–${x.end})`).join(', ')}`;
      case 'career_lite':
        return `${houseCtx(10, 10)}\n${houseCtx(2, 2)}\n${houseCtx(11, 11)}\nProfessions: ${groundTruth.careerIndicators.professions.join(', ')}\n${groundTruth.careerIndicators.businessVsService}`;
      case 'marriage_lite':
      case 'couple_lite':
        return `${houseCtx(7, 7)}\n${moonCtx}\n${planetCtx(['Venus', 'Jupiter'])}\nPartner sign: ${groundTruth.marriageIndicators.partnerSign}\nTiming: ${groundTruth.marriageIndicators.timing}`;
      case 'health_lite':
        return `${ascCtx}\n${moonCtx}\n${planetCtx(['Mars', 'Saturn', 'Rahu', 'Ketu'])}\nConstitution: ${groundTruth.healthIndicators.constitution}\nVulnerable: ${groundTruth.healthIndicators.vulnerableSystems.join(', ')}`;
      case 'spiritual_lite':
        return `${houseCtx(9, 9)}\n${houseCtx(12, 12)}\n${planetCtx(['Jupiter', 'Ketu'])}\n${ascCtx}`;
      case 'past_life_lite':
        return `${houseCtx(8, 8)}\n${houseCtx(12, 12)}\n${planetCtx(['Rahu', 'Ketu', 'Saturn'])}\n${ascCtx}`;
      case 'remedies_lite':
        return `${ascCtx}\n${moonCtx}\n${planetCtx(['Saturn', 'Rahu', 'Ketu', 'Mars'])}\nWeak planets: ${groundTruth.planetRemediesNeeded.join(', ')}`;
      case 'yearly_lite':
        return `${dashaCtx}\n${ascCtx}\n${moonCtx}\nTransit year: ${currentYear}`;
      case 'guna_chakra': {
        const axes = mapShadbalaToAxes(shadbalaArr);
        const sorted = [...GUNA_AXIS_ORDER].sort((a, b) => axes[b] - axes[a]);
        const lines = GUNA_AXIS_ORDER.map(k => `${GUNA_AXIS_LABELS[k as GunaAxisKey]}: ${axes[k]}/100`).join('\n');
        return `Six personality dimensions (0-100, higher = stronger expression):\n${lines}\n\nStrongest: ${sorted.slice(0, 2).map(k => GUNA_AXIS_LABELS[k as GunaAxisKey]).join(', ')}\nWeakest: ${sorted.slice(-2).map(k => GUNA_AXIS_LABELS[k as GunaAxisKey]).join(', ')}`;
      }
      case 'summary_lite':
        return `Name: ${profile?.name ?? ''}\n${ascCtx}\n${moonCtx}\n${sunCtx}\nKeywords: ${groundTruth.personalityKeywords.join(', ')}\nElement: ${groundTruth.ascendantTraits.element}\nYogas: ${groundTruth.detectedYogas.length}`;
      case 'personality_lite':
        return `${ascCtx}\n${moonCtx}\n${sunCtx}\n${houseCtx(4, 4)}\nTraits: ${groundTruth.ascendantTraits.appearance.join(', ')}`;
      default:
        return `${ascCtx}\n${moonCtx}\n${dashaCtx}`;
    }
  }

  // ── Build prompt using the same PROMPTS registry ──────────────────────────

  function buildPrompt(callId: keyof typeof PROMPTS): string {
    const fn = PROMPTS[callId];
    if (!fn) return '';
    // Only transits and yearly_predictions need a year arg; yogas needs keys/ctx
    if (callId === 'transits')            return (fn as (y: number) => string)(currentYear);
    if (callId === 'yearly_predictions')  return (fn as (y: number) => string)(currentYear);
    return (fn as () => string)();
  }

  // ── Execute lite NIM call(s) ──────────────────────────────────────────────

  const langDirective = buildLangDirective(language);
  const systemPrompt  = buildYogiBabaSystem(langDirective);
  const ctx           = buildCtx();

  const merged: Record<string, string> = {};

  for (const { callId, maxTokens, resultKeys, model, temperature } of liteCalls) {
    const prompt = buildPrompt(callId);
    if (!prompt) continue;

    try {
      const signal = AbortSignal.timeout(LITE_TIMEOUT_MS);
      const result = await createAIMessage({
        max_tokens:  maxTokens,
        system:      systemPrompt + ctx + lifeCtxBlock + (toneBlock ? `\n\n${toneBlock}` : ''),
        messages:    [{ role: 'user', content: prompt }],
        jsonMode:    true,
        temperature: temperature ?? 0.7,
        ...(model ? { model } : {}),
        signal,
      });

      const textBlock = result.content.find(c => c.type === 'text');
      if (!textBlock) continue;

      let raw = textBlock.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      const start = raw.indexOf('{');
      if (start > 0) raw = raw.slice(start);

      let parsed: Record<string, string> = {};
      try { parsed = JSON.parse(raw); } catch { /* best-effort */ }

      for (const [k, v] of Object.entries(parsed)) {
        if (resultKeys.length === 0 || resultKeys.includes(k)) {
          merged[k] = v;
        }
      }

      // For yearly_predictions, resultKeys is built at runtime from parsed keys
      if (callId === 'yearly_predictions' && resultKeys.length === 0) {
        Object.assign(merged, parsed);
      }
    } catch (err) {
      console.warn(`[runLite] NIM call failed for ${feature_key}/${callId}:`, err);
    }
  }

  // ── Write result ──────────────────────────────────────────────────────────

  if (Object.keys(merged).length > 0) {
    await upsertFeatureInsight(supabase, {
      userId:     user_id,
      chartId:    chart_id,
      featureKey: feature_key,
      paramsHash: params_hash,
      language,
      source:     'lite_ai',
      content:    merged,
    });
    return { ok: true };
  }

  // NIM exhausted — write deterministic fallback with 1h expiry
  const fallback = buildDeterministicFallback(feature_key, groundTruth);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await upsertFeatureInsight(supabase, {
    userId:     user_id,
    chartId:    chart_id,
    featureKey: feature_key,
    paramsHash: params_hash,
    language,
    source:     'deterministic',
    content:    fallback,
    expiresAt,
  });
  return { ok: false, error: 'NIM calls produced no output — deterministic fallback written' };
}
