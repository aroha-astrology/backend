export const runtime = 'nodejs';
export const maxDuration = 10;

import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getChartCached } from '@/lib/chat/chartContext';
import { cacheGet } from '@/lib/redis';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { chartId } = (await request.json().catch(() => ({}))) as { chartId?: string };

    const tasks: PromiseLike<unknown>[] = [];

    if (chartId) {
      tasks.push(getChartCached(supabase, chartId, user.id));

      tasks.push(
        supabase
          .from('palm_readings')
          .select('analysis, hand')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      );

      tasks.push(
        supabase
          .from('divisional_chart_analyses')
          .select('chart_type, key_findings')
          .eq('kundli_chart_id', chartId)
          .in('chart_type', ['D9', 'D10'])
          .eq('status', 'ready'),
      );

      tasks.push(
        supabase
          .from('predictions')
          .select('content, type, created_at')
          .eq('chart_id', chartId)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),
      );

      tasks.push(
        supabase
          .from('follow_up_questions')
          .select('question, answer')
          .eq('chart_id', chartId)
          .not('answer', 'is', null)
          .order('created_at', { ascending: false })
          .limit(20),
      );
    }

    const todayKey = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    tasks.push(cacheGet(`panchang:${todayKey}:20.59,78.96`));

    await Promise.allSettled(tasks);

    return new Response(null, { status: 204 });
  } catch (err) {
    console.warn('[chat/warmup] non-fatal:', err);
    return new Response(null, { status: 204 });
  }
}
