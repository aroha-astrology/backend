import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { runLifeJourneyPhase } from '@/lib/life-journey/runPhase';
import { enqueueJob } from '@/lib/queue';
import { kickDrain } from '@/lib/queue/kick';

export const runtime = 'nodejs';
export const maxDuration = 60;

const PLANET_THEME: Record<string, { title: string }> = {
  Ketu:    { title: 'Spiritual Awakening & Past Karma' },
  Venus:   { title: 'Love, Beauty & Creative Expansion' },
  Sun:     { title: 'Self-Discovery & Personal Power' },
  Moon:    { title: 'Emotional Depth & Family Bonds' },
  Mars:    { title: 'Ambition, Energy & Life Challenges' },
  Rahu:    { title: 'Big Dreams & Unconventional Paths' },
  Jupiter: { title: 'Wisdom, Expansion & Good Fortune' },
  Saturn:  { title: 'Discipline, Karma & Life Lessons' },
  Mercury: { title: 'Communication, Skills & Adaptability' },
};

/* -------------------------------------------------------------------------- */
/*  POST /api/life-journey  { chartId, phaseIndex }                            */
/*  Fast path: events already in DB → return immediately (status: 'ready').   */
/*  Slow path: no events yet → enqueue job + kick drain + return 'generating'. */
/*  Client polls every 3 s until status flips to 'ready'.                     */
/* -------------------------------------------------------------------------- */

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { chartId: rawChartId, phaseIndex } = await request.json() as { chartId: string; phaseIndex: number };

    let chartId = rawChartId;
    if (chartId === 'current') {
      const { data: latest } = await supabase
        .from('kundli_charts')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (!latest) return NextResponse.json({ error: 'No chart found for user' }, { status: 404 });
      chartId = latest.id as string;
    }

    // Check if events already exist before doing any AI work
    const { count: eventCount } = await supabase
      .from('life_journey_events')
      .select('id', { count: 'exact', head: true })
      .eq('chart_id', chartId)
      .eq('phase_index', phaseIndex)
      .eq('is_active', true);

    if ((eventCount ?? 0) >= 5) {
      // Fast path — read from DB, no AI needed
      const result = await runLifeJourneyPhase(supabase, user.id, chartId, phaseIndex);
      if (!result.ok) {
        const status = result.error.code === 'chart_not_found' ? 404 : 400;
        const message = result.error.code === 'chart_not_found' ? 'Chart not found' : 'Invalid phase index';
        return NextResponse.json({ error: message }, { status });
      }
      return NextResponse.json({ success: true, status: 'ready', data: result.data });
    }

    // Events not ready — load chart metadata for the loading screen, then enqueue
    const { data: chart } = await supabase
      .from('kundli_charts')
      .select('dasha_data, birth_profiles(name)')
      .eq('id', chartId)
      .eq('user_id', user.id)
      .single();
    if (!chart) return NextResponse.json({ error: 'Chart not found' }, { status: 404 });

    const mahadashas = (
      ((chart.dasha_data as Record<string, unknown>)?.vimshottari as Record<string, unknown>)?.mahadashas ?? []
    ) as Array<Record<string, unknown>>;

    const phase = mahadashas[phaseIndex] as Record<string, unknown> | undefined;
    if (!phase) return NextResponse.json({ error: 'Invalid phase index' }, { status: 400 });

    const planet = phase.planet as string;
    const meta = {
      planet,
      title: PLANET_THEME[planet]?.title ?? `${planet} Dasha`,
      startYear: new Date(phase.startDate as string).getFullYear(),
      endYear: new Date(phase.endDate as string).getFullYear(),
    };

    // Enqueue with high priority (10) so it runs ahead of onboarding batch
    await enqueueJob(supabase, user.id, 'life_journey_phase', { chart_id: chartId, phase_index: phaseIndex }, 10);
    void kickDrain(request);

    return NextResponse.json({ success: true, status: 'generating', meta });
  } catch (err) {
    console.error('[life-journey]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/*  GET /api/life-journey?chartId=xxx — timeline of past+current phases       */
/* -------------------------------------------------------------------------- */

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    let chartId = url.searchParams.get('chartId');
    if (!chartId) return NextResponse.json({ error: 'chartId required' }, { status: 400 });

    if (chartId === 'current') {
      const { data: latest } = await supabase
        .from('kundli_charts')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (!latest) return NextResponse.json({ error: 'No chart found for user' }, { status: 404 });
      chartId = latest.id as string;
    }

    const { data: chart } = await supabase
      .from('kundli_charts')
      .select('dasha_data, birth_profiles(name, dob, gender)')
      .eq('id', chartId)
      .eq('user_id', user.id)
      .single();
    if (!chart) return NextResponse.json({ error: 'Chart not found' }, { status: 404 });

    const dashaData = chart.dasha_data as Record<string, unknown> | undefined;
    const vimshottari = dashaData?.vimshottari as Record<string, unknown> | undefined;
    const mahadashas = (vimshottari?.mahadashas ?? []) as Array<Record<string, unknown>>;
    const profile = (chart.birth_profiles as unknown) as Record<string, unknown> | undefined;
    const dob = profile?.dob as string;
    const dobDate = dob ? new Date(dob) : new Date('1990-01-01');
    const birthYear = dobDate.getFullYear();

    // Return all mahadashas up to age 120 (full Vimshottari cycle).
    // Past tab filters by startYear < now on the client; Future tab filters
    // by startYear >= now. Same payload feeds both views.
    const phases = mahadashas
      .map((m, i) => {
        const start = new Date(m.startDate as string);
        const end = new Date(m.endDate as string);
        const startAge = Math.max(0, Math.floor((start.getTime() - dobDate.getTime()) / (365.25 * 24 * 3600 * 1000)));
        const endAge = Math.max(0, Math.floor((end.getTime() - dobDate.getTime()) / (365.25 * 24 * 3600 * 1000)));
        const planet = m.planet as string;
        const planetInfo = PLANET_THEME[planet];
        return {
          index: i,
          planet,
          title: planetInfo?.title ?? `${planet} Dasha`,
          startYear: start.getFullYear(),
          endYear: end.getFullYear(),
          startAge,
          endAge,
          isActive: m.isActive as boolean,
          isCurrent: m.isActive as boolean,
        };
      })
      .filter(p => p.startAge <= 120);

    return NextResponse.json({
      success: true,
      data: {
        phases,
        birthYear,
        name: (profile?.name as string)?.split(' ')[0] ?? 'You',
        gender: (profile?.gender as string) ?? 'female',
      },
    });
  } catch (err) {
    console.error('[life-journey GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
