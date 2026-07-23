import { describe, expect, it } from 'vitest';
import pdfParse from 'pdf-parse';
import { renderFlagshipReportPdf } from '../src/lib/flagship/pdfRenderer.js';
import type { FlagshipReportContent } from '../src/lib/flagship/orchestrator.js';

const CONTENT: FlagshipReportContent = {
  avkahada: {
    varna: 'Kshatriya',
    vashya: 'Chatushpada',
    yoni: 'Ashwa',
    gana: 'Deva',
    nadi: 'Antya',
    paya: 'Gold',
    namingSyllable: 'Ro',
    moonSign: 'Taurus',
    moonNakshatra: 'Rohini',
  },
  planetPositions: [
    {
      planet: 'Sun',
      sign: 'Capricorn',
      house: 10,
      nakshatra: 'Uttara Ashadha',
      nakshatraPada: 2,
      isRetrograde: false,
    },
    {
      planet: 'Moon',
      sign: 'Taurus',
      house: 4,
      nakshatra: 'Rohini',
      nakshatraPada: 1,
      isRetrograde: false,
    },
    {
      planet: 'Saturn',
      sign: 'Libra',
      house: 7,
      nakshatra: 'Vishakha',
      nakshatraPada: 3,
      isRetrograde: true,
    },
  ],
  houseTable: [
    { house: 1, sign: 'Leo', lord: 'Sun' },
    { house: 2, sign: 'Virgo', lord: 'Mercury' },
  ],
  yogas: [
    {
      name: 'Gajakesari Yoga',
      type: 'raja',
      description: 'Moon-Jupiter angular relationship brings wisdom and reputation.',
      strength: 8,
    },
  ],
  doshas: [
    {
      name: 'Mangal Dosha',
      present: true,
      severity: 'high',
      description: 'Mars afflicts the 7th house of partnerships.',
    },
    {
      name: 'Kaal Sarp Dosha',
      present: false,
      severity: 'none',
      description: 'No qualifying planetary configuration found.',
    },
  ],
  dashaTimeline: [
    { planet: 'Venus', startDate: '2020-01-01', endDate: '2040-01-01', isCurrent: true },
    { planet: 'Sun', startDate: '2040-01-01', endDate: '2046-01-01', isCurrent: false },
  ],
  ashtakavarga: {
    bySign: [
      { sign: 'Aries', bindus: 28 },
      { sign: 'Taurus', bindus: 30 },
    ],
  },
  shadbala: [
    {
      planet: 'Sun',
      sthanaBala: 120,
      digBala: 40,
      kalaBala: 80,
      cheshtaBala: 30,
      naisargikaBala: 60,
      drikBala: 10,
      totalVirupas: 340,
      requiredVirupas: 390,
      isStrong: false,
    },
    {
      planet: 'Moon',
      sthanaBala: 150,
      digBala: 50,
      kalaBala: 90,
      cheshtaBala: 40,
      naisargikaBala: 51.43,
      drikBala: 5,
      totalVirupas: 386.43,
      requiredVirupas: 360,
      isStrong: true,
    },
  ],
  ascendant: {
    intro:
      'Your Leo ascendant gives you a natural warmth people notice within minutes of meeting you.',
    personalityTraits: 'Confident, generous, and drawn to leadership roles.',
    appearance: 'A strong, upright bearing with expressive eyes.',
    temperament: 'Fire-driven and quick to act, softened by genuine warmth.',
    model: 'gemini-mock',
  },
  numerology: {
    intro: 'Your numbers point to a life built on steady, patient effort.',
    lifePathStory: 'You keep circling back to the same lesson: finish what you start.',
    expressionStory: 'People already come to you first when something needs organizing.',
    soulUrgeStory: 'Underneath the plans, what you actually want is to feel needed.',
    personalityStory: 'Strangers read you as calm before they ever hear you speak.',
    model: 'gemini-mock',
  },
  career: {
    intro:
      'Your career runs on visible, structured effort rather than quiet behind-the-scenes work.',
    currentPhase: 'A consolidation phase after several years of rapid change.',
    strengths: 'Organizational clarity and a talent for turning chaos into a plan.',
    challenges: 'A tendency to take on too much before delegating.',
    guidance: 'Say yes to the leadership opportunity that surfaces this year.',
    model: 'gemini-mock',
  },
  finance: {
    intro: 'Money moves toward you through steady accumulation, not windfalls.',
    currentPhase: 'A saving-focused stretch after a period of higher spending.',
    strengths: 'Discipline once a budget is actually written down.',
    challenges: 'Impulse purchases tied to stress, not genuine want.',
    guidance: 'Automate savings before the next salary revision lands.',
    model: 'gemini-mock',
  },
  health: {
    intro:
      'Your vitality tracks closely with how well you are sleeping, more than diet or exercise alone.',
    currentPhase: 'A generally stable period with one area needing attention.',
    strengths: 'Fast physical recovery once you actually rest.',
    challenges: 'Skipping sleep to finish "one more thing."',
    guidance: 'Protect a fixed wind-down hour, even on demanding weeks.',
    model: 'gemini-mock',
  },
  love: {
    intro: 'You show love through action long before you say it out loud.',
    currentPhase: 'A season favoring deepening an existing bond over starting new ones.',
    strengths: 'Loyalty and follow-through once you commit.',
    challenges: 'Waiting too long to name what you actually need.',
    guidance: 'Say the thing you have been rehearsing in your head.',
    model: 'gemini-mock',
  },
  education: {
    intro: 'You learn best by teaching the material back to someone else.',
    currentPhase: 'A strong window for finishing a long-delayed certification.',
    strengths: 'Deep focus once a topic actually interests you.',
    challenges: 'Losing momentum on subjects that feel purely obligatory.',
    guidance: 'Pair the delayed certification with a study partner this month.',
    model: 'gemini-mock',
  },
  remedies: {
    intro: 'These remedies are chosen specifically for the placements found in your chart above.',
    notes: {
      'Pacify Saturn':
        'Saturn sits weak in your chart, so this remedy directly supports the area it governs.',
    },
    model: 'gemini-mock',
  },
  executiveSummary: {
    overallSummary:
      'This chart describes someone who builds a good life through consistency rather than luck.',
    keyStrengths: 'Discipline, loyalty, and a talent for turning plans into results.',
    areasToWatch: 'Overcommitting before delegating, and delaying honest conversations.',
    closingGuidance:
      'The next two years reward finishing what is already in motion over starting anything new.',
    model: 'gemini-mock',
  },
};

const META = {
  fullName: 'Subir Dutta',
  dateOfBirth: '1993-04-17',
  gender: 'male' as string | null,
};

describe('renderFlagshipReportPdf', () => {
  it('produces a buffer starting with the PDF magic header', async () => {
    const buffer = await renderFlagshipReportPdf(CONTENT, META);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('includes the cover page name and date of birth', async () => {
    const buffer = await renderFlagshipReportPdf(CONTENT, META);
    const { text } = await pdfParse(buffer);
    expect(text).toContain('Subir Dutta');
    expect(text).toContain('1993-04-17');
  });

  it('includes every Avkahada Chakra value', async () => {
    const buffer = await renderFlagshipReportPdf(CONTENT, META);
    const { text } = await pdfParse(buffer);
    expect(text).toContain('Kshatriya');
    expect(text).toContain('Chatushpada');
    expect(text).toContain('Ashwa');
    expect(text).toContain('Antya');
    expect(text).toContain('Gold');
    expect(text).toContain('Rohini');
  });

  it('includes the Executive Summary and Ascendant narrative text verbatim', async () => {
    const buffer = await renderFlagshipReportPdf(CONTENT, META);
    const { text } = await pdfParse(buffer);
    expect(text).toContain('builds a good life through consistency rather than luck');
    expect(text).toContain('natural warmth people notice within minutes');
  });

  it('includes all 5 life-area section intros', async () => {
    const buffer = await renderFlagshipReportPdf(CONTENT, META);
    const { text } = await pdfParse(buffer);
    expect(text).toContain('Your career runs on visible, structured effort');
    expect(text).toContain('Money moves toward you through steady accumulation');
    expect(text).toContain('Your vitality tracks closely with how well you are sleeping');
    expect(text).toContain('You show love through action long before you say it out loud');
    expect(text).toContain('You learn best by teaching the material back to someone else');
  });

  it('includes the numerology narrative', async () => {
    const buffer = await renderFlagshipReportPdf(CONTENT, META);
    const { text } = await pdfParse(buffer);
    expect(text).toContain('finish what you start');
  });

  it('includes only the present dosha, not the absent one', async () => {
    const buffer = await renderFlagshipReportPdf(CONTENT, META);
    const { text } = await pdfParse(buffer);
    expect(text).toContain('Mangal Dosha');
    expect(text).not.toContain('Kaal Sarp Dosha');
  });

  it('includes the yoga name and dasha timeline planet names', async () => {
    const buffer = await renderFlagshipReportPdf(CONTENT, META);
    const { text } = await pdfParse(buffer);
    expect(text).toContain('Gajakesari Yoga');
    expect(text).toContain('Venus');
  });

  it('includes the remedies section title and personalized note', async () => {
    const buffer = await renderFlagshipReportPdf(CONTENT, META);
    const { text } = await pdfParse(buffer);
    expect(text).toContain('Pacify Saturn');
    expect(text).toContain('directly supports the area it governs');
  });

  it('includes Shadbala planet names', async () => {
    const buffer = await renderFlagshipReportPdf(CONTENT, META);
    const { text } = await pdfParse(buffer);
    expect(text).toContain('Sun');
    expect(text).toContain('Moon');
  });

  it('renders a report with zero present doshas without throwing, and says so', async () => {
    const noDoshaContent: FlagshipReportContent = {
      ...CONTENT,
      doshas: [
        { name: 'Mangal Dosha', present: false, severity: 'none', description: 'Not present.' },
      ],
    };
    const buffer = await renderFlagshipReportPdf(noDoshaContent, META);
    const { text } = await pdfParse(buffer);
    expect(text).toContain('No significant doshas identified');
  });
});
