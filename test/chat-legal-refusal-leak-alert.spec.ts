import { beforeEach, describe, expect, it, vi } from 'vitest';

// Coverage for the Telegram alert on the legal-refusal-leak guard in
// chatStream (astro.service.ts): when a reply reuses the death policy's
// "against the law" refusal framing for an unrelated decline, the existing
// containsLegalRefusalFraming() check already re-rolls once and, if that
// still leaks, swaps in a neutral decline — never shipping the false legal
// claim. This suite covers the added observability: every turn that leaked
// on any attempt must notify Telegram with the user id, the question, and
// the answer that was actually delivered. Same mock scaffold as
// chat-stream-profile.spec.ts (this file is not about profile scoping, so
// every unrelated best-effort lookup is defaulted to empty/off exactly as
// there).

const state = vi.hoisted(() => ({
  findActiveUserById: vi.fn(),
  getKundliForUser: vi.fn(),
  withLiveSadeSati: vi.fn(),
  getUserFacts: vi.fn(),
  saveUserFacts: vi.fn(),
  getBirthProfile: vi.fn(),
  checkTopicGate: vi.fn(),
  scholarStream: vi.fn(),
  compactHistory: vi.fn(),
  extractTurnFacts: vi.fn(),
  listReportsForUser: vi.fn(() => Promise.resolve([])),
  findGemstoneRecommendation: vi.fn(() => Promise.resolve(undefined)),
  listPlansForUser: vi.fn(() => Promise.resolve([])),
  listPalmReadingsForUser: vi.fn(() => Promise.resolve([])),
  notifyLegalRefusalLeak: vi.fn(),
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  findActiveUserById: state.findActiveUserById,
}));

vi.mock('../src/modules/features/features.service.js', () => ({
  resolveFeaturesForUser: vi.fn(() => Promise.resolve({})),
}));

vi.mock('../src/modules/kundli/kundli.service.js', () => ({
  getKundliForUser: state.getKundliForUser,
  withLiveSadeSati: state.withLiveSadeSati,
}));

vi.mock('../src/modules/astro/user-facts.repo.js', () => ({
  getUserFacts: state.getUserFacts,
  saveUserFacts: state.saveUserFacts,
}));

vi.mock('../src/modules/birth-profiles/birth-profiles.service.js', () => ({
  getBirthProfile: state.getBirthProfile,
}));

vi.mock('../src/lib/chat-compaction.js', () => ({
  compactHistory: state.compactHistory,
}));

vi.mock('../src/lib/chat-fact-extraction.js', () => ({
  extractTurnFacts: state.extractTurnFacts,
}));

vi.mock('../src/modules/reports/reports.repo.js', () => ({
  listReportsForUser: state.listReportsForUser,
}));

vi.mock('../src/modules/gemstone/gemstone.repo.js', () => ({
  findGemstoneRecommendation: state.findGemstoneRecommendation,
}));

vi.mock('../src/modules/vastu/vastu.repo.js', () => ({
  listPlansForUser: state.listPlansForUser,
}));

vi.mock('../src/modules/palm/palm.repo.js', () => ({
  listPalmReadingsForUser: state.listPalmReadingsForUser,
}));

vi.mock('../src/lib/swarm/index.js', () => ({
  runPipeline: vi.fn(),
  newState: vi.fn(() => ({})),
  compileResponse: vi.fn(),
  scholarStream: state.scholarStream,
  checkTopicGate: state.checkTopicGate,
  computeMetrology: vi.fn(),
  synthesizeDailyForecast: vi.fn(),
  moonSignPrediction: vi.fn(),
  moonSignPeriodicPrediction: vi.fn(),
  sunSignPrediction: vi.fn(),
}));

vi.mock('../src/lib/notifications/telegram.js', () => ({
  notifyLegalRefusalLeak: state.notifyLegalRefusalLeak,
}));

import { makeUserRow, makeProfileContext } from './helpers/mocks.js';

const { chatStream } = await import('../src/modules/astro/astro.service.js');

async function drain<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const events: T[] = [];
  for await (const ev of gen) events.push(ev);
  return events;
}

beforeEach(() => {
  state.findActiveUserById.mockReset();
  state.getKundliForUser.mockReset().mockResolvedValue(undefined);
  state.withLiveSadeSati.mockReset().mockImplementation((d: unknown) => Promise.resolve(d));
  state.getUserFacts.mockReset().mockResolvedValue([]);
  state.saveUserFacts.mockReset().mockResolvedValue(undefined);
  state.getBirthProfile.mockReset();
  state.checkTopicGate.mockReset().mockResolvedValue({ related: true });
  state.compactHistory
    .mockReset()
    .mockResolvedValue({ recentHistory: [], summary: '', changed: false });
  state.extractTurnFacts.mockReset().mockResolvedValue([]);
  state.scholarStream.mockReset();
  state.notifyLegalRefusalLeak.mockReset().mockResolvedValue(undefined);
});

describe('chatStream — legal-refusal-leak Telegram alert', () => {
  it('notifies Telegram with the user id, question, and the final delivered answer when the first attempt leaks and a re-roll recovers', async () => {
    const user = makeUserRow({ id: 'user-1', activeProfileId: null });
    state.findActiveUserById.mockResolvedValue(user);
    const profile = makeProfileContext({ birthProfileId: null, placeOfBirth: null });

    // Long enough to clear OPENER_HOLD_CHARS (140) in one yield, so the leak
    // is judged and caught before anything reaches the client.
    const leakText =
      'A'.repeat(150) + " I'm so sorry — we know, but we can't share that. It's against the law.";
    const recoveredText = 'Your Venus period favours career growth this year.';

    state.scholarStream
      .mockImplementationOnce(function* () {
        yield leakText;
      })
      .mockImplementationOnce(function* () {
        yield recoveredText;
      });

    const question = 'What is a lucky name change for my online game account?';
    const events = await drain(
      chatStream('user-1', question, [], undefined, undefined, 'en', undefined, undefined, profile),
    );

    // The leaked draft must never reach the client — only the recovered reply.
    const tokens = events.filter((e) => (e as { type: string }).type === 'token');
    expect(tokens).toEqual([{ type: 'token', content: recoveredText }]);

    expect(state.notifyLegalRefusalLeak).toHaveBeenCalledTimes(1);
    expect(state.notifyLegalRefusalLeak).toHaveBeenCalledWith({
      userId: 'user-1',
      locale: 'en',
      question,
      answer: recoveredText,
    });
  });

  it('does not notify Telegram for an ordinary reply with no leak', async () => {
    const user = makeUserRow({ id: 'user-1', activeProfileId: null });
    state.findActiveUserById.mockResolvedValue(user);
    const profile = makeProfileContext({ birthProfileId: null, placeOfBirth: null });

    state.scholarStream.mockImplementation(function* () {
      yield 'Jupiter supports your career growth this year.';
    });

    await drain(
      chatStream(
        'user-1',
        'What does my chart say about my career?',
        [],
        undefined,
        undefined,
        'en',
        undefined,
        undefined,
        profile,
      ),
    );

    expect(state.notifyLegalRefusalLeak).not.toHaveBeenCalled();
  });
});
