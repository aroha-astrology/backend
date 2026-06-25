import type { SupabaseClient } from '@supabase/supabase-js';
import { generateEvents, type GenerationContext, type JourneyEvent } from '@/lib/ai/lifeJourneyEvents';
import { markJobsDone } from '@/lib/queue';

const PLANET_THEME: Record<string, { title: string; theme: string }> = {
  Ketu:    { title: 'Spiritual Awakening & Past Karma',     theme: 'detachment, spiritual insight, past karma clearing, losses that teach lessons, isolation or solitude, unusual experiences' },
  Venus:   { title: 'Love, Beauty & Creative Expansion',    theme: 'romantic relationships, artistic pursuits, luxury and pleasure, social connections, beauty and aesthetics, financial gains' },
  Sun:     { title: 'Self-Discovery & Personal Power',      theme: 'identity and self-expression, career recognition, authority and leadership, father figure influence, government or public life' },
  Moon:    { title: 'Emotional Depth & Family Bonds',       theme: 'emotional sensitivity, mother and home life, domestic changes, mental fluctuations, travel, public connection, intuition' },
  Mars:    { title: 'Ambition, Energy & Life Challenges',   theme: 'physical energy and courage, conflicts and competition, property matters, siblings, ambition and drive, accidents or surgeries' },
  Rahu:    { title: 'Big Dreams & Unconventional Paths',    theme: 'unconventional choices, foreign connections, technology and innovation, sudden changes, obsessive pursuits, illusions and confusion' },
  Jupiter: { title: 'Wisdom, Expansion & Good Fortune',     theme: 'higher education, spiritual growth, marriage and children, wealth expansion, guru figure, religion and philosophy, luck and opportunity' },
  Saturn:  { title: 'Discipline, Karma & Life Lessons',     theme: 'hard work and perseverance, delays and obstacles teaching patience, career foundations, responsibilities, health challenges, karmic debts being paid' },
  Mercury: { title: 'Communication, Skills & Adaptability', theme: 'intellectual pursuits, business and trade, communication skills, education and learning, siblings, travel, writing or media' },
};

interface DbEvent {
  id: string;
  slot: number;
  short_text: string;
  story_text: string;
  feedback: 'agree' | 'maybe' | 'disagree' | null;
}

export interface PhaseResult {
  planet: string;
  title: string;
  tense: 'past' | 'present' | 'future';
  events: Array<{ id: string; short: string; story: string; feedback: DbEvent['feedback'] }>;
  startYear: number;
  endYear: number;
  startAge: number;
  endAge: number;
  birthYear: number;
  name: string;
  phaseIndex: number;
  totalPhases: number;
}

export type PhaseError =
  | { code: 'chart_not_found' }
  | { code: 'invalid_phase_index' };

/**
 * Generate (or load) life-journey events for a single mahadasha phase.
 * Pure data layer — no HTTP, no auth. Caller is responsible for authenticating
 * the user (or being service-role from the queue drainer) and passing a
 * chartId that is known to belong to userId.
 *
 * Idempotent: existing rows are returned without re-running the LLM. Any open
 * matching queue job is marked done so a manual visit doesn't double-generate.
 */
export async function runLifeJourneyPhase(
  supabase: SupabaseClient,
  userId: string,
  chartId: string,
  phaseIndex: number,
): Promise<{ ok: true; data: PhaseResult } | { ok: false; error: PhaseError }> {
  const { data: chart } = await supabase
    .from('kundli_charts')
    .select('*, birth_profiles(name, dob, gender)')
    .eq('id', chartId)
    .eq('user_id', userId)
    .single();
  if (!chart) return { ok: false, error: { code: 'chart_not_found' } };

  const dashaData = chart.dasha_data as Record<string, unknown> | undefined;
  const vimshottari = dashaData?.vimshottari as Record<string, unknown> | undefined;
  const mahadashas = (vimshottari?.mahadashas ?? []) as Array<Record<string, unknown>>;
  if (phaseIndex < 0 || phaseIndex >= mahadashas.length) {
    return { ok: false, error: { code: 'invalid_phase_index' } };
  }

  const phase = mahadashas[phaseIndex];
  const planet = phase.planet as string;
  const startDate = new Date(phase.startDate as string);
  const endDate = new Date(phase.endDate as string);
  const profile = chart.birth_profiles as Record<string, unknown> | undefined;
  const name = (profile?.name as string) || 'the person';
  const dob = profile?.dob as string;
  const birthYear = dob ? new Date(dob).getFullYear() : 1990;
  const dobDate = new Date(dob || '1990-01-01');
  const startAge = Math.max(0, Math.floor((startDate.getTime() - dobDate.getTime()) / (365.25 * 24 * 3600 * 1000)));
  const endAge = Math.max(0, Math.floor((endDate.getTime() - dobDate.getTime()) / (365.25 * 24 * 3600 * 1000)));
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();
  const planetInfo = PLANET_THEME[planet] ?? PLANET_THEME.Saturn;

  const now = new Date();
  const tense: 'past' | 'present' | 'future' = endDate < now ? 'past' : startDate > now ? 'future' : 'present';

  const totalPhases = mahadashas.filter(m => new Date(m.startDate as string) <= new Date()).length;

  const { data: existing } = await supabase
    .from('life_journey_events')
    .select('id, slot, short_text, story_text, feedback')
    .eq('chart_id', chartId)
    .eq('phase_index', phaseIndex)
    .eq('is_active', true)
    .order('slot', { ascending: true });

  let events: DbEvent[] = (existing ?? []) as DbEvent[];

  if (events.length < 5) {
    const cd = chart.chart_data as Record<string, unknown> | undefined;
    const planets = (cd?.planets ?? []) as Array<Record<string, unknown>>;
    const planetSummary = planets.slice(0, 7).map(p => `${p.planet}: ${p.sign} H${p.house}`).join(', ');
    const asc = cd?.ascendant as Record<string, unknown> | undefined;

    const ctx: GenerationContext = {
      name: name.split(' ')[0],
      planet,
      planetTheme: planetInfo.theme,
      startAge, endAge, startYear, endYear,
      tense,
      ascendantSign: asc?.sign as string | undefined,
      planetSummary,
    };

    const { data: blacklistRows } = await supabase
      .from('life_journey_events')
      .select('short_text')
      .eq('chart_id', chartId)
      .eq('phase_index', phaseIndex)
      .eq('feedback', 'disagree');
    const blacklist = (blacklistRows ?? []).map(r => r.short_text as string);

    const filledSlots = new Set(events.map(e => e.slot));
    const missingCount = 5 - events.length;

    let generated: JourneyEvent[] = [];
    const MAX_ATTEMPTS = 1;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && generated.length < missingCount; attempt++) {
      const remaining = missingCount - generated.length;
      try {
        const batch = await generateEvents(ctx, remaining, [
          ...blacklist,
          ...generated.map(g => g.short),
        ]);
        if (batch.length > 0) {
          generated = [...generated, ...batch];
          console.log(`[life-journey] AI attempt ${attempt}: +${batch.length}, total ${generated.length}/${missingCount}`);
        } else {
          console.warn(`[life-journey] AI attempt ${attempt}: returned 0 events`);
        }
      } catch (e) {
        console.error(`[life-journey] AI attempt ${attempt} failed`, e);
      }
      if (generated.length < missingCount && attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 400 * attempt));
      }
    }
    if (generated.length < missingCount) {
      console.warn(`[life-journey] all AI attempts exhausted — using ${missingCount - generated.length} template fallback(s)`);
    }

    const FALLBACK_SLOTS: Array<{ past: { short: string; story: string[] }; present: { short: string; story: string[] }; future: { short: string; story: string[] } }> = [
      {
        past: { short: `Drifted into a quietly different worldview`, story: [`Maybe found the old way of seeing things slowly stopped fitting`, `A part of you started asking questions that didn't have easy answers`, `Something in you let go of certainties that had felt unshakeable before`, `The unease, looking back, may have been the start of something honest`] },
        present: { short: `Sitting with a worldview that's quietly shifting`, story: [`Maybe noticing that what felt obvious before doesn't quite land the same now`, `A part of you keeps drifting toward questions instead of answers`, `Something in you is loosening its grip on old certainties`, `The unsteadiness might be doing more work than it feels like right now`] },
        future: { short: `Might find your inner compass quietly turning`, story: [`Could catch yourself questioning things that once felt settled`, `A part of you may start trusting instinct over the familiar map`, `Something in you might soften where it used to be sure`, `The shift may feel small in the moment, larger in hindsight`] },
      },
      {
        past: { short: `Some close bonds quietly redrew themselves`, story: [`Maybe felt some people drift while others moved closer without warning`, `A part of you may have learned which connections actually held weight`, `Something in those years sorted out who belonged in your real life`, `The loneliness and the belonging probably lived in the same stretch of time`] },
        present: { short: `Close bonds quietly being tested right now`, story: [`Maybe noticing who keeps showing up and who quietly doesn't`, `A part of you is paying closer attention to how relationships actually feel`, `Something in you is willing to let some bonds rest, even briefly`, `The honesty being asked of you may matter more than the comfort`] },
        future: { short: `Could see close bonds quietly rearranging`, story: [`Might find a few connections deepening in ways you didn't expect`, `A part of you may need to let some relationships move into the background`, `Something in you could become pickier about whose presence you protect`, `The bonds that survive this stretch are likely the ones worth keeping`] },
      },
      {
        past: { short: `Work pulled you somewhere quietly unexpected`, story: [`Maybe found yourself drawn to a path that didn't match the original plan`, `A part of you may have built skills no one explicitly asked you to learn`, `Something in your work life shifted by accident more than by design`, `Looking back, that detour might have laid the foundation for what came next`] },
        present: { short: `Work quietly tugging in an unfamiliar direction`, story: [`Maybe sensing the comfortable lane isn't where the energy actually is`, `A part of you keeps eyeing an opening that doesn't fit the usual map`, `Something in you is restless with the version of work that worked before`, `The unconventional move right now might land softer than it looks`] },
        future: { short: `Might find work opening in a quieter direction`, story: [`Could feel pulled toward a path that doesn't fit the obvious next step`, `A part of you may start building for something that isn't named yet`, `Something in you might trust an unusual chance more than a safe one`, `The detour, if it comes, may turn out to be the actual road`] },
      },
      {
        past: { short: `Something inside reorganised quietly underneath`, story: [`Maybe felt a slow inner pull while life on the surface looked steady`, `A part of you may have outgrown beliefs you didn't know you were holding`, `Something restless was probably pointing at something worth listening to`, `The inner shift, even unseen, likely did its work all the way through`] },
        present: { short: `Something inside is quietly reorganising`, story: [`Maybe sensing a restlessness that doesn't have a clean name yet`, `A part of you is tired of carrying beliefs that don't quite fit anymore`, `Something in you is signalling — not as a problem, but as a hint`, `The discomfort right now might be more useful than it feels`] },
        future: { short: `Could feel something inside quietly rearrange`, story: [`Might find old assumptions getting tested without permission`, `A part of you may stop defending ideas that no longer earn the room`, `Something in you could come out steadier than how it went in`, `The unsettling part may be exactly where the realness gets built`] },
      },
      {
        past: { short: `Some core part of you came out reshaped`, story: [`Maybe noticed by the end that what you wanted had quietly changed`, `A part of you let go of versions of yourself you'd outgrown`, `Some of the losses may have been releases hiding in disguise`, `The version of you that came out probably felt more like the real one`] },
        present: { short: `A core part of you is quietly being reshaped`, story: [`Maybe noticing what used to matter doesn't carry the same weight now`, `A part of you is letting older selves quietly retire`, `Something truer is forming, even before it has a name`, `Who you're becoming right now is worth paying attention to`] },
        future: { short: `Might come out of this stretch quietly different`, story: [`Could find core values getting redrawn without much fanfare`, `A part of you may step out of identities you've worn too long`, `Something in you might end up steadier and less performed`, `The version of you on the other side may feel more honestly yours`] },
      },
    ];

    while (generated.length < missingCount) {
      const slotIndex = (generated.length + events.length) % FALLBACK_SLOTS.length;
      const fb = FALLBACK_SLOTS[slotIndex][tense];
      generated.push({ short: fb.short, story: JSON.stringify(fb.story) });
    }

    const inserts: Array<Omit<DbEvent, 'id'> & { user_id: string; chart_id: string; phase_index: number }> = [];
    let genIdx = 0;
    for (let slot = 0; slot < 5 && genIdx < generated.length; slot++) {
      if (filledSlots.has(slot)) continue;
      const ev = generated[genIdx++];
      inserts.push({
        user_id: userId,
        chart_id: chartId,
        phase_index: phaseIndex,
        slot,
        short_text: ev.short,
        story_text: ev.story,
        feedback: null,
      });
    }

    if (inserts.length > 0) {
      const { data: inserted, error: insertErr } = await supabase
        .from('life_journey_events')
        .insert(inserts)
        .select('id, slot, short_text, story_text, feedback');
      if (inserted) {
        events = [...events, ...(inserted as DbEvent[])].sort((a, b) => a.slot - b.slot);
      } else {
        console.error('[life-journey] insert failed (migration pending?)', insertErr);
        const fallback: DbEvent[] = inserts.map((ins, i) => ({
          id: `gen-${i}`,
          slot: ins.slot,
          short_text: ins.short_text,
          story_text: ins.story_text,
          feedback: null,
        }));
        events = [...events, ...fallback].sort((a, b) => a.slot - b.slot);
      }
    }
  }

  void markJobsDone(supabase, userId, 'life_journey_phase', { chart_id: chartId, phase_index: phaseIndex });

  return {
    ok: true,
    data: {
      planet,
      title: planetInfo.title,
      tense,
      events: events.map(e => ({
        id: e.id,
        short: e.short_text,
        story: e.story_text,
        feedback: e.feedback,
      })),
      startYear,
      endYear,
      startAge,
      endAge,
      birthYear,
      name: name.split(' ')[0],
      phaseIndex,
      totalPhases,
    },
  };
}
