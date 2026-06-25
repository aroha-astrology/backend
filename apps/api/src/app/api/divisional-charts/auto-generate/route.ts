export const runtime = 'nodejs';
export const maxDuration = 120;

// Called opportunistically after report renders complete — processes one pending
// divisional chart analysis while the LLM is otherwise idle.

import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

// Highest-value charts get auto-generated first when no user-requested work exists
const AUTO_PRIORITY: string[] = ['D9', 'D10', 'D1', 'D2', 'D7', 'D12', 'D3', 'D4', 'D16', 'D20', 'D24', 'D27', 'D30', 'D40', 'D45', 'D60'];

export async function POST(request: Request) {
  const internalKey = request.headers.get('x-internal-key');
  if (!internalKey || internalKey !== process.env.INTERNAL_PROCESS_KEY) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createAdminSupabase();

  // Step 1: Claim any existing pending analysis (user-requested work takes priority)
  const { data: pending } = await supabase
    .from('divisional_chart_analyses')
    .select('id, kundli_chart_id, chart_type')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  let analysisId: string | null = pending?.id ?? null;

  if (!analysisId) {
    // Step 2: Find a kundli missing a high-priority analysis and create a pending row for it
    const { data: recentKundlis } = await supabase
      .from('kundli_charts')
      .select('id, user_id, divisional_charts')
      .order('created_at', { ascending: false })
      .limit(10);

    if (recentKundlis) {
      outer: for (const k of recentKundlis) {
        // Skip if divisional chart data is absent
        if (!k.divisional_charts) continue;

        for (const chartType of AUTO_PRIORITY) {
          const { data: existing } = await supabase
            .from('divisional_chart_analyses')
            .select('id, status')
            .eq('kundli_chart_id', k.id)
            .eq('chart_type', chartType)
            .maybeSingle();

          if (!existing) {
            const { data: inserted, error } = await supabase
              .from('divisional_chart_analyses')
              .insert({ kundli_chart_id: k.id, user_id: k.user_id, chart_type: chartType, status: 'pending' })
              .select('id')
              .single();
            if (!error && inserted) {
              analysisId = inserted.id;
              break outer;
            }
          }
        }
      }
    }
  }

  if (!analysisId) {
    return NextResponse.json({ processed: false });
  }

  // Step 3: Delegate to the process endpoint
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  try {
    await fetch(`${appUrl}/api/divisional-charts/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': process.env.INTERNAL_PROCESS_KEY ?? '',
      },
      body: JSON.stringify({ analysisId }),
    });
  } catch (e) {
    console.error('[divisional-charts/auto-generate] process call failed:', e);
    return NextResponse.json({ processed: false, error: String(e) }, { status: 500 });
  }

  return NextResponse.json({ processed: true, analysisId });
}
