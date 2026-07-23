import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroundingSource } from '../src/lib/chat-grounding.js';

const state = vi.hoisted(() => ({
  generateNumerologyReport: vi.fn(),
  generateLifeAreaReport: vi.fn(),
  generateRemediesReport: vi.fn(),
  generateAscendantReport: vi.fn(),
  generateSummaryReport: vi.fn(),
  getRemedies: vi.fn(),
}));

vi.mock('../src/lib/llm/numerology-report.js', () => ({
  generateNumerologyReport: state.generateNumerologyReport,
}));
vi.mock('../src/lib/llm/life-area-report.js', () => ({
  generateLifeAreaReport: state.generateLifeAreaReport,
}));
vi.mock('../src/lib/llm/remedies-report.js', () => ({
  generateRemediesReport: state.generateRemediesReport,
}));
vi.mock('../src/lib/llm/flagship-ascendant-report.js', () => ({
  generateAscendantReport: state.generateAscendantReport,
}));
vi.mock('../src/lib/llm/flagship-summary-report.js', () => ({
  generateSummaryReport: state.generateSummaryReport,
}));
vi.mock('../src/modules/astro/astro.service.js', () => ({
  getRemedies: state.getRemedies,
}));

const { assembleFlagshipReport } = await import('../src/lib/flagship/orchestrator.js');

const FULL_GROUNDING: GroundingSource = {
  chart: {
    ascendant: { sign: 'Leo' },
    planets: [
      {
        planet: 'Moon',
        longitude: 45.5,
        house: 2,
        sign: 'Taurus',
        nakshatra: 'Rohini',
        nakshatraPada: 2,
        nakshatraIndex: 3,
        isRetrograde: false,
      },
      {
        planet: 'Sun',
        longitude: 120,
        house: 6,
        sign: 'Virgo',
        nakshatra: 'Uttara Phalguni',
        nakshatraPada: 1,
        nakshatraIndex: 11,
        isRetrograde: false,
      },
    ],
    houses: [
      { house: 1, sign: 'Leo', lord: 'Sun' },
      { house: 2, sign: 'Virgo', lord: 'Mercury' },
    ],
  },
  dasha: {
    vimshottari: {
      mahadashas: [{ planet: 'Venus', startDate: '2020-01-01', endDate: '2040-01-01' }],
      currentMahadasha: { planet: 'Venus' },
    },
  },
  yogas: {
    yogas: [
      {
        name: 'Gajakesari Yoga',
        type: 'raja',
        description: 'Moon-Jupiter angle',
        strength: 8,
        present: true,
      },
    ],
  },
  doshas: {
    mangal: { present: true, severity: 'high', description: 'Mars afflicts the 7th' },
  },
  ashtakavarga: {
    sarva: { bindus: [28, 30, 25, 27, 26, 29, 24, 31, 28, 27, 26, 25] },
  },
};

const VALID_INPUT = {
  dateOfBirth: '1995-06-15',
  fullName: 'Test User',
  gender: 'female' as string | null,
  grounding: FULL_GROUNDING,
  birthData: {
    date: '1995-06-15',
    time: '10:30',
    latitude: 28.6,
    longitude: 77.2,
    timezone: 'Asia/Kolkata',
  },
};

const REMEDIES = [{ planet: 'Saturn', title: 'Pacify Saturn', icon: 'sun', remedy: 'Donate oil.' }];

function makeAscendantResult() {
  return {
    intro: 'ascendant intro',
    personalityTraits: 'traits',
    appearance: 'appearance',
    temperament: 'temperament',
    model: 'gemini-mock',
  };
}
function makeNumerologyResult() {
  return {
    intro: 'numerology intro',
    lifePathStory: 'a',
    expressionStory: 'b',
    soulUrgeStory: 'c',
    personalityStory: 'd',
    model: 'gemini-mock',
  };
}
function makeLifeAreaResult(area: string) {
  return {
    intro: `${area} intro`,
    currentPhase: 'phase',
    strengths: 'strengths',
    challenges: 'challenges',
    guidance: 'guidance',
    model: 'gemini-mock',
  };
}
function makeRemediesResult() {
  return {
    intro: 'remedies intro',
    notes: { 'Pacify Saturn': 'because Saturn is weak' },
    model: 'gemini-mock',
  };
}
function makeSummaryResult() {
  return {
    overallSummary: 'summary',
    keyStrengths: 'strengths',
    areasToWatch: 'watch',
    closingGuidance: 'guidance',
    model: 'gemini-mock',
  };
}

/** Tracks the ORDER each generator's mock actually completes/executes in, so the orchestrator's call-ordering guarantees can be asserted on. */
let order: string[];

function installHappyPathMocks() {
  order = [];
  state.getRemedies.mockReset().mockResolvedValue(REMEDIES);

  // The 8 bounded-concurrency generators each yield at least one microtask
  // tick before recording themselves as done, so — if the implementation
  // were ever changed to fire the Executive Summary concurrently with them
  // instead of strictly afterward — the summary's zero-delay mock would
  // race ahead and this test would catch it.
  state.generateAscendantReport.mockReset().mockImplementation(async () => {
    await Promise.resolve();
    order.push('ascendant');
    return makeAscendantResult();
  });
  state.generateNumerologyReport.mockReset().mockImplementation(async () => {
    await Promise.resolve();
    order.push('numerology');
    return makeNumerologyResult();
  });
  state.generateLifeAreaReport.mockReset().mockImplementation(async (ctx: { area: string }) => {
    await Promise.resolve();
    order.push(ctx.area);
    return makeLifeAreaResult(ctx.area);
  });
  state.generateRemediesReport.mockReset().mockImplementation(async () => {
    await Promise.resolve();
    order.push('remedies');
    return makeRemediesResult();
  });
  // No artificial delay, not even an async function: pushes synchronously
  // the instant it's invoked. Only ends up last in `order` if the
  // orchestrator truly awaits the whole batch before calling this.
  state.generateSummaryReport.mockReset().mockImplementation(() => {
    order.push('summary');
    return makeSummaryResult();
  });
}

beforeEach(() => {
  installHappyPathMocks();
});

describe('assembleFlagshipReport', () => {
  it('returns a content object with every expected key populated', async () => {
    const content = await assembleFlagshipReport(VALID_INPUT);

    expect(content.avkahada).not.toBeNull();
    expect(content.planetPositions.length).toBeGreaterThan(0);
    expect(content.houseTable.length).toBeGreaterThan(0);
    expect(content.yogas.length).toBeGreaterThan(0);
    expect(content.doshas.length).toBeGreaterThan(0);
    expect(content.dashaTimeline.length).toBeGreaterThan(0);
    expect(content.ashtakavarga.bySign.length).toBeGreaterThan(0);
    expect(content.ascendant).toEqual(makeAscendantResult());
    expect(content.numerology).toEqual(makeNumerologyResult());
    expect(content.career).toEqual(makeLifeAreaResult('career'));
    expect(content.finance).toEqual(makeLifeAreaResult('finance'));
    expect(content.health).toEqual(makeLifeAreaResult('health'));
    expect(content.love).toEqual(makeLifeAreaResult('love'));
    expect(content.education).toEqual(makeLifeAreaResult('education'));
    expect(content.remedies).toEqual(makeRemediesResult());
    expect(content.executiveSummary).toEqual(makeSummaryResult());
  });

  it('calls the 5 life-area areas exactly once each, and passes the resolved remedies list to generateRemediesReport', async () => {
    await assembleFlagshipReport(VALID_INPUT);

    const areasRequested = state.generateLifeAreaReport.mock.calls.map(
      (c) => (c[0] as { area: string }).area,
    );
    expect(areasRequested.sort()).toEqual(['career', 'education', 'finance', 'health', 'love']);
    expect(state.getRemedies).toHaveBeenCalledWith(VALID_INPUT.birthData);
    expect(state.generateRemediesReport).toHaveBeenCalledWith({ remedies: REMEDIES });
  });

  it('calls the Executive Summary AFTER all 8 other generators have resolved, not concurrently', async () => {
    await assembleFlagshipReport(VALID_INPUT);

    expect(order).toHaveLength(9);
    expect(order[order.length - 1]).toBe('summary');
    expect(new Set(order.slice(0, 8))).toEqual(
      new Set([
        'ascendant',
        'numerology',
        'career',
        'finance',
        'health',
        'love',
        'education',
        'remedies',
      ]),
    );
  });

  it("passes each section's intro into the Executive Summary context", async () => {
    await assembleFlagshipReport(VALID_INPUT);

    expect(state.generateSummaryReport).toHaveBeenCalledWith({
      sectionDigests: {
        Ascendant: 'ascendant intro',
        Numerology: 'numerology intro',
        Career: 'career intro',
        Finance: 'finance intro',
        Health: 'health intro',
        Love: 'love intro',
        Education: 'education intro',
        Remedies: 'remedies intro',
      },
    });
  });

  it('propagates a rejection when one of the 8 concurrent generators fails, rather than continuing with a gap', async () => {
    state.generateLifeAreaReport.mockImplementation(async (ctx: { area: string }) => {
      if (ctx.area === 'health') throw new Error('gemini boom');
      await Promise.resolve();
      order.push(ctx.area);
      return makeLifeAreaResult(ctx.area);
    });

    await expect(assembleFlagshipReport(VALID_INPUT)).rejects.toThrow('gemini boom');
    expect(state.generateSummaryReport).not.toHaveBeenCalled();
  });

  it('propagates a rejection from generateRemediesReport too', async () => {
    state.generateRemediesReport.mockRejectedValueOnce(new Error('remedies boom'));

    await expect(assembleFlagshipReport(VALID_INPUT)).rejects.toThrow('remedies boom');
    expect(state.generateSummaryReport).not.toHaveBeenCalled();
  });
});
