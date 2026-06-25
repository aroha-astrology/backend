import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { createAIMessage } from '@/lib/ai/aiProvider';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { NumerologyReport } from '@/components/pdf/NumerologyReport';
import type { NumerologyReportData } from '@/components/pdf/NumerologyReport';
import {
  getMulankFallback,
  getBhagyankFallback,
  mergeWithFallback,
  getMulankGroundTruth,
  getBhagyankGroundTruth,
  pinMulankGroundTruth,
} from '@/app/api/numerology/fallbacks';
import { sendPushToUser } from '@/lib/push/send';
import { createNotification } from '@/lib/notifications/create';
import { notifyReportReady } from '@/lib/telegram';
import { POLICY_SYSTEM_DIRECTIVE } from '@/lib/ai/contentPolicy';

// Allow up to 5 minutes for AI calls + PDF rendering
export const maxDuration = 60; // Vercel Hobby plan max; upgrade to Pro for 300s

function parseAIJson(msg: { content: Array<{ type: string; text: string }> }, label: string) {
  const textBlock = msg.content.find((c) => c.type === 'text');
  if (!textBlock) { console.error(`[process] No text block for: ${label}`); return {}; }
  try {
    let raw = textBlock.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const start = raw.indexOf('{');
    if (start > 0) raw = raw.slice(start);
    const end = raw.lastIndexOf('}');
    if (end !== -1 && end < raw.length - 1) raw = raw.slice(0, end + 1);
    return JSON.parse(raw);
  } catch (e) {
    console.error(`[process] JSON parse failed for ${label}:`, e, '\nRaw:', textBlock.text.slice(0, 300));
    return {};
  }
}

export async function POST(request: Request) {
  // Verify internal call
  const internalKey = request.headers.get('x-internal-key');
  const expectedKey = process.env.INTERNAL_PROCESS_KEY;
  if (!expectedKey || internalKey !== expectedKey) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createAdminSupabase();
  let reportId = '';

  try {
    const body = await request.json() as { report_id: string; user_id: string };
    reportId = body.report_id;

    // Mark as generating
    await supabase.from('generated_reports').update({ status: 'generating' }).eq('id', reportId);

    // Fetch report metadata + user neural pathway
    const { data: report } = await supabase
      .from('generated_reports')
      .select('metadata, subject_name, subject_dob, subject_gender, user_id, pdf_filename')
      .eq('id', reportId)
      .single();

    if (!report) throw new Error('Report record not found');

    const { metadata, subject_name: name, subject_dob: dob, subject_gender: gender, user_id: userId } = report as {
      metadata: Record<string, unknown>; subject_name: string; subject_dob: string;
      subject_gender: 'male' | 'female'; user_id: string; pdf_filename: string;
    };

    const { mulank, bhagyank, kua, zodiac, loShuGrid, challengeNumbers,
      soulUrge, personality, namePlanes, monthlyForecast,
      birthCity, currentCity, maritalStatus, concern, occupation } = metadata as Record<string, unknown> & {
      mulank: number; bhagyank: number; kua: Record<string, unknown>; zodiac: Record<string, unknown>;
      loShuGrid: Record<string, unknown>; challengeNumbers: Record<string, unknown>;
      soulUrge: number; personality: number; namePlanes: Record<string, unknown>;
      monthlyForecast: Array<Record<string, unknown>>;
      birthCity: string | null; currentCity: string | null;
      maritalStatus: string; concern: string; occupation: string | null;
    };

    // Age + life-stage banding for tone modulation. Reports for a 22-year-old
    // should not read like reports for a 65-year-old.
    const age = Math.max(0, Math.floor((Date.now() - new Date(dob + 'T00:00:00Z').getTime()) / (365.25 * 24 * 3600 * 1000)));
    const lifeStage =
      age < 18 ? 'youth (under 18)' :
      age < 30 ? 'young adult (18–29)' :
      age < 45 ? 'established adult (30–44)' :
      age < 60 ? 'mid-life (45–59)' :
      'senior (60+)';

    // Build context
    const loShuTyped = loShuGrid as { frequencies: Record<number, number>; missing: number[] };
    const challengeTyped = challengeNumbers as { phases: Array<{ phase: number; ageRange: string; challenge: number }> };
    const zodiacTyped = zodiac as { sign: string; element: string; quality: string; rulingPlanet: string };
    const kuaTyped = kua as { kuaNumber: number; element: string };
    const freqStr = Object.entries(loShuTyped.frequencies).filter(([, v]) => v > 0).map(([k, v]) => `${k}×${v}`).join(', ');
    const missingStr = loShuTyped.missing.length > 0 ? loShuTyped.missing.join(', ') : 'none';
    const namePlanesTyped = namePlanes as { knowledge: number; strength: number; emotional: number; spiritual: number; letters?: Record<string, string[]> };
    const forecastStr = (monthlyForecast as Array<{ month: string; year: number; personalYear: number; personalMonth: number }>)
      .map((m) => `${m.month} ${m.year} PY${m.personalYear} PM${m.personalMonth}`).join(', ');

    const concernLabel: Record<string, string> = {
      career: 'Career & Profession', marriage: 'Marriage & Relationships',
      wealth: 'Wealth & Finance', health: 'Health & Wellbeing',
      spiritual: 'Spiritual Growth', education: 'Education & Learning',
      family: 'Family & Children', overall: 'Overall Life Guidance',
    };
    const concernFocus = concernLabel[concern] ?? 'Overall Life Guidance';

    // Canonical Vedic numerology constants for this user's specific Mulank/Bhagyank.
    // The AI must INTERPRET these (write narrative around them) but never CHANGE them.
    const mulankTruth = getMulankGroundTruth(mulank);
    const bhagyankTruth = getBhagyankGroundTruth(bhagyank);

    const ctx = `Name: ${name}
DOB: ${dob}
Age: ${age} (${lifeStage})
Gender: ${gender}${birthCity ? `\nBirth City: ${birthCity}` : ''}${currentCity ? `\nCurrent City: ${currentCity}` : ''}${occupation ? `\nOccupation: ${occupation}` : ''}
Marital Status: ${maritalStatus}
Primary Life Concern: ${concernFocus}
Mulank (Psychic Number): ${mulank}
Bhagyank (Destiny Number): ${bhagyank}
Kua Number: ${kuaTyped.kuaNumber} (${kuaTyped.element} element)
Zodiac: ${zodiacTyped.sign} (${zodiacTyped.element}, ${zodiacTyped.quality}, ruled by ${zodiacTyped.rulingPlanet})
Soul Urge: ${soulUrge} | Personality: ${personality}
Lo Shu Grid — Present: ${freqStr} | Missing: ${missingStr}
Name Planes — Knowledge:${namePlanesTyped.knowledge} Strength:${namePlanesTyped.strength} Emotional:${namePlanesTyped.emotional} Spiritual:${namePlanesTyped.spiritual}
12-Month Forecast: ${forecastStr}

FIXED CANONICAL VALUES (DO NOT CHANGE — interpret these, never redefine them):
- Mulank ${mulank} ruling planet: ${mulankTruth.planet}
- Mulank ${mulank} ruling day: ${mulankTruth.day}
- Mulank ${mulank} colors: ${mulankTruth.color}
- Mulank ${mulank} gemstone: ${mulankTruth.gemstone}
- Mulank ${mulank} metal: ${mulankTruth.metal}
- Mulank ${mulank} lucky numbers: [${mulankTruth.luckyNumbers.join(', ')}]
- Mulank ${mulank} numbers to avoid: [${mulankTruth.numbersToAvoid.join(', ')}]
- Bhagyank ${bhagyank} theme: ${bhagyankTruth.theme}
- Bhagyank ${bhagyank} life purpose: ${bhagyankTruth.purpose}
- Bhagyank ${bhagyank} ruling planet: ${bhagyankTruth.planet}

IMPORTANT: This person's primary concern is "${concernFocus}". Give extra depth and specificity to content related to this concern throughout the report. Make all advice actionable and specific to their context.`;

    // Shared directives prepended to every section prompt. Covers content
    // policy (no death/longevity/maraka), tone calibration to age, and the
    // "never invent specifics" rule that keeps prose from inventing
    // colleagues, employers, project names, or quoted occupations.
    const BASE_DIRECTIVES = `${POLICY_SYSTEM_DIRECTIVE}

TONE — calibrate to the seeker's life stage (${lifeStage}, age ${age}):
- Youth / young adult: forward-looking, focus on possibilities and habit-building.
- Established / mid-life adult: practical, decision-oriented, family + career integration.
- Senior: reflective, legacy + wellbeing focused (NEVER discuss remaining lifespan).

NEVER INVENT SPECIFICS:
- Do not invent the seeker's job title, employer, project names, colleague names, family member names, or city of residence.
- Refer to their work as "your work" / "your sector" / "your field" — never quote a specific profession unless one is explicitly given in the context above.
- Speak about life events in second person ("you may notice…") rather than fabricated narratives ("your friend Rohan will…").

OUTPUT FORMAT:
- Return ONLY valid JSON. No prose preamble. No markdown fences.
- Lead with human impact. Keep planet / dasha / number jargon to a minimum — name the principle once, then talk like a wise friend.

`;

    // -----------------------------------------------------------------------
    // 7 parallel AI calls (palm reading was removed when the form was dropped)
    // -----------------------------------------------------------------------
    const [mulankMsg, bhagyankMsg, zodiacLuckyMsg, compatMsg, healthCareerMsg, loShuNameMsg, forecastRemediesMsg] =
      await Promise.all([

        createAIMessage({ max_tokens: 8000, system: `${BASE_DIRECTIVES}You are a master Vedic numerologist. Write rich, detailed paragraph-form content. Return ONLY valid JSON (no markdown fences).

Context: ${ctx}

The "summary" field is the H/N/A 3-line structure — an ARRAY OF EXACTLY THREE STRINGS:
  [0] HOOK — 1–2 short sentences naming what is most defining for ${name} numerologically.
  [1] NUANCE — 1–2 short sentences with the why (Mulank ${mulank} energy, ruling planet).
  [2] ACTION — 1–2 short sentences with one concrete numerological practice to start.
Short sentences only.

{
  "summary": ["hook", "nuance", "action"],
  "overview": "4-5 sentence overview of Mulank ${mulank} for ${name}",
  "ruling_planet": { "name": "", "description": "", "day": "", "color": "", "gemstone": "", "metal": "" },
  "personality": { "core": "", "emotional": "", "social": "", "intellectual": "", "shadow": "" },
  "strengths": [{ "title": "", "description": "" }],
  "weaknesses": [{ "title": "", "description": "" }],
  "favorable_periods": { "months": [], "description": "" },
  "unfavorable_periods": { "months": [], "description": "" },
  "relationships": "", "finances": "", "spirituality": "", "health_tendencies": "",
  "lucky_numbers": [], "numbers_to_avoid": [],
  "famous_personalities": [{ "name": "", "note": "" }]
}
Provide 8+ strengths, 6+ weaknesses, 3+ famous personalities.`,
          messages: [{ role: 'user', content: `Generate Mulank ${mulank} analysis for ${name}.` }] }),

        createAIMessage({ max_tokens: 7000, system: `${BASE_DIRECTIVES}You are a master Vedic numerologist. Return ONLY valid JSON.

Context: ${ctx}

{
  "overview": "",
  "life_path": { "description": "", "purpose": "", "journey": "" },
  "karmic_lessons": [{ "lesson": "", "description": "" }],
  "major_themes": [{ "theme": "", "description": "" }],
  "key_life_years": "",
  "secondary_traits": { "positive": "", "challenging": "" },
  "combination_with_mulank": { "overview": "", "strengths": "", "challenges": "", "advice": "" },
  "life_lessons": ""
}
Provide 3+ karmic lessons and 4+ major themes.`,
          messages: [{ role: 'user', content: `Generate Bhagyank ${bhagyank} analysis for ${name}.` }] }),

        createAIMessage({ max_tokens: 5000, system: `${BASE_DIRECTIVES}Vedic astrologer and numerologist. Return ONLY valid JSON.

Context: ${ctx}

{
  "zodiac": { "sign": "${zodiacTyped.sign}", "overview": "", "traits": "", "ruling_planet_influence": "", "element_influence": "", "shadow_traits": "" },
  "deity": { "name": "", "description": "", "day_for_worship": "", "fasting_rules": "", "ritual": "", "mantra": "", "charity": "" },
  "lucky": {
    "numbers": [], "numbers_to_avoid": [], "colors": [], "dates": [], "years": [],
    "gemstone": { "primary": "", "how_to_wear": "", "mantra_for_energising": "" },
    "bracelet": "", "lucky_directions": [], "lucky_metal": "", "lucky_day": "",
    "favorable_business_names": "", "lucky_vehicle_numbers": ""
  }
}`,
          messages: [{ role: 'user', content: 'Generate zodiac, deity and lucky variables.' }] }),

        createAIMessage({ max_tokens: 8000, system: `${BASE_DIRECTIVES}Expert Vedic numerologist. Return ONLY valid JSON.

Context: ${ctx}
Marital Status: ${maritalStatus}
${maritalStatus === 'married' ? 'This person is married — in the romance section, focus on deepening existing bonds, understanding partner dynamics, and avoiding friction. Still provide ideal/challenging numbers for reference.' : maritalStatus === 'single' ? 'This person is single — in the romance section, focus on identifying an ideal life partner profile and timing for marriage.' : ''}

{
  "friendship": { "1": {"rating":"","description":""}, "2": {"rating":"","description":""}, "3": {"rating":"","description":""}, "4": {"rating":"","description":""}, "5": {"rating":"","description":""}, "6": {"rating":"","description":""}, "7": {"rating":"","description":""}, "8": {"rating":"","description":""}, "9": {"rating":"","description":""} },
  "business": { "1": {"rating":"","description":""}, "2": {"rating":"","description":""}, "3": {"rating":"","description":""}, "4": {"rating":"","description":""}, "5": {"rating":"","description":""}, "6": {"rating":"","description":""}, "7": {"rating":"","description":""}, "8": {"rating":"","description":""}, "9": {"rating":"","description":""} },
  "romance": { "overview": "", "ideal_partner_profile": "", "ideal_mulank_numbers": [], "ideal_explanation": "", "challenging_numbers": [], "challenging_explanation": "", "relationship_strengths": "", "relationship_challenges": "", "advice": "" }
}`,
          messages: [{ role: 'user', content: `Generate compatibility matrix for Mulank ${mulank}.` }] }),

        createAIMessage({ max_tokens: 7000, system: `${BASE_DIRECTIVES}Vedic numerologist specialising in health and career. Return ONLY valid JSON.

Context: ${ctx}${occupation ? `\n\nThe person works as: ${occupation}. Tailor career advice specifically to this field — how their numbers support or challenge this career, specific growth paths within it, and whether a career change would be beneficial.` : ''}
${maritalStatus === 'single' ? 'They are single — focus health on preventive care and productive habits.' : maritalStatus === 'married' ? 'They are married — include family health dynamics.' : ''}

{
  "health": {
    "overview": "", "ruling_planet_body": "",
    "vulnerable_systems": [{ "system": "", "description": "" }],
    "health_by_decade": { "childhood": "", "youth": "", "middle_age": "", "senior": "" },
    "diet_recommendations": { "foods_to_include": [], "foods_to_avoid": [], "dietary_advice": "" },
    "lifestyle": { "exercise": "", "sleep": "", "stress_management": "", "general_habits": "" },
    "mental_health": ""
  },
  "career": {
    "overview": "", "ideal_professions": [{ "profession": "", "why": "" }],
    "business_vs_service": "", "leadership_style": "", "career_strengths": "",
    "career_challenges": "", "peak_career_periods": "", "financial_earning_pattern": "", "ideal_work_environment": ""
  }
}
Provide 5+ vulnerable systems and 8+ ideal professions.`,
          messages: [{ role: 'user', content: 'Generate health and career analysis.' }] }),

        createAIMessage({ max_tokens: 7000, system: `${BASE_DIRECTIVES}Expert in Lo Shu numerology, Feng Shui, and name numerology. Return ONLY valid JSON.

Context: ${ctx}
Lo Shu Grid present: ${freqStr} | Missing: ${missingStr}
Name planes: Knowledge=${namePlanesTyped.knowledge}, Strength=${namePlanesTyped.strength}, Emotional=${namePlanesTyped.emotional}, Spiritual=${namePlanesTyped.spiritual}${currentCity ? `\nCurrent City for Feng Shui directions: ${currentCity}` : ''}

{
  "lo_shu": {
    "intro": "", "grid_overview": "",
    "frequency_analysis": { ${[1,2,3,4,5,6,7,8,9].map(n => `"${n}": {"count":${loShuTyped.frequencies[n] ?? 0},"interpretation":""}`).join(',')} },
    "missing_numbers": { ${loShuTyped.missing.length > 0 ? loShuTyped.missing.map(n => `"${n}":{"traits_lacking":"","life_impact":"","remedy_overview":""}`).join(',') : '"none":"All numbers present"'} },
    "grid_planes": {
      "mental_plane": {"numbers":"4,9,2","description":""},
      "physical_plane": {"numbers":"3,5,7","description":""},
      "emotional_plane": {"numbers":"8,1,6","description":""},
      "spiritual_plane": {"numbers":"4,3,8","description":""}
    }
  },
  "feng_shui": {
    "kua_overview": "", "element_description": "",
    "lucky_directions": { "success":{"direction":"","use":""}, "health":{"direction":"","use":""}, "relationship":{"direction":"","use":""}, "personal_growth":{"direction":"","use":""} },
    "home_advice": "", "office_advice": "", "unlucky_directions": [], "feng_shui_cures": ""
  },
  "name_numerology": {
    "name_number": {"value":${metadata.nameNumber ?? 0},"overview":"","alignment_with_mulank":""},
    "soul_urge": {"value":${soulUrge},"overview":"","how_it_manifests":""},
    "personality_number": {"value":${personality},"overview":"","first_impressions":""},
    "name_planes": {
      "knowledge":{"count":${namePlanesTyped.knowledge},"letters":${JSON.stringify((namePlanesTyped.letters as Record<string, string[]> | undefined)?.knowledge ?? [])},"description":""},
      "strength":{"count":${namePlanesTyped.strength},"letters":${JSON.stringify((namePlanesTyped.letters as Record<string, string[]> | undefined)?.strength ?? [])},"description":""},
      "emotional":{"count":${namePlanesTyped.emotional},"letters":${JSON.stringify((namePlanesTyped.letters as Record<string, string[]> | undefined)?.emotional ?? [])},"description":""},
      "spiritual":{"count":${namePlanesTyped.spiritual},"letters":${JSON.stringify((namePlanesTyped.letters as Record<string, string[]> | undefined)?.spiritual ?? [])},"description":""}
    }
  }
}`,
          messages: [{ role: 'user', content: 'Generate Lo Shu, Feng Shui, and name numerology analysis.' }] }),

        createAIMessage({ max_tokens: 8000, system: `${BASE_DIRECTIVES}Vedic numerologist writing forecasts and remedies. Return ONLY valid JSON.

Context: ${ctx}

For each monthly forecast entry, emphasize themes related to "${concernFocus}" — make the "what_to_focus_on" and "advice" fields directly relevant to this concern.
For mantras, generate all 4 (career, health, marriage, wealth) but add extra detail to the "${concern}" mantra.
For everyday_luck, give specific lucky numbers for ${maritalStatus === 'married' ? 'couple decisions' : 'personal decisions'}${currentCity ? `, and advice relevant to living in ${currentCity}` : ''}.

{
  "monthly_forecast": [
    ${(monthlyForecast as Array<{ month: string; year: number; personalYear: number; personalMonth: number }>).map(m => `{"month":"${m.month}","year":${m.year},"personal_year":${m.personalYear},"personal_month":${m.personalMonth},"theme":"","overview":"","what_to_focus_on":"","what_to_avoid":"","power_days":"","affirmation":""}`).join(',\n    ')}
  ],
  "life_cycles": [
    ${challengeTyped.phases.map(p => `{"phase":${p.phase},"age_range":"${p.ageRange}","challenge_number":${p.challenge},"overview":"","key_lessons":"","opportunities":"","pitfalls":"","advice":""}`).join(',\n    ')}
  ],
  "remedies": { ${loShuTyped.missing.map(n => `"missing_${n}":{"overview":"","vastu_fix":"","feng_shui_item":"","charity":"","bracelet":"","additional_remedy":""}`).join(',\n    ')} },
  "mantras": {
    "career": {"deity":"","text":"","meaning":"","pronunciation":"","chanting_instructions":"","benefits":""},
    "health": {"deity":"","text":"","meaning":"","pronunciation":"","chanting_instructions":"","benefits":""},
    "marriage": {"deity":"","text":"","meaning":"","pronunciation":"","chanting_instructions":"","benefits":""},
    "wealth": {"deity":"","text":"","meaning":"","pronunciation":"","chanting_instructions":"","benefits":""}
  },
  "everyday_luck": {"email_id":"","bank_names":[],"bank_explanation":"","vehicle_number":"","house_number":"","mobile_number":"","tattoo_suggestion":"","lucky_time_of_day":""}
}`,
          messages: [{ role: 'user', content: 'Generate forecast, life cycles, remedies and everyday luck.' }] }),
      ]);

    // Merge AI output with the rich fallback, then pin the canonical mulank ground truth
    // so any AI drift on ruling planet / gemstone / lucky numbers is silently corrected.
    // (Drifted fields are logged via console.warn for prompt-tuning telemetry.)
    const mulankData = pinMulankGroundTruth(
      mergeWithFallback(parseAIJson(mulankMsg, 'mulank'), getMulankFallback(mulank)),
      mulank,
    );
    const bhagyankData = mergeWithFallback(parseAIJson(bhagyankMsg, 'bhagyank'), getBhagyankFallback(bhagyank));
    const zodiacLucky = parseAIJson(zodiacLuckyMsg, 'zodiacLucky');
    const compat = parseAIJson(compatMsg, 'compat');
    const healthCareer = parseAIJson(healthCareerMsg, 'healthCareer');
    const loShuName = parseAIJson(loShuNameMsg, 'loShuName');
    const forecastRemedies = parseAIJson(forecastRemediesMsg, 'forecastRemedies');

    // Assemble report data — palmData is left null because palm reading is no
    // longer collected. The PDF component handles a null palmData gracefully.
    const reportData: NumerologyReportData = {
      name, dob, gender: gender as 'male' | 'female',
      mulank, bhagyank,
      kua: kuaTyped as never,
      zodiac: zodiacTyped as never,
      loShuGrid: loShuTyped as never,
      challengeNumbers: challengeTyped as never,
      soulUrge, personality,
      nameNumber: (metadata.nameNumber as number) ?? 1,
      namePlanes: namePlanesTyped as never,
      monthlyForecast: monthlyForecast as never,
      aiContent: { mulankData, bhagyankData, zodiacLucky, compat, healthCareer, loShuName, forecastRemedies, palmData: null },
    };

    // Render PDF
    const pdfBuffer = await renderToBuffer(
      createElement(NumerologyReport, { data: reportData }) as Parameters<typeof renderToBuffer>[0],
    );

    // Upload to Supabase Storage
    const storageKey = `${userId}/${reportId}.pdf`;
    await supabase.storage.from('reports').upload(storageKey, pdfBuffer, {
      contentType: 'application/pdf', upsert: true,
    });

    // Get signed URL (1 year)
    const { data: signed } = await supabase.storage
      .from('reports')
      .createSignedUrl(storageKey, 60 * 60 * 24 * 365);

    // Update record with complete status
    await supabase.from('generated_reports').update({
      status: 'complete',
      pdf_url: signed?.signedUrl ?? null,
      ai_content: { mulankData, bhagyankData, zodiacLucky, compat, healthCareer, loShuName, forecastRemedies },
    }).eq('id', reportId);

    try {
      const { data: { user: reportUser } } = await supabase.auth.admin.getUserById(userId);
      await notifyReportReady(name, 'Numerology', reportUser?.email ?? userId);
    } catch { /* non-critical */ }

    const reportLink = `/reports/premium?reportId=${reportId}`;
    const notifTitle = 'Your Numerology report is ready';
    const notifBody = `${name}'s numerology report has been generated.`;

    try {
      await sendPushToUser(userId, {
        title: notifTitle,
        body: notifBody,
        url: reportLink,
        tag: `report-${reportId}`,
      });
    } catch (pushErr) {
      console.error('[numerology/process] push send failed:', pushErr);
    }

    await createNotification({
      userId,
      type: 'report_ready',
      title: notifTitle,
      body: notifBody,
      link: reportLink,
      metadata: { report_id: reportId, subject_name: name },
    });

    return NextResponse.json({ success: true, data: { report_id: reportId, status: 'complete' } });

  } catch (error) {
    console.error('[process] Report generation error:', error);
    if (reportId) {
      const supabase2 = createAdminSupabase();
      await supabase2.from('generated_reports').update({
        status: 'error',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      }).eq('id', reportId);
    }
    return NextResponse.json({ success: false, error: 'Processing failed' }, { status: 500 });
  }
}
