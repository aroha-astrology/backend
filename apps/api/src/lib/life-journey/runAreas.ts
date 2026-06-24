import type { SupabaseClient } from '@supabase/supabase-js';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { markJobsDone } from '@/lib/queue';

type Area = 'Career' | 'Love' | 'Money' | 'Health';
type Status = 'good' | 'neutral' | 'challenging';

export interface AreaInsight {
  area: Area;
  status: Status;
  brief: string;
  story: string;
  key_insights: string[];
}

const AREAS: Area[] = ['Career', 'Love', 'Money', 'Health'];

// Deterministic status — Vedic planet-area relationships are fixed rules, not AI opinion.
// Status never changes regardless of how many times insights are regenerated.
const PLANET_AREA_STATUS: Record<string, Record<Area, Status>> = {
  Sun:     { Career: 'good',        Love: 'neutral',      Money: 'good',        Health: 'good'        },
  Moon:    { Career: 'good',        Love: 'good',         Money: 'neutral',     Health: 'neutral'     },
  Mars:    { Career: 'good',        Love: 'neutral',      Money: 'neutral',     Health: 'good'        },
  Mercury: { Career: 'good',        Love: 'good',         Money: 'good',        Health: 'good'        },
  Jupiter: { Career: 'good',        Love: 'good',         Money: 'good',        Health: 'good'        },
  Venus:   { Career: 'good',        Love: 'good',         Money: 'good',        Health: 'good'        },
  Saturn:  { Career: 'neutral',     Love: 'neutral',      Money: 'neutral',     Health: 'challenging' },
  Rahu:    { Career: 'neutral',     Love: 'neutral',      Money: 'neutral',     Health: 'challenging' },
  Ketu:    { Career: 'neutral',     Love: 'neutral',      Money: 'neutral',     Health: 'good'        },
};

const PLANET_TONE: Record<string, string> = {
  Sun:     'authority, recognition, identity, leadership',
  Moon:    'emotions, intuition, family, comfort',
  Mars:    'energy, drive, courage, conflict',
  Mercury: 'intellect, business, communication, learning',
  Jupiter: 'wisdom, expansion, blessings, abundance',
  Venus:   'love, beauty, art, pleasure',
  Saturn:  'discipline, delays, responsibility, karma',
  Rahu:    'ambition, foreign matters, sudden shifts',
  Ketu:    'detachment, spirituality, past karma',
};

function parseAreas(text: string): AreaInsight[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as Array<Record<string, unknown>>;
    return parsed
      .filter(p =>
        typeof p.area === 'string'
        && typeof p.status === 'string'
        && typeof p.brief === 'string'
        && typeof p.story === 'string',
      )
      .map(p => ({
        area: p.area as Area,
        status: ((['good', 'neutral', 'challenging'] as const).includes(p.status as Status) ? p.status : 'neutral') as Status,
        brief: String(p.brief).trim(),
        story: String(p.story).trim(),
        key_insights: Array.isArray(p.key_insights)
          ? (p.key_insights as unknown[]).map(s => String(s).trim()).slice(0, 5)
          : [],
      }));
  } catch {
    return [];
  }
}

export type AreasError =
  | { code: 'chart_not_found' }
  | { code: 'phase_not_found' };

/**
 * Generate (or load) the 4 life-area insights (Career/Love/Money/Health) for
 * a single mahadasha phase. Idempotent — re-uses persisted rows on repeat
 * calls and dequeues any matching pending job. No HTTP, no auth — caller
 * must scope chartId to userId.
 */
export async function runLifeAreas(
  supabase: SupabaseClient,
  userId: string,
  chartId: string,
  phaseIndex: number,
): Promise<{ ok: true; data: AreaInsight[] } | { ok: false; error: AreasError }> {
  const { data: existing } = await supabase
    .from('life_area_insights')
    .select('area, status, brief, story, key_insights')
    .eq('chart_id', chartId)
    .eq('phase_index', phaseIndex)
    .eq('user_id', userId);

  if (existing && existing.length === 4) {
    void markJobsDone(supabase, userId, 'life_journey_phase', { chart_id: chartId, phase_index: phaseIndex });
    return { ok: true, data: existing as AreaInsight[] };
  }

  const { data: chart } = await supabase
    .from('kundli_charts')
    .select('chart_data, dasha_data, birth_profiles(name, dob)')
    .eq('id', chartId)
    .eq('user_id', userId)
    .single();
  if (!chart) return { ok: false, error: { code: 'chart_not_found' } };

  const dasha = chart.dasha_data as Record<string, unknown> | undefined;
  const vimshottari = dasha?.vimshottari as Record<string, unknown> | undefined;
  const mahadashas = (vimshottari?.mahadashas ?? []) as Array<Record<string, unknown>>;
  const phase = mahadashas[phaseIndex];
  if (!phase) return { ok: false, error: { code: 'phase_not_found' } };

  const planet = phase.planet as string;
  const cd = chart.chart_data as Record<string, unknown> | undefined;
  const planets = (cd?.planets ?? []) as Array<Record<string, unknown>>;
  const asc = cd?.ascendant as Record<string, unknown> | undefined;
  const profile = (chart.birth_profiles as unknown) as Record<string, unknown> | undefined;
  const name = ((profile?.name as string) || 'You').split(' ')[0];

  const planetSummary = planets.slice(0, 9).map(p => `${p.planet} in ${p.sign} (H${p.house})`).join(', ');
  const tone = PLANET_TONE[planet] ?? 'growth and change';

  const aiResponse = await createAIMessage({
    max_tokens: 1500,
    temperature: 0.4,
    skipPersona: true,
    system: `You are a master Vedic astrologer with the soul of a poet. You write warm, vivid, grounded guidance — never clinical, never generic. Use the person's name. Speak in present tense for the current life chapter.

You are analysing ${name}'s ${planet} Mahadasha. Theme: ${tone}.

Return ONLY a JSON array — no markdown, no code fences. Exactly 4 objects, one per area in this order: Career, Love, Money, Health.

Each object has:
- "area": "Career" | "Love" | "Money" | "Health"
- "status": "good" | "neutral" | "challenging" — based on how this planet treats this life area for ${name}'s chart
- "brief": one short evocative line, 8-14 words. The headline shown on the card.
- "story": 3-4 warm sentences (60-100 words). What this period feels like in this life area for ${name}. Sensory, specific, never preachy. Past or present tense.
- "key_insights": 3 short, practical bullet points (each 6-12 words). Concrete moves or watch-outs.

Format example:
[{"area":"Career","status":"good","brief":"...","story":"...","key_insights":["...","...","..."]}, ...]`,
    messages: [
      {
        role: 'user',
        content: `Generate the 4 life-area insights.\n\nName: ${name}\nAscendant: ${asc?.sign ?? 'unknown'}\nMahadasha: ${planet}\nPlanetary positions: ${planetSummary}`,
      },
    ],
  });

  const text = aiResponse.content.map(c => c.text).join('');
  const parsed = parseAreas(text);

  const planetStatuses = PLANET_AREA_STATUS[planet];

  const generated: AreaInsight[] = AREAS.map(area => {
    const deterministicStatus: Status = planetStatuses?.[area] ?? 'neutral';
    const found = parsed.find(p => p.area === area);
    if (found) return { ...found, status: deterministicStatus };
    return {
      area,
      status: deterministicStatus,
      brief: `${planet} brings change to ${name}'s ${area.toLowerCase()} life.`,
      story: `${planet}'s influence quietly reshapes how ${name} experiences ${area.toLowerCase()} during this chapter. Patterns from before evolve, and new ways of being open up.`,
      key_insights: ['Stay attentive to inner shifts', 'Anchor in steady habits', 'Trust the slower pace of growth'],
    };
  });

  const rows = generated.map(g => ({
    user_id: userId,
    chart_id: chartId,
    phase_index: phaseIndex,
    area: g.area,
    status: g.status,
    brief: g.brief,
    story: g.story,
    key_insights: g.key_insights,
  }));

  const { data: upserted } = await supabase
    .from('life_area_insights')
    .upsert(rows, { onConflict: 'chart_id,phase_index,area', ignoreDuplicates: true })
    .select('area, status, brief, story, key_insights');

  void markJobsDone(supabase, userId, 'life_journey_phase', { chart_id: chartId, phase_index: phaseIndex });

  return { ok: true, data: (upserted ?? rows) as AreaInsight[] };
}
