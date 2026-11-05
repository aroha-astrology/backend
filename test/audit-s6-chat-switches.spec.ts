import { beforeEach, describe, expect, it, vi } from 'vitest';

// Audit Sprint 6: the two cost switches are wired into chatStream and both ship OFF.
//   chat.focusedFacts -> scholarStream gets a focus for a topical question, null otherwise
//   chat.factGate     -> the per-turn fact-extraction call is skipped when nothing is worth remembering
// Scaffolding mirrors chat-stream-profile.spec.ts (every db-backed lookup mocked, or the suite hangs).

const state = vi.hoisted(() => ({
  features: {},
  findActiveUserById: vi.fn(),
  getKundliForUser: vi.fn(),
  getUserFacts: vi.fn(),
  saveUserFacts: vi.fn(),
  checkTopicGate: vi.fn(),
  scholarStream: vi.fn(),
  compactHistory: vi.fn(),
  extractTurnFacts: vi.fn(),
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  findActiveUserById: state.findActiveUserById,
}));
vi.mock('../src/modules/features/features.service.js', () => ({
  resolveFeaturesForUser: vi.fn(() => Promise.resolve(state.features)),
}));
vi.mock('../src/lib/entitlements.js', () => ({
  passEntitlement: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('../src/modules/kundli/kundli.service.js', () => ({
  getKundliForUser: state.getKundliForUser,
  withLiveSaturnTransits: vi.fn((d: unknown) => Promise.resolve(d)),
}));
vi.mock('../src/modules/astro/user-facts.repo.js', () => ({
  getUserFacts: state.getUserFacts,
  saveUserFacts: state.saveUserFacts,
}));
vi.mock('../src/modules/birth-profiles/birth-profiles.service.js', () => ({
  getBirthProfile: vi.fn(),
}));
vi.mock('../src/lib/chat-compaction.js', () => ({ compactHistory: state.compactHistory }));
vi.mock('../src/lib/chat-fact-extraction.js', () => ({ extractTurnFacts: state.extractTurnFacts }));
vi.mock('../src/modules/reports/reports.repo.js', () => ({
  listReportsForUser: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../src/modules/gemstone/gemstone.repo.js', () => ({
  findGemstoneRecommendation: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock('../src/modules/vastu/vastu.repo.js', () => ({
  listPlansForUser: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../src/modules/palm/palm.repo.js', () => ({
  listPalmReadingsForUser: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../src/modules/birth-profiles/birth-profiles.repo.js', () => ({
  listBirthProfilesByOwner: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../src/modules/astro/prediction-outcomes.repo.js', () => ({
  findPredictionsDueForReview: vi.fn(() => Promise.resolve([])),
  recordPrediction: vi.fn(() => Promise.resolve()),
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

import { makeUserRow, makeProfileContext } from './helpers/mocks.js';

const { chatStream } = await import('../src/modules/astro/astro.service.js');

async function ask(message: string, locale = 'en') {
  const profile = makeProfileContext({ birthProfileId: null, placeOfBirth: null });
  for await (const _ of chatStream(
    'user-1',
    message,
    [],
    undefined,
    undefined,
    locale,
    undefined,
    undefined,
    profile,
  ))
    void _;
}
const focusArg = () =>
  (state.scholarStream.mock.calls[0] as unknown[])[12] as
    | { domains: Set<string> }
    | null
    | undefined;

beforeEach(() => {
  state.features = {};
  state.findActiveUserById.mockReset().mockResolvedValue(makeUserRow({ id: 'user-1' }));
  state.getKundliForUser.mockReset().mockResolvedValue(undefined);
  state.getUserFacts.mockReset().mockResolvedValue([]);
  state.saveUserFacts.mockReset().mockResolvedValue(undefined);
  state.checkTopicGate.mockReset().mockResolvedValue({ related: true });
  state.compactHistory
    .mockReset()
    .mockResolvedValue({ recentHistory: [], summary: '', changed: false });
  state.extractTurnFacts.mockReset().mockResolvedValue([]);
  // A reply long enough to clear the opener hold, with no date in it.
  state.scholarStream.mockReset().mockImplementation(function* () {
    yield 'Your chart shows a steady and patient nature, and the present period favours slow, careful progress in whatever you take up.';
  });
});

describe('chat.focusedFacts', () => {
  it('off (the shipped default): no focus, whatever the question', async () => {
    await ask('When will I get a job?');
    expect(focusArg() ?? null).toBeNull();
  });
  it('on: a topical question gets a focus, a vague one does not', async () => {
    state.features = { 'chat.focusedFacts': { enabled: true } };
    await ask('When will I get a job?');
    expect(focusArg()!.domains.has('career')).toBe(true);
    state.scholarStream.mockClear();
    await ask('and then?');
    expect(focusArg() ?? null).toBeNull();
  });
});

describe('chat.factGate', () => {
  it('off (the shipped default): extraction runs after every turn', async () => {
    await ask('What does my Moon in Leo mean?');
    expect(state.extractTurnFacts).toHaveBeenCalledTimes(1);
  });
  it('on: a plain English chart question with a plain answer skips extraction', async () => {
    state.features = { 'chat.factGate': { enabled: true } };
    await ask('What does my Moon in Leo mean?');
    expect(state.extractTurnFacts).not.toHaveBeenCalled();
  });
  it('on: something personal still goes through', async () => {
    state.features = { 'chat.factGate': { enabled: true } };
    await ask('I got a new job last month, what does my chart say?');
    expect(state.extractTurnFacts).toHaveBeenCalledTimes(1);
  });
  it('on: a non-English chat always goes through', async () => {
    state.features = { 'chat.factGate': { enabled: true } };
    await ask('What does my Moon in Leo mean?', 'hi');
    expect(state.extractTurnFacts).toHaveBeenCalledTimes(1);
  });
  it('on: a reply that names a dated timing goes through even for a plain question', async () => {
    state.features = { 'chat.factGate': { enabled: true } };
    state.scholarStream.mockReset().mockImplementation(function* () {
      yield 'A good window for a change of work opens from March 2027 and stays supportive well into the following year, so prepare quietly until then.';
    });
    await ask('Any news?');
    expect(state.extractTurnFacts).toHaveBeenCalledTimes(1);
  });
});
