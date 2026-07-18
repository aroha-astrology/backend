import { beforeEach, describe, expect, it, vi } from 'vitest';

// Coverage for chatStream's multi-profile wiring (astro.service.ts): kundli
// and user-facts must be fetched for the CURRENTLY ACTIVE profile (resolved
// BEFORE those fetches, since both depend on profile.birthProfileId), and
// birthTimeUnknown / the gender fact in extraFacts must come from the
// resolved profile, not unconditionally from the account (`user`) row.
// Everything below `place`/panchang/relocation is left with no place of
// birth so those best-effort paths short-circuit to `[]` and stay out of
// scope for this test (they're not part of this task).

const state = vi.hoisted(() => ({
  findActiveUserById: vi.fn(),
  resolveActiveProfileContext: vi.fn(),
  getKundliForUser: vi.fn(),
  withLiveSadeSati: vi.fn(),
  getUserFacts: vi.fn(),
  saveUserFacts: vi.fn(),
  getBirthProfile: vi.fn(),
  checkTopicGate: vi.fn(),
  scholarStream: vi.fn(),
  compactHistory: vi.fn(),
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  findActiveUserById: state.findActiveUserById,
}));

vi.mock('../src/modules/birth-profiles/profile-context.js', () => ({
  resolveActiveProfileContext: state.resolveActiveProfileContext,
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
  state.resolveActiveProfileContext.mockReset();
  state.getKundliForUser.mockReset().mockResolvedValue(undefined);
  state.withLiveSadeSati.mockReset().mockImplementation((d: unknown) => Promise.resolve(d));
  state.getUserFacts.mockReset().mockResolvedValue([]);
  state.saveUserFacts.mockReset().mockResolvedValue(undefined);
  state.getBirthProfile.mockReset();
  state.checkTopicGate.mockReset().mockResolvedValue({ related: true });
  state.compactHistory
    .mockReset()
    .mockResolvedValue({ recentHistory: [], summary: '', changed: false, facts: [] });
  state.scholarStream.mockReset().mockImplementation(function* () {
    yield 'A short reply about your chart.';
  });
});

describe('chatStream — profile resolution happens before kundli/facts fetch', () => {
  it('defaults to the primary/self profile (birthProfileId: null) when none is active', async () => {
    const user = makeUserRow({
      id: 'user-1',
      activeProfileId: null,
      gender: 'male',
      relationshipStatus: 'single',
      interestAreas: ['career'],
      birthTimeAccuracy: 'exact',
    });
    state.findActiveUserById.mockResolvedValue(user);
    state.resolveActiveProfileContext.mockResolvedValue(
      makeProfileContext({
        birthProfileId: null,
        gender: 'male',
        birthTimeAccuracy: 'exact',
        placeOfBirth: null,
      }),
    );
    state.getUserFacts.mockResolvedValue(['likes hiking']);

    const events = await drain(
      chatStream(
        'user-1',
        'What does my Jupiter transit mean for my career?',
        [],
        undefined,
        'direct',
        undefined,
        'en',
        undefined,
      ),
    );

    expect(events.some((e) => (e as { type: string }).type === 'token')).toBe(true);
    expect(state.resolveActiveProfileContext).toHaveBeenCalledWith(user);
    expect(state.getKundliForUser).toHaveBeenCalledWith('user-1', null);
    expect(state.getUserFacts).toHaveBeenCalledWith('user-1', null);

    const call = state.scholarStream.mock.calls[0] as any[];
    const [, , , birthTimeUnknown, , , , userFacts, extraFacts] = call;
    expect(birthTimeUnknown).toBe(false);
    expect(userFacts).toEqual(['likes hiking']);
    expect(extraFacts).toContain("User's gender: male");
  });

  it('grounds on the ACTIVE ADDITIONAL profile: kundli/facts scoped to it, gender pulled from the profile (not the account), birthTimeUnknown driven by the profile', async () => {
    const user = makeUserRow({
      id: 'user-1',
      activeProfileId: 'profile-a',
      gender: 'male', // account-level — must NOT leak into the gender fact below
      relationshipStatus: 'married',
      interestAreas: [],
      birthTimeAccuracy: 'exact', // account-level — must NOT drive birthTimeUnknown below
    });
    state.findActiveUserById.mockResolvedValue(user);
    state.resolveActiveProfileContext.mockResolvedValue(
      makeProfileContext({
        birthProfileId: 'profile-a',
        gender: 'female', // the child's OWN gender
        birthTimeAccuracy: 'unknown', // the child's OWN (unknown) birth-time accuracy
        placeOfBirth: null,
      }),
    );
    state.getUserFacts.mockResolvedValue(['loves painting']);
    state.compactHistory.mockResolvedValue({
      recentHistory: [],
      summary: '',
      changed: false,
      facts: ['new durable fact'],
    });

    await drain(
      chatStream(
        'user-1',
        'What does my daughter’s chart say about her creativity?',
        [],
        undefined,
        'direct',
        undefined,
        'en',
        undefined,
      ),
    );

    expect(state.getKundliForUser).toHaveBeenCalledWith('user-1', 'profile-a');
    expect(state.getUserFacts).toHaveBeenCalledWith('user-1', 'profile-a');
    // saveUserFacts must be tagged with the ACTIVE profile too, not the account.
    expect(state.saveUserFacts).toHaveBeenCalledWith('user-1', 'profile-a', ['new durable fact']);

    const call = state.scholarStream.mock.calls[0] as any[];
    const [, , , birthTimeUnknown, , , , userFacts, extraFacts] = call;
    expect(birthTimeUnknown).toBe(true); // from the profile, not the account's 'exact'
    expect(userFacts).toEqual(['loves painting']);
    expect(extraFacts).toContain("User's gender: female");
    expect(extraFacts).not.toContain("User's gender: male");
    // relationshipStatus has no per-profile equivalent — still sourced from the account.
    expect((extraFacts as string[]).some((f) => f.includes('married'))).toBe(true);
  });

  it('degrades gracefully (no profile-specific grounding, primary-profile scoping) when the user lookup fails', async () => {
    state.findActiveUserById.mockRejectedValue(new Error('db down'));

    const events = await drain(
      chatStream(
        'user-1',
        'What does my Jupiter transit mean?',
        [],
        undefined,
        'direct',
        undefined,
        'en',
        undefined,
      ),
    );

    expect(events.some((e) => (e as { type: string }).type === 'token')).toBe(true);
    expect(state.resolveActiveProfileContext).not.toHaveBeenCalled();
    expect(state.getKundliForUser).toHaveBeenCalledWith('user-1', null);
    expect(state.getUserFacts).toHaveBeenCalledWith('user-1', null);
  });
});
