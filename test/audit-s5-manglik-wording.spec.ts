import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeKundliMilanScores } from '../src/lib/astro-engine/reports/kundli-milan.js';
import { computeSpouseSynastry } from '../src/lib/astro-engine/reports/marriage-spouse-synastry.js';

// Audit Sprint 5, SB2 (Sprint 1 leftover): Kundli Milan, Match Report and the spouse part of the
// Marriage Report showed each person's RAW "present" plus one either-person "cancelled" flag, so a
// cancelled dosha still read "present". Each person now carries their own effective status
// (Manglik only when present and not cancelled) and their own cancellation reasons.

const state = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateKundliMilanNarrative } = await import('../src/lib/llm/reports/kundli-milan.js');
const { generateMatchReportNarrative } = await import('../src/lib/llm/reports/match-report.js');
const { generateMarriageNarrative } = await import('../src/lib/llm/reports/marriage.js');

function chart(marsSignIndex: number, marsSign: string): Record<string, unknown> {
  return {
    ascendant: { signIndex: 0 },
    planets: [
      { planet: 'Moon', nakshatraIndex: 3, sign: 'Aries', signIndex: 0 },
      { planet: 'Mars', signIndex: marsSignIndex, sign: marsSign },
    ],
  };
}
const ACTIVE = chart(3, 'Cancer'); // Mars 4th from Lagna and Moon, nothing cancels it
const CANCELLED = chart(0, 'Aries'); // Mars in its own sign: found, then cancelled
const CLEAN = chart(2, 'Gemini');

const emptySections = JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] });

beforeEach(() => {
  state.generate.mockReset();
  state.generate.mockResolvedValue(emptySections);
});

function allPromptText(): string {
  return state.generate.mock.calls
    .map((c) => (c[0].messages as { content: string }[]).map((m) => m.content).join('\n'))
    .join('\n');
}

describe('manglikStatus carries each person’s own effective status and reasons', () => {
  it('a cancelled dosha is not Manglik for that person, and keeps its own reason', () => {
    const s = computeKundliMilanScores({ chart: CANCELLED, partnerChart: ACTIVE }, null);
    expect(s.manglikStatus.person1).toBe(false); // cancelled => not Manglik
    expect(s.manglikStatus.person2).toBe(true); // in force
    expect(s.manglikStatus.cancelled1).toBe(true);
    expect(s.manglikStatus.cancelled2).toBe(false);
    expect(s.manglikStatus.reasons1?.join(' ')).toMatch(/own sign Aries/);
    expect(s.manglikStatus.reasons2).toEqual([]);
    expect(s.manglikStatus.cancelled).toBe(true); // either-person flag kept for old readers
  });

  it('the spouse synastry reports self and spouse the same way', () => {
    const syn = computeSpouseSynastry(ACTIVE, CANCELLED, null);
    expect(syn?.manglikStatus.self).toBe(true);
    expect(syn?.manglikStatus.spouse).toBe(false);
    expect(syn?.manglikStatus.cancelledSpouse).toBe(true);
    expect(syn?.manglikStatus.reasonsSpouse?.join(' ')).toMatch(/own sign Aries/);
  });
});

describe('the report prompts say who is Manglik, who is cancelled and why', () => {
  it('Kundli Milan: names the cancelled person as NOT Manglik, with the reason', async () => {
    const scores = computeKundliMilanScores({ chart: CANCELLED, partnerChart: ACTIVE }, null);
    await generateKundliMilanNarrative(scores).catch(() => undefined);
    const text = allPromptText();
    expect(text).toMatch(/person1: NOT Manglik/i);
    expect(text).toMatch(/own sign Aries/);
    expect(text).toMatch(/person2: Manglik/i);
    expect(text).not.toMatch(/person1: present/i);
  });

  it('Match Report: one in force and one cancelled is "only one", never "BOTH people"', async () => {
    const scores = computeKundliMilanScores({ chart: CANCELLED, partnerChart: ACTIVE }, null);
    await generateMatchReportNarrative(scores as never).catch(() => undefined);
    const text = allPromptText();
    expect(text).toMatch(/only one person is Manglik/i);
    expect(text).not.toMatch(/BOTH people/);
    expect(text).toMatch(/own sign Aries/);
  });

  it('Match Report: two cancelled doshas read as neither being Manglik', async () => {
    const scores = computeKundliMilanScores({ chart: CANCELLED, partnerChart: CANCELLED }, null);
    await generateMatchReportNarrative(scores as never).catch(() => undefined);
    expect(allPromptText()).toMatch(/neither person is Manglik/i);
  });

  it('Match Report: a clean pair is still "not present for either person"', async () => {
    const scores = computeKundliMilanScores({ chart: CLEAN, partnerChart: CLEAN }, null);
    await generateMatchReportNarrative(scores as never).catch(() => undefined);
    expect(allPromptText()).toMatch(/not present for either person/);
  });

  it('Marriage Report spouse line: a cancelled spouse dosha is "not Manglik", with the reason', async () => {
    const syn = computeSpouseSynastry(ACTIVE, CANCELLED, null);
    await generateMarriageNarrative({
      marriageScore: 70,
      band: 'steady',
      ageBands: [],
      windows: [],
      jupiterDharmaWindow: null,
      manglik: { isManglik: true, cancelled: false },
      spouseSynastry: syn,
      spouseName: 'Asha',
    } as never).catch(() => undefined);
    const text = allPromptText();
    expect(text).toMatch(/Spouse's own Manglik status: NOT Manglik/);
    expect(text).toMatch(/own sign Aries/);
    expect(text).not.toMatch(/Spouse's own Manglik status: present/);
  });
});
