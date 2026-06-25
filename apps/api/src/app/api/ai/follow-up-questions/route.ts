import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import type { ApiResponse } from '@aroha-astrology/shared';

// ============================================================
// Dasha planet significance mapping
// ============================================================

const PLANET_LIFE_AREAS: Record<string, { areas: string[]; themes: string[] }> = {
  Sun: {
    areas: ['career', 'authority', 'father', 'government', 'health-vitality'],
    themes: ['leadership changes', 'recognition', 'ego conflicts', 'father\'s health'],
  },
  Moon: {
    areas: ['mind', 'emotions', 'mother', 'public-image', 'travel'],
    themes: ['emotional shifts', 'mother\'s influence', 'mental health', 'relocation'],
  },
  Mars: {
    areas: ['energy', 'property', 'siblings', 'courage', 'accidents'],
    themes: ['property matters', 'legal disputes', 'surgical procedures', 'sibling relations'],
  },
  Mercury: {
    areas: ['intellect', 'communication', 'business', 'education', 'skin'],
    themes: ['education pursuits', 'business changes', 'communication style', 'nervous system'],
  },
  Jupiter: {
    areas: ['wisdom', 'children', 'wealth', 'dharma', 'teacher'],
    themes: ['spiritual growth', 'children matters', 'financial expansion', 'higher education'],
  },
  Venus: {
    areas: ['marriage', 'luxury', 'art', 'vehicles', 'romance'],
    themes: ['relationship dynamics', 'material comforts', 'creative pursuits', 'partnerships'],
  },
  Saturn: {
    areas: ['career', 'discipline', 'chronic-illness', 'resilience', 'service'],
    themes: ['career restructuring', 'delayed results', 'chronic health', 'karmic lessons'],
  },
  Rahu: {
    areas: ['foreign', 'technology', 'obsession', 'unconventional', 'sudden-events'],
    themes: ['foreign connections', 'sudden changes', 'technology ventures', 'addictions'],
  },
  Ketu: {
    areas: ['spirituality', 'detachment', 'past-life', 'liberation', 'losses'],
    themes: ['spiritual awakening', 'material detachment', 'psychic experiences', 'ancestral karma'],
  },
};

interface FollowUpQuestion {
  id: string;
  question: string;
  options: string[];
  why: string;
  dashaReference: string;
}

// ============================================================
// POST /api/ai/follow-up-questions
// ============================================================

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

    const { chartId } = await request.json();

    if (!chartId) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'chartId is required' },
        { status: 400 },
      );
    }

    // Fetch chart data
    const { data: chart, error: chartError } = await supabase
      .from('kundli_charts')
      .select('dasha_data, chart_data, dosha_data, yoga_data')
      .eq('id', chartId)
      .eq('user_id', user.id)
      .single();

    if (chartError || !chart) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Chart not found' },
        { status: 404 },
      );
    }

    const dashaData = chart.dasha_data as Record<string, unknown>;
    const chartData = chart.chart_data as Record<string, unknown>;
    const doshaData = chart.dosha_data as Record<string, unknown>;

    const questions: FollowUpQuestion[] = [];

    // Analyze Vimshottari dasha data
    const vimshottari = dashaData?.vimshottari as Record<string, unknown> | undefined;
    if (vimshottari) {
      const currentMD = vimshottari.currentMahadasha as Record<string, unknown> | undefined;
      const currentAD = vimshottari.currentAntardasha as Record<string, unknown> | undefined;

      const mdPlanet = (currentMD?.planet as string) ?? 'Saturn';
      const adPlanet = (currentAD?.planet as string) ?? 'Mercury';
      const mdStart = currentMD?.startDate as string;
      const mdEnd = currentMD?.endDate as string;

      // Generate questions based on current Mahadasha lord
      const mdInfo = PLANET_LIFE_AREAS[mdPlanet];
      if (mdInfo) {
        questions.push({
          id: `md_${mdPlanet.toLowerCase()}_themes`,
          question: `You are in ${mdPlanet} Mahadasha. Which of these ${mdPlanet}-related themes have you experienced most strongly?`,
          options: mdInfo.themes,
          why: `${mdPlanet} Mahadasha governs ${mdInfo.areas.join(', ')}. Your experiences help calibrate predictions.`,
          dashaReference: `${mdPlanet} MD (${mdStart ? new Date(mdStart).getFullYear() : '?'} - ${mdEnd ? new Date(mdEnd).getFullYear() : '?'})`,
        });
      }

      // Generate questions based on current Antardasha lord
      const adInfo = PLANET_LIFE_AREAS[adPlanet];
      if (adInfo && adPlanet !== mdPlanet) {
        questions.push({
          id: `ad_${adPlanet.toLowerCase()}_themes`,
          question: `Within your ${mdPlanet} period, you are currently in ${adPlanet} sub-period. Have you noticed changes related to ${adInfo.areas.slice(0, 3).join(', ')}?`,
          options: [
            `Yes, significant ${adInfo.areas[0]} changes`,
            `Some ${adInfo.areas[1]} related activity`,
            'Subtle shifts only',
            'Not particularly',
          ],
          why: `${adPlanet} Antardasha modifies the ${mdPlanet} Mahadasha themes.`,
          dashaReference: `${mdPlanet}-${adPlanet} period`,
        });
      }

      // Check for mahadasha transitions in last 10 years
      const mahadashas = vimshottari.mahadashas as Array<Record<string, unknown>> | undefined;
      if (mahadashas) {
        const now = Date.now();
        const tenYearsAgo = now - 10 * 365.25 * 86400000;

        const recentTransitions = mahadashas.filter((md) => {
          const start = new Date(md.startDate as string).getTime();
          return start > tenYearsAgo && start < now;
        });

        if (recentTransitions.length > 0) {
          const transitionPlanets = recentTransitions.map((t) => t.planet as string);
          questions.push({
            id: 'dasha_transition',
            question: `Your Mahadasha changed to ${transitionPlanets[transitionPlanets.length - 1]} recently. Did you notice a major life shift around that time?`,
            options: [
              'Yes, everything changed dramatically',
              'Gradual shift in priorities',
              'Some changes but nothing dramatic',
              'I did not notice any major shift',
            ],
            why: 'Mahadasha transitions are among the most significant timing markers in Vedic astrology.',
            dashaReference: `Transition to ${transitionPlanets[transitionPlanets.length - 1]} MD`,
          });
        }
      }
    }

    // Add dosha-based questions
    const mangal = doshaData?.mangal as Record<string, unknown> | undefined;
    if (mangal?.present) {
      questions.push({
        id: 'mangal_dosha_experience',
        question: 'Mangal Dosha is present in your chart. Have you experienced delays or challenges in marriage/relationships?',
        options: [
          'Significant delays in finding a partner',
          'Relationship conflicts or breakups',
          'Happy in relationship despite the dosha',
          'Not yet in the marriage phase of life',
        ],
        why: `Mangal Dosha detected (severity: ${mangal.severity}). Understanding your experience helps gauge its actual impact.`,
        dashaReference: `Mars in house ${mangal.marsHouseFromLagna} from Lagna`,
      });
    }

    const kaalSarp = doshaData?.kaalSarp as Record<string, unknown> | undefined;
    if (kaalSarp?.present) {
      questions.push({
        id: 'kaalsarp_experience',
        question: 'Kaal Sarp Dosha is present. Have you experienced recurring obstacles or a feeling that success is always just out of reach?',
        options: [
          'Yes, constant feeling of being held back',
          'Success comes but with extreme effort',
          'Periodic intense struggles followed by breakthroughs',
          'I have not felt particularly held back',
        ],
        why: `${kaalSarp.name} Kaal Sarp Dosha detected. This helps assess the dosha's practical manifestation.`,
        dashaReference: `Rahu in house ${kaalSarp.rahuHouse}, Ketu in house ${kaalSarp.ketuHouse}`,
      });
    }

    // Always include general life status question
    questions.push({
      id: 'current_life_focus',
      question: 'What is your primary area of concern or focus right now?',
      options: [
        'Career growth and financial stability',
        'Marriage or relationship matters',
        'Health concerns (self or family)',
        'Education or skill development',
        'Family conflicts or property disputes',
        'Spiritual growth and inner peace',
      ],
      why: 'This helps prioritize which areas of your chart to analyze in depth.',
      dashaReference: 'General',
    });

    // Limit to 6 questions
    const finalQuestions = questions.slice(0, 6);

    // Store questions in DB
    const questionsToInsert = finalQuestions.map((q) => ({
      chart_id: chartId,
      question: q.question,
      options: { options: q.options, why: q.why } as unknown as Record<string, unknown>,
      dasha_period: q.dashaReference,
    }));

    await supabase.from('follow_up_questions').insert(questionsToInsert);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: { questions: finalQuestions },
    });
  } catch (error) {
    console.error('Follow-up questions error:', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate follow-up questions',
      },
      { status: 500 },
    );
  }
}
