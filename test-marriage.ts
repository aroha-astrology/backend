import { generateMarriageNarrative } from './src/lib/llm/reports/marriage.js';

const mockScores = {
  marriageScore: 75,
  band: 'slow_build',
  manglik: { isManglik: false },
  windows: [],
  ageBands: [],
  jupiterDharmaWindow: null,
  seventhHouseSign: 'Virgo',
  seventhHouseTemperament: 'Thoughtful',
  seventhLord: 'Mercury',
  seventhLordStrength: 'Strong',
  seventhLordReason: 'In own sign',
  venusStrength: 'Strong',
  venusReason: 'Exalted',
  jupiterStrength: 'Weak',
  jupiterReason: 'Debilitated',
  partnerArchetype: { label: 'The Thinker', description: 'Very smart', traits: [] },
  fourthLordStrength: 'Average',
  inLaws: { note: 'Good' },
  moneyAfterMarriage: { note: 'Good' },
  doshaYoga: { positives: [], cautions: [] },
  marriageQualityArc: [{ label: '20s', score: 80, tone: 'favorable' }],
  modernRealities: { lateMarriageLeaning: false, seventhHousePlanetCount: 1 }
};

async function test() {
  const result = await generateMarriageNarrative(mockScores as any);
  console.log(JSON.stringify(result, null, 2));
}

test().catch(console.error);
