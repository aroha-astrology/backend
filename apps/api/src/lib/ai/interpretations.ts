import { createAIMessage } from '@/lib/ai/aiProvider';
import type { ChartData, DoshaAnalysis, Yoga, VimshottariDasha, PredictionType } from '@aroha-astrology/shared';

interface InterpretationInput {
  chartData: ChartData;
  doshas: DoshaAnalysis;
  yogas: Yoga[];
  dashas: VimshottariDasha;
  userConcern?: string;
  harshMode: boolean;
  followUpAnswers?: { question: string; answer: string; dashaReference?: string }[];
  language: string;
  predictionType: PredictionType;
  additionalContext?: Record<string, unknown>;
}

export async function generateInterpretation(input: InterpretationInput): Promise<Record<string, unknown>> {
  const {
    chartData,
    doshas,
    yogas,
    dashas,
    userConcern,
    harshMode,
    followUpAnswers,
    language,
    predictionType,
    additionalContext,
  } = input;

  const activeYogas = yogas.filter((y) => y.present);
  const activeDoshas = [];
  if (doshas.mangal.present) activeDoshas.push('Mangal Dosha');
  if (doshas.kaalSarp.present) activeDoshas.push(`Kaal Sarp Dosha (${doshas.kaalSarp.name})`);
  if (doshas.sadeSati.active) activeDoshas.push(`Sade Sati (${doshas.sadeSati.phase} phase)`);
  if (doshas.pitra.present) activeDoshas.push('Pitra Dosha');
  if (doshas.kemDruma.present) activeDoshas.push('Kemdrum Dosha');
  if (doshas.grahan.present) activeDoshas.push('Grahan Dosha');
  if (doshas.guruChandal.present) activeDoshas.push('Guru Chandal Dosha');

  const followUpContext = followUpAnswers?.length
    ? followUpAnswers
        .map((a) => {
          if (a.answer === 'skip') return '';
          return `User confirmed regarding "${a.question}": "${a.answer}" (Dasha: ${a.dashaReference || 'N/A'})`;
        })
        .filter(Boolean)
        .join('\n')
    : 'No follow-up verification available.';

  const systemPrompt = `You are a master Vedic astrologer with 30+ years experience in Parashari, KP, and Lal Kitab systems. Given the following birth chart data, generate detailed predictions.

CHART DATA:
- Ascendant: ${chartData.ascendant.sign} at ${chartData.ascendant.degree.toFixed(2)}° in ${chartData.ascendant.nakshatra}
- Planets: ${chartData.planets.map((p) => `${p.planet} in ${p.sign} (${p.signDegree.toFixed(1)}°, House ${p.house}${p.isRetrograde ? ', Retrograde' : ''}, Nakshatra: ${p.nakshatra})`).join('; ')}
- Active Yogas: ${activeYogas.map((y) => `${y.name} (${y.type}, strength: ${y.strength}%)`).join(', ') || 'None detected'}
- Active Doshas: ${activeDoshas.join(', ') || 'None'}
- Current Mahadasha: ${dashas.currentMahadasha.planet} (${new Date(dashas.currentMahadasha.startDate).getFullYear()}-${new Date(dashas.currentMahadasha.endDate).getFullYear()})
- Current Antardasha: ${dashas.currentAntardasha.planet}

USER CONCERN: ${userConcern || 'General reading'}
HARSH MODE: ${harshMode}
PREDICTION TYPE: ${predictionType}
LANGUAGE: ${language === 'hi' ? 'Hindi' : 'English'}

FOLLOW-UP VERIFICATION:
${followUpContext}

${
  harshMode
    ? 'Give raw, unfiltered predictions. Do not sugarcoat. Point out real challenges directly. Be specific about timings and severities. Name exact dates and years when possible.'
    : 'Give balanced, constructive predictions. Highlight positives while honestly noting challenges. Suggest actionable solutions for every difficulty mentioned.'
}

${
  predictionType === 'personality'
    ? 'Generate: Core Nature (3-4 sentences), Strengths (3-4 points), Weaknesses (3-4 points), Compatibility Traits (2-3 sentences).'
    : predictionType === 'career'
      ? 'Generate: Career Type, Best Industries (list 5), Key Career Periods with years, Salary Potential estimate, Job vs Business suitability.'
      : predictionType === 'health'
        ? 'Generate: Vulnerable Body Areas (specific), Mental Health tendencies, Health Timeline (decade-wise), Diet Recommendations.'
        : predictionType === 'marriage'
          ? 'Generate: Spouse Description (appearance, nature, family), Marriage Timing (specific age/year range), Married Life Quality, Compatibility Needs.'
          : predictionType === 'wealth'
            ? 'Generate: Earning Pattern, Best Investment Types, Peak Wealth Period (years), Financial Risks to avoid.'
            : predictionType === 'children'
              ? 'Generate: Number of Children likely, Best Timing for conception, Children Nature/characteristics, Education Recommendations for children.'
              : predictionType === 'education'
                ? 'Generate: Learning Style, Best Streams/Subjects, Exam Timing (favorable periods), Higher Education guidance.'
                : 'Generate comprehensive predictions covering personality, career, health, marriage, wealth, children, and education.'
}

Respond in valid JSON format with subsections as keys and detailed paragraph text as values. Each subsection should have 3-5 sentences of specific, personalized analysis referencing the actual planetary positions.`;

  const message = await createAIMessage({
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          chartSummary: {
            lagna: chartData.ascendant.sign,
            moonSign: chartData.planets.find((p) => p.planet === 'Moon')?.sign,
            sunSign: chartData.planets.find((p) => p.planet === 'Sun')?.sign,
          },
          ...additionalContext,
        }),
      },
    ],
  });

  const textContent = message.content.find((c) => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from AI');
  }

  try {
    return JSON.parse(textContent.text);
  } catch {
    return { raw: textContent.text };
  }
}

export async function generateRemedies(
  chartData: ChartData,
  doshas: DoshaAnalysis,
  yogas: Yoga[],
): Promise<Record<string, unknown>> {
  const message = await createAIMessage({
    max_tokens: 3000,
    system: `You are a Vedic astrology remedies expert. Based on chart data, recommend specific remedies.

For each remedy type, provide very specific recommendations:
- Gemstone: exact stone, weight in carats/ratti, metal, which finger, day to wear, muhurta
- Mantra: exact beej mantra text, daily count, best time
- Puja: specific ritual name, recommended dates, procedure
- Fasting: which day, what to eat/avoid
- Charity: what to donate, to whom, when
- Yantra: which yantra, material, where to place
- Rudraksha: which mukhi, how to wear, mantra for energizing

Respond in valid JSON with keys: gemstone, mantra, puja, fasting, charity, yantra, rudraksha.`,
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          ascendant: chartData.ascendant,
          planets: chartData.planets.map((p) => ({
            planet: p.planet,
            sign: p.sign,
            house: p.house,
            isRetrograde: p.isRetrograde,
          })),
          doshas: {
            mangal: doshas.mangal.present,
            kaalSarp: doshas.kaalSarp.present,
            sadeSati: doshas.sadeSati.active,
          },
          weakPlanets: chartData.planets.filter(
            (p) => p.isRetrograde || ['Rahu', 'Ketu'].includes(p.planet),
          ),
        }),
      },
    ],
  });

  const textContent = message.content.find((c) => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from AI');
  }

  try {
    return JSON.parse(textContent.text);
  } catch {
    return { raw: textContent.text };
  }
}
