export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { generatePersonalDaily } from '@/lib/horoscope/personalDailyGenerate';

// POST /api/admin/generate-daily-horoscopes
// Generates personal daily horoscopes for every user who has a premium report.
export async function POST() {
  // 1. Verify caller is admin
  const userSupabase = await createServerSupabase();
  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: caller } = await userSupabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!caller?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 2. Fetch all premium reports that are ready
  const admin = createAdminSupabase();
  const { data: reports, error } = await admin
    .from('generated_reports')
    .select('id, user_id, metadata, ai_content')
    .eq('report_type', 'kundli_premium')
    .in('status', ['ai_ready', 'ready', 'completed']);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = reports ?? [];
  let success = 0;
  let failed = 0;
  let skipped = 0;

  // 3. For each report, generate personal daily (sequential to avoid rate limits)
  for (const report of rows) {
    const chartId = (report.metadata as Record<string, string> | null)?.chartId;
    if (!chartId) { skipped++; continue; }

    try {
      const reading = await generatePersonalDaily(admin, {
        userId: report.user_id,
        chartId,
        reportId: report.id,
        language: 'en',
        reportAiContent: report.ai_content as Record<string, string> | null,
      });
      if (reading) { success++; } else { failed++; }
    } catch (err) {
      console.error('[generate-daily-horoscopes] failed for', report.user_id, err);
      failed++;
    }
  }

  return NextResponse.json({ total: rows.length, success, failed, skipped });
}
