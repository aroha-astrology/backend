import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VastuPlanRow } from '../src/db/schema.js';

// Coverage for Task B8 part 2: requestVastuAnalysis / askVastuQuestion must
// look up the birth chart for the resolved ACTIVE profile (birthProfileId
// passed in from the route, after resolveActiveProfileContext), not always
// the primary/self chart via a hardcoded `null` — the marker comment
// "Vastu isn't profile-aware yet" is gone from both call sites.

const state = vi.hoisted(() => ({
  findKundliByUserId: vi.fn(),
  deductWalletBalance: vi.fn(),
  addWalletBalance: vi.fn(),
  insertPendingPlan: vi.fn(),
  findPlanForUser: vi.fn(),
  countRecentPlansForUser: vi.fn(),
  markProcessing: vi.fn(),
  markDone: vi.fn(),
  markError: vi.fn(),
  saveFollowUp: vi.fn(),
  generateVastuAnalysis: vi.fn(),
  generateVastuAnswer: vi.fn(),
}));

vi.mock('../src/modules/kundli/kundli.repo.js', () => ({
  findKundliByUserId: state.findKundliByUserId,
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  deductWalletBalance: state.deductWalletBalance,
  addWalletBalance: state.addWalletBalance,
}));

vi.mock('../src/modules/vastu/vastu.repo.js', () => ({
  insertPendingPlan: state.insertPendingPlan,
  findPlanForUser: state.findPlanForUser,
  countRecentPlansForUser: state.countRecentPlansForUser,
  markProcessing: state.markProcessing,
  markDone: state.markDone,
  markError: state.markError,
  saveFollowUp: state.saveFollowUp,
  listPlansForUser: vi.fn(),
  deletePlanForUser: vi.fn(),
  saveVastuTranslation: vi.fn(),
}));

vi.mock('../src/lib/llm/vastu.js', () => ({
  generateVastuAnalysis: state.generateVastuAnalysis,
  generateVastuAnswer: state.generateVastuAnswer,
  translateVastuContent: vi.fn(),
}));

const { requestVastuAnalysis, askVastuQuestion, VASTU_COST_PAISE } =
  await import('../src/modules/vastu/vastu.service.js');

function makePlanRow(overrides: Partial<VastuPlanRow> = {}): VastuPlanRow {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'plan-1',
    userId: 'user-1',
    birthProfileId: null,
    layout: null,
    roomLayout: { kitchen: ['SE'] },
    roomDetails: {},
    overallScore: 80,
    language: 'en',
    status: 'done',
    analysis: { intro: 'ok' },
    translations: null,
    errorMessage: null,
    createdAt: now,
    completedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  state.findKundliByUserId.mockReset().mockResolvedValue(undefined);
  state.deductWalletBalance.mockReset().mockResolvedValue(true);
  state.addWalletBalance.mockReset().mockResolvedValue(undefined);
  state.insertPendingPlan.mockReset().mockResolvedValue(makePlanRow({ status: 'pending' }));
  state.findPlanForUser.mockReset();
  state.countRecentPlansForUser.mockReset().mockResolvedValue(0);
  state.markProcessing.mockReset().mockResolvedValue(undefined);
  state.markDone.mockReset().mockResolvedValue(undefined);
  state.markError.mockReset().mockResolvedValue(undefined);
  state.saveFollowUp.mockReset().mockResolvedValue(undefined);
  state.generateVastuAnalysis.mockReset().mockResolvedValue({ analysis: { intro: 'ok' } });
  state.generateVastuAnswer.mockReset().mockResolvedValue('An answer.');
});

describe('requestVastuAnalysis — birthProfileId wiring', () => {
  it('looks up the kundli for the resolved active profile (non-null birthProfileId), not the primary chart', async () => {
    await requestVastuAnalysis('user-1', 'profile-a', {
      roomLayout: { kitchen: ['SE'] },
      roomDetails: {},
      language: 'en',
    });

    expect(state.findKundliByUserId).toHaveBeenCalledWith('user-1', 'profile-a');
    expect(state.deductWalletBalance).toHaveBeenCalledWith(
      expect.any(String),
      VASTU_COST_PAISE,
      'vastu_report',
    );
  });

  it('looks up the primary chart when the active profile IS the primary (birthProfileId: null)', async () => {
    await requestVastuAnalysis('user-1', null, {
      roomLayout: { kitchen: ['SE'] },
      roomDetails: {},
      language: 'en',
    });

    expect(state.findKundliByUserId).toHaveBeenCalledWith('user-1', null);
  });
});

describe('askVastuQuestion — birthProfileId wiring', () => {
  it('looks up the kundli for the resolved active profile (non-null birthProfileId), not the primary chart', async () => {
    const row = makePlanRow();
    state.findPlanForUser.mockResolvedValueOnce(row).mockResolvedValueOnce(row);

    await askVastuQuestion('plan-1', 'user-1', 'profile-a', 'What about the kitchen?');

    expect(state.findKundliByUserId).toHaveBeenCalledWith('user-1', 'profile-a');
  });

  it('looks up the primary chart when the active profile IS the primary (birthProfileId: null)', async () => {
    const row = makePlanRow();
    state.findPlanForUser.mockResolvedValueOnce(row).mockResolvedValueOnce(row);

    await askVastuQuestion('plan-1', 'user-1', null, 'What about the kitchen?');

    expect(state.findKundliByUserId).toHaveBeenCalledWith('user-1', null);
  });
});

describe('requestVastuAnalysis — refund on failure', () => {
  it('refunds the wallet charge with a refund reason when queuing the job fails synchronously', async () => {
    state.insertPendingPlan.mockRejectedValueOnce(new Error('db insert failed'));

    await expect(
      requestVastuAnalysis('user-1', null, {
        roomLayout: { kitchen: ['SE'] },
        roomDetails: {},
        language: 'en',
      }),
    ).rejects.toThrow('db insert failed');

    expect(state.addWalletBalance).toHaveBeenCalledWith(
      expect.any(String),
      VASTU_COST_PAISE,
      'refund:vastu_report',
    );
  });

  it('refunds the wallet charge with a refund reason when the background LLM analysis fails', async () => {
    state.generateVastuAnalysis.mockRejectedValueOnce(new Error('llm failed'));

    await requestVastuAnalysis('user-1', null, {
      roomLayout: { kitchen: ['SE'] },
      roomDetails: {},
      language: 'en',
    });

    // processAnalysis runs in the background (fire-and-forget), so the refund
    // happens asynchronously after requestVastuAnalysis has already resolved.
    await vi.waitFor(() => {
      expect(state.addWalletBalance).toHaveBeenCalledWith(
        expect.any(String),
        VASTU_COST_PAISE,
        'refund:vastu_report',
      );
    });
  });
});
