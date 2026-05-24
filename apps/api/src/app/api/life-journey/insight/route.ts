import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { generateAreaInsight, type InsightContext } from '@/lib/ai/lifeJourneyEvents';

export const runtime = 'nodejs';
export const maxDuration = 30;

const PLANET_THEME: Record<string, string> = {
  Ketu:    'detachment, spiritual insight, past karma clearing, losses that teach lessons, isolation or solitude',
  Venus:   'romantic relationships, artistic pursuits, luxury and pleasure, social connections, financial gains',
  Sun:     'identity and self-expression, career recognition, authority and leadership, father figure influence',
  Moon:    'emotional sensitivity, mother and home life, domestic changes, mental fluctuations, intuition',
  Mars:    'physical energy and courage, conflicts and competition, property matters, ambition and drive',
  Rahu:    'unconventional choices, foreign connections, technology, sudden changes, obsessive pursuits',
  Jupiter: 'higher education, spiritual growth, marriage and children, wealth expansion, luck and opportunity',
  Saturn:  'hard work and perseverance, delays and obstacles, career foundations, responsibilities, karmic debts',
  Mercury: 'intellectual pursuits, business and trade, communication skills, education and learning, writing',
};

/* -------------------------------------------------------------------------- */
/*  POST /api/life-journey/insight  { chartId, area }                         */
/*  Returns cached or freshly-generated per-area insight for current antardasha */
/* -------------------------------------------------------------------------- */

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { chartId: rawChartId, area } = await request.json() as { chartId: string; area: string };
    if (!['Career', 'Love', 'Money', 'Health'].includes(area)) {
      return NextResponse.json({ error: 'Invalid area' }, { status: 400 });
    }

    let chartId = rawChartId;
    if (chartId === 'current') {
      const { data: latest } = await supabase
        .from('kundli_charts')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (!latest) return NextResponse.json({ error: 'No chart found' }, { status: 404 });
      chartId = latest.id as string;
    }

    // Parallel: fetch chart data + all cached insights for this chart+area simultaneously
    const [{ data: chart }, { data: cachedRows }] = await Promise.all([
      supabase
        .from('kundli_charts')
        .select('chart_data, dasha_data, birth_profiles(name, dob)')
        .eq('id', chartId)
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('life_journey_insights')
        .select('mahadasha_planet, antardasha_planet, title, story, do_items, avoid_items')
        .eq('chart_id', chartId)
        .eq('area', area),
    ]);

    if (!chart) return NextResponse.json({ error: 'Chart not found' }, { status: 404 });

    // Extract current antardasha info
    const dashaData = chart.dasha_data as Record<string, unknown> | undefined;
    const vimshottari = dashaData?.vimshottari as Record<string, unknown> | undefined;
    const currentMD = vimshottari?.currentMahadasha as Record<string, unknown> | undefined;
    const currentAD = vimshottari?.currentAntardasha as Record<string, unknown> | undefined;

    const mdPlanet = (currentMD?.planet as string) ?? 'Jupiter';
    const adPlanet = (currentAD?.planet as string) ?? mdPlanet;
    const adStart = (currentAD?.startDate as string) ?? '';
    const adEnd = (currentAD?.endDate as string) ?? '';

    // Match cached row against current dasha (data was fetched in parallel above)
    const cached = (cachedRows ?? []).find(
      r => r.mahadasha_planet === mdPlanet && r.antardasha_planet === adPlanet
    ) ?? null;

    if (cached) {
      return NextResponse.json({
        success: true,
        data: {
          title: cached.title as string,
          story: cached.story as string,
          doItems: cached.do_items as string[],
          avoidItems: cached.avoid_items as string[],
          cached: true,
        },
      });
    }

    // Build generation context
    const profile = chart.birth_profiles as unknown as Record<string, unknown> | undefined;
    const name = ((profile?.name as string) ?? 'You').split(' ')[0];
    const cd = chart.chart_data as Record<string, unknown> | undefined;
    const planets = (cd?.planets ?? []) as Array<Record<string, unknown>>;
    const planetSummary = planets.slice(0, 7).map(p => `${p.planet}: ${p.sign} H${p.house}`).join(', ');
    const asc = cd?.ascendant as Record<string, unknown> | undefined;

    const adStartFmt = adStart ? new Date(adStart).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
    const adEndFmt = adEnd ? new Date(adEnd).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

    const ctx: InsightContext = {
      name,
      mahadashaPlanet: mdPlanet,
      mahadashaPlanetTheme: PLANET_THEME[mdPlanet] ?? '',
      antardashaPlanet: adPlanet,
      antardashaPlanetTheme: PLANET_THEME[adPlanet] ?? '',
      area,
      adStartDate: adStartFmt,
      adEndDate: adEndFmt,
      ascendantSign: asc?.sign as string | undefined,
      planetSummary,
      dob: (profile?.dob as string | undefined) ?? null,
    };

    let insight: Awaited<ReturnType<typeof generateAreaInsight>> = null;
    try {
      insight = await generateAreaInsight(ctx);
    } catch (aiErr) {
      console.warn('[life-journey/insight] AI generation failed, falling back', aiErr);
    }

    const result = insight ?? {
      title: `${area} energy in ${mdPlanet} Mahadasha`,
      story: `This ${adPlanet} antardasha brings ${PLANET_THEME[adPlanet]?.split(',')[0] ?? 'new themes'} to your ${area.toLowerCase()} life. Stay aligned with your core values to make the most of this period.`,
      doItems: ['Stay consistent with your daily routine.', 'Trust your instincts and act with clarity.', 'Seek guidance from experienced mentors.'],
      avoidItems: ['Avoid impulsive decisions without reflection.', 'Do not neglect important relationships.', 'Resist the urge to overextend yourself.'],
    };

    // Persist to cache — fire-and-forget (not on the response path)
    supabase
      .from('life_journey_insights')
      .upsert({
        user_id: user.id,
        chart_id: chartId,
        mahadasha_planet: mdPlanet,
        antardasha_planet: adPlanet,
        area,
        title: result.title,
        story: result.story,
        do_items: result.doItems,
        avoid_items: result.avoidItems,
      }, { onConflict: 'chart_id,mahadasha_planet,antardasha_planet,area' })
      .then(undefined, (e: unknown) => console.warn('[life-journey/insight] cache write failed', e));

    return NextResponse.json({ success: true, data: { ...result, cached: false } });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error('[life-journey/insight]', { name: e.name, message: e.message, stack: e.stack });
    return NextResponse.json(
      { error: 'Internal error', detail: process.env.NODE_ENV === 'production' ? undefined : e.message },
      { status: 500 },
    );
  }
}
