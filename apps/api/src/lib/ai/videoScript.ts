import { createAIMessage } from '@/lib/ai/aiProvider';
import type { ChartData, VimshottariDasha, DoshaAnalysis, Yoga } from '@aroha-astrology/shared';

interface VideoScriptSection {
  id: string;
  title: string;
  text: string;
  durationSeconds: number;
}

interface VideoScriptInput {
  chartData: ChartData;
  dashas: VimshottariDasha;
  doshas: DoshaAnalysis;
  yogas: Yoga[];
  profileName: string;
  type: 'quick' | 'standard' | 'detailed';
  language: 'en' | 'hi' | 'ta';
  focusArea: string;
  specificQuestion?: string;
}

const DURATION_MAP = {
  quick: 120,
  standard: 300,
  detailed: 600,
};

export async function generateVideoScript(input: VideoScriptInput): Promise<VideoScriptSection[]> {
  const targetDuration = DURATION_MAP[input.type];
  const sectionCount = input.type === 'quick' ? 4 : input.type === 'standard' ? 7 : 10;
  const secondsPerSection = Math.floor(targetDuration / sectionCount);

  const langInstruction =
    input.language === 'hi'
      ? 'Write all narration text in conversational Hindi (Devanagari script). Use respectful tone (aap).'
      : input.language === 'ta'
        ? 'Write all narration text in conversational Tamil. Use respectful tone.'
        : 'Write all narration text in conversational English with occasional Sanskrit/Hindi astrology terms.';

  const sections =
    input.type === 'quick'
      ? ['Introduction', 'Chart Overview', input.focusArea, 'Key Remedies']
      : input.type === 'standard'
        ? [
            'Introduction',
            'Chart Overview',
            input.focusArea,
            'Career Outlook',
            'Relationships',
            'Key Challenges',
            'Remedies & Closing',
          ]
        : [
            'Introduction',
            'Chart Overview',
            input.focusArea,
            'Career & Finance',
            'Relationships & Marriage',
            'Health & Wellbeing',
            'Wealth & Prosperity',
            'Challenges & Difficult Periods',
            'Detailed Remedies',
            'Closing & Blessings',
          ];

  const message = await createAIMessage({
    max_tokens: 4096,
    system: `You are a warm, experienced Vedic astrologer narrating a personalized video reading.
${langInstruction}

Generate a narration script with exactly ${sectionCount} sections.
Each section should be approximately ${secondsPerSection} seconds when spoken (~${Math.floor(secondsPerSection * 2.5)} words).

Sections needed: ${sections.join(', ')}

Style: Warm, personal, addressing the person by name (${input.profileName}). Use natural speech patterns. Reference specific planetary positions. Be encouraging but honest.

Chart data:
- Ascendant: ${input.chartData.ascendant.sign}
- Moon Sign: ${input.chartData.planets.find((p) => p.planet === 'Moon')?.sign}
- Current Mahadasha: ${input.dashas.currentMahadasha.planet}
- Key Yogas: ${input.yogas.filter((y) => y.present).map((y) => y.name).join(', ') || 'None'}
- Doshas: ${input.doshas.mangal.present ? 'Mangal Dosha' : ''} ${input.doshas.kaalSarp.present ? 'Kaal Sarp' : ''} ${input.doshas.sadeSati.active ? 'Sade Sati' : ''}
${input.specificQuestion ? `User's specific question: ${input.specificQuestion}` : ''}

Respond as JSON array: [{"id": "section_1", "title": "Section Title", "text": "narration text", "durationSeconds": ${secondsPerSection}}]`,
    messages: [
      {
        role: 'user',
        content: `Generate the ${input.type} video script for ${input.profileName}'s birth chart reading, focusing on ${input.focusArea}.`,
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
    return sections.map((title, i) => ({
      id: `section_${i + 1}`,
      title,
      text: textContent.type === 'text' ? textContent.text : '',
      durationSeconds: secondsPerSection,
    }));
  }
}
