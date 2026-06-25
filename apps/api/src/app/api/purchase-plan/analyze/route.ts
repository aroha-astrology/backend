export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextResponse, after } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { deductCredits } from '@/lib/credits/deductCredits';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function resolveDates(
  bookingDate: string | null | undefined,
  deliveryDate: string | null | undefined,
): { resolvedBooking: string; resolvedDelivery: string } {
  if (bookingDate && deliveryDate) {
    return { resolvedBooking: bookingDate, resolvedDelivery: deliveryDate };
  }
  if (bookingDate && !deliveryDate) {
    return { resolvedBooking: bookingDate, resolvedDelivery: addDays(bookingDate, 5) };
  }
  if (!bookingDate && deliveryDate) {
    const proposed = addDays(deliveryDate, -5);
    const yday = yesterday();
    const resolvedBooking = proposed < yday ? proposed : yday;
    return { resolvedBooking, resolvedDelivery: deliveryDate };
  }
  // Both null — should not reach here (frontend validates)
  const today = new Date().toISOString().split('T')[0];
  return { resolvedBooking: yesterday(), resolvedDelivery: addDays(today, 5) };
}

// ---------------------------------------------------------------------------
// Panchang fetcher (reuses the existing API route)
// ---------------------------------------------------------------------------

async function fetchPanchang(dateStr: string, origin: string): Promise<Record<string, unknown>> {
  try {
    const url = `${origin}/api/panchang/today?date=${dateStr}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return {};
    const json = (await res.json()) as { success: boolean; data?: Record<string, unknown> };
    return json.success && json.data ? json.data : {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// AI Prompt builder
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  vehicle: 'Vehicle Purchase (Car / Bike / EV)',
  home: 'Home / Residential Property',
  commercial: 'Commercial Property (Office / Shop / Warehouse)',
  other: 'Other Purchase',
};

const COST_BRACKET_LABELS: Record<string, string> = {
  'under-1l': 'Under ₹1 Lakh',
  '1l-5l': '₹1L – ₹5L',
  '5l-10l': '₹5L – ₹10L',
  '10l-25l': '₹10L – ₹25L',
  '25l-50l': '₹25L – ₹50L',
  '50l-1cr': '₹50L – ₹1 Crore',
  'above-1cr': 'Above ₹1 Crore',
};

const LANG_INSTRUCTION: Record<string, string> = {
  en: 'Respond entirely in English.',
  hi: 'सभी उत्तर हिंदी में दें। (Respond entirely in Hindi.)',
  bn: 'সম্পূর্ণ বাংলায় উত্তর দিন। (Respond entirely in Bengali.)',
  ta: 'முழுவதும் தமிழில் பதிலளிக்கவும். (Respond entirely in Tamil.)',
  te: 'సమాధానాలు పూర్తిగా తెలుగులో ఇవ్వండి. (Respond entirely in Telugu.)',
  mr: 'संपूर्ण उत्तरे मराठीत द्या. (Respond entirely in Marathi.)',
  gu: 'તમામ જવાબો ગુજરાતીમાં આપો. (Respond entirely in Gujarati.)',
};

function buildPrompt(params: {
  category: string;
  metadata: Record<string, string>;
  costBracket: string | null;
  resolvedBooking: string;
  resolvedDelivery: string;
  bookingProvided: boolean;
  deliveryProvided: boolean;
  panchangBooking: Record<string, unknown>;
  panchangDelivery: Record<string, unknown>;
  chartContext: string;
  language: string;
}): string {
  const {
    category, metadata, costBracket, resolvedBooking, resolvedDelivery,
    bookingProvided, deliveryProvided, panchangBooking, panchangDelivery,
    chartContext, language,
  } = params;

  const langInstruction = LANG_INSTRUCTION[language] ?? LANG_INSTRUCTION.en;
  const catLabel = CATEGORY_LABELS[category] ?? category;
  const costLabel = costBracket ? (COST_BRACKET_LABELS[costBracket] ?? costBracket) : 'Not specified';

  const metaLines = Object.entries(metadata)
    .filter(([, v]) => v)
    .map(([k, v]) => `  • ${k}: ${v}`)
    .join('\n');

  const panchangSummary = (p: Record<string, unknown>, label: string, provided: boolean): string => {
    if (!p || Object.keys(p).length === 0) return `${label}: Panchang data unavailable\n`;
    return `${label}${provided ? '' : ' (calculated — user did not specify)'}:
  • Tithi: ${p.tithi ?? 'N/A'}
  • Nakshatra: ${p.nakshatra ?? 'N/A'}
  • Yoga: ${p.yoga ?? 'N/A'}
  • Karana: ${p.karana ?? 'N/A'}
  • Vara (Day): ${p.vara ?? 'N/A'}
  • Rahu Kaal: ${(p.rahuKaal as { display?: string })?.display ?? 'N/A'}
  • Gulika Kaal: ${(p.gulikaKaal as { display?: string })?.display ?? 'N/A'}
  • Yamaganda: ${(p.yamagandaKaal as { display?: string })?.display ?? 'N/A'}
  • Abhijit Muhurta: ${(p.abhijitMuhurta as { start?: string; end?: string })?.start ?? 'N/A'} – ${(p.abhijitMuhurta as { start?: string; end?: string })?.end ?? 'N/A'}
  • Sunrise: ${p.sunrise ?? 'N/A'} | Sunset: ${p.sunset ?? 'N/A'}`;
  };

  return `You are Yogi Baba, the most legendary Vedic astrologer. A user wants an in-depth auspicious timing analysis for a major purchase. Give them the MOST ACCURATE, DETAILED, ACTIONABLE Vedic analysis possible.

${langInstruction}

━━━ PURCHASE DETAILS ━━━
📦 Category: ${catLabel}
💰 Budget: ${costLabel}
${metaLines ? `🔖 Specifics:\n${metaLines}` : ''}

━━━ KEY DATES ━━━
📅 Booking Date: ${resolvedBooking}${bookingProvided ? '' : ' (auto-calculated: delivery - 5 days, capped before today)'}
📦 Delivery Date: ${resolvedDelivery}${deliveryProvided ? '' : ' (auto-calculated: booking + 5 days)'}

━━━ PANCHANG FOR BOOKING DATE (${resolvedBooking}) ━━━
${panchangSummary(panchangBooking, 'Booking Panchang', bookingProvided)}

━━━ PANCHANG FOR DELIVERY DATE (${resolvedDelivery}) ━━━
${panchangSummary(panchangDelivery, 'Delivery Panchang', deliveryProvided)}

━━━ USER'S BIRTH CHART ━━━
${chartContext || 'Birth chart not available — provide general analysis based on panchang alone.'}

━━━ ANALYSIS INSTRUCTIONS ━━━
Give a COMPREHENSIVE Vedic purchase timing analysis. Consider ALL of the following:

FOR BOOKING DATE (${resolvedBooking}):
1. Tithi quality for ${category} purchases (e.g., avoid Rikta tithis 4/9/14, prefer Poorna tithis)
2. Nakshatra suitability (Rohini/Pushya/Hasta are best for buying; Mula/Ardra/Ashlesha to avoid)
3. Yoga quality (avoid Vyatipata/Vaidhriti; prefer Siddha/Amrit/Shubha)
4. Vara (weekday) compatibility — Wednesday best for vehicles, Thursday for property
5. Rahu Kaal, Gulika Kaal, Yamaganda — exact times to AVOID
6. Best choghadiya windows from the panchang data
7. Abhijit Muhurta window if applicable
8. Score out of 100 for the booking date

FOR DELIVERY DATE (${resolvedDelivery}):
1. Same analysis as above for the delivery date
2. Nakshatra for receiving/taking possession
3. Best time slots (Shubha/Labh/Amrit choghadiya)
4. Score out of 100 for the delivery date

BIRTH CHART ANALYSIS (if chart available):
1. Current Mahadasha/Antardasha planet — is it compatible with this purchase type?
2. Relevant house lords: 2nd (wealth/possessions), 4th (property/vehicles), 11th (gains)
3. Lagna lord strength on both dates
4. Any malefic aspects or doshas affecting the purchase
5. Lucky planets for this user based on their chart

The "summary" field is the H/N/A 3-line structure — an ARRAY OF EXACTLY THREE STRINGS:
  [0] HOOK — 1–2 short sentences naming the verdict on this purchase window.
  [1] NUANCE — 1–2 short sentences with the Vedic why (panchang/dasha).
  [2] ACTION — 1–2 short sentences with one concrete next step.
Short sentences only.

OUTPUT FORMAT — Return ONLY valid JSON, no markdown, no code blocks:
{
  "summary": ["hook", "nuance", "action"],
  "overallScore": <integer 1-100>,
  "overallVerdict": "<2-sentence powerful verdict with emoji, Gen Z friendly, clear YES/CAUTION/AVOID>",
  "tldr": "<3 bullet points, max 15 words each, use 🟢🟡🔴 emojis>",
  "bookingDate": {
    "date": "${resolvedBooking}",
    "provided": ${bookingProvided},
    "score": <integer 1-100>,
    "verdict": "<one line verdict with emoji>",
    "highlights": ["<point 1 with symbol>", "<point 2>", "<point 3>", ...],
    "warnings": ["<warning 1 with ⚠️>", ...],
    "bestTimeWindows": ["<time window 1>", "<time window 2>"],
    "avoidTimes": ["<rahu kaal>", "<gulika kaal>", ...]
  },
  "deliveryDate": {
    "date": "${resolvedDelivery}",
    "provided": ${deliveryProvided},
    "score": <integer 1-100>,
    "verdict": "<one line verdict with emoji>",
    "highlights": ["<point 1>", ...],
    "warnings": ["<warning with ⚠️>", ...],
    "bestTimeWindows": ["<time window>", ...],
    "avoidTimes": ["<time>", ...]
  },
  "birthChartInsights": {
    "currentDasha": "<Mahadasha lord — Antardasha lord>",
    "dashaVerdict": "<is this dasha good for this purchase type? 1-2 sentences>",
    "favorablePlanets": ["<planet 1> — <why>", ...],
    "challengingFactors": ["<factor with ⚠️>", ...],
    "keyHouses": "<analysis of 2nd/4th/11th house lords>"
  },
  "remedies": [
    "<remedy 1 — specific mantra/ritual with planet and timing>",
    "<remedy 2>",
    "<remedy 3>",
    "<remedy 4>"
  ],
  "luckyColor": "<color for this purchase based on chart>",
  "luckyDirection": "<direction to face when signing/receiving>",
  "finalAdvice": "<3-4 sentences. Practical, actionable, Vedic-accurate. Tell them EXACTLY what to do and when.>"
}

CRITICAL RULES:
- Be SPECIFIC about times — mention actual times from panchang (e.g., "Best: 10:23 AM – 12:00 PM (Labh Choghadiya)")
- Use symbols and emojis throughout — ✅ 🟢 ⚠️ 🔴 🌙 ⭐ 🪐 etc.
- Write like a knowledgeable but friendly astrologer Gen Z can relate to
- DO NOT refuse any analysis
- If both dates are inauspicious, still give best windows within them
- Output ONLY JSON — no extra text`;
}

// ---------------------------------------------------------------------------
// Background AI worker
// ---------------------------------------------------------------------------

async function runAnalysis(
  planId: string,
  prompt: string,
): Promise<void> {
  const admin = createAdminSupabase();
  try {
    await admin.from('purchase_plans').update({ status: 'processing' }).eq('id', planId);

    const msg = await createAIMessage({
      max_tokens: 4096,
      temperature: 0.3,
      jsonMode: true,
      skipPersona: true,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = msg.content.find((c) => c.type === 'text')?.text ?? '{}';
    let analysis: Record<string, unknown> = {};
    try {
      analysis = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim());
    } catch {
      analysis = { raw, parseError: true };
    }

    await admin
      .from('purchase_plans')
      .update({ status: 'done', analysis, completed_at: new Date().toISOString() })
      .eq('id', planId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin
      .from('purchase_plans')
      .update({ status: 'error', error_message: msg })
      .eq('id', planId);
  }
}

// ---------------------------------------------------------------------------
// POST /api/purchase-plan/analyze
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json()) as {
      category: string;
      metadata?: Record<string, string>;
      costBracket?: string;
      bookingDate?: string;
      deliveryDate?: string;
      panchangDate?: string;
      language?: string;
    };

    const { category, metadata = {}, costBracket, bookingDate, deliveryDate, language = 'en' } = body;
    const panchangDate = body.panchangDate ?? new Date().toISOString().split('T')[0];

    if (!category) return NextResponse.json({ success: false, error: 'Category required' }, { status: 400 });
    if (!bookingDate && !deliveryDate) {
      return NextResponse.json({ success: false, error: 'At least one date required' }, { status: 400 });
    }

    // Deduct 5 credits
    const creditResult = await deductCredits(
      supabase, user.id, 5, 'feature_debit',
      `Purchase plan analysis — ${CATEGORY_LABELS[category] ?? category}`,
    );
    if (!creditResult.success) {
      return NextResponse.json({ success: false, error: 'INSUFFICIENT_TOKENS' }, { status: 402 });
    }

    // Resolve dates
    const { resolvedBooking, resolvedDelivery } = resolveDates(bookingDate, deliveryDate);

    // Fetch user's primary chart
    const { data: chartRow } = await supabase
      .from('kundli_charts')
      .select('id, chart_data')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const chartId = chartRow?.id ?? null;
    const chartData = chartRow?.chart_data as Record<string, unknown> | null;

    // Build chart context string
    let chartContext = '';
    if (chartData) {
      const planets = (chartData.planets as Array<{ planet: string; sign: string; house: number; longitude?: number }> | undefined) ?? [];
      const asc = (chartData.ascendant as { sign?: string; degree?: number }) ?? {};
      const dasha = (chartData.dasha as { mahadasha?: string; antardasha?: string }) ?? {};
      chartContext = `Ascendant: ${asc.sign ?? 'N/A'} (${(asc.degree ?? 0).toFixed(2)}°)
Mahadasha: ${dasha.mahadasha ?? 'N/A'} | Antardasha: ${dasha.antardasha ?? 'N/A'}
Planets: ${planets.map((p) => `${p.planet} in ${p.sign} (H${p.house})`).join(', ')}`;
    }

    // Insert pending plan record
    const { data: plan, error: insertErr } = await supabase
      .from('purchase_plans')
      .insert({
        user_id: user.id,
        chart_id: chartId,
        category,
        metadata,
        cost_bracket: costBracket ?? null,
        booking_date: bookingDate ?? null,
        delivery_date: deliveryDate ?? null,
        resolved_booking_date: resolvedBooking,
        resolved_delivery_date: resolvedDelivery,
        panchang_date: panchangDate,
        language,
        status: 'pending',
      })
      .select('id')
      .single();

    if (insertErr || !plan) {
      return NextResponse.json({ success: false, error: 'Failed to create plan' }, { status: 500 });
    }

    // Get origin for internal panchang fetch
    const origin = new URL(request.url).origin;

    // Fire background analysis after response is sent
    after(async () => {
      const [panchangBooking, panchangDelivery] = await Promise.all([
        fetchPanchang(resolvedBooking, origin),
        fetchPanchang(resolvedDelivery, origin),
      ]);

      const prompt = buildPrompt({
        category,
        metadata,
        costBracket: costBracket ?? null,
        resolvedBooking,
        resolvedDelivery,
        bookingProvided: !!bookingDate,
        deliveryProvided: !!deliveryDate,
        panchangBooking,
        panchangDelivery,
        chartContext,
        language,
      });

      await runAnalysis(plan.id, prompt);
    });

    return NextResponse.json({ success: true, planId: plan.id });
  } catch (err) {
    console.error('[purchase-plan/analyze]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
