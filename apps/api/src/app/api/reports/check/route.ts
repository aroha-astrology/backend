import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

// REPORTS_DISABLED: always returns 'none' — no DB query needed.
export async function GET(_request: NextRequest) {
  return NextResponse.json({ status: 'none' });
}

/* REPORTS_DISABLED_START
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const chartId = request.nextUrl.searchParams.get('chartId');
  if (!chartId) return NextResponse.json({ status: 'none' });

  const { data: ready } = await supabase
    .from('generated_reports')
    .select('id, pdf_url')
    .eq('user_id', user.id)
    .contains('metadata', { chartId })
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ready) return NextResponse.json({ status: 'ready', reportId: ready.id, downloadUrl: ready.pdf_url ?? null });

  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: inFlight } = await supabase
    .from('generated_reports')
    .select('id, status')
    .eq('user_id', user.id)
    .contains('metadata', { chartId })
    .in('status', ['pending', 'generating'])
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inFlight) return NextResponse.json({ status: inFlight.status, reportId: inFlight.id });

  return NextResponse.json({ status: 'none' });
}
REPORTS_DISABLED_END */
