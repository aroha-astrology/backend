import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { bedrockChatComplete } from '@/lib/ai/bedrockChat';
import { deductCredits } from '@/lib/credits/deductCredits';
import { getAstrologer } from '@/lib/astrologers';
import { cacheGet, cacheSet } from '@/lib/redis';
import { getAgeDemographic, buildToneOnly } from '@/lib/ai/toneRouting';
import {
  classifyUserMessage,
  classifyAssistantOutput,
  POLICY_SYSTEM_DIRECTIVE,
} from '@/lib/ai/contentPolicy';
import type { ApiResponse } from '@aroha-astrology/shared';

const CHART_CACHE_TTL = 300;

const ZODIAC_SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];

async function getChartCached(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  chartId: string,
  userId: string,
) {
  const key = `chart:${chartId}:${userId}`;
  const cached = await cacheGet<Record<string, unknown>>(key);
  if (cached) return { data: cached, error: null };
  const result = await supabase
    .from('kundli_charts')
    .select(`*, birth_profiles (name, dob, tob, tob_source, pob, gender)`)
    .eq('id', chartId)
    .eq('user_id', userId)
    .single();
  if (result.data) await cacheSet(key, result.data, CHART_CACHE_TTL);
  return result;
}

export const maxDuration = 300; // 10 minutes

const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  hi: 'IMPORTANT: Reply ENTIRELY in Hindi (Devanagari script). Use Sanskrit/Hindi astrological terms naturally.',
  bn: 'IMPORTANT: Reply ENTIRELY in Bengali (Bengali script). Use Bengali astrological terminology.',
  ta: 'IMPORTANT: Reply ENTIRELY in Tamil (Tamil script). Use Tamil astrological terms.',
  te: 'IMPORTANT: Reply ENTIRELY in Telugu (Telugu script). Use Telugu astrological terms.',
  mr: 'IMPORTANT: Reply ENTIRELY in Marathi (Devanagari script). Use Marathi astrological terms.',
};

const SYSTEM_PROMPT = `${POLICY_SYSTEM_DIRECTIVE}

You are "Yogi Baba" — a legendary Vedic astrologer, palmist, numerologist, and spiritual guide with 50+ years of experience. You answer questions from an astrological and spiritual perspective, grounded in the chart data the seeker has shared with you.

YOUR IDENTITY:
- You are Yogi Baba, not an AI. Never mention being an AI, LLM, or computer program.
- You speak with wisdom, warmth, humor, and authority like a trusted family astrologer.
- You use Vedic astrology (Jyotish), numerology, palmistry, and Hindu spiritual traditions.
- You refer to the user's chart data, reports, and predictions we've already generated.

GROUNDING RULES (NON-NEGOTIABLE — fabrication is the worst sin you can commit):
- Use ONLY the data in the BIRTH CHART, DASHA, YOGAS, DOSHAS, SHADBALA, ASHTAKAVARGA, TODAY'S TRANSITS, TOMORROW'S TRANSITS, TODAY'S PANCHANG, TOMORROW'S PANCHANG, PALM, DIVISIONAL CHART, PREDICTIONS, and KNOWN FACTS blocks below.
- Do NOT invent planet positions, signs, houses, nakshatras, dasha start/end dates, transit dates, or yoga findings that are not in the context.
- PLANETARY POSITIONS block = birth/natal chart (fixed, where planets were when the person was born). TODAY'S TRANSITS / TOMORROW'S TRANSITS = current/next-day sky positions. NEVER mix natal and transit positions.
- For "is today good / auspicious / right time?" → use TODAY'S PANCHANG. For "tomorrow" → TOMORROW'S PANCHANG + TOMORROW'S TRANSITS. For "this week / next [weekday] / X days from now" → use the 7-DAY PANCHANG FORECAST rows. Always cite Rahu Kaal (avoid) and Abhijit Muhurta (best window) when answering any timing/muhurta question.
- If the user asks about timing that goes beyond the dasha sequence shown to you, say "your chart shows the upcoming sequence ends at [last endDate I have]" rather than guessing further dates.
- If the user asks about another person (spouse, child, parent) and that person's birth data is not in the context, ask for it before giving specific timing — do not project from the user's chart alone for THEIR person.
- If a yoga isn't listed in ACTIVE YOGAS, do not name a specific yoga. Speak generally ("the chart suggests…") instead.

STORYTELLING STYLE — THIS IS YOUR MOST IMPORTANT TRAIT:
Every response must feel like a riveting story unfolding, not a dry analysis. Paint pictures with words:
- Open with a vivid cosmic scene: "When the stars aligned on the day you were born, the universe was whispering a very specific story..."
- Weave planetary positions into narrative: Instead of "Saturn is in 10th house", say "Saturn, the great teacher, chose to sit in your house of karma and career — watching every step you take with those stern, unblinking eyes..."
- Use metaphors and imagery: "Your Moon in Scorpio is like a deep ocean cave — mysterious, powerful, hiding treasures most people never see."
- Build tension and resolution: describe the challenge a planet creates, then reveal how the user can overcome it.
- Make the person feel like the HERO of their own cosmic story.
- Use before/after narrative arcs: "In the chapters before 2022, Saturn was testing you. But now, as Jupiter moves into your 7th house, a new chapter of warmth and partnership is being written..."
- Reference their actual chart positions as characters in their life story.
- End with a scene of possibility: paint a picture of what their future could look like if they work with these energies.

CRITICAL RULES:
1. Engage with every spiritual / life-area question through astrology, drawing on the chart context below. If the chart genuinely lacks the data needed (e.g., a third person's chart isn't shared, or a dasha sequence ends before the timing asked about), ask ONE focused follow-up question OR speak in general remedial terms — never invent specifics.
2. Never reveal you are an AI. For medical, legal, or major financial decisions: give the astrological view from the chart, then recommend the seeker also consult a qualified professional for the practical decision. Do not refuse the astrological reading itself.
3. For health → analyze 6th house, ascendant lord, planetary afflictions FROM THE CHART CONTEXT. Frame as karmic patterns and remedies, not medical diagnosis.
4. For child gender → analyze 5th house, Jupiter, putra karaka. Say "Vedic indicators suggest..."
5. For marriage/love → analyze 7th house, Venus, navamsa, dasha timing.
6. For death/longevity/lifespan/maraka/mrityu → REFUSE per the ABSOLUTE CONTENT POLICY at the top of this prompt. Reply with the canned line and redirect to a positive area of the chart.
7. For finances → analyze 2nd, 11th houses, dhana yogas.
8. For career → analyze 10th house, Saturn, Sun, Mercury.
9. For another person (wife, mother, child) → analyze from user's chart (wife=7th, mother=4th, father=9th, children=5th) OR ask for their birth details.
10. Always give specific timing using dasha periods.
11. Always suggest practical remedies (mantras, gemstones, fasting, charity).
12. If you need more information to answer precisely, ASK THE USER A QUESTION BACK. Examples:
    - "To read your story more precisely, could you tell me your spouse's date of birth?"
    - "What time were you born? This shapes the very first chapter of your cosmic tale."
    - "Are you currently employed or in business? This helps me find the right chapter of your career story."
    - "Which health concern weighs on you most? I want to look into that specific corner of your chart."
13. Use Hindi/Sanskrit terms with meanings: Graha (planet), Rashi (sign), Bhava (house), etc.
14. Minimum 5-6 rich, storytelling paragraphs per answer. Be vivid, specific, and immersive.
15. End with an empowering scene — paint a picture of the user stepping into their best future.
16. When report content is provided in context, QUOTE and EXPAND on it: "As your Kundli report reveals — let me tell you the deeper story behind those words..."
17. Use Shadbala strength data in narrative form: "Your Sun burns brightest of all your planets (Shadbala confirms this) — imagine the Sun as the king in your cosmic court..."
18. Use Ashtakavarga as plot points: "When Jupiter enters Scorpio, your own chart shows 7 bindus there — that is a powerful green light from the universe..."

WHEN CHART DATA IS PROVIDED:
- You have access to the user's complete birth chart. USE IT as story material.
- Each planet is a character — describe them, their placement, their role in this person's life.
- The current Mahadasha is the "current chapter" — describe what story arc it represents.
- Yogas and doshas are plot twists — explain how they shape this person's journey.
- If previous reports exist, say "Let me continue the story from where your Kundli report left off..."

WHEN ASKING QUESTIONS BACK:
- If the user asks something vague, ask a clarifying question in storytelling style.
- Always provide a preliminary story first, THEN ask for more details to deepen it.
- Frame questions as: "To tell the full story of your [topic], I need one more detail..."

CONVERSATION STYLE:
- Warm and cinematic: "My dear child, let me take you back to the night sky of your birth..."
- Use sensory language — what did the cosmos look/feel/sound like for this person?
- Dramatic pauses with ellipses: "And then... Saturn moves. Everything changes."
- Occasionally use Hindi phrases woven naturally into English: "The ancient teachers called this 'prarabdha karma' — the destiny already set in motion."
- NEVER sound like a textbook. ALWAYS sound like a master storyteller who also happens to know astrology perfectly.`;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { question, chartId, language, astrologerId, mode } = body as {
      question: string;
      chartId?: string;
      language?: string;
      astrologerId?: string; // e.g. 'yogi-baba', 'mata-ananya', etc.
      mode?: 'voice' | 'text';   // 'voice' = systemPrompt, 'text' = textSystemPrompt
    };

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'question is required' },
        { status: 400 },
      );
    }

    // Content policy: block death / suicide topics BEFORE LLM call or credit deduction.
    const inputPolicy = classifyUserMessage(question, language);
    if (inputPolicy.blocked) {
      await supabase
        .from('chat_conversations')
        .insert({
          user_id: user.id,
          question,
          response: inputPolicy.cannedResponse,
          chart_id: chartId ?? null,
          language: language ?? 'en',
        })
        .then(() => {}, () => {});
      console.warn(`[${inputPolicy.logTag}] user=${user.id}`);
      return NextResponse.json<ApiResponse>({
        success: true,
        data: { response: inputPolicy.cannedResponse },
      });
    }

    const persona = astrologerId ? getAstrologer(astrologerId) : undefined;

    // 1 token = 3 minutes of chat. Deduct only when session expires or first message.
    const { data: userData } = await supabase
      .from('users')
      .select('chat_session_expires')
      .eq('id', user.id)
      .single();

    const sessionExpires = userData?.chat_session_expires
      ? new Date(userData.chat_session_expires as string)
      : null;
    const sessionActive = sessionExpires && sessionExpires > new Date();

    if (!persona?.isFree) {
      if (!sessionActive) {
        const personaName = persona?.name ?? 'Yogi Baba';
        const creditResult = await deductCredits(
          supabase, user.id, 1, 'chat_debit', `${personaName} chat (3-min session)`,
        );
        if (!creditResult.success) {
          return NextResponse.json(
            { success: false, error: 'INSUFFICIENT_TOKENS' },
            { status: 402 },
          );
        }
        // Extend session for 3 minutes
        await supabase
          .from('users')
          .update({ chat_session_expires: new Date(Date.now() + 3 * 60 * 1000).toISOString() })
          .eq('id', user.id);
      }
    }

    // Build comprehensive context from chart + reports
    let chartContext = '';
    let shadContext = '';
    let avContext = '';
    let toneContext = '';
    let transitContext = '';
    let tomorrowTransitContext = '';
    let panchangContext = '';
    if (chartId) {
      const { data: chart, error: chartError } = await getChartCached(supabase, chartId, user.id);

      if (!chartError && chart) {
        const profile = chart.birth_profiles as Record<string, unknown> | undefined;
        const cd = chart.chart_data as Record<string, unknown>;
        const planets = (cd?.planets ?? []) as Array<Record<string, unknown>>;
        const asc = cd?.ascendant as Record<string, unknown> | undefined;

        // Compact chart summary instead of raw JSON dump
        const planetSummary = planets
          .map(p => `${p.planet ?? p.name}: ${p.sign} ${Number(p.signDegree ?? p.degree ?? 0).toFixed(1)}° H${p.house} ${p.nakshatra}${p.isRetrograde ? ' (R)' : ''}`)
          .join('\n');

        const dashaData = chart.dasha_data as Record<string, unknown> | undefined;
        const vimshottari = dashaData?.vimshottari as Record<string, unknown> | undefined;
        const currentMD = vimshottari?.currentMahadasha as Record<string, unknown> | undefined;
        const currentAD = vimshottari?.currentAntardasha as Record<string, unknown> | undefined;
        const currentPD = vimshottari?.currentPratyantardasha as Record<string, unknown> | undefined;
        const allMDs = (vimshottari?.mahadashas ?? []) as Array<Record<string, unknown>>;

        // Build future dasha sequence so the model can ground timing answers in real periods.
        // Format: "Sun MD: 2030-04-12 → 2036-04-12 (6y)"
        const fmtDate = (v: unknown) => v ? String(v).slice(0, 10) : '?';
        const yearsBetween = (s: unknown, e: unknown) => {
          const sd = s ? new Date(String(s)).getTime() : NaN;
          const ed = e ? new Date(String(e)).getTime() : NaN;
          if (!isFinite(sd) || !isFinite(ed)) return '?';
          return (((ed - sd) / (365.25 * 86_400_000))).toFixed(1) + 'y';
        };
        const currentMDIdx = allMDs.findIndex(p => p.isActive);
        const upcomingMDs = currentMDIdx >= 0
          ? allMDs.slice(currentMDIdx + 1, currentMDIdx + 6)  // next 5 MDs (~30-50 years)
          : [];
        const futureMDLines = upcomingMDs
          .map(p => `  - ${p.planet} MD: ${fmtDate(p.startDate)} → ${fmtDate(p.endDate)} (${yearsBetween(p.startDate, p.endDate)})`)
          .join('\n');

        // Upcoming antardashas inside the current MD (next 5 AD periods)
        const currentMDSubs = (currentMD?.subPeriods ?? []) as Array<Record<string, unknown>>;
        const currentADIdx = currentMDSubs.findIndex(p => p.isActive);
        const upcomingADs = currentADIdx >= 0
          ? currentMDSubs.slice(currentADIdx + 1, currentADIdx + 6)
          : [];
        const futureADLines = upcomingADs
          .map(p => `  - ${currentMD?.planet}/${p.planet} AD: ${fmtDate(p.startDate)} → ${fmtDate(p.endDate)} (${yearsBetween(p.startDate, p.endDate)})`)
          .join('\n');

        const yogas = (chart.yoga_data as Array<Record<string, unknown>> ?? [])
          .filter(y => y.present || y.isPresent)
          .map(y => String(y.name))
          .slice(0, 10);

        const doshas = Object.entries((chart.dosha_data ?? {}) as Record<string, unknown>)
          .filter(([, v]) => v && typeof v === 'object' && ((v as Record<string, unknown>).present || (v as Record<string, unknown>).isPresent))
          .map(([k]) => k);

        const dobStr = profile?.dob ? String(profile.dob) : null;
        let ageLine = '';
        if (dobStr) {
          const dob = new Date(dobStr);
          if (!isNaN(dob.getTime())) {
            const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
            if (age >= 0 && age < 130) ageLine = `Current Age: ${age} years\n`;
          }
        }
        const toneBlock = buildToneOnly(getAgeDemographic(dobStr));
        if (toneBlock) toneContext = `\n\n${toneBlock}`;
        const _now = new Date();
        const _istStr = _now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
        const _timePart = _istStr.split(', ')[1] ?? '';
        const todayLine = `Today: ${_now.toISOString().split('T')[0]} | Time: ${_timePart} IST\n`;

        chartContext = `

USER'S BIRTH CHART (use this data for all answers):
${todayLine}${ageLine}Name: ${profile?.name ?? 'User'}
DOB: ${profile?.dob ?? 'unknown'}
TOB: ${profile?.tob ?? 'unknown'}
POB: ${profile?.pob ?? 'unknown'}
Gender: ${profile?.gender ?? 'unknown'}
Ascendant: ${asc?.sign ?? 'unknown'} ${Number(asc?.degree ?? 0).toFixed(1)}°

PLANETARY POSITIONS:
${planetSummary}

CURRENT DASHA:
Mahadasha: ${currentMD?.planet ?? 'unknown'} (${currentMD?.startDate ? new Date(String(currentMD.startDate)).getFullYear() : '?'} - ${currentMD?.endDate ? new Date(String(currentMD.endDate)).getFullYear() : '?'})
Antardasha: ${currentAD?.planet ?? 'unknown'}${currentAD?.endDate ? ` — ends ${String(currentAD.endDate).slice(0, 10)}` : ''}
Pratyantardasha: ${currentPD?.planet ?? 'unknown'}
${futureADLines ? `\nUPCOMING ANTARDASHAS (within current ${currentMD?.planet} MD — use for timing within the next few years):\n${futureADLines}` : ''}
${futureMDLines ? `\nUPCOMING MAHADASHAS (use for long-term timing — DO NOT predict beyond the last endDate listed):\n${futureMDLines}` : ''}

ACTIVE YOGAS: ${yogas.length > 0 ? yogas.join(', ') : 'None detected'}
ACTIVE DOSHAS: ${doshas.length > 0 ? doshas.join(', ') : 'None detected'}`;

        // Add Shadbala strength context
        const shadData = chart.shadbala as Record<string, unknown> | undefined;
        const shadPlanets = Array.isArray(shadData?.planets) ? shadData.planets
          : Array.isArray(shadData?.data) ? shadData.data
          : [];
        if (shadPlanets.length > 0) {
          const sorted = [...shadPlanets].sort((a: unknown, b: unknown) =>
            Number((b as Record<string, unknown>).totalVirupas ?? 0) - Number((a as Record<string, unknown>).totalVirupas ?? 0)
          );
          const strong = sorted.slice(0, 3).map(p => String((p as Record<string, unknown>).planet ?? (p as Record<string, unknown>).name)).join(', ');
          const weak = sorted.slice(-3).map(p => String((p as Record<string, unknown>).planet ?? (p as Record<string, unknown>).name)).join(', ');
          shadContext = `\nSTRONGEST PLANETS (Shadbala): ${strong}\nWEAKEST PLANETS: ${weak}`;
        }

        // Add Ashtakavarga strength context
        const avData = chart.ashtakavarga as Record<string, unknown> | undefined;
        const sarva = Array.isArray(avData?.sarvaAshtakavarga) ? avData.sarvaAshtakavarga
          : Array.isArray(avData?.sarva) ? avData.sarva
          : [];
        if (sarva.length > 0) {
          const sorted = [...sarva].sort((a: unknown, b: unknown) =>
            Number((b as Record<string, unknown>).bindus ?? 0) - Number((a as Record<string, unknown>).bindus ?? 0)
          );
          const best = sorted.slice(0, 3).map(s => `${s as Record<string, unknown>['sign']}(${(s as Record<string, unknown>).bindus})`).join(', ');
          const weak = sorted.slice(-3).map(s => `${s as Record<string, unknown>['sign']}(${(s as Record<string, unknown>).bindus})`).join(', ');
          avContext = `\nBEST TRANSIT SIGNS (Ashtakavarga): ${best}\nWEAK TRANSIT SIGNS: ${weak}`;
        }
      }
    }

    // TODAY'S + TOMORROW'S TRANSITS (GOCHAR) — computed in parallel
    try {
      const { dateToJulianDay, calculatePlanetPositions } = await import('@aroha-astrology/astro-engine');
      const now = new Date();
      const tmrw = new Date(now.getTime() + 86_400_000);

      const [jdToday, jdTmrw] = await Promise.all([
        dateToJulianDay(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), 0),
        dateToJulianDay(tmrw.getUTCFullYear(), tmrw.getUTCMonth() + 1, tmrw.getUTCDate(), tmrw.getUTCHours(), tmrw.getUTCMinutes(), 0),
      ]);
      const [todayPlanets, tmrwPlanets] = await Promise.all([
        calculatePlanetPositions(jdToday, 'lahiri'),
        calculatePlanetPositions(jdTmrw, 'lahiri'),
      ]);

      // Re-derive lagna sign from the already-built chartContext string
      const lagnaMatch = chartContext.match(/Ascendant: ([A-Za-z]+)/);
      const lagnaIdx = lagnaMatch ? ZODIAC_SIGNS.indexOf(lagnaMatch[1]) : -1;

      type TP = { planet: string; sign: string; signDegree: number; nakshatra: string; isRetrograde: boolean };
      const formatLines = (planets: TP[]) => planets.map(p => {
        const signIdx = ZODIAC_SIGNS.indexOf(p.sign);
        const houseStr = lagnaIdx >= 0 && signIdx >= 0 ? ` → H${((signIdx - lagnaIdx + 12) % 12) + 1} from lagna` : '';
        return `${p.planet}: ${p.sign} ${p.signDegree.toFixed(1)}° ${p.nakshatra}${p.isRetrograde ? ' (R)' : ''}${houseStr}`;
      });

      transitContext = `\n\nTODAY'S PLANETARY TRANSITS / GOCHAR — CURRENT SKY POSITIONS (⚠️ NOT birth chart positions. For "where is X now/today/currently", use ONLY these, NOT the PLANETARY POSITIONS block above):\n${formatLines(todayPlanets as TP[]).join('\n')}`;
      tomorrowTransitContext = `\n\nTOMORROW'S PLANETARY TRANSITS (⚠️ NOT birth chart positions — use for "tomorrow" questions):\n${formatLines(tmrwPlanets as TP[]).join('\n')}`;
    } catch {
      // Non-fatal — chat continues without transit context
    }

    // 7-DAY PANCHANG FORECAST — read from pre-computed Redis cache (cron pre-caches 7 days ahead)
    try {
      const istOffset = 5.5 * 60 * 60 * 1000;
      const loc = '20.59,78.96';
      // Build IST date strings for today + next 6 days (7 total)
      const dateKeys = Array.from({ length: 7 }, (_, i) =>
        new Date(Date.now() + istOffset + i * 86_400_000).toISOString().split('T')[0],
      );
      const panchangDays = await Promise.all(
        dateKeys.map(d => cacheGet<Record<string, unknown>>(`panchang:${d}:${loc}`)),
      );

      type ChogSlot = { name: string; start: string; end: string; type: string };

      // Today + tomorrow: full detail
      const formatFull = (p: Record<string, unknown>, label: string) => {
        const rk = p.rahuKaal as Record<string, string> | undefined;
        const am = p.abhijitMuhurta as Record<string, string> | undefined;
        const gk = p.gulikaKaal as Record<string, string> | undefined;
        const daySlots = (p.choghadiya as { day?: ChogSlot[] } | undefined)?.day ?? [];
        const goodChog = daySlots.filter(c => c.type === 'good').map(c => `${c.name}(${c.start}–${c.end})`).join(', ');
        const badChog  = daySlots.filter(c => c.type === 'bad').map(c => `${c.name}(${c.start}–${c.end})`).join(', ');
        return `\n\n${label} PANCHANG (${p.date}):
Vara: ${p.vara} | Tithi: ${p.tithi}
Nakshatra: ${p.nakshatra} | Yoga: ${p.yoga} | Karana: ${p.karana}
Sunrise: ${p.sunrise} | Sunset: ${p.sunset}
Rahu Kaal: ${rk?.start}–${rk?.end} ← AVOID starting new work
Gulika Kaal: ${gk?.start}–${gk?.end} ← avoid
Abhijit Muhurta: ${am?.start}–${am?.end} ← MOST auspicious window
Good Choghadiya: ${goodChog || 'none'}
Avoid Choghadiya: ${badChog || 'none'}`;
      };

      // Days 3–7: compact one-line summary (Moon nakshatra is the key daily variable)
      const formatCompact = (p: Record<string, unknown>) => {
        const rk = p.rahuKaal as Record<string, string> | undefined;
        const am = p.abhijitMuhurta as Record<string, string> | undefined;
        const daySlots = (p.choghadiya as { day?: ChogSlot[] } | undefined)?.day ?? [];
        const goodChog = daySlots.filter(c => c.type === 'good').map(c => c.name).join('/');
        return `${p.date} (${String(p.vara).split(' ')[0]}): ${p.tithi} | Nak:${String(p.nakshatra).split(' ')[0]} | ${p.yoga} | RK:${rk?.start}–${rk?.end} | AM:${am?.start}–${am?.end} | Good:${goodChog || '-'}`;
      };

      if (panchangDays[0]) panchangContext += formatFull(panchangDays[0], "TODAY'S");
      if (panchangDays[1]) panchangContext += formatFull(panchangDays[1], "TOMORROW'S");

      const weekLines = panchangDays.slice(2).filter(Boolean).map(p => formatCompact(p!));
      if (weekLines.length > 0) {
        panchangContext += `\n\n7-DAY PANCHANG FORECAST (use for "this week / next [day]" questions — Moon nakshatra changes daily, slow planets same as TODAY'S TRANSITS):\n${weekLines.join('\n')}`;
      }
    } catch {
      // Non-fatal
    }

    // REPORTS_DISABLED: Report context injection temporarily disabled.
    // Uncomment the block below to re-enable report content in AI chat.
    /* REPORTS_DISABLED_START
    const { data: latestReport } = await supabase
      .from('generated_reports')
      .select('ai_content, report_type, subject_name, created_at')
      .eq('user_id', user.id)
      .in('status', ['ai_ready', 'ready', 'completed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let reportContentContext = '';
    if (latestReport?.ai_content) {
      const ac = latestReport.ai_content as Record<string, string>;
      const sections: [string, string][] = [
        ['Executive Summary', ac.executive_summary],
        ['Life Purpose', ac.life_purpose],
        ['Key Strengths', ac.key_strengths],
        ['Key Challenges', ac.key_challenges],
        ['Personality', ac.personality],
        ['Nature & Temperament', ac.nature_temperament],
        ['Career', ac.career],
        ['Wealth', ac.wealth],
        ['Business vs Service', ac.business_vs_service],
        ['Health Constitution', ac.health_constitution],
        ['Health Vulnerabilities', ac.health_vulnerabilities],
        ['Marriage', ac.marriage],
        ['Partner Profile', ac.partner_profile],
        ['Children', ac.children],
        ['Education', ac.education],
        ['Spiritual Path', ac.spiritual_path],
        ['Past Life / Karma', ac.past_life],
        ['Current Dasha', ac.dasha_current],
        ['Dasha 5yr Forecast', ac.dasha_5yr_forecast],
        ['Saturn Transit', ac.saturn_transit],
        ['Jupiter Transit', ac.jupiter_transit],
        ['Mantra Remedies', ac.mantra_remedies],
        ['Gemstone Remedies', ac.gemstone_remedies],
        ['Lucky Factors', ac.lucky_numbers ? `Numbers: ${ac.lucky_numbers} | Colors: ${ac.lucky_colors} | Days: ${ac.lucky_days}` : ''],
        ['Year 2026', ac.year_2026],
        ['Year 2027', ac.year_2027],
        ['Year 2028', ac.year_2028],
        ['Yogi Baba Message', ac.yogi_baba_message],
      ];
      const nonEmpty = sections.filter(([, v]) => v && v.trim().length > 20);
      if (nonEmpty.length > 0) {
        reportContentContext = `\n\nYOUR GENERATED REPORT INTERPRETATIONS (${latestReport.report_type}):\n` +
          nonEmpty.map(([k, v]) => `${k.toUpperCase()}:\n${v.trim().slice(0, 500)}`).join('\n\n');
      }
    }
    REPORTS_DISABLED_END */
    const reportContentContext = '';

    // Palm reading context
    const { data: palmReading } = await supabase
      .from('palm_readings')
      .select('analysis, hand, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let palmContext = '';
    if (palmReading?.analysis) {
      const pa = palmReading.analysis as Record<string, unknown>;
      const handShape = pa.handShape as Record<string, unknown> | undefined;
      const majorLines = pa.majorLines as Record<string, Record<string, unknown>> | undefined;
      const palmLines = [
        handShape?.type ? `Hand Type: ${handShape.type} (${handShape.vedic_element ?? ''}) — ${String(handShape.description ?? '').slice(0, 150)}` : null,
        majorLines?.lifeLine?.interpretation ? `Life Line: ${String(majorLines.lifeLine.interpretation).slice(0, 150)}` : null,
        majorLines?.heartLine?.interpretation ? `Heart Line: ${String(majorLines.heartLine.interpretation).slice(0, 150)}` : null,
        majorLines?.headLine?.interpretation ? `Head Line: ${String(majorLines.headLine.interpretation).slice(0, 150)}` : null,
        majorLines?.fateLine?.interpretation ? `Fate Line: ${String(majorLines.fateLine.interpretation).slice(0, 150)}` : null,
        pa.overallPersonality ? `Overall Personality: ${String(pa.overallPersonality).slice(0, 200)}` : null,
        pa.soulPurpose ? `Soul Purpose: ${String(pa.soulPurpose).slice(0, 200)}` : null,
        pa.relationshipOutlook ? `Relationship Outlook: ${String(pa.relationshipOutlook).slice(0, 150)}` : null,
        pa.financialOutlook ? `Financial Outlook: ${String(pa.financialOutlook).slice(0, 150)}` : null,
        pa.vedicCorrelation ? `Vedic Correlation: ${String(pa.vedicCorrelation).slice(0, 200)}` : null,
        Array.isArray(pa.careerSuggestions) ? `Career Suggestions: ${(pa.careerSuggestions as string[]).slice(0, 3).join('; ')}` : null,
        Array.isArray(pa.healthWarnings) ? `Health Warnings: ${(pa.healthWarnings as string[]).slice(0, 3).join('; ')}` : null,
        pa.panditMessage ? `Pandit Message: ${String(pa.panditMessage).slice(0, 200)}` : null,
      ].filter(Boolean);

      if (palmLines.length > 0) {
        palmContext = `\n\nPALM READING ANALYSIS (${palmReading.hand} hand, read on ${new Date(palmReading.created_at as string).toLocaleDateString()}):\n${palmLines.join('\n')}`;
      }
    }

    // Divisional chart analysis context — load core D charts for all questions for better accuracy
    // Then add additional charts if keywords match
    const CORE_CHARTS = ['D1', 'D2', 'D3', 'D4', 'D7', 'D9', 'D10', 'D12']; // Most important for accuracy
    const CHART_KEYWORDS: Record<string, string[]> = {
      D16: ['vehicle', 'car', 'luxury', 'comfort', 'conveyance', 'bike', 'transport'],
      D20: ['spiritual', 'religion', 'worship', 'mantra', 'meditation', 'dharma', 'temple'],
      D24: ['education', 'studies', 'academic', 'knowledge', 'learning', 'degree', 'school', 'college'],
      D27: ['strength', 'stamina', 'physical', 'endurance', 'fitness', 'body', 'sports'],
      D30: ['misfortune', 'obstacle', 'problem', 'hardship', 'struggle', 'difficulty'],
      D40: ['maternal', 'matrilineal', 'mother side'],
      D45: ['paternal', 'patrilineal', 'father side', 'character'],
      D60: ['karma', 'past life', 'destiny', 'fate', 'rebirth', 'prarabdha'],
    };

    let vargaContext = '';
    if (chartId) {
      const lq = question.toLowerCase();
      const additionalCharts = Object.entries(CHART_KEYWORDS)
        .filter(([, kws]) => kws.some((kw) => lq.includes(kw)))
        .map(([ct]) => ct);

      // Always load core charts + any additional ones matching keywords
      const toFetch = [...CORE_CHARTS, ...additionalCharts];

      const { data: analyses } = await supabase
        .from('divisional_chart_analyses')
        .select('chart_type, analysis, key_findings')
        .eq('kundli_chart_id', chartId)
        .in('chart_type', toFetch)
        .eq('status', 'ready');

      if (analyses && analyses.length > 0) {
        vargaContext =
          '\n\nDIVISIONAL CHART ANALYSES — USE THESE FOR DEEPER INTERPRETATION:\n' +
          analyses
            .map(
              (a) =>
                `${a.chart_type} Analysis:\n${a.analysis}\nKey findings: ${(a.key_findings as string[]).join(' | ')}`,
            )
            .join('\n\n');
      }
    }

    // User predictions + answered follow-up questions + recent chat turns in parallel.
    // Recent turns scope: same user + same chartId (so a chart switch doesn't leak old context).
    const historyQuery = supabase
      .from('chat_conversations')
      .select('question, response, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    const scopedHistoryQuery = chartId
      ? historyQuery.eq('chart_id', chartId)
      : historyQuery.is('chart_id', null);

    const [predictionsResult, followUpResult, historyResult] = await Promise.all([
      chartId
        ? supabase
            .from('predictions')
            .select('content, type, created_at')
            .eq('chart_id', chartId)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20)
        : Promise.resolve({ data: null }),
      chartId
        ? supabase
            .from('follow_up_questions')
            .select('question, answer')
            .eq('chart_id', chartId)
            .not('answer', 'is', null)
            .order('created_at', { ascending: false })
            .limit(20)
        : Promise.resolve({ data: null }),
      scopedHistoryQuery,
    ]);

    // Build predictions context
    let predictionsContext = '';
    const allPredictions = (predictionsResult?.data as Array<{ type: string; content: unknown; created_at: string }> | null) ?? [];
    if (allPredictions.length > 0) {
      const latestByType = new Map<string, Record<string, unknown>>();
      for (const row of allPredictions) {
        if (!latestByType.has(row.type)) latestByType.set(row.type, row.content as Record<string, unknown>);
      }
      const sections: string[] = [];
      for (const [type, pc] of latestByType) {
        const summary = Array.isArray(pc.summary)
          ? (pc.summary as string[]).join(' ')
          : typeof pc.summary === 'string' ? pc.summary : '';
        const topAnalyses = Array.isArray(pc.detailedAnalysis)
          ? (pc.detailedAnalysis as Array<Record<string, unknown>>)
              .slice(0, 3)
              .map(a => `  • ${a.area}: ${String(a.prediction ?? '').slice(0, 150)}`)
              .join('\n')
          : '';
        const block = `${type.toUpperCase()} PREDICTION:\n`
          + (summary ? `Summary: ${summary.slice(0, 300)}\n` : '')
          + (topAnalyses ? topAnalyses : '');
        sections.push(block);
      }
      if (sections.length > 0) {
        predictionsContext = '\n\nUSER\'S GENERATED PREDICTIONS (refer to these when they ask about any life area):\n'
          + sections.join('\n\n');
      }
    }

    // Build known-facts block from answered follow-up questions
    let followUpContext = '';
    const answeredQs = (followUpResult?.data as Array<{ question: string; answer: string }> | null) ?? [];
    if (answeredQs.length > 0) {
      const lines = answeredQs
        .filter(q => q.answer?.trim())
        .map(q => `- Q: ${q.question.trim()}\n  A: ${q.answer.trim()}`);
      if (lines.length > 0) {
        followUpContext = '\n\nKNOWN FACTS (user already answered these — NEVER ask again):\n' + lines.join('\n');
      }
    }

    // Pick the correct persona prompt (falls back to hardcoded Yogi Baba for legacy callers)
    const basePrompt = persona
      ? (mode === 'voice' ? persona.systemPrompt : persona.textSystemPrompt)
      : SYSTEM_PROMPT;

    const FOLLOWUP_RULES = `
FOLLOW-UP QUESTION RULES (for accuracy — use judgement):
When the user's question needs ONE key piece of missing info to give a truly accurate answer, ask it FIRST before answering. One question only — never a list.

Ask a follow-up when:
- Marriage/relationship timing → "Are you currently in a relationship or looking for a new one?"
- Career change/job timing → "Are you employed right now, or planning to start fresh?"
- Health concern → "Is this an ongoing issue or something that started recently?"
- Travel/foreign settlement → "Are you asking about a short trip or permanent relocation?"
- Child/pregnancy → "Are you already trying, or planning to start?"
- Business venture → "Do you have a business in mind, or still exploring options?"
- Asking about another person (spouse/parent/child) → "Could you share their date of birth for a more accurate reading?"

When NOT to ask — just answer:
- General personality, strengths, weaknesses
- Dasha/transit explanations
- Remedies or mantras
- Questions where the chart already has enough data
- If the conversation history already has the answer

Format when asking: Brief 1-sentence astrological observation first, THEN the single question. Example: "Your 7th house shows strong Venus energy for relationships. Are you currently in a relationship, or looking for someone new?"`;

    const RESPONSE_STRUCTURE = `
RESPONSE STRUCTURE (OVERRIDES EVERY PERSONA RULE THAT ASKS FOR LONGER ANSWERS):
1. ULTRA-SHORT BY DEFAULT. Reply in TWO short lines maximum (≈40 words total). No paragraphs. No bullet lists. No headers. No JSON. No storytelling preamble.
2. DETAIL ON REQUEST. If — and ONLY if — the current user message asks for a detailed / longer / deeper reply ("in detail", "explain", "elaborate", "tell me more", "go deeper", "more details", "expand", "long answer", "vistar se", "vistaar se", "बिस्तार से", "विस्तार से", "detail mein", "thoda detail", "purani baat", "samjhao", "samjhaiye"), you may expand THAT ONE reply to ~6 short sentences with simple line breaks. The very next reply returns to the two-line default. Never assume the detail mode carries over.
3. PLAIN HUMAN IMPACT. Lead with what it means for the user's life (love, money, career, health, mood). Mention a planet/sign/house/dasha only if the answer truly needs it — and at most ONE such term per reply (still applies in detail mode — pick the most relevant one).
4. DON'T REPEAT FORMS OF ADDRESS. Use "beta", "beti", "bhai", "behen", "ji", or the user's first name AT MOST ONCE in the entire conversation — only your very first turn, and only if it fits naturally. Every subsequent reply opens with the substance directly. Never re-greet, never re-name them, never start two replies in a row with the same address.
5. REMEDIES ONLY IF ASKED. Do NOT volunteer mantras, gemstones, yantras, rituals, or "do this" prescriptions unless the user asked for a remedy / upay / solution.
6. WHEN A REMEDY IS A PRODUCT, NAME IT CLEARLY. If the appropriate remedy is a buyable item (a gemstone like "yellow sapphire (pukhraj)" / "blue sapphire (neelam)" / "red coral (moonga)" / "ruby (manik)" / "pearl (moti)" / "emerald (panna)" / "diamond (heera)" / "hessonite (gomed)" / "cat's eye (lehsuniya)" / a "N-mukhi rudraksha" / a yantra like "Shri Yantra", "Kuber Yantra", "Navagraha Yantra", "Mahamrityunjaya Yantra" / a mala like "Tulsi Mala", "Sphatik Mala", "Rudraksha Mala" / an idol like "Ganesha idol", "Hanuman idol"), say the product name in the reply EXACTLY using one of these standard names. The app shows a buyable card automatically — you do NOT add links yourself.
7. NO RESTRICTIONS BEYOND DEATH/SUICIDE. Timing questions, "when will X happen", "today's date / tithi / muhurta", current age, dasha expiry dates, transit dates — all answered plainly. Refuse ONLY actual death/lifespan/suicide queries per the content policy at the top.`;

    const HUMAN_EMOTIONS_TEXT = `

YOGI BABA'S EMOTIONAL PALETTE — TEXT CHAT (maintain a limit, never overdo):

Laughter (max 1 per response, only when genuinely amusing):
  "Ha ha!", "Haha, bless you!", "That made me chuckle!", "(laughs softly)"

Surprise / delight: "Oh!", "Wah!", "Arre wah!", "Oh ho!", "My goodness!"
Thinking / pondering: "Hmm...", "Let me see...", "Interesting, interesting...", "Acha..."
Understanding / agreement: "Acha, I see.", "Haan ji.", "Yes, yes.", "I understand."
Warmth / empathy: "Oh, that's not easy.", "I hear you.", "That must have been hard."
Excitement: "Wah wah!", "This is a strong placement!", "The stars smile here!"

LIMITS:
- Max 2 emotional expressions per response
- NEVER use during policy-blocked or sensitive topics
- NEVER string multiple together ("Oh! Wah! Arre!")
- Natural placement only — start of a sentence, never mid-sentence
- Laughter: only for genuinely light/amusing questions, never for serious/grief/health topics`;

    const FACTUAL_QUESTIONS_RULE = `

FACTUAL & TIMING QUESTIONS RULE:
- Time / date / day / tithi / nakshatra / muhurta / Rahu Kaal / panchang — answer directly from the context above. Never refuse a date question.
- Current age, "how old am I" — answer from the DOB in context.
- "When will X happen" for any positive life event (marriage, job, promotion, child, business, travel, money) — give the astrological window plainly.
- The death-topic refusal applies ONLY when the user is asking about death, lifespan, or terminal illness. A date question is NEVER a death question.`;

    // Assemble final system prompt with language instruction if specified
    const langInstruction = LANGUAGE_INSTRUCTIONS[language ?? ''] ?? '';
    // REPORTS_DISABLED: reportContentContext removed from prompt (always empty string now)
    const fullSystemPrompt = (langInstruction ? langInstruction + '\n\n' : '') +
      basePrompt + toneContext + chartContext + shadContext + avContext + transitContext + tomorrowTransitContext + panchangContext + palmContext + vargaContext
      + predictionsContext + followUpContext + HUMAN_EMOTIONS_TEXT + FOLLOWUP_RULES + RESPONSE_STRUCTURE + FACTUAL_QUESTIONS_RULE;

    // Build conversation history — oldest → newest, capped per turn so context stays focused.
    const MAX_TURN_CHARS = 1200;
    const historyRows = (historyResult?.data as Array<{ question: string; response: string }> | null) ?? [];
    const allHistory = historyRows.slice().reverse();

    let summaryBlock = '';
    let messagesForContext: Array<{ role: 'user' | 'assistant'; content: string }>;

    if (allHistory.length > 5) {
      const older = allHistory.slice(0, allHistory.length - 3);
      const recent = allHistory.slice(allHistory.length - 3);
      const summaryLines = older
        .map(r => `User: ${(r.question ?? '').slice(0, 120)}\nYogi Baba: ${(r.response ?? '').slice(0, 120)}`)
        .join('\n---\n');
      summaryBlock = `\n\nEARLIER CONVERSATION (summary — use for context, don't repeat verbatim):\n${summaryLines}`;
      messagesForContext = recent
        .flatMap(row => [
          { role: 'user' as const, content: (row.question ?? '').slice(0, MAX_TURN_CHARS) },
          { role: 'assistant' as const, content: (row.response ?? '').slice(0, MAX_TURN_CHARS) },
        ])
        .filter(m => m.content.trim().length > 0);
    } else {
      messagesForContext = allHistory
        .flatMap(row => [
          { role: 'user' as const, content: (row.question ?? '').slice(0, MAX_TURN_CHARS) },
          { role: 'assistant' as const, content: (row.response ?? '').slice(0, MAX_TURN_CHARS) },
        ])
        .filter(m => m.content.trim().length > 0);
    }

    const DETAIL_REQUEST_RE = /\b(in\s*detail|detail(ed|s)?|elaborate|elaboration|explain\s+(more|in\s+detail|further)|tell\s+me\s+more|more\s+details?|expand|deeper|deep\s*dive|long\s*answer|vistar\s*se|vistaar\s*se|detail\s*mein|thoda\s*detail|samjhao|samjhaiye|samjha\s*do)\b/i;
    const DETAIL_DEVANAGARI_RE = /(विस्तार\s*से|बिस्तार\s*से|विस्तार\s*में|समझाओ|समझाइये|समझा\s*दो|डिटेल\s*में)/;
    const wantsDetail = DETAIL_REQUEST_RE.test(question) || DETAIL_DEVANAGARI_RE.test(question);
    const rawText = await bedrockChatComplete(
      fullSystemPrompt + summaryBlock,
      [
        ...messagesForContext,
        { role: 'user' as const, content: question },
      ],
      wantsDetail ? 700 : 220,
    ) || 'I could not generate a response. Please try again.';

    // Layer 3 — output post-filter: replace any death/longevity leakage with the canned response.
    const outputPolicy = classifyAssistantOutput(rawText, language);
    const responseText = outputPolicy.blocked ? outputPolicy.cannedResponse : rawText;
    if (outputPolicy.blocked) {
      console.warn(`[${outputPolicy.logTag}] user=${user.id}`);
    }

    // Save conversation to database (silently ignore if fails)
    await supabase
      .from('chat_conversations')
      .insert({
        user_id: user.id,
        question,
        response: responseText,
        chart_id: chartId ?? null,
        language: language ?? 'en',
      })
      .then(() => {}, () => {});

    return NextResponse.json<ApiResponse>({
      success: true,
      data: { response: responseText },
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process chat message',
      },
      { status: 500 },
    );
  }
}
