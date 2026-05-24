export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { createAIMessage } from '@/lib/ai/aiProvider';

const VARGA_INFO: Record<string, { name: string; purpose: string }> = {
  D1:  { name: 'Rashi',           purpose: 'overall life, physical body, and general health' },
  D2:  { name: 'Hora',            purpose: 'wealth, liquid assets, and financial prosperity' },
  D3:  { name: 'Drekkana',        purpose: 'siblings, courage, and vitality' },
  D4:  { name: 'Chaturthamsa',    purpose: 'fixed assets, property, and general fortune' },
  D7:  { name: 'Saptamsa',        purpose: 'children, progeny, and grandchildren' },
  D9:  { name: 'Navamsa',         purpose: "marriage, spouse, and the planet's true strength" },
  D10: { name: 'Dasamsa',         purpose: 'career, profession, and status in society' },
  D12: { name: 'Dwadasamsa',      purpose: 'parents, ancestors, and hereditary traits' },
  D16: { name: 'Shodasamsa',      purpose: 'vehicles, luxuries, and comforts' },
  D20: { name: 'Vimsamsa',        purpose: 'spiritual progress, religious worship, and mantras' },
  D24: { name: 'Chaturvimsamsa',  purpose: 'education, academic achievements, and knowledge' },
  D27: { name: 'Saptavimshamsa',  purpose: 'physical strength, endurance, and stamina' },
  D30: { name: 'Trimsamsa',       purpose: 'misfortunes, obstacles, and general mischief' },
  D40: { name: 'Khavedamsa',      purpose: 'matrilineal legacy and auspicious effects' },
  D45: { name: 'Akshavedamsa',    purpose: 'patrilineal legacy and general character' },
  D60: { name: 'Shashtiamsa',     purpose: 'past life karma and deep-rooted destiny' },
};

type VargaEntry = { planet: string; sign: string; signIndex: number };

function extractText(resp: { content: Array<{ type: string; text: string }> }): string {
  return resp.content.find((c) => c.type === 'text')?.text ?? '';
}

function parseAnalysis(raw: string): { analysis: string; keyFindings: string[] } {
  const analysisMatch = raw.match(/<analysis>([\s\S]*?)<\/analysis>/i);
  const findingsMatch = raw.match(/<findings>([\s\S]*?)<\/findings>/i);

  const analysis = analysisMatch?.[1]?.trim() ?? raw.slice(0, 1500).trim();

  let keyFindings: string[] = [];
  if (findingsMatch) {
    try {
      const parsed = JSON.parse(findingsMatch[1].trim());
      if (Array.isArray(parsed)) keyFindings = parsed.map(String);
    } catch {
      keyFindings = findingsMatch[1]
        .trim()
        .split('\n')
        .map((l) => l.replace(/^[-•*\d.)]\s*/, '').trim())
        .filter(Boolean);
    }
  }

  return { analysis, keyFindings: keyFindings.slice(0, 6) };
}

export async function POST(request: Request) {
  const internalKey = request.headers.get('x-internal-key');
  if (!internalKey || internalKey !== process.env.INTERNAL_PROCESS_KEY) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createAdminSupabase();
  const body = await request.json() as { analysisId: string };
  const { analysisId } = body;

  // Atomic claim — prevents double-processing
  const { data: claimed } = await supabase
    .from('divisional_chart_analyses')
    .update({ status: 'generating' })
    .eq('id', analysisId)
    .eq('status', 'pending')
    .select('id, kundli_chart_id, chart_type, user_id')
    .single();

  if (!claimed) {
    return NextResponse.json({ skipped: true });
  }

  const { kundli_chart_id, chart_type } = claimed;

  try {
    const { data: kundli } = await supabase
      .from('kundli_charts')
      .select('chart_data, divisional_charts, birth_profiles(name, dob, gender)')
      .eq('id', kundli_chart_id)
      .single();

    if (!kundli) throw new Error('Kundli not found');

    const profile = kundli.birth_profiles as unknown as Record<string, string> | null;
    const chartData = kundli.chart_data as Record<string, unknown> | null;
    const divisionalCharts = kundli.divisional_charts as Record<string, VargaEntry[]> | null;

    const info = VARGA_INFO[chart_type] ?? { name: chart_type, purpose: 'general analysis' };
    const vargas: VargaEntry[] = divisionalCharts?.[chart_type] ?? [];

    const d1Entries: VargaEntry[] = divisionalCharts?.['D1'] ?? [];
    const d1Map: Record<string, string> = {};
    for (const e of d1Entries) d1Map[e.planet] = e.sign;

    const ascendant = (chartData?.ascendant as Record<string, unknown> | undefined)?.sign ?? 'unknown';
    const name = profile?.name ?? 'the native';
    const dob = profile?.dob ?? 'unknown';
    const gender = profile?.gender ? `, ${profile.gender}` : '';

    const planetLines = vargas
      .map((e) => {
        const d1Sign = d1Map[e.planet] ?? '?';
        const vargottama = e.sign === d1Sign ? ' [VARGOTTAMA — same sign as D1, very strong]' : '';
        return `${e.planet}: ${e.sign} (D1 sign: ${d1Sign})${vargottama}`;
      })
      .join('\n');

    const prompt = `Analyze the ${info.name} (${chart_type}) divisional chart for ${name}, born ${dob}${gender}.

This chart governs: ${info.purpose}

Planet positions in ${chart_type}:
${planetLines || 'No planet data available'}

D1 Ascendant: ${ascendant}

Write 6–8 bullet points breaking down what this ${chart_type} chart reveals about ${name}'s ${info.purpose}. Rules:
- Start each bullet with "•"
- FIRST 3 bullets MUST follow this structure:
  • Bullet 1 = HOOK — the single biggest reveal this chart has for this person (what's most alive here)
  • Bullet 2 = NUANCE — the planetary WHY (specific planet + sign + why it hits this way in ${chart_type})
  • Bullet 3 = ACTION — one concrete thing this means for their actual life
- Use casual, Gen-Z friendly language — like a smart friend reading the chart, not a textbook
- Short punchy sentences. No fluff, no filler.
- Name specific planets and signs — be personal, not generic
- Highlight vargottama planets as "extra powerful / hits different"
- Bold key terms with **double asterisks**
- Use relatable comparisons where helpful ("basically your Saturn is in full grind mode")

Then list exactly 5 key findings as a JSON array.

Respond in EXACTLY this format:
<analysis>
• Bullet 1
• Bullet 2
• Bullet 3
• (continue for 6–8 total)
</analysis>
<findings>
["Finding 1", "Finding 2", "Finding 3", "Finding 4", "Finding 5"]
</findings>`;

    const response = await createAIMessage({
      system: `You are a Gen-Z Vedic astrology guide — knowledgeable but casual, like a cosmic bestie who actually studied Jyotish. Write in short punchy bullet points. No long paragraphs. No academic tone. Keep it real, relatable, and specific to the person's chart.`,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
      temperature: 0.7,
    });

    const raw = extractText(response);
    const { analysis, keyFindings } = parseAnalysis(raw);

    await supabase
      .from('divisional_chart_analyses')
      .update({
        status: 'ready',
        analysis,
        key_findings: keyFindings,
        generated_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', analysisId);

    return NextResponse.json({ success: true, analysisId });
  } catch (error) {
    console.error('[divisional-charts/process] Error:', error);
    await supabase
      .from('divisional_chart_analyses')
      .update({
        status: 'error',
        error_message: error instanceof Error ? error.message : String(error),
      })
      .eq('id', analysisId);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
