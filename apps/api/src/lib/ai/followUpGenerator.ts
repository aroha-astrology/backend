import type { ChartData, VimshottariDasha, DoshaAnalysis, DashaPeriod, Planet } from '@aroha-astrology/shared';

interface FollowUpQuestion {
  id: string;
  question: string;
  options: string[];
  why: string;
  dashaReference: string;
}

const DASHA_EVENT_MAP: Record<Planet, { events: string[]; question: string; options: string[] }> = {
  Saturn: {
    events: ['career delays', 'restrictions', 'authority issues'],
    question: 'During {period}, did you experience career obstacles, delays in promotions, or increased responsibilities that felt burdensome?',
    options: ['Yes, significant career challenges', 'Some minor delays', 'No, things were smooth', 'I was too young to remember'],
  },
  Rahu: {
    events: ['sudden changes', 'confusion', 'unconventional paths'],
    question: 'During {period}, did you experience any sudden life changes, confusion about direction, or were you drawn to unusual/unconventional paths?',
    options: ['Yes, major unexpected changes', 'Some confusion but manageable', 'No, life was fairly stable', 'Not applicable'],
  },
  Mars: {
    events: ['accidents', 'surgeries', 'conflicts'],
    question: 'During {period}, did you face any accidents, surgeries, heated conflicts, or property-related disputes?',
    options: ['Yes, physical health issues/accidents', 'Yes, conflicts or legal issues', 'Minor disagreements only', 'No such events'],
  },
  Jupiter: {
    events: ['growth', 'education', 'expansion'],
    question: 'During {period}, did you experience growth in education, spiritual development, or expansion of knowledge/wisdom?',
    options: ['Yes, significant personal growth', 'Started new learning/education', 'Moderate positive changes', 'No notable growth'],
  },
  Venus: {
    events: ['relationships', 'luxury', 'artistic pursuits'],
    question: 'During {period}, did you experience new relationships, marriage, acquisition of luxury items, or involvement in creative/artistic activities?',
    options: ['Yes, new relationship/marriage', 'Acquired property/luxury', 'Creative pursuits flourished', 'No significant changes'],
  },
  Ketu: {
    events: ['spiritual awakening', 'detachment', 'losses'],
    question: 'During {period}, did you experience a spiritual awakening, sense of detachment from material things, or unexpected losses?',
    options: ['Yes, strong spiritual pull', 'Felt detached from usual interests', 'Experienced losses/separation', 'No such experiences'],
  },
  Sun: {
    events: ['authority', 'government', 'father'],
    question: 'During {period}, did you have significant interactions with authority figures, government matters, or events related to your father?',
    options: ['Yes, career authority gained', 'Government/legal matters', 'Father-related events', 'Nothing notable'],
  },
  Moon: {
    events: ['emotional changes', 'mother', 'travel'],
    question: 'During {period}, did you experience emotional upheavals, events related to your mother, or frequent travels/relocations?',
    options: ['Yes, emotional challenges', 'Mother-related events', 'Frequent travel/relocation', 'Stable period'],
  },
  Mercury: {
    events: ['education', 'communication', 'business'],
    question: 'During {period}, did you see changes in education, communication skills, or business/trade activities?',
    options: ['Yes, education milestones', 'Business/trade changes', 'Communication improvements', 'No notable changes'],
  },
};

export function generateFollowUpQuestions(
  chartData: ChartData,
  dashas: VimshottariDasha,
  doshas: DoshaAnalysis,
  birthYear: number,
): FollowUpQuestion[] {
  const questions: FollowUpQuestion[] = [];
  const now = new Date();
  const tenYearsAgo = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());

  // Analyze dasha transitions in last 10 years
  for (const maha of dashas.mahadashas) {
    const start = new Date(maha.startDate);
    const end = new Date(maha.endDate);

    if (start > tenYearsAgo && start < now && DASHA_EVENT_MAP[maha.planet]) {
      const mapping = DASHA_EVENT_MAP[maha.planet];
      const period = `${start.getFullYear()}-${end.getFullYear()}`;
      questions.push({
        id: `dasha_${maha.planet}_${start.getFullYear()}`,
        question: mapping.question.replace('{period}', period),
        options: mapping.options,
        why: `Your ${maha.planet} Mahadasha started in ${start.getFullYear()}. ${maha.planet} typically brings ${mapping.events.join(', ')}. Your answer helps us calibrate predictions.`,
        dashaReference: `${maha.planet} Mahadasha (${period})`,
      });
    }

    // Check antardasha transitions too
    for (const antar of maha.subPeriods) {
      const antarStart = new Date(antar.startDate);
      if (
        antarStart > tenYearsAgo &&
        antarStart < now &&
        DASHA_EVENT_MAP[antar.planet] &&
        antar.planet !== maha.planet
      ) {
        const antarEnd = new Date(antar.endDate);
        const period = `${antarStart.getFullYear()}-${antarEnd.getFullYear()}`;
        if (questions.length < 4) {
          questions.push({
            id: `antar_${antar.planet}_${antarStart.getFullYear()}`,
            question: DASHA_EVENT_MAP[antar.planet].question.replace('{period}', period),
            options: DASHA_EVENT_MAP[antar.planet].options,
            why: `Your ${antar.planet} Antardasha within ${maha.planet} Mahadasha ran during ${period}. This sub-period specifically influences ${DASHA_EVENT_MAP[antar.planet].events.join(', ')}.`,
            dashaReference: `${maha.planet}-${antar.planet} (${period})`,
          });
        }
      }
    }
  }

  // Dosha-specific questions
  if (doshas.mangal.present && questions.length < 6) {
    questions.push({
      id: 'dosha_mangal',
      question: 'Have you experienced delays in marriage, relationship conflicts, or difficulty finding a compatible partner?',
      options: [
        'Yes, significant marriage delays',
        'Relationship conflicts but married',
        'Some minor issues',
        'No marriage-related problems',
      ],
      why: 'Mangal Dosha is detected in your chart. Mars in certain houses can indicate marriage-related challenges. Your experience helps us assess the dosha\'s real impact.',
      dashaReference: 'Mangal Dosha analysis',
    });
  }

  if (doshas.sadeSati.active && questions.length < 6) {
    questions.push({
      id: 'dosha_sadesati',
      question: 'In the last 2-3 years, have you felt a persistent sense of struggle, obstacles in work, or health issues?',
      options: [
        'Yes, extremely challenging period',
        'Some struggles but manageable',
        'Mixed — some good, some bad',
        'Actually doing quite well',
      ],
      why: 'Sade Sati (Saturn\'s transit over your Moon) is currently active. This 7.5-year period typically brings challenges. Understanding your current experience helps calibrate predictions.',
      dashaReference: 'Sade Sati (active)',
    });
  }

  if (doshas.kaalSarp.present && questions.length < 6) {
    questions.push({
      id: 'dosha_kaalsarp',
      question: 'Do you experience recurring cycles of frustration where efforts don\'t yield expected results, or do you feel stuck in patterns?',
      options: [
        'Yes, strong recurring patterns',
        'Sometimes feel stuck',
        'Occasionally frustrated',
        'No such patterns',
      ],
      why: `${doshas.kaalSarp.name} Kaal Sarp Dosha is present. This can create cyclical patterns of frustration. Your experience helps us understand its manifestation.`,
      dashaReference: `Kaal Sarp (${doshas.kaalSarp.name})`,
    });
  }

  // Birth time verification
  questions.push({
    id: 'birth_time_verify',
    question: 'How confident are you about your exact birth time?',
    options: [
      'Very confident — from hospital/birth certificate',
      'Fairly confident — family memory within 15 minutes',
      'Approximate — could be off by 30+ minutes',
      'Very uncertain — guessing within hours',
    ],
    why: 'Birth time accuracy directly affects the Ascendant (Lagna) and house placements. Even a 5-minute difference can shift predictions. This helps us adjust confidence levels.',
    dashaReference: 'Chart accuracy calibration',
  });

  return questions.slice(0, 6);
}
