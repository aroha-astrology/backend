import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { refineEvent, type GenerationContext } from '@/lib/ai/lifeJourneyEvents';

export const runtime = 'nodejs';
export const maxDuration = 30;

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

type FeedbackKind = 'agree' | 'maybe' | 'disagree';

async function buildContext(supabase: Awaited<ReturnType<typeof createServerSupabase>>, chartId: string, phaseIndex: number, userId: string): Promise<GenerationContext | null> {
  const { data: chart } = await supabase
    .from('kundli_charts')
    .select('chart_data, dasha_data, birth_profiles(name, dob)')
    .eq('id', chartId)
    .eq('user_id', userId)
    .single();
  if (!chart) return null;

  const dashaData = chart.dasha_data as Record<string, unknown> | undefined;
  const vimshottari = dashaData?.vimshottari as Record<string, unknown> | undefined;
  const mahadashas = (vimshottari?.mahadashas ?? []) as Array<Record<string, unknown>>;
  const phase = mahadashas[phaseIndex];
  if (!phase) return null;

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

  return {
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
}

/* -------------------------------------------------------------------------- */
/*  POST /api/life-journey/feedback  { eventId, feedback }                     */
/*  agree    → save feedback only                                              */
/*  maybe    → refine same event, replace text in-place                        */
/*  disagree → mark feedback only; the nightly /api/cron/life-journey-regen   */
/*             job re-rolls disagreed events overnight so users return to a    */
/*             fresh reading the next day (and don't pay an inline LLM wait).  */
/* -------------------------------------------------------------------------- */

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { eventId, feedback } = await request.json() as { eventId: string; feedback: FeedbackKind };

    if (!eventId || !['agree', 'maybe', 'disagree'].includes(feedback)) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const { data: event } = await supabase
      .from('life_journey_events')
      .select('id, chart_id, phase_index, slot, short_text, story_text, user_id')
      .eq('id', eventId)
      .single();
    if (!event || event.user_id !== user.id) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (feedback === 'agree') {
      const { data: updated } = await supabase
        .from('life_journey_events')
        .update({ feedback: 'agree' })
        .eq('id', eventId)
        .select('id, short_text, story_text, feedback')
        .single();
      return NextResponse.json({ success: true, data: updated });
    }

    if (feedback === 'maybe') {
      const ctx = await buildContext(supabase, event.chart_id, event.phase_index, user.id);
      if (!ctx) return NextResponse.json({ error: 'Could not build context' }, { status: 500 });

      const refined = await refineEvent(ctx, { short: event.short_text, story: event.story_text });
      if (!refined) return NextResponse.json({ error: 'Refinement failed' }, { status: 502 });

      const { data: updated } = await supabase
        .from('life_journey_events')
        .update({
          short_text: refined.short,
          story_text: refined.story,
          feedback: 'maybe',
        })
        .eq('id', eventId)
        .select('id, short_text, story_text, feedback')
        .single();
      return NextResponse.json({ success: true, data: updated });
    }

    // disagree → mark feedback; row stays active so the user still sees the
    // card (in 'disagree' state) until the nightly regen cron replaces it.
    const { data: updated, error: updateErr } = await supabase
      .from('life_journey_events')
      .update({ feedback: 'disagree' })
      .eq('id', eventId)
      .select('id, short_text, story_text, feedback')
      .single();
    if (updateErr || !updated) {
      console.error('[life-journey/feedback] disagree update failed', updateErr);
      return NextResponse.json({ error: 'Failed to record feedback' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: updated, deferred: true });
  } catch (err) {
    console.error('[life-journey/feedback]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
