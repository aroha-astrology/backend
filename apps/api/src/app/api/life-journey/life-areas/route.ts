import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { runLifeAreas } from '@/lib/life-journey/runAreas';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Thin wrapper — heavy logic lives in lib/life-journey/runAreas.ts so the
 * server-side queue drain can call the same code path without HTTP.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { chartId, phaseIndex } = await request.json() as { chartId: string; phaseIndex: number };
    if (!chartId || typeof phaseIndex !== 'number') {
      return NextResponse.json({ error: 'chartId and phaseIndex required' }, { status: 400 });
    }

    const result = await runLifeAreas(supabase, user.id, chartId, phaseIndex);
    if (!result.ok) {
      const status = result.error.code === 'chart_not_found' ? 404 : 404;
      const message = result.error.code === 'chart_not_found' ? 'Chart not found' : 'Phase not found';
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (err) {
    console.error('[life-journey/life-areas]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
