export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kundliChartId: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { kundliChartId } = await params;

  // Verify the chart belongs to this user
  const { data: chart } = await supabase
    .from('kundli_charts')
    .select('id')
    .eq('id', kundliChartId)
    .eq('user_id', user.id)
    .single();

  if (!chart) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: analyses } = await supabase
    .from('divisional_chart_analyses')
    .select('chart_type, status, generated_at, analysis, key_findings')
    .eq('kundli_chart_id', kundliChartId)
    .eq('user_id', user.id);

  return NextResponse.json({ analyses: analyses ?? [] });
}
