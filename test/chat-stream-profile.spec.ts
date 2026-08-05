import { beforeEach, describe, expect, it, vi } from 'vitest';

// Coverage for chatStream's multi-profile wiring (astro.service.ts): the
// active profile is now resolved ONCE by the caller (astro.routes.ts's
// chatRoute) and passed in as the `profile` parameter — chatStream no longer
// calls `resolveActiveProfileContext` itself. kundli and user-facts must be
// fetched for whichever profile was passed in (profile.birthProfileId), and
// birthTimeUnknown / the gender fact in extraFacts must come from that
// profile, not unconditionally from the account (`user`) row.
// Everything below `place`/panchang/relocation is left with no place of
// birth so those best-effort paths short-circuit to `[]` and stay out of
// scope for this test (they're not part of this task).

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
  // buildPurchaseFacts' four lookups (chat-purchase-facts.ts) — unmocked they
  // hit real db.select() against a Postgres connection this suite never
  // provides, which hangs instead of erroring (the caller's .catch(() => [])
  // only fires once the promise actually rejects). Defaulting to empty is the
  // correct "nothing purchased" case for every test in this file, which is
  // about profile scoping, not purchase grounding.
  listReportsForUser: vi.fn(() => Promise.resolve([])),
  findGemstoneRecommendation: vi.fn(() => Promise.resolve(undefined)),
  listPlansForUser: vi.fn(() => Promise.resolve([])),
  listPalmReadingsForUser: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  findActiveUserById: state.findActiveUserById,
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
  state.scholarStream.mockReset().mockImplementation(function* () {
    yield 'A short reply about your chart.';
  });
});

describe('chatStream — grounds on the profile passed in by the caller (no internal re-resolution)', () => {
  it('grounds on the primary/self profile when the caller passes birthProfileId: null', async () => {
    const user = makeUserRow({
      id: 'user-1',
      activeProfileId: null,
      gender: 'male',
      relationshipStatus: 'single',
      interestAreas: ['career'],
      birthTimeAccuracy: 'exact',
    });
    state.findActiveUserById.mockResolvedValue(user);
    state.getUserFacts.mockResolvedValue([{ fact: 'likes hiking', followUpQuestion: null }]);

    const profile = makeProfileContext({
      birthProfileId: null,
      gender: 'male',
      birthTimeAccuracy: 'exact',
      placeOfBirth: null,
    });

    const events = await drain(
      chatStream(
        'user-1',
        'What does my Jupiter transit mean for my career?',
        [],
        undefined,
        undefined,
        'en',
        undefined,
        undefined,
        profile,
      ),
    );

    expect(events.some((e) => (e as { type: string }).type === 'token')).toBe(true);
    expect(state.getKundliForUser).toHaveBeenCalledWith('user-1', null);
    expect(state.getUserFacts).toHaveBeenCalledWith('user-1', null);

    const call = state.scholarStream.mock.calls[0] as any[];
    const [, , , birthTimeUnknown, , , userFacts, extraFacts] = call;
    expect(birthTimeUnknown).toBe(false);
    expect(userFacts).toEqual([{ fact: 'likes hiking', followUpQuestion: null }]);
    expect(extraFacts).toContain("User's gender: male");
  });

  it('grounds on the ACTIVE ADDITIONAL profile passed in by the caller: kundli/facts scoped to it, gender pulled from the profile (not the account), birthTimeUnknown driven by the profile', async () => {
    const user = makeUserRow({
      id: 'user-1',
      activeProfileId: 'profile-a',
      gender: 'male', // account-level — must NOT leak into the gender fact below
      relationshipStatus: 'married',
      interestAreas: [],
      birthTimeAccuracy: 'exact', // account-level — must NOT drive birthTimeUnknown below
    });
    state.findActiveUserById.mockResolvedValue(user);
    state.getUserFacts.mockResolvedValue([{ fact: 'loves painting', followUpQuestion: null }]);
    state.extractTurnFacts.mockResolvedValue([
      { fact: 'new durable fact', followUpQuestion: null },
    ]);

    const profile = makeProfileContext({
      birthProfileId: 'profile-a',
      gender: 'female', // the child's OWN gender
      birthTimeAccuracy: 'unknown', // the child's OWN (unknown) birth-time accuracy
      placeOfBirth: null,
    });

    await drain(
      chatStream(
        'user-1',
        'What does my daughter’s chart say about her creativity?',
        [],
        undefined,
        undefined,
        'en',
        undefined,
        undefined,
        profile,
      ),
    );

    expect(state.getKundliForUser).toHaveBeenCalledWith('user-1', 'profile-a');
    expect(state.getUserFacts).toHaveBeenCalledWith('user-1', 'profile-a');
    // extractTurnFacts runs fire-and-forget after the reply finishes streaming,
    // so its saveUserFacts follow-up call lands asynchronously.
    await vi.waitFor(() => {
      // saveUserFacts must be tagged with the passed-in profile too, not the account.
      expect(state.saveUserFacts).toHaveBeenCalledWith('user-1', 'profile-a', [
        { fact: 'new durable fact', followUpQuestion: null },
      ]);
    });

    const call = state.scholarStream.mock.calls[0] as any[];
    const [, , , birthTimeUnknown, , , userFacts, extraFacts] = call;
    expect(birthTimeUnknown).toBe(true); // from the profile, not the account's 'exact'
    expect(userFacts).toEqual([{ fact: 'loves painting', followUpQuestion: null }]);
    expect(extraFacts).toContain("User's gender: female");
    expect(extraFacts).not.toContain("User's gender: male");
    // relationshipStatus has no per-profile equivalent — still sourced from the account.
    expect((extraFacts as string[]).some((f) => f.includes('married'))).toBe(true);
  });

  it('falls back to primary-profile scoping when no profile is passed in at all (e.g. a caller that never resolved one)', async () => {
    const user = makeUserRow({
      id: 'user-1',
      activeProfileId: 'profile-a',
      gender: 'male',
      birthTimeAccuracy: 'exact',
    });
    state.findActiveUserById.mockResolvedValue(user);

    const events = await drain(
      chatStream(
        'user-1',
        'What does my Jupiter transit mean?',
        [],
        undefined,
        undefined,
        'en',
        undefined,
        // profile intentionally omitted
      ),
    );

    // The whole turn must still produce a reply — a missing `profile` arg
    // must never throw or break the stream.
    expect(events.some((e) => (e as { type: string }).type === 'token')).toBe(true);
    // profile undefined -> `profile?.birthProfileId ?? null` falls back to primary scoping,
    // regardless of the account's own (unrelated) activeProfileId.
    expect(state.getKundliForUser).toHaveBeenCalledWith('user-1', null);
    expect(state.getUserFacts).toHaveBeenCalledWith('user-1', null);

    const call = state.scholarStream.mock.calls[0] as any[];
    const [, , , birthTimeUnknown] = call;
    expect(birthTimeUnknown).toBe(false); // profile undefined -> falls back rather than throwing
  });

  it('degrades gracefully (still grounds on the passed-in profile) when the internal account-row lookup fails', async () => {
    state.findActiveUserById.mockRejectedValue(new Error('db down'));

    const profile = makeProfileContext({ birthProfileId: null, placeOfBirth: null });

    const events = await drain(
      chatStream(
        'user-1',
        'What does my Jupiter transit mean?',
        [],
        undefined,
        undefined,
        'en',
        undefined,
        undefined,
        profile,
      ),
    );

    // A failed account-row fetch must still produce a reply, and must not
    // block grounding on the profile the caller already resolved — kundli/
    // facts are scoped from `profile` directly, independent of `user`.
    expect(events.some((e) => (e as { type: string }).type === 'token')).toBe(true);
    expect(state.getKundliForUser).toHaveBeenCalledWith('user-1', null);
    expect(state.getUserFacts).toHaveBeenCalledWith('user-1', null);
  });
});
