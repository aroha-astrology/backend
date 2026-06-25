export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getFeatureInsight } from '@/lib/insights/cache';
import { buildGroundTruth } from '@/lib/ai/groundTruth';
import type { GroundTruthInput } from '@/lib/ai/groundTruth';

/**
 * GET /api/insights/[featureKey]?chartId=...&language=en&paramsHash=
 *
 * Unified insight endpoint. Returns cached content with cascading fallback:
 * report_enriched → lite_ai → deterministic (from astro-engine, instant).
 *
 * The response always includes:
 *   { content: {...}, source: 'report_enriched'|'lite_ai'|'deterministic', featureKey }
 *
 * Supabase realtime on the feature_insights table auto-upgrades the client
 * when a higher-quality row lands — no polling required.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ featureKey: string }> },
) {
  const { featureKey } = await params;
  const sp = request.nextUrl.searchParams;
  const chartId    = sp.get('chartId') ?? '';
  const language   = sp.get('language') ?? 'en';
  const paramsHash = sp.get('paramsHash') ?? '';

  if (!chartId) {
    return NextResponse.json({ error: 'chartId is required' }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Optionally build groundTruth for a richer deterministic fallback
  let groundTruth: ReturnType<typeof buildGroundTruth> | undefined;
  try {
    const { data: chart } = await supabase
      .from('kundli_charts')
      .select(`
        chart_data, dasha_data, yoga_data, dosha_data, shadbala, ashtakavarga, panchang_at_birth,
        birth_profiles ( name, dob, tob, pob, gender )
      `)
      .eq('id', chartId)
      .eq('user_id', user.id)
      .single();

    if (chart) {
      const profile = Array.isArray(chart.birth_profiles)
        ? chart.birth_profiles[0]
        : chart.birth_profiles as Record<string, string> | null;

      if (profile) {
        const cd  = (chart.chart_data ?? {}) as Record<string, unknown>;
        const planets = (cd.planets ?? []) as Array<Record<string, unknown>>;
        const houses  = (cd.houses  ?? []) as Array<Record<string, unknown>>;
        const asc     = (cd.ascendant ?? {}) as Record<string, unknown>;

        const gtInput: GroundTruthInput = {
          name:   String(profile.name ?? ''),
          dob:    String(profile.dob  ?? ''),
          tob:    String(profile.tob  ?? ''),
          pob:    String(profile.pob  ?? ''),
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
            ascendant: { sign: String(asc.sign ?? ''), degree: Number(asc.degree ?? 0), lord: String(asc.lord ?? '') },
          },
          dashaData:    (chart.dasha_data    ?? {}) as Record<string, unknown>,
          yogaData:     (chart.yoga_data     ?? []) as Array<Record<string, unknown>>,
          doshaData:    (chart.dosha_data    ?? {}) as Record<string, unknown>,
          shadbala:     (chart.shadbala      ?? {}) as Record<string, unknown>,
          ashtakavarga: (chart.ashtakavarga  ?? {}) as Record<string, unknown>,
          panchangAtBirth: (chart.panchang_at_birth ?? {}) as Record<string, unknown>,
        };
        groundTruth = buildGroundTruth(gtInput);
      }
    }
  } catch { /* non-fatal — fallback works without groundTruth */ }

  // Read-through cache
  const { data: existingRow } = await supabase
    .from('feature_insights')
    .select('source, content, expires_at')
    .eq('user_id', user.id)
    .eq('chart_id', chartId)
    .eq('feature_key', featureKey)
    .eq('params_hash', paramsHash)
    .eq('language', language)
    .maybeSingle();

  const now = new Date().toISOString();
  if (existingRow && (existingRow.expires_at === null || existingRow.expires_at > now)) {
    return NextResponse.json({
      featureKey,
      source:  existingRow.source,
      content: existingRow.content,
    });
  }

  const content = await getFeatureInsight(supabase, featureKey, {
    chartId,
    userId: user.id,
    language,
    paramsHash,
    groundTruth,
  });

  // Read back to get actual source written
  const { data: written } = await supabase
    .from('feature_insights')
    .select('source')
    .eq('user_id', user.id)
    .eq('chart_id', chartId)
    .eq('feature_key', featureKey)
    .eq('params_hash', paramsHash)
    .eq('language', language)
    .maybeSingle();

  return NextResponse.json({
    featureKey,
    source:  written?.source ?? 'deterministic',
    content,
  });
}
