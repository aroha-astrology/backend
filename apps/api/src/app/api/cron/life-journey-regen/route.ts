export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateReplacement, type GenerationContext } from '@/lib/ai/lifeJourneyEvents';

const PLANET_THEME: Record<string, string> = {
  Ketu:    'detachment, spiritual insight, past karma clearing, losses that teach lessons, isolation or solitude, unusual experiences',
  Venus:   'romantic relationships, artistic pursuits, luxury and pleasure, social connections, beauty and aesthetics, financial gains',
  Sun:     'identity and self-expression, career recognition, authority and leadership, father figure influence, government or public life',
  Moon:    'emotional sensitivity, mother and home life, domestic changes, mental fluctuations, travel, public connection, intuition',
  Mars:    'physical energy and courage, conflicts and competition, property matters, siblings, ambition and drive, accidents or surgeries',
  Rahu:    'unconventional choices, foreign connections, technology and innovation, sudden changes, obsessive pursuits, illusions and confusion',
  Jupiter: 'higher education, spiritual growth, marriage and children, wealth expansion, guru figure, religion and philosophy, luck and opportunity',
  Saturn:  'hard work and perseverance, delays and obstacles teaching patience, career foundations, responsibilities, health challenges, karmic debts being paid',
  Mercury: 'intellectual pursuits, business and trade, communication skills, education and learning, siblings, travel, writing or media',
};

function isAuthorized(req: NextRequest): boolean {
  const cronSecret  = process.env.CRON_SECRET;
  const internalKey = process.env.INTERNAL_PROCESS_KEY;
  const auth = req.headers.get('authorization');
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const xKey = req.headers.get('x-internal-key');
  if (internalKey && xKey === internalKey) return true;
  return false;
}

// Service-role client — bypasses RLS so the cron can read/write across all users.
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service-role env vars missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get('limit') ?? 200), 500);

  const supabase = adminClient();

  // Find events marked disagree but still showing on the user's screen.
  const { data: pending, error: pendingErr } = await supabase
    .from('life_journey_events')
    .select('id, user_id, chart_id, phase_index, slot, short_text')
    .eq('feedback', 'disagree')
    .eq('is_active', true)
    .order('id', { ascending: true })
    .limit(limit);
  if (pendingErr) {
    console.error('[life-journey-regen] fetch failed', pendingErr);
    return NextResponse.json({ error: 'Fetch failed' }, { status: 500 });
  }
  if (!pending || pending.length === 0) {
    return NextResponse.json({ success: true, regenerated: 0, failed: 0 });
  }

  // Cache phase context per (chartId, phaseIndex) so we don't re-fetch the chart
  // for every disagreed event in the same phase.
  const ctxCache = new Map<string, GenerationContext | null>();
  async function getCtx(chartId: string, phaseIndex: number): Promise<GenerationContext | null> {
    const key = `${chartId}:${phaseIndex}`;
    if (ctxCache.has(key)) return ctxCache.get(key) ?? null;
    const { data: chart } = await supabase
      .from('kundli_charts')
      .select('chart_data, dasha_data, birth_profiles(name, dob)')
      .eq('id', chartId)
      .single();
    if (!chart) { ctxCache.set(key, null); return null; }
    const dashaData = chart.dasha_data as Record<string, unknown> | undefined;
    const vimshottari = dashaData?.vimshottari as Record<string, unknown> | undefined;
    const mahadashas = (vimshottari?.mahadashas ?? []) as Array<Record<string, unknown>>;
    const phase = mahadashas[phaseIndex];
    if (!phase) { ctxCache.set(key, null); return null; }
    const planet = phase.planet as string;
    const startDate = new Date(phase.startDate as string);
    const endDate = new Date(phase.endDate as string);
    const profile = (chart.birth_profiles as unknown) as Record<string, unknown> | undefined;
    const dob = profile?.dob as string;
    const dobDate = dob ? new Date(dob) : new Date('1990-01-01');
    const startAge = Math.max(0, Math.floor((startDate.getTime() - dobDate.getTime()) / (365.25 * 24 * 3600 * 1000)));
    const endAge = Math.max(0, Math.floor((endDate.getTime() - dobDate.getTime()) / (365.25 * 24 * 3600 * 1000)));
    const cd = chart.chart_data as Record<string, unknown> | undefined;
    const planets = (cd?.planets ?? []) as Array<Record<string, unknown>>;
    const asc = cd?.ascendant as Record<string, unknown> | undefined;
    const name = ((profile?.name as string) || 'the person').split(' ')[0];
    const now = new Date();
    const tense: 'past' | 'present' | 'future' = endDate < now ? 'past' : startDate > now ? 'future' : 'present';
    const ctx: GenerationContext = {
      name,
      planet,
      planetTheme: PLANET_THEME[planet] ?? PLANET_THEME.Saturn,
      startAge,
      endAge,
      startYear: startDate.getFullYear(),
      endYear: endDate.getFullYear(),
      tense,
      ascendantSign: asc?.sign as string | undefined,
      planetSummary: planets.slice(0, 7).map(p => `${p.planet}: ${p.sign} H${p.house}`).join(', '),
    };
    ctxCache.set(key, ctx);
    return ctx;
  }

  let regenerated = 0;
  let failed = 0;

  for (const row of pending) {
    try {
      const ctx = await getCtx(row.chart_id as string, row.phase_index as number);
      if (!ctx) { failed++; continue; }

      // Blacklist all prior disagreed shorts at this phase so the LLM doesn't
      // regenerate something already rejected.
      const { data: blacklistRows } = await supabase
        .from('life_journey_events')
        .select('short_text')
        .eq('chart_id', row.chart_id)
        .eq('phase_index', row.phase_index)
        .eq('feedback', 'disagree');
      const blacklist = (blacklistRows ?? []).map(r => r.short_text as string);

      const replacement = await generateReplacement(ctx, blacklist);
      if (!replacement) { failed++; continue; }

      // Deactivate the disagreed row, insert a fresh one in the same slot.
      const { error: deactivateErr } = await supabase
        .from('life_journey_events')
        .update({ is_active: false })
        .eq('id', row.id);
      if (deactivateErr) { failed++; continue; }

      const { error: insertErr } = await supabase
        .from('life_journey_events')
        .insert({
          user_id: row.user_id,
          chart_id: row.chart_id,
          phase_index: row.phase_index,
          slot: row.slot,
          short_text: replacement.short,
          story_text: replacement.story,
          feedback: null,
          is_active: true,
          parent_event_id: row.id,
        });
      if (insertErr) { failed++; continue; }

      regenerated++;
    } catch (e) {
      console.error('[life-journey-regen] row failed', row.id, e);
      failed++;
    }
  }

  console.log(`[life-journey-regen] regenerated:${regenerated} failed:${failed} total:${pending.length}`);
  return NextResponse.json({ success: true, regenerated, failed, total: pending.length });
}

export const GET  = handle;
export const POST = handle;
