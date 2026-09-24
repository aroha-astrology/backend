import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeProfileContext } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  deltas: [] as string[],
  resolveFeaturesForUser: vi.fn(),
  findKundliByUserId: vi.fn(),
}));

vi.mock('../src/lib/llm/gemini-client.js', () => ({
  stream: async function* () {
    for (const d of state.deltas) yield await Promise.resolve(d);
  },
  generate: vi.fn(),
}));
vi.mock('../src/modules/features/features.service.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    resolveFeaturesForUser: state.resolveFeaturesForUser,
    modelForUser: () => Promise.resolve(undefined),
  };
});
vi.mock('../src/modules/kundli/kundli.repo.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, findKundliByUserId: state.findKundliByUserId };
});

import { classifyQuestionArea } from '../src/lib/intelligence/question-area.js';
import { whyFactorEnglish } from '../src/lib/intelligence/why-text.js';
import { streamStructuredAnswer } from '../src/lib/swarm/agents/scholar.js';
import { structuredChatContext } from '../src/modules/astro/astro.service.js';

const on = {
  enabled: true,
  pricePaise: null,
  originalPricePaise: null,
  model: null,
  enabledAt: null,
};

beforeEach(() => {
  state.deltas = [];
  state.resolveFeaturesForUser.mockReset();
  state.findKundliByUserId.mockReset().mockResolvedValue(undefined);
});

describe('classifyQuestionArea', () => {
  it.each([
    ['Why is my career so unstable?', 'career'],
    ['Meri shaadi kab hogi?', 'relationships'],
    ['amar chakrir situation ta kemon?', 'career'],
    ['मेरी नौकरी कब लगेगी?', 'career'],
    ['আমার বিয়ে কবে হবে?', 'relationships'],
    ['Should I invest in property or stocks?', 'money'],
    ['Will I settle abroad?', 'relocation'],
    ['How will my exams go?', 'education'],
  ])('%s → %s', (q, area) => {
    expect(classifyQuestionArea(q)).toBe(area);
  });

  it('returns null for a question with no clear area', () => {
    expect(classifyQuestionArea('What should I focus on today?')).toBeNull();
  });
});

describe('whyFactorEnglish', () => {
  it('renders a factor as a plain English line with its direction', () => {
    expect(
      whyFactorEnglish({
        kind: 'transit',
        effect: -1,
        textKey: 'why.transit',
        params: { planet: 'Saturn', sign: 'Pisces', house: 10 },
      }),
    ).toBe('Saturn is transiting Pisces, the 10th house from the natal Moon. (strains)');
  });
});

describe('streamStructuredAnswer', () => {
  it('keeps the FACTOR/MEANING/TIMELINE markers, strips markdown decoration, drops blank lines', async () => {
    state.deltas = [
      'FACTOR: **Current Dasha** | Mercury period favours planning.\n',
      '\nFACTOR: Career house | 10th-house activity is high.\nFACTOR: Saturn | Saturn tests patience.\n',
      '- MEANING: Stay put for now.\nTIMELINE: Oct to Jan.\nAsk next: Best months? | Job or business?',
    ];
    const out: string[] = [];
    for await (const chunk of streamStructuredAnswer([], undefined)) out.push(chunk);
    expect(out.join('')).toBe(
      [
        'FACTOR: Current Dasha | Mercury period favours planning.',
        'FACTOR: Career house | 10th-house activity is high.',
        'FACTOR: Saturn | Saturn tests patience.',
        'MEANING: Stay put for now.',
        'TIMELINE: Oct to Jan.',
        'Ask next: Best months? | Job or business?',
      ].join('\n'),
    );
  });

  it('stops a runaway reply at the word ceiling', async () => {
    state.deltas = Array.from({ length: 80 }, () => 'MEANING: one two three four five six seven\n');
    let words = 0;
    for await (const chunk of streamStructuredAnswer([], undefined))
      words += chunk.split(/\s+/).filter(Boolean).length;
    expect(words).toBeLessThanOrEqual(270);
  });
});

describe('structuredChatContext', () => {
  it('returns null (the normal prose reply) while chat.structuredAnswers is off', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({});
    expect(await structuredChatContext('user-1', 'career?', makeProfileContext())).toBeNull();
  });

  it('classifies the question and only offers links to features that are on', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({
      'chat.structuredAnswers': on,
      'nav.lifeTimeline': on,
      'nav.calendar': on,
    });
    const ctx = await structuredChatContext(
      'user-1',
      'When will I get a promotion?',
      makeProfileContext(),
    );
    expect(ctx).toEqual({ keyFactors: [], area: 'career', links: ['timeline', 'calendar'] });
  });
});
