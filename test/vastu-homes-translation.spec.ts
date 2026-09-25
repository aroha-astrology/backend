import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VastuHomeRow, VastuPlanRow } from '../src/db/schema.js';

// Vastu Studio phase 0: translation compares against the report's own language,
// the history list never translates, and homes are scoped to their owner.

const state = vi.hoisted(() => ({
  listPlansForUser: vi.fn(),
  findPlanForUser: vi.fn(),
  saveVastuTranslation: vi.fn(),
  translateVastuContent: vi.fn(),
  insertHome: vi.fn(),
  countHomesForUser: vi.fn(),
  findHomeForUser: vi.fn(),
  updateHomeForUser: vi.fn(),
  deleteHomeForUser: vi.fn(),
  deductWalletBalance: vi.fn(),
}));

vi.mock('../src/modules/kundli/kundli.repo.js', () => ({
  findKundliByUserId: vi.fn(),
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  deductWalletBalance: state.deductWalletBalance,
  addWalletBalance: vi.fn(),
}));

vi.mock('../src/modules/vastu/vastu.repo.js', () => ({
  insertPendingPlan: vi.fn(),
  findPlanForUser: state.findPlanForUser,
  countRecentPlansForUser: vi.fn().mockResolvedValue(0),
  markProcessing: vi.fn(),
  markDone: vi.fn(),
  markError: vi.fn(),
  saveFollowUpIfAbsent: vi.fn(),
  listPlansForUser: state.listPlansForUser,
  deletePlanForUser: vi.fn(),
  saveVastuTranslation: state.saveVastuTranslation,
  findStaleProcessingPlans: vi.fn(),
  insertHome: state.insertHome,
  listHomesForUser: vi.fn(),
  countHomesForUser: state.countHomesForUser,
  findHomeForUser: state.findHomeForUser,
  updateHomeForUser: state.updateHomeForUser,
  deleteHomeForUser: state.deleteHomeForUser,
}));

vi.mock('../src/lib/llm/vastu.js', () => ({
  generateVastuAnalysis: vi.fn(),
  generateVastuAnswer: vi.fn(),
  translateVastuContent: state.translateVastuContent,
}));

const svc = await import('../src/modules/vastu/vastu.service.js');

const now = new Date('2026-09-25T00:00:00Z');

function planRow(overrides: Partial<VastuPlanRow> = {}): VastuPlanRow {
  return {
    id: 'plan-1',
    userId: 'user-1',
    birthProfileId: null,
    homeId: null,
    ruleSetId: 'aroha-traditional-v1',
    layout: { plot: [], rooms: [], northOffsetDeg: 0 },
    roomLayout: { kitchen: ['SE'] },
    roomDetails: {},
    overallScore: 80,
    language: 'hi',
    status: 'done',
    analysis: { summaryParagraph: 'हिंदी' },
    translations: null,
    errorMessage: null,
    pricePaidPaise: 5000,
    startedAt: null,
    createdAt: now,
    completedAt: now,
    ...overrides,
  };
}

function homeRow(overrides: Partial<VastuHomeRow> = {}): VastuHomeRow {
  return {
    id: 'home-1',
    userId: 'user-1',
    birthProfileId: null,
    name: 'My Home',
    layout: { plot: [], rooms: [], northOffsetDeg: 0 },
    overallScore: 90,
    ruleSetId: 'aroha-traditional-v1',
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  for (const fn of Object.values(state)) fn.mockReset();
  state.translateVastuContent.mockResolvedValue({ summaryParagraph: 'English' });
  state.countHomesForUser.mockResolvedValue(0);
});

describe('translation', () => {
  it('does not translate a Hindi report read in Hindi', async () => {
    state.findPlanForUser.mockResolvedValue(planRow());
    const dto = await svc.getPlanForUser('plan-1', 'user-1', 'hi');
    expect(state.translateVastuContent).not.toHaveBeenCalled();
    expect(dto.analysis).toEqual({ summaryParagraph: 'हिंदी' });
    expect(dto.language).toBe('hi');
  });

  it('translates a Hindi report read in English', async () => {
    state.findPlanForUser.mockResolvedValue(planRow());
    const dto = await svc.getPlanForUser('plan-1', 'user-1', 'en');
    expect(state.translateVastuContent).toHaveBeenCalledWith({ summaryParagraph: 'हिंदी' }, 'en');
    expect(dto.analysis).toEqual({ summaryParagraph: 'English' });
  });

  it('ignores an unsupported language instead of paying for a translation', async () => {
    state.findPlanForUser.mockResolvedValue(planRow());
    await svc.getPlanForUser('plan-1', 'user-1', 'xx');
    expect(state.translateVastuContent).not.toHaveBeenCalled();
  });

  it('the history list never translates, but uses a cached translation', async () => {
    state.listPlansForUser.mockResolvedValue([
      planRow({ id: 'a' }),
      planRow({ id: 'b', translations: { en: { summaryParagraph: 'cached' } } }),
    ]);
    const plans = await svc.getPlansForUser('user-1', null, 'en');
    expect(state.translateVastuContent).not.toHaveBeenCalled();
    expect(plans[0]?.analysis).toEqual({ summaryParagraph: 'हिंदी' });
    expect(plans[1]?.analysis).toEqual({ summaryParagraph: 'cached' });
  });

  it('returns the saved layout and rule set so the editor can restore the plan', async () => {
    state.findPlanForUser.mockResolvedValue(planRow({ homeId: 'home-1' }));
    const dto = await svc.getPlanForUser('plan-1', 'user-1');
    expect(dto.layout).toEqual({ plot: [], rooms: [], northOffsetDeg: 0 });
    expect(dto.ruleSetId).toBe('aroha-traditional-v1');
    expect(dto.homeId).toBe('home-1');
  });
});

describe('homes', () => {
  it('creates a home stamped with the current rule set', async () => {
    state.insertHome.mockImplementation((row: Partial<VastuHomeRow>) =>
      Promise.resolve(homeRow(row)),
    );
    const dto = await svc.createHome('user-1', 'profile-a', {
      name: 'My Home',
      layout: { plot: [], rooms: [], northOffsetDeg: 0 },
    });
    expect(state.insertHome).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        birthProfileId: 'profile-a',
        ruleSetId: 'aroha-traditional-v1',
      }),
    );
    expect(dto.archived).toBe(false);
  });

  it('refuses a new home past the per-account limit', async () => {
    state.countHomesForUser.mockResolvedValue(svc.MAX_HOMES_PER_USER);
    await expect(
      svc.createHome('user-1', null, { name: 'X', layout: {} as never }),
    ).rejects.toThrow('HOME_LIMIT_REACHED');
    expect(state.insertHome).not.toHaveBeenCalled();
  });

  it('archiving sets archivedAt; unarchiving clears it', async () => {
    state.updateHomeForUser.mockResolvedValue(homeRow({ archivedAt: now }));
    await svc.patchHomeForUser('home-1', 'user-1', { archived: true });
    expect(state.updateHomeForUser).toHaveBeenLastCalledWith('home-1', 'user-1', {
      archivedAt: expect.any(Date),
    });
    state.updateHomeForUser.mockResolvedValue(homeRow());
    await svc.patchHomeForUser('home-1', 'user-1', { archived: false });
    expect(state.updateHomeForUser).toHaveBeenLastCalledWith('home-1', 'user-1', {
      archivedAt: null,
    });
  });

  it("404s on someone else's home", async () => {
    state.updateHomeForUser.mockResolvedValue(undefined);
    await expect(svc.patchHomeForUser('home-x', 'user-1', { name: 'Y' })).rejects.toThrow(
      'Vastu home not found',
    );
    state.findHomeForUser.mockResolvedValue(undefined);
    await expect(svc.removeHomeForUser('home-x', 'user-1')).rejects.toThrow('Vastu home not found');
    expect(state.deleteHomeForUser).not.toHaveBeenCalled();
  });

  it('a report linked to a home that is not yours is refused before charging', async () => {
    state.findHomeForUser.mockResolvedValue(undefined);
    await expect(
      svc.requestVastuAnalysis('user-1', null, {
        roomLayout: { kitchen: ['SE'] },
        roomDetails: {},
        language: 'en',
        homeId: '00000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toThrow('Vastu home not found');
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
  });
});
