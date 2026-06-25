export const runtime = 'nodejs';
export const maxDuration = 30;

import { NextResponse, after } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

const ALLOWED_CHARTS = new Set([
  'D1', 'D2', 'D3', 'D4', 'D7', 'D9', 'D10',
  'D12', 'D16', 'D20', 'D24', 'D27', 'D30', 'D40', 'D45', 'D60',
]);

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as { kundliChartId?: string; chartType?: string };
  const { kundliChartId, chartType } = body;

  if (!kundliChartId || !chartType) {
    return NextResponse.json({ error: 'kundliChartId and chartType are required' }, { status: 400 });
  }
  if (!ALLOWED_CHARTS.has(chartType)) {
    return NextResponse.json({ error: 'Invalid chartType' }, { status: 400 });
  }

  // Verify ownership
  const { data: chart } = await supabase
    .from('kundli_charts')
    .select('id')
    .eq('id', kundliChartId)
    .eq('user_id', user.id)
    .single();

  if (!chart) return NextResponse.json({ error: 'Chart not found' }, { status: 404 });

  const admin = createAdminSupabase();

  // Check for existing row
  const { data: existing } = await admin
    .from('divisional_chart_analyses')
    .select('id, status')
    .eq('kundli_chart_id', kundliChartId)
    .eq('chart_type', chartType)
    .maybeSingle();

  // Return early if already ready or currently generating
  if (existing && (existing.status === 'ready' || existing.status === 'generating')) {
    return NextResponse.json({ id: existing.id, status: existing.status });
  }

  let analysisId: string;

  if (existing) {
    // Reset errored row to pending
    await admin
      .from('divisional_chart_analyses')
      .update({ status: 'pending', error_message: null })
      .eq('id', existing.id);
    analysisId = existing.id;
  } else {
    const { data: inserted, error: insertError } = await admin
      .from('divisional_chart_analyses')
      .insert({ kundli_chart_id: kundliChartId, user_id: user.id, chart_type: chartType, status: 'pending' })
      .select('id')
      .single();
    if (insertError || !inserted) {
      return NextResponse.json({ error: 'Failed to create analysis record' }, { status: 500 });
    }
    analysisId = inserted.id;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const internalKey = process.env.INTERNAL_PROCESS_KEY ?? '';

  after(async () => {
    try {
      await fetch(`${appUrl}/api/divisional-charts/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': internalKey },
        body: JSON.stringify({ analysisId }),
      });
    } catch (e) {
      console.error('[divisional-charts/generate] after() trigger failed:', e);
    }
  });

  return NextResponse.json({ id: analysisId, status: 'pending' });
}
