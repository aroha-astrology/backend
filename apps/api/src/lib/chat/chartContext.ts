import type { createServerSupabase } from '@/lib/supabase/server';
import { cacheGet, cacheSet } from '@/lib/redis';

const CHART_CACHE_TTL = 300;

export type ChartRow = Record<string, unknown> & { birth_profiles?: Record<string, unknown> };

export async function getChartCached(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  chartId: string,
  userId: string,
): Promise<ChartRow | null> {
  const key = `chart:${chartId}:${userId}`;
  const cached = await cacheGet<ChartRow>(key);
  if (cached) return cached;

  const { data } = await supabase
    .from('kundli_charts')
    .select('*, birth_profiles(name, dob, tob, pob, gender)')
    .eq('id', chartId)
    .eq('user_id', userId)
    .single();

  if (data) await cacheSet(key, data, CHART_CACHE_TTL);
  return (data as ChartRow | null) ?? null;
}
