import type { SupabaseClient } from '@supabase/supabase-js';
import type { KundliContext } from './analysis';

/**
 * Pull a compact Kundli summary so Pandit Hastamani can cross-reference
 * palm findings with the user's birth chart instead of guessing.
 *
 * Strategy: prefer the chartId the caller passed; otherwise fall back to
 * the user's most recently created chart. Returns undefined if nothing
 * usable is found — callers must treat this as best-effort context.
 */
export async function fetchKundliContext(
  supabase: SupabaseClient,
  userId: string,
  chartId?: string,
): Promise<KundliContext | undefined> {
  let query = supabase
    .from('kundli_charts')
    .select('chart_data, dasha_data, birth_profiles(name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (chartId) query = query.eq('id', chartId);

  const { data: chart } = await query.maybeSingle();
  if (!chart) return undefined;

  const cd = (chart.chart_data ?? {}) as Record<string, unknown>;
  const dd = (chart.dasha_data ?? {}) as Record<string, unknown>;

  const ascendant = cd.ascendant as { sign?: string } | undefined;
  const planets = (cd.planets ?? []) as Array<{ planet?: string; name?: string; sign?: string; house?: number }>;

  const moon = planets.find((p) => (p.planet ?? p.name)?.toLowerCase() === 'moon');
  const sun = planets.find((p) => (p.planet ?? p.name)?.toLowerCase() === 'sun');
  const vimshottari = dd.vimshottari as Record<string, unknown> | undefined;
  const md = vimshottari?.currentMahadasha as { planet?: string } | undefined;

  const planetSummary = planets
    .slice(0, 7)
    .map((p) => `${p.planet ?? p.name}:${p.sign ?? '?'}H${p.house ?? '?'}`)
    .join(', ');

  return {
    ascendantSign: ascendant?.sign,
    moonSign: moon?.sign,
    sunSign: sun?.sign,
    currentMahadasha: md?.planet,
    planetSummary: planetSummary || undefined,
  };
}
