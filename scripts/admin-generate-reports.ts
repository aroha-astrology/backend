/**
 * Admin script: generate premium kundli reports for specific users
 * bypassing credit checks via service role key.
 *
 * Usage:  npx tsx scripts/admin-generate-reports.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
const INTERNAL_KEY = process.env.INTERNAL_PROCESS_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !INTERNAL_KEY) {
  console.error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INTERNAL_PROCESS_KEY');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// { userId, chartId, profileId }
const TARGETS = [
  {
    email: 's9475220017@gmail.com',
    userId: '2c86b824-ddb0-4129-93bf-a45bb61159ec',
    chartId: 'aa588d3a-c86d-4350-ba7f-38e67ed8bc99',
    profileId: '190b27c7-b70f-427f-aeaf-83d38cd963b8',
  },
  {
    email: 'ayesharachh@gmail.com',
    userId: 'c11e9450-da20-4f32-bcb4-d70ef446f46d',
    chartId: '4b79e7dd-7ef2-490e-a571-4b82b64d4d2c',
    profileId: '32b13294-d36d-49d6-8ee2-b3c77a9327bc',
  },
  {
    email: 'rtohellrider@gmail.com',
    userId: '170a214a-1c32-45a6-aa0a-b6487332afdc',
    chartId: '251c422c-b1a2-48e8-b440-421f92df1b3f',
    profileId: 'bd74199e-c204-4c04-9843-17c3bab7dc82',
  },
];

async function generateForUser(target: typeof TARGETS[0]) {
  console.log(`\n[${target.email}] Fetching chart data...`);

  // 1. Fetch full chart + profile
  const { data: chart, error: chartErr } = await admin
    .from('kundli_charts')
    .select('*, birth_profiles(*)')
    .eq('id', target.chartId)
    .single();

  if (chartErr || !chart) {
    console.error(`  ✗ Chart not found:`, chartErr?.message);
    return;
  }

  const profile = (chart as Record<string, unknown>).birth_profiles as Record<string, unknown>;
  const name = String(profile?.name ?? 'Native');
  const dob = String(profile?.dob ?? '');

  console.log(`  Person: ${name} (${dob})`);

  // 2. Check for existing pending/completed premium report — skip if fresh
  const { data: existing } = await admin
    .from('generated_reports')
    .select('id, status, created_at')
    .eq('user_id', target.userId)
    .eq('report_type', 'kundli_premium')
    .eq('subject_name', name)
    .eq('subject_dob', dob)
    .in('status', ['pending', 'generating', 'ready', 'completed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const age = Date.now() - new Date(existing.created_at as string).getTime();
    const ageHrs = (age / 3600000).toFixed(1);
    if (existing.status === 'pending' || existing.status === 'generating') {
      console.log(`  ↻ Already ${existing.status} (id=${existing.id}) — re-triggering process`);
      await triggerProcess(existing.id as string, target.userId);
      return;
    }
    if (parseFloat(ageHrs) < 2) {
      console.log(`  ✓ Recent ${existing.status} report (${ageHrs}h ago) — skipping`);
      return;
    }
    console.log(`  ↻ Existing report is ${ageHrs}h old — generating fresh`);
  }

  // 3. Insert pending record (admin, no credit deduction)
  const { data: saved, error: saveErr } = await admin
    .from('generated_reports')
    .insert({
      user_id: target.userId,
      report_type: 'kundli_premium',
      subject_name: name,
      subject_dob: dob,
      subject_gender: profile?.gender ?? 'male',
      status: 'pending',
      pdf_filename: `kundli-report-${name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
      metadata: {
        tier: 'premium',
        language: 'en',
        avatarUrl: null,
        chartId: target.chartId,
        profileId: target.profileId,
        chartData: chart.chart_data,
        dashaData: chart.dasha_data,
        yogaData: chart.yoga_data,
        doshaData: chart.dosha_data,
        shadbala: chart.shadbala,
        ashtakavarga: chart.ashtakavarga,
        profileData: profile,
      },
      ai_content: {},
    })
    .select('id')
    .single();

  if (saveErr || !saved) {
    console.error(`  ✗ Insert failed:`, saveErr?.message);
    return;
  }

  console.log(`  + Created report record ${saved.id}`);
  await triggerProcess(saved.id as string, target.userId);
}

async function triggerProcess(reportId: string, userId: string) {
  console.log(`  ⟳ Triggering /api/reports/process for ${reportId}...`);
  try {
    const res = await fetch(`${APP_URL}/api/reports/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': INTERNAL_KEY,
      },
      body: JSON.stringify({ report_id: reportId, user_id: userId }),
    });
    const text = await res.text();
    if (res.ok) {
      console.log(`  ✓ Process triggered (${res.status})`);
    } else {
      console.error(`  ✗ Process returned ${res.status}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.error(`  ✗ Fetch error:`, err);
  }
}

async function main() {
  console.log('=== Admin Report Generator ===');
  console.log(`Target: ${TARGETS.length} users | Tier: premium | App: ${APP_URL}\n`);

  for (const target of TARGETS) {
    await generateForUser(target);
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
