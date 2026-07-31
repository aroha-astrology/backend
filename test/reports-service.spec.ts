import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReportRow, UserRow } from '../src/db/schema.js';
import type * as ReportGeneratorTypesModule from '../src/modules/reports/report-generator.types.js';
import type * as WindowSummaryModule from '../src/lib/llm/reports/window-summary.js';
import type { ReportGenerator } from '../src/modules/reports/report-generator.types.js';

// Prevent the REAL kundli-milan generator (and its real astro-engine/LLM calls) from
// self-registering — these tests control REPORT_GENERATORS directly so they can exercise
// both "a generator is registered and behaves in a controlled way" and "no generator is
// registered for this key" (the documented safety net for the 9 not-yet-built report types).
vi.mock('../src/modules/reports/generators/index.js', () => ({}));

const state = vi.hoisted(() => {
  const REPORT_GENERATORS: Record<string, ReportGenerator> = {};
  return {
    claimReportRow: vi.fn(),
    findReportRow: vi.fn(),
    findReportById: vi.fn(),
    findStaleGeneratingReports: vi.fn(),
    listReportsForUser: vi.fn(),
    markReportReady: vi.fn(),
    markReportFailed: vi.fn(),
    overwriteReadyReportContent: vi.fn(),
    saveReportTranslation: vi.fn(),
    upgradePreviewToPurchased: vi.fn(),
    countReadyReportsByKey: vi.fn(),
    resolveFeaturesForUser: vi.fn(),
    deductWalletBalance: vi.fn(),
    addWalletBalance: vi.fn(),
    findActiveUserById: vi.fn(),
    findKundliByUserId: vi.fn(),
    resolveProfileContext: vi.fn(),
    computeMetrology: vi.fn(),
    findActiveTokensForUser: vi.fn(),
    sendPushBatch: vi.fn(),
    summarizeTimingWindows: vi.fn(),
    generateReportVerdict: vi.fn(),
    REPORT_GENERATORS,
  };
});

vi.mock('../src/modules/reports/reports.repo.js', () => ({
  claimReportRow: state.claimReportRow,
  findReportRow: state.findReportRow,
  findReportById: state.findReportById,
  findStaleGeneratingReports: state.findStaleGeneratingReports,
  listReportsForUser: state.listReportsForUser,
  markReportReady: state.markReportReady,
  markReportFailed: state.markReportFailed,
  overwriteReadyReportContent: state.overwriteReadyReportContent,
  saveReportTranslation: state.saveReportTranslation,
  upgradePreviewToPurchased: state.upgradePreviewToPurchased,
  countReadyReportsByKey: state.countReadyReportsByKey,
}));

vi.mock('../src/modules/device-tokens/device-tokens.repo.js', () => ({
  findActiveTokensForUser: state.findActiveTokensForUser,
}));

vi.mock('../src/lib/notifications/fcm.js', () => ({
  sendPushBatch: state.sendPushBatch,
}));

vi.mock('../src/modules/features/features.service.js', () => ({
  resolveFeaturesForUser: state.resolveFeaturesForUser,
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  deductWalletBalance: state.deductWalletBalance,
  addWalletBalance: state.addWalletBalance,
  findActiveUserById: state.findActiveUserById,
}));

vi.mock('../src/modules/kundli/kundli.repo.js', () => ({
  findKundliByUserId: state.findKundliByUserId,
}));

vi.mock('../src/modules/birth-profiles/profile-context.js', () => ({
  resolveProfileContext: state.resolveProfileContext,
}));

vi.mock('../src/lib/swarm/agents/metrologist.js', () => ({
  computeMetrology: state.computeMetrology,
}));

vi.mock('../src/lib/llm/reports/window-summary.js', async () => {
  const actual = await vi.importActual<typeof WindowSummaryModule>(
    '../src/lib/llm/reports/window-summary.js',
  );
  return {
    ...actual, // keep the real findRankedWindowsField (pure, no LLM) — only the LLM call itself is mocked
    summarizeTimingWindows: state.summarizeTimingWindows,
  };
});

// Same reasoning as window-summary.js above: computeReportVerdict calls the real
// generateReportVerdict (a live Gemini call) at generation time for every report type, not just
// the ones a given test cares about — must be mocked so unrelated tests don't hang/time out.
vi.mock('../src/lib/llm/reports/verdict.js', () => ({
  generateReportVerdict: state.generateReportVerdict,
  translateReportVerdict: vi.fn(),
}));

vi.mock('../src/modules/reports/report-generator.types.js', async () => {
  const actual = await vi.importActual<typeof ReportGeneratorTypesModule>(
    '../src/modules/reports/report-generator.types.js',
  );
  return {
    ...actual,
    REPORT_GENERATORS: state.REPORT_GENERATORS,
    registerReportGenerator: (gen: ReportGenerator) => {
      state.REPORT_GENERATORS[gen.key] = gen;
    },
  };
});

const {
  purchaseReport,
  previewReport,
  getReportCatalogueForUser,
  getReportForUser,
  getReportStats,
  notifyReportReady,
  reapStaleReports,
  regenerateReportContent,
} = await import('../src/modules/reports/reports.service.js');

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return { id: 'user-1', ...overrides } as unknown as UserRow;
}

function makeReportRow(overrides: Partial<ReportRow> = {}): ReportRow {
  const now = new Date('2026-07-01T00:00:00Z');
  return {
    id: 'report-1',
    userId: 'user-1',
    birthProfileId: null,
    reportKey: 'marriage',
    periodMonth: null,
    status: 'generating',
    content: null,
    translations: {},
    input: null,
    model: null,
    pricePaidPaise: 9900,
    isPreview: false,
    startedAt: now,
    error: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  for (const key of Object.keys(state.REPORT_GENERATORS)) delete state.REPORT_GENERATORS[key];
  state.claimReportRow.mockReset();
  state.findReportRow.mockReset();
  state.findReportById.mockReset();
  state.findStaleGeneratingReports.mockReset().mockResolvedValue([]);
  state.listReportsForUser.mockReset().mockResolvedValue([]);
  state.markReportReady.mockReset().mockResolvedValue(undefined);
  state.markReportFailed.mockReset().mockResolvedValue(undefined);
  state.saveReportTranslation.mockReset().mockResolvedValue(undefined);
  state.upgradePreviewToPurchased.mockReset().mockResolvedValue(undefined);
  state.countReadyReportsByKey.mockReset().mockResolvedValue([]);
  state.resolveFeaturesForUser.mockReset().mockResolvedValue({});
  state.deductWalletBalance.mockReset().mockResolvedValue(true);
  state.addWalletBalance.mockReset().mockResolvedValue(undefined);
  state.findKundliByUserId.mockReset().mockResolvedValue(undefined);
  state.findActiveUserById.mockReset().mockResolvedValue(makeUser());
  state.resolveProfileContext.mockReset().mockResolvedValue({ birthProfileId: null });
  state.computeMetrology.mockReset().mockResolvedValue({ chart: { planets: [] } });
  state.findActiveTokensForUser.mockReset().mockResolvedValue([]);
  state.summarizeTimingWindows.mockReset().mockResolvedValue([]);
  state.generateReportVerdict
    .mockReset()
    .mockResolvedValue({ headline: 'H', bullets: ['a', 'b', 'c'], nextStep: 'Next' });
  state.overwriteReadyReportContent.mockReset().mockResolvedValue(undefined);
  state.sendPushBatch.mockReset().mockResolvedValue({ success: 0, failure: 0 });
});

describe('purchaseReport — validation', () => {
  it('throws NOT_FOUND for an unknown report key', async () => {
    await expect(purchaseReport(makeUser(), { reportKey: 'not_real' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws FORBIDDEN (FEATURE_DISABLED) when the feature flag is off', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({
      'reports.marriage': { enabled: false, pricePaise: null },
    });
    await expect(purchaseReport(makeUser(), { reportKey: 'marriage' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'FEATURE_DISABLED',
    });
  });

  it('throws BAD_REQUEST when a monthly report has no months', async () => {
    await expect(purchaseReport(makeUser(), { reportKey: 'health_monthly' })).rejects.toMatchObject(
      {
        code: 'BAD_REQUEST',
      },
    );
  });

  it('throws BAD_REQUEST when a one-time report includes months', async () => {
    await expect(
      purchaseReport(makeUser(), { reportKey: 'marriage', months: ['2026-07'] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws BAD_REQUEST when kundli_milan has no partner', async () => {
    await expect(purchaseReport(makeUser(), { reportKey: 'kundli_milan' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('throws BAD_REQUEST when a non-partner report includes partner details', async () => {
    await expect(
      purchaseReport(makeUser(), {
        reportKey: 'marriage',
        partner: {
          dateOfBirth: '1990-01-01',
          timeOfBirth: '10:00',
          latitude: 1,
          longitude: 1,
          timezone: '5.5',
        },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws CONFLICT (INSUFFICIENT_CREDITS) when the wallet debit fails', async () => {
    state.deductWalletBalance.mockResolvedValue(false);
    await expect(purchaseReport(makeUser(), { reportKey: 'marriage' })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'INSUFFICIENT_CREDITS',
    });
    expect(state.claimReportRow).not.toHaveBeenCalled();
  });
});

describe('purchaseReport — pricing and row shape', () => {
  it('one-time report: debits basePricePaise under the one-time reason and claims a single null-period row', async () => {
    state.claimReportRow.mockResolvedValue(makeReportRow({ id: 'r1', status: 'generating' }));

    const result = await purchaseReport(makeUser(), { reportKey: 'marriage' });

    expect(state.deductWalletBalance).toHaveBeenCalledWith(
      'user-1',
      9900,
      'report_unlock:marriage',
    );
    expect(state.claimReportRow).toHaveBeenCalledTimes(1);
    expect(state.claimReportRow).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        birthProfileId: null,
        reportKey: 'marriage',
        periodMonth: null,
        input: null,
        pricePaidPaise: 9900,
      }),
    );
    expect(result.reports).toEqual([
      { id: 'r1', reportKey: 'marriage', periodMonth: null, status: 'generating' },
    ]);
  });

  it('kundli_milan: forwards partner birth details as `input` and prices as a flat one-time report', async () => {
    state.claimReportRow.mockResolvedValue(
      makeReportRow({ id: 'km1', reportKey: 'kundli_milan', input: { dateOfBirth: '1990-01-01' } }),
    );
    const partner = {
      dateOfBirth: '1990-01-01',
      timeOfBirth: '10:00',
      latitude: 1,
      longitude: 1,
      timezone: '5.5',
    };

    await purchaseReport(makeUser(), { reportKey: 'kundli_milan', partner });

    expect(state.deductWalletBalance).toHaveBeenCalledWith(
      'user-1',
      9900,
      'report_unlock:kundli_milan',
    );
    expect(state.claimReportRow).toHaveBeenCalledWith(
      expect.objectContaining({ reportKey: 'kundli_milan', input: partner, periodMonth: null }),
    );
  });

  it('monthly bundle of 3 months uses monthlyBundlePricePaise(3)=6500, split with the remainder on the first row', async () => {
    state.claimReportRow.mockImplementation(
      (c: { periodMonth: string | null; pricePaidPaise: number }) =>
        Promise.resolve(
          makeReportRow({
            id: `m-${c.periodMonth}`,
            reportKey: 'health_monthly',
            periodMonth: c.periodMonth,
            pricePaidPaise: c.pricePaidPaise,
          }),
        ),
    );

    await purchaseReport(makeUser(), {
      reportKey: 'health_monthly',
      months: ['2026-07', '2026-08', '2026-09'],
    });

    expect(state.deductWalletBalance).toHaveBeenCalledWith(
      'user-1',
      6500,
      'report_unlock:health_monthly:bundle:3',
    );
    const calls = state.claimReportRow.mock.calls.map(
      (c) => c[0] as { periodMonth: string | null; pricePaidPaise: number },
    );
    expect(calls.map((c) => c.periodMonth)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01']);
    expect(calls.map((c) => c.pricePaidPaise)).toEqual([2168, 2166, 2166]);
    expect(calls.reduce((sum, c) => sum + c.pricePaidPaise, 0)).toBe(6500);
  });

  it('a single-month monthly purchase uses the plain YYYY-MM reason suffix, not :bundle:1', async () => {
    state.claimReportRow.mockResolvedValue(
      makeReportRow({
        id: 'm1',
        reportKey: 'health_monthly',
        periodMonth: '2026-07-01',
        pricePaidPaise: 2500,
      }),
    );

    await purchaseReport(makeUser(), { reportKey: 'health_monthly', months: ['2026-07'] });

    expect(state.deductWalletBalance).toHaveBeenCalledWith(
      'user-1',
      2500,
      'report_unlock:health_monthly:2026-07',
    );
  });

  it('scales the whole monthly bundle ladder proportionally when the admin has overridden the per-month price', async () => {
    // Admin doubled the per-month price (2500 -> 5000): ratio 2x, so the 3-month bundle
    // (normally 6500) should cost exactly double (13000), preserving the discount curve.
    state.resolveFeaturesForUser.mockResolvedValue({
      'reports.health_monthly': { enabled: true, pricePaise: 5000 },
    });
    state.claimReportRow.mockImplementation(
      (c: { periodMonth: string | null; pricePaidPaise: number }) =>
        Promise.resolve(
          makeReportRow({
            id: `m-${c.periodMonth}`,
            periodMonth: c.periodMonth,
            pricePaidPaise: c.pricePaidPaise,
          }),
        ),
    );

    await purchaseReport(makeUser(), {
      reportKey: 'health_monthly',
      months: ['2026-07', '2026-08', '2026-09'],
    });

    const total = state.claimReportRow.mock.calls.reduce(
      (sum, c) => sum + (c[0] as { pricePaidPaise: number }).pricePaidPaise,
      0,
    );
    expect(total).toBe(13000);
  });
});

describe('purchaseReport — duplicate purchase reuse and refunds', () => {
  it('reuses an existing row and refunds its share when claimReportRow signals a duplicate (undefined)', async () => {
    state.claimReportRow.mockResolvedValue(undefined);
    state.findReportRow.mockResolvedValue(
      makeReportRow({ id: 'existing-1', status: 'ready', periodMonth: null }),
    );

    const result = await purchaseReport(makeUser(), { reportKey: 'marriage' });

    expect(state.addWalletBalance).toHaveBeenCalledWith(
      'user-1',
      9900,
      'refund:report_unlock:marriage',
    );
    expect(result.reports).toEqual([
      { id: 'existing-1', reportKey: 'marriage', periodMonth: null, status: 'ready' },
    ]);
  });

  it('refunds the full charge when claimReportRow throws before any row succeeds', async () => {
    state.claimReportRow.mockRejectedValue(new Error('db down'));

    await expect(purchaseReport(makeUser(), { reportKey: 'marriage' })).rejects.toThrow('db down');
    expect(state.addWalletBalance).toHaveBeenCalledWith(
      'user-1',
      9900,
      'refund:report_unlock:marriage',
    );
  });

  it('refunds only the unprocessed rows when claimReportRow throws partway through a multi-month bundle', async () => {
    state.claimReportRow
      .mockResolvedValueOnce(
        makeReportRow({ id: 'm1', periodMonth: '2026-07-01', pricePaidPaise: 2168 }),
      )
      .mockRejectedValueOnce(new Error('db blip'));

    await expect(
      purchaseReport(makeUser(), {
        reportKey: 'health_monthly',
        months: ['2026-07', '2026-08', '2026-09'],
      }),
    ).rejects.toThrow('db blip');

    // Rows 2 and 3 (2166 + 2166 = 4332) never got claimed — row 1 (2168) already succeeded and
    // fired generation, so it must NOT be refunded here.
    expect(state.addWalletBalance).toHaveBeenCalledWith(
      'user-1',
      4332,
      'refund:report_unlock:health_monthly:bundle:3',
    );
  });
});

describe('purchaseReport — preview-to-purchase upgrade (the two collision paths)', () => {
  // Path 1: the preview is still 'generating' and non-stale — claimReportRow's own
  // onConflictDoUpdate (setWhere) reclaims the row directly (the real DB flips isPreview to
  // false via the `set` clause claimReportRow always writes — see reports-repo.spec.ts for that
  // coverage). No extra purchaseReport code runs for this path: it's the ordinary `if (claimed)`
  // branch, exactly like a fresh purchase. This test proves purchaseReport asks for isPreview:
  // false on every claim (so a real DB reclaim would correctly flip the flag) and does NOT
  // refund or call upgradePreviewToPurchased when the claim succeeds.
  it('generating-preview reclaimed directly: claims with isPreview:false and the real price, no refund, no upgrade call', async () => {
    // A real generator + ready chart so the background generation this fires actually succeeds
    // instead of racing a "no generator registered" refund against the assertions below.
    state.REPORT_GENERATORS.marriage = {
      key: 'marriage',
      computeScores: vi.fn().mockReturnValue({}),
      generateNarrative: vi.fn().mockResolvedValue([{ heading: 'H', paragraphs: ['p'] }]),
      translateNarrative: vi.fn(),
    };
    state.findKundliByUserId.mockResolvedValue({ status: 'ready', chartData: { planets: [] } });
    state.claimReportRow.mockResolvedValue(
      makeReportRow({
        id: 'preview-1',
        status: 'generating',
        isPreview: false,
        pricePaidPaise: 9900,
      }),
    );

    const result = await purchaseReport(makeUser(), { reportKey: 'marriage' });

    expect(state.claimReportRow).toHaveBeenCalledWith(
      expect.objectContaining({ isPreview: false, pricePaidPaise: 9900 }),
    );
    expect(state.upgradePreviewToPurchased).not.toHaveBeenCalled();
    expect(state.addWalletBalance).not.toHaveBeenCalled();
    expect(result.reports).toEqual([
      { id: 'preview-1', reportKey: 'marriage', periodMonth: null, status: 'generating' },
    ]);

    await vi.waitFor(() => {
      expect(state.markReportReady).toHaveBeenCalled();
    });
    // The successful-generation path never touches the wallet — confirm the refund still hasn't
    // fired even after generation completes.
    expect(state.addWalletBalance).not.toHaveBeenCalled();
  });

  // Path 2: the preview already finished ('ready') — claimReportRow's setWhere can't reclaim a
  // ready row (see its "never a ready row" guard), so it returns undefined. purchaseReport must
  // then recognize (via findReportRow) that the existing row is a PREVIEW, not a genuine
  // already-purchased row: upgrade it in place (isPreview -> false, real price recorded) rather
  // than refunding — the buyer paid for and should receive this content.
  it('ready-preview upgraded in place: no refund, upgradePreviewToPurchased called with the real price, buyer gets the existing ready content instantly', async () => {
    state.claimReportRow.mockResolvedValue(undefined);
    state.findReportRow.mockResolvedValue(
      makeReportRow({
        id: 'preview-2',
        status: 'ready',
        isPreview: true,
        pricePaidPaise: 0,
        periodMonth: null,
      }),
    );

    const result = await purchaseReport(makeUser(), { reportKey: 'marriage' });

    expect(state.upgradePreviewToPurchased).toHaveBeenCalledWith('preview-2', 9900);
    expect(state.addWalletBalance).not.toHaveBeenCalled();
    expect(result.reports).toEqual([
      { id: 'preview-2', reportKey: 'marriage', periodMonth: null, status: 'ready' },
    ]);
  });

  it('a genuinely already-purchased (non-preview) row still refunds and reuses, unchanged from before', async () => {
    state.claimReportRow.mockResolvedValue(undefined);
    state.findReportRow.mockResolvedValue(
      makeReportRow({ id: 'purchased-1', status: 'ready', isPreview: false }),
    );

    const result = await purchaseReport(makeUser(), { reportKey: 'marriage' });

    expect(state.upgradePreviewToPurchased).not.toHaveBeenCalled();
    expect(state.addWalletBalance).toHaveBeenCalledWith(
      'user-1',
      9900,
      'refund:report_unlock:marriage',
    );
    expect(result.reports).toEqual([
      { id: 'purchased-1', reportKey: 'marriage', periodMonth: null, status: 'ready' },
    ]);
  });
});

describe('purchaseReport — background generation safety net', () => {
  it('marks the row failed and refunds when no generator is registered for the report key (e.g. wealth, pending a later task)', async () => {
    state.claimReportRow.mockResolvedValue(
      makeReportRow({ id: 'w1', reportKey: 'wealth', pricePaidPaise: 9900 }),
    );

    await purchaseReport(makeUser(), { reportKey: 'wealth' });

    await vi.waitFor(() => {
      expect(state.markReportFailed).toHaveBeenCalledWith(
        'w1',
        expect.any(Date),
        expect.stringContaining('No generator registered'),
      );
    });
    expect(state.addWalletBalance).toHaveBeenCalledWith(
      'user-1',
      9900,
      'refund:report_unlock:wealth',
    );
  });

  it('marks the row failed and refunds when the birth chart is not ready yet', async () => {
    state.REPORT_GENERATORS.marriage = {
      key: 'marriage',
      computeScores: vi.fn().mockReturnValue({}),
      generateNarrative: vi.fn(),
      translateNarrative: vi.fn(),
    };
    state.findKundliByUserId.mockResolvedValue(undefined);
    state.claimReportRow.mockResolvedValue(makeReportRow({ id: 'm1', reportKey: 'marriage' }));

    await purchaseReport(makeUser(), { reportKey: 'marriage' });

    await vi.waitFor(() => {
      expect(state.markReportFailed).toHaveBeenCalledWith(
        'm1',
        expect.any(Date),
        'Birth chart is not ready yet',
      );
    });
    expect(state.addWalletBalance).toHaveBeenCalledWith(
      'user-1',
      9900,
      'refund:report_unlock:marriage',
    );
  });

  it('marks the row failed and refunds when the registered generator throws during narrative generation', async () => {
    state.REPORT_GENERATORS.marriage = {
      key: 'marriage',
      computeScores: vi.fn().mockReturnValue({ score: 1 }),
      generateNarrative: vi.fn().mockRejectedValue(new Error('LLM exploded')),
      translateNarrative: vi.fn(),
    };
    state.findKundliByUserId.mockResolvedValue({ status: 'ready', chartData: { planets: [] } });
    state.claimReportRow.mockResolvedValue(makeReportRow({ id: 'm2', reportKey: 'marriage' }));

    await purchaseReport(makeUser(), { reportKey: 'marriage' });

    await vi.waitFor(() => {
      expect(state.markReportFailed).toHaveBeenCalledWith('m2', expect.any(Date), 'LLM exploded');
    });
    expect(state.addWalletBalance).toHaveBeenCalledWith(
      'user-1',
      9900,
      'refund:report_unlock:marriage',
    );
  });

  it('computes the partner chart via computeMetrology and marks the row ready on success', async () => {
    const generateNarrative = vi.fn().mockResolvedValue([{ heading: 'H', paragraphs: ['p'] }]);
    state.REPORT_GENERATORS.kundli_milan = {
      key: 'kundli_milan',
      computeScores: vi.fn().mockReturnValue({ gunaMilanScore: 30 }),
      generateNarrative,
      translateNarrative: vi.fn(),
    };
    state.findKundliByUserId.mockResolvedValue({ status: 'ready', chartData: { planets: [] } });
    state.computeMetrology.mockResolvedValue({ chart: { planets: [{ planet: 'Moon' }] } });
    const partnerInput = {
      dateOfBirth: '1990-01-01',
      timeOfBirth: '10:00',
      latitude: 1,
      longitude: 1,
      timezone: '5.5',
    };
    state.claimReportRow.mockResolvedValue(
      makeReportRow({ id: 'km2', reportKey: 'kundli_milan', input: partnerInput }),
    );

    await purchaseReport(makeUser(), { reportKey: 'kundli_milan', partner: partnerInput });

    await vi.waitFor(() => {
      expect(state.markReportReady).toHaveBeenCalledWith(
        'km2',
        expect.any(Date),
        expect.objectContaining({ model: expect.any(String) }),
      );
    });
    expect(state.computeMetrology).toHaveBeenCalledWith(
      expect.objectContaining({ date: '1990-01-01', time: '10:00' }),
    );
    expect(generateNarrative).toHaveBeenCalledWith({ gunaMilanScore: 30 }, 'en');
  });

  it('summarizes timing windows once and persists them alongside sections when scores has a RankedWindow[] field', async () => {
    const window = {
      startDate: '2026-10-22T00:00:00.000Z',
      endDate: '2027-01-12T00:00:00.000Z',
      score: 1,
      level: 'LOW',
      dashaLevel: 'pratyantardasha',
      reasoning: ['Vimshottari anchor: Mercury pratyantardasha (within Saturn major period).'],
    };
    state.REPORT_GENERATORS.true_love = {
      key: 'true_love',
      computeScores: vi.fn().mockReturnValue({ romanceScore: 60, windows: [window] }),
      generateNarrative: vi.fn().mockResolvedValue([{ heading: 'H', paragraphs: ['p'] }]),
      translateNarrative: vi.fn(),
    };
    state.findKundliByUserId.mockResolvedValue({ status: 'ready', chartData: { planets: [] } });
    state.claimReportRow.mockResolvedValue(makeReportRow({ id: 'tl1', reportKey: 'true_love' }));
    state.summarizeTimingWindows.mockResolvedValue(['A window worth watching.']);

    await purchaseReport(makeUser(), { reportKey: 'true_love' });

    await vi.waitFor(() => {
      expect(state.markReportReady).toHaveBeenCalled();
    });
    expect(state.summarizeTimingWindows).toHaveBeenCalledWith([window]);
    expect(state.markReportReady).toHaveBeenCalledWith(
      'tl1',
      expect.any(Date),
      expect.objectContaining({
        content: expect.objectContaining({
          sections: [{ heading: 'H', paragraphs: ['p'] }],
          windowSummaries: { field: 'windows', summaries: ['A window worth watching.'] },
        }),
      }),
    );
  });

  it('does not call summarizeTimingWindows when scores has no timing-window field', async () => {
    state.REPORT_GENERATORS.wealth = {
      key: 'wealth',
      computeScores: vi.fn().mockReturnValue({ wealthScore: 70 }),
      generateNarrative: vi.fn().mockResolvedValue([{ heading: 'H', paragraphs: ['p'] }]),
      translateNarrative: vi.fn(),
    };
    state.findKundliByUserId.mockResolvedValue({ status: 'ready', chartData: { planets: [] } });
    state.claimReportRow.mockResolvedValue(makeReportRow({ id: 'w9', reportKey: 'wealth' }));

    await purchaseReport(makeUser(), { reportKey: 'wealth' });

    await vi.waitFor(() => {
      expect(state.markReportReady).toHaveBeenCalled();
    });
    expect(state.summarizeTimingWindows).not.toHaveBeenCalled();
  });

  it('still marks the report ready (with no window summaries) when summarizeTimingWindows fails', async () => {
    const window = {
      startDate: '2026-10-22T00:00:00.000Z',
      endDate: '2027-01-12T00:00:00.000Z',
      score: 1,
      level: 'LOW',
      dashaLevel: 'pratyantardasha',
      reasoning: ['x'],
    };
    state.REPORT_GENERATORS.true_love = {
      key: 'true_love',
      computeScores: vi.fn().mockReturnValue({ windows: [window] }),
      generateNarrative: vi.fn().mockResolvedValue([{ heading: 'H', paragraphs: ['p'] }]),
      translateNarrative: vi.fn(),
    };
    state.findKundliByUserId.mockResolvedValue({ status: 'ready', chartData: { planets: [] } });
    state.claimReportRow.mockResolvedValue(makeReportRow({ id: 'tl2', reportKey: 'true_love' }));
    state.summarizeTimingWindows.mockRejectedValue(new Error('LLM exploded'));

    await purchaseReport(makeUser(), { reportKey: 'true_love' });

    await vi.waitFor(() => {
      expect(state.markReportReady).toHaveBeenCalled();
    });
    expect(state.markReportFailed).not.toHaveBeenCalled();
    expect(state.markReportReady).toHaveBeenCalledWith(
      'tl2',
      expect.any(Date),
      expect.objectContaining({
        content: expect.objectContaining({
          windowSummaries: { field: 'windows', summaries: [] },
        }),
      }),
    );
  });

  it('fires notifyReportReady (push) after marking the row ready, without affecting the ready outcome', async () => {
    state.REPORT_GENERATORS.marriage = {
      key: 'marriage',
      computeScores: vi.fn().mockReturnValue({}),
      generateNarrative: vi.fn().mockResolvedValue([{ heading: 'H', paragraphs: ['p'] }]),
      translateNarrative: vi.fn(),
    };
    state.findKundliByUserId.mockResolvedValue({ status: 'ready', chartData: { planets: [] } });
    state.claimReportRow.mockResolvedValue(makeReportRow({ id: 'm3', reportKey: 'marriage' }));
    state.findActiveTokensForUser.mockResolvedValue([{ token: 'tok-1' }]);

    await purchaseReport(makeUser(), { reportKey: 'marriage' });

    await vi.waitFor(() => {
      expect(state.sendPushBatch).toHaveBeenCalledWith(
        ['tok-1'],
        '🔮 Your Marriage Report is ready',
        'Tap to read your report now.',
        { type: 'report_ready', navigate: '/reports/m3' },
      );
    });
    expect(state.markReportReady).toHaveBeenCalled();
  });
});

describe('notifyReportReady', () => {
  it('sends a push using the catalogue label and reportId-based deep link', async () => {
    state.findActiveTokensForUser.mockResolvedValue([{ token: 'tok-a' }, { token: 'tok-b' }]);

    await notifyReportReady('user-1', 'wealth', 'report-9');

    expect(state.findActiveTokensForUser).toHaveBeenCalledWith('user-1');
    expect(state.sendPushBatch).toHaveBeenCalledWith(
      ['tok-a', 'tok-b'],
      '🔮 Your Wealth Report is ready',
      'Tap to read your report now.',
      { type: 'report_ready', navigate: '/reports/report-9' },
    );
  });

  it('is a no-op (no push call) when the user has no active tokens', async () => {
    state.findActiveTokensForUser.mockResolvedValue([]);
    await notifyReportReady('user-1', 'wealth', 'report-9');
    expect(state.sendPushBatch).not.toHaveBeenCalled();
  });

  it('never throws — a lookup failure resolves normally', async () => {
    state.findActiveTokensForUser.mockRejectedValue(new Error('db down'));
    await expect(notifyReportReady('user-1', 'wealth', 'report-9')).resolves.toBeUndefined();
    expect(state.sendPushBatch).not.toHaveBeenCalled();
  });

  it('never throws — a push-send failure resolves normally', async () => {
    state.findActiveTokensForUser.mockResolvedValue([{ token: 'tok-a' }]);
    state.sendPushBatch.mockRejectedValue(new Error('fcm down'));
    await expect(notifyReportReady('user-1', 'wealth', 'report-9')).resolves.toBeUndefined();
  });
});

describe('reapStaleReports', () => {
  it('marks each stale row failed (timed-out reason) and refunds its price share, returning the reaped count', async () => {
    const staleAt = new Date('2026-07-01T00:00:00Z');
    state.findStaleGeneratingReports.mockResolvedValue([
      makeReportRow({
        id: 's1',
        reportKey: 'marriage',
        periodMonth: null,
        pricePaidPaise: 9900,
        startedAt: staleAt,
      }),
      makeReportRow({
        id: 's2',
        reportKey: 'health_monthly',
        periodMonth: '2026-07-01',
        pricePaidPaise: 2500,
        startedAt: staleAt,
      }),
    ]);

    const result = await reapStaleReports();

    expect(result).toEqual({ reaped: 2 });
    expect(state.markReportFailed).toHaveBeenCalledWith(
      's1',
      staleAt,
      'Generation timed out (stale)',
    );
    expect(state.markReportFailed).toHaveBeenCalledWith(
      's2',
      staleAt,
      'Generation timed out (stale)',
    );
    expect(state.addWalletBalance).toHaveBeenCalledWith(
      'user-1',
      9900,
      'refund:report_unlock:marriage',
    );
    expect(state.addWalletBalance).toHaveBeenCalledWith(
      'user-1',
      2500,
      'refund:report_unlock:health_monthly:2026-07',
    );
  });

  it('returns { reaped: 0 } and touches nothing when there are no stale rows', async () => {
    state.findStaleGeneratingReports.mockResolvedValue([]);
    const result = await reapStaleReports();
    expect(result).toEqual({ reaped: 0 });
    expect(state.markReportFailed).not.toHaveBeenCalled();
    expect(state.addWalletBalance).not.toHaveBeenCalled();
  });

  it('never throws — logs and continues past a per-row failure, still reaping the rest', async () => {
    const staleAt = new Date('2026-07-01T00:00:00Z');
    state.findStaleGeneratingReports.mockResolvedValue([
      makeReportRow({ id: 'bad', reportKey: 'marriage', startedAt: staleAt }),
      makeReportRow({ id: 'good', reportKey: 'marriage', startedAt: staleAt }),
    ]);
    state.markReportFailed
      .mockRejectedValueOnce(new Error('db blip'))
      .mockResolvedValueOnce(undefined);

    await expect(reapStaleReports()).resolves.toEqual({ reaped: 1 });
  });

  it('still counts a row as reaped when markReportFailed succeeds but the refund itself fails', async () => {
    const staleAt = new Date('2026-07-01T00:00:00Z');
    state.findStaleGeneratingReports.mockResolvedValue([
      makeReportRow({ id: 's1', reportKey: 'marriage', startedAt: staleAt }),
    ]);
    state.addWalletBalance.mockRejectedValue(new Error('wallet down'));

    await expect(reapStaleReports()).resolves.toEqual({ reaped: 1 });
  });

  it('skips a stale row with no startedAt rather than crashing (defensive only — should not occur in practice)', async () => {
    state.findStaleGeneratingReports.mockResolvedValue([
      makeReportRow({ id: 'no-claim', reportKey: 'marriage', startedAt: null }),
    ]);

    await expect(reapStaleReports()).resolves.toEqual({ reaped: 0 });
    expect(state.markReportFailed).not.toHaveBeenCalled();
  });
});

describe('getReportCatalogueForUser', () => {
  it("merges the catalogue with resolved feature pricing and the user's own purchases", async () => {
    state.resolveFeaturesForUser.mockResolvedValue({
      'reports.marriage': { enabled: true, pricePaise: 12000 },
    });
    state.listReportsForUser.mockResolvedValue([
      makeReportRow({ id: 'r1', reportKey: 'marriage', status: 'ready' }),
    ]);

    const catalogue = await getReportCatalogueForUser(makeUser(), null);
    const marriage = catalogue.find((c) => c.key === 'marriage')!;
    expect(marriage.pricePaise).toBe(12000);
    expect(marriage.purchases).toEqual([{ id: 'r1', periodMonth: null, status: 'ready' }]);

    const wealth = catalogue.find((c) => c.key === 'wealth')!;
    expect(wealth.pricePaise).toBe(9900); // falls back to basePricePaise — no override
    expect(wealth.purchases).toEqual([]);
  });

  it('surfaces originalPricePaise from the admin override when a discount is configured', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({
      'reports.marriage': { enabled: true, pricePaise: 14900, originalPricePaise: 49900 },
    });
    state.listReportsForUser.mockResolvedValue([]);

    const catalogue = await getReportCatalogueForUser(makeUser(), null);
    const marriage = catalogue.find((c) => c.key === 'marriage')!;

    expect(marriage.pricePaise).toBe(14900);
    expect(marriage.originalPricePaise).toBe(49900);
  });

  it('resolves originalPricePaise to null (never falling back to basePricePaise) when no discount is configured', async () => {
    state.resolveFeaturesForUser.mockResolvedValue({
      'reports.marriage': { enabled: true, pricePaise: 9900 },
    });
    state.listReportsForUser.mockResolvedValue([]);

    const catalogue = await getReportCatalogueForUser(makeUser(), null);
    const marriage = catalogue.find((c) => c.key === 'marriage')!;
    // No resolved feature entry at all for 'wealth' — must still be null, not def.basePricePaise.
    const wealth = catalogue.find((c) => c.key === 'wealth')!;

    expect(marriage.originalPricePaise).toBeNull();
    expect(wealth.originalPricePaise).toBeNull();
  });
});

describe('getReportForUser', () => {
  it('throws NOT_FOUND when the row does not exist', async () => {
    state.findReportById.mockResolvedValue(undefined);
    await expect(getReportForUser('missing', 'user-1', 'en')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND (not FORBIDDEN) when the row belongs to a different user — avoids leaking existence', async () => {
    state.findReportById.mockResolvedValue(makeReportRow({ userId: 'someone-else' }));
    await expect(getReportForUser('report-1', 'user-1', 'en')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('returns {status: generating} without touching chart/generator lookups', async () => {
    state.findReportById.mockResolvedValue(makeReportRow({ status: 'generating' }));
    const dto = await getReportForUser('report-1', 'user-1', 'en');
    expect(dto).toEqual({ status: 'generating' });
    expect(state.findKundliByUserId).not.toHaveBeenCalled();
  });

  it('returns {status: failed, error} for a failed row', async () => {
    state.findReportById.mockResolvedValue(makeReportRow({ status: 'failed', error: 'boom' }));
    const dto = await getReportForUser('report-1', 'user-1', 'en');
    expect(dto).toEqual({
      status: 'failed',
      error: 'Report generation failed. Any amount charged has been automatically refunded.',
    });
  });

  it('returns ready English sections merged with freshly recomputed scores', async () => {
    state.REPORT_GENERATORS.marriage = {
      key: 'marriage',
      computeScores: vi.fn().mockReturnValue({ fresh: true }),
      generateNarrative: vi.fn(),
      translateNarrative: vi.fn(),
    };
    state.findKundliByUserId.mockResolvedValue({ chartData: { planets: [] } });
    state.findReportById.mockResolvedValue(
      makeReportRow({
        status: 'ready',
        content: { sections: [{ heading: 'H', paragraphs: ['p'] }] },
      }),
    );

    const dto = await getReportForUser('report-1', 'user-1', 'en');
    expect(dto).toMatchObject({
      status: 'ready',
      scores: { fresh: true },
      sections: [{ heading: 'H', paragraphs: ['p'] }],
    });
  });

  it('splices persisted window summaries onto freshly recomputed scores by position', async () => {
    const window = {
      startDate: '2026-10-22T00:00:00.000Z',
      endDate: '2027-01-12T00:00:00.000Z',
      score: 1,
      level: 'LOW',
      dashaLevel: 'pratyantardasha',
      reasoning: ['Vimshottari anchor: Mercury pratyantardasha (within Saturn major period).'],
    };
    state.REPORT_GENERATORS.true_love = {
      key: 'true_love',
      computeScores: vi.fn().mockReturnValue({ windows: [window] }),
      generateNarrative: vi.fn(),
      translateNarrative: vi.fn(),
    };
    state.findKundliByUserId.mockResolvedValue({ chartData: { planets: [] } });
    state.findReportById.mockResolvedValue(
      makeReportRow({
        reportKey: 'true_love',
        status: 'ready',
        content: {
          sections: [{ heading: 'H', paragraphs: ['p'] }],
          windowSummaries: { field: 'windows', summaries: ['A window worth watching.'] },
        },
      }),
    );

    const dto = await getReportForUser('report-1', 'user-1', 'en');

    expect(dto).toMatchObject({
      status: 'ready',
      scores: { windows: [{ ...window, summary: 'A window worth watching.' }] },
    });
  });

  it('leaves scores.windows[i].summary undefined when the row has no persisted window summaries (pre-feature report)', async () => {
    const window = {
      startDate: '2026-10-22T00:00:00.000Z',
      endDate: '2027-01-12T00:00:00.000Z',
      score: 1,
      level: 'LOW',
      dashaLevel: 'pratyantardasha',
      reasoning: ['x'],
    };
    state.REPORT_GENERATORS.true_love = {
      key: 'true_love',
      computeScores: vi.fn().mockReturnValue({ windows: [window] }),
      generateNarrative: vi.fn(),
      translateNarrative: vi.fn(),
    };
    state.findKundliByUserId.mockResolvedValue({ chartData: { planets: [] } });
    state.findReportById.mockResolvedValue(
      makeReportRow({
        reportKey: 'true_love',
        status: 'ready',
        content: { sections: [{ heading: 'H', paragraphs: ['p'] }] },
      }),
    );

    const dto = await getReportForUser('report-1', 'user-1', 'en');

    expect(
      (dto as unknown as { scores: { windows: Array<{ summary?: string }> } }).scores.windows[0]
        .summary,
    ).toBeUndefined();
  });

  it('surfaces isPreview:true from the row so the client knows to blur/paywall it', async () => {
    state.REPORT_GENERATORS.marriage = {
      key: 'marriage',
      computeScores: vi.fn().mockReturnValue({}),
      generateNarrative: vi.fn(),
      translateNarrative: vi.fn(),
    };
    state.findKundliByUserId.mockResolvedValue({ chartData: {} });
    state.findReportById.mockResolvedValue(
      makeReportRow({
        status: 'ready',
        isPreview: true,
        content: { sections: [{ heading: 'H', paragraphs: ['p'] }] },
      }),
    );

    const dto = await getReportForUser('report-1', 'user-1', 'en');
    expect(dto).toMatchObject({ status: 'ready', isPreview: true });
  });

  it('surfaces isPreview:false for a genuinely purchased row', async () => {
    state.REPORT_GENERATORS.marriage = {
      key: 'marriage',
      computeScores: vi.fn().mockReturnValue({}),
      generateNarrative: vi.fn(),
      translateNarrative: vi.fn(),
    };
    state.findKundliByUserId.mockResolvedValue({ chartData: {} });
    state.findReportById.mockResolvedValue(
      makeReportRow({
        status: 'ready',
        isPreview: false,
        content: { sections: [{ heading: 'H', paragraphs: ['p'] }] },
      }),
    );

    const dto = await getReportForUser('report-1', 'user-1', 'en');
    expect(dto).toMatchObject({ status: 'ready', isPreview: false });
  });

  it('uses a cached translation without calling translateNarrative again', async () => {
    const translateNarrative = vi.fn();
    state.REPORT_GENERATORS.marriage = {
      key: 'marriage',
      computeScores: vi.fn().mockReturnValue({}),
      generateNarrative: vi.fn(),
      translateNarrative,
    };
    state.findKundliByUserId.mockResolvedValue({ chartData: {} });
    state.findReportById.mockResolvedValue(
      makeReportRow({
        status: 'ready',
        content: { sections: [{ heading: 'H', paragraphs: ['p'] }] },
        translations: { hi: { sections: [{ heading: 'हिंदी', paragraphs: ['पैरा'] }] } },
      }),
    );

    const dto = await getReportForUser('report-1', 'user-1', 'hi');
    expect(dto).toMatchObject({ sections: [{ heading: 'हिंदी', paragraphs: ['पैरा'] }] });
    expect(translateNarrative).not.toHaveBeenCalled();
  });

  it('translates and persists on first request for a new language', async () => {
    const translateNarrative = vi
      .fn()
      .mockResolvedValue([{ heading: 'हिंदी', paragraphs: ['पैरा'] }]);
    state.REPORT_GENERATORS.marriage = {
      key: 'marriage',
      computeScores: vi.fn().mockReturnValue({}),
      generateNarrative: vi.fn(),
      translateNarrative,
    };
    state.findKundliByUserId.mockResolvedValue({ chartData: {} });
    state.findReportById.mockResolvedValue(
      makeReportRow({
        status: 'ready',
        content: { sections: [{ heading: 'H', paragraphs: ['p'] }] },
      }),
    );

    const dto = await getReportForUser('report-1', 'user-1', 'hi');
    expect(translateNarrative).toHaveBeenCalledWith([{ heading: 'H', paragraphs: ['p'] }], 'hi');
    expect(state.saveReportTranslation).toHaveBeenCalledWith('report-1', 'hi', {
      sections: [{ heading: 'हिंदी', paragraphs: ['पैरा'] }],
    });
    expect(dto).toMatchObject({ sections: [{ heading: 'हिंदी', paragraphs: ['पैरा'] }] });
  });

  it('falls back to the English narrative when translation fails', async () => {
    const translateNarrative = vi.fn().mockRejectedValue(new Error('translate failed'));
    state.REPORT_GENERATORS.marriage = {
      key: 'marriage',
      computeScores: vi.fn().mockReturnValue({}),
      generateNarrative: vi.fn(),
      translateNarrative,
    };
    state.findKundliByUserId.mockResolvedValue({ chartData: {} });
    state.findReportById.mockResolvedValue(
      makeReportRow({
        status: 'ready',
        content: { sections: [{ heading: 'H', paragraphs: ['p'] }] },
      }),
    );

    const dto = await getReportForUser('report-1', 'user-1', 'hi');
    expect(dto).toMatchObject({ sections: [{ heading: 'H', paragraphs: ['p'] }] });
  });
});

describe('previewReport', () => {
  it('throws NOT_FOUND for an unknown report key', async () => {
    await expect(previewReport(makeUser(), { reportKey: 'not_real' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(state.claimReportRow).not.toHaveBeenCalled();
  });

  it('throws BAD_REQUEST for kundli_milan — no partner data exists yet at preview time', async () => {
    await expect(previewReport(makeUser(), { reportKey: 'kundli_milan' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(state.claimReportRow).not.toHaveBeenCalled();
  });

  it('throws BAD_REQUEST for match_report — the other partner-required report', async () => {
    await expect(previewReport(makeUser(), { reportKey: 'match_report' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(state.claimReportRow).not.toHaveBeenCalled();
  });

  it('claims a free (pricePaidPaise: 0) preview row — one-time shape, isPreview:true, no partner input — and fires generation', async () => {
    state.claimReportRow.mockResolvedValue(
      makeReportRow({ id: 'p1', reportKey: 'marriage', isPreview: true, pricePaidPaise: 0 }),
    );
    state.REPORT_GENERATORS.marriage = {
      key: 'marriage',
      computeScores: vi.fn().mockReturnValue({}),
      generateNarrative: vi.fn().mockResolvedValue([{ heading: 'H', paragraphs: ['p'] }]),
      translateNarrative: vi.fn(),
    };
    state.findKundliByUserId.mockResolvedValue({ status: 'ready', chartData: { planets: [] } });

    const result = await previewReport(makeUser(), { reportKey: 'marriage' });

    expect(state.claimReportRow).toHaveBeenCalledWith({
      userId: 'user-1',
      birthProfileId: null,
      reportKey: 'marriage',
      periodMonth: null,
      input: null,
      pricePaidPaise: 0,
      isPreview: true,
    });
    expect(result).toEqual({ id: 'p1', reportKey: 'marriage', status: 'generating' });

    // No wallet debit at all for a preview.
    expect(state.deductWalletBalance).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(state.markReportReady).toHaveBeenCalled();
    });
  });

  it('is idempotent: when claimReportRow signals a duplicate (undefined), looks up the existing row via findReportRow and returns its current state instead of erroring', async () => {
    state.claimReportRow.mockResolvedValue(undefined);
    state.findReportRow.mockResolvedValue(
      makeReportRow({ id: 'p1', reportKey: 'marriage', status: 'ready', isPreview: true }),
    );

    const result = await previewReport(makeUser(), { reportKey: 'marriage' });

    expect(result).toEqual({ id: 'p1', reportKey: 'marriage', status: 'ready' });
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
    expect(state.addWalletBalance).not.toHaveBeenCalled();
  });

  it('resolves the profile via resolveProfileContext for a non-primary birthProfileId, same as purchaseReport', async () => {
    state.resolveProfileContext.mockResolvedValue({ birthProfileId: 'profile-a' });
    state.claimReportRow.mockResolvedValue(
      makeReportRow({
        id: 'p2',
        reportKey: 'wealth',
        birthProfileId: 'profile-a',
        isPreview: true,
      }),
    );

    await previewReport(makeUser(), { reportKey: 'wealth', birthProfileId: 'profile-a' });

    expect(state.resolveProfileContext).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1' }),
      'profile-a',
    );
    expect(state.claimReportRow).toHaveBeenCalledWith(
      expect.objectContaining({ birthProfileId: 'profile-a' }),
    );
  });
});

describe('getReportStats', () => {
  // The cache under test is a real module-level variable in reports.service.ts (persists across
  // `it` blocks in this file, by design — see getReportStats's doc comment). Everything here
  // therefore runs as ONE test with a clock that only ever moves forward: switching timers
  // backward between separate `it` blocks would make a stale expiresAt from an earlier test
  // look "not yet expired" relative to an earlier fake `now`, which is exactly the kind of bug
  // this cache must not have in production either.
  afterEach(() => {
    vi.useRealTimers();
  });

  it('groups ready/non-preview counts by report key, serves the cache within the TTL, and re-queries with fresh data (including an empty result) once the TTL elapses', async () => {
    vi.useFakeTimers();

    state.countReadyReportsByKey.mockResolvedValue([
      { reportKey: 'marriage', count: 12 },
      { reportKey: 'wealth', count: 3 },
    ]);

    const first = await getReportStats();
    expect(first).toEqual({ marriage: 12, wealth: 3 });
    expect(state.countReadyReportsByKey).toHaveBeenCalledTimes(1);

    // A second call within the TTL must be served from cache, not hit the DB again — even if
    // the underlying data "changed" (simulated here by a different mock resolution the cached
    // call must NOT observe).
    state.countReadyReportsByKey.mockResolvedValue([{ reportKey: 'marriage', count: 999 }]);
    const second = await getReportStats();
    expect(second).toEqual({ marriage: 12, wealth: 3 });
    expect(state.countReadyReportsByKey).toHaveBeenCalledTimes(1);

    // Once the ~5-minute TTL window has elapsed, the next call must re-query and pick up the
    // now-current data instead of continuing to serve the stale cached object forever.
    vi.advanceTimersByTime(5 * 60_000 + 1);
    const third = await getReportStats();
    expect(third).toEqual({ marriage: 999 });
    expect(state.countReadyReportsByKey).toHaveBeenCalledTimes(2);

    // A further TTL elapse with no ready/non-preview reports at all must map to `{}`, not throw
    // or leak the previous cached shape.
    vi.advanceTimersByTime(5 * 60_000 + 1);
    state.countReadyReportsByKey.mockResolvedValue([]);
    const fourth = await getReportStats();
    expect(fourth).toEqual({});
    expect(state.countReadyReportsByKey).toHaveBeenCalledTimes(3);
  });
});

describe('regenerateReportContent — bulk admin refresh of an already-purchased report', () => {
  it('recomputes scores/narrative/window-summaries and overwrites content via overwriteReadyReportContent, never touching price/purchase fields', async () => {
    const generateNarrative = vi.fn().mockResolvedValue([{ heading: 'H', paragraphs: ['p'] }]);
    state.REPORT_GENERATORS.marriage = {
      key: 'marriage',
      computeScores: vi.fn().mockReturnValue({ score: 1 }),
      generateNarrative,
      translateNarrative: vi.fn(),
    };
    state.findKundliByUserId.mockResolvedValue({ status: 'ready', chartData: { planets: [] } });
    const row = makeReportRow({ id: 'r1', reportKey: 'marriage', status: 'ready' });

    const result = await regenerateReportContent(row);

    expect(result).toBe('regenerated');
    expect(generateNarrative).toHaveBeenCalledWith({ score: 1 }, 'en');
    expect(state.overwriteReadyReportContent).toHaveBeenCalledWith('r1', {
      content: {
        sections: [{ heading: 'H', paragraphs: ['p'] }],
        verdict: { headline: 'H', bullets: ['a', 'b', 'c'], nextStep: 'Next' },
      },
      model: expect.any(String),
    });
    expect(state.markReportReady).not.toHaveBeenCalled();
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
    expect(state.addWalletBalance).not.toHaveBeenCalled();
  });

  it('includes windowSummaries in the overwritten content when scores has a timing-window field', async () => {
    const window = {
      startDate: '2026-10-22T00:00:00.000Z',
      endDate: '2027-01-12T00:00:00.000Z',
      score: 1,
      level: 'LOW',
      dashaLevel: 'pratyantardasha',
      reasoning: ['x'],
    };
    state.REPORT_GENERATORS.true_love = {
      key: 'true_love',
      computeScores: vi.fn().mockReturnValue({ windows: [window] }),
      generateNarrative: vi.fn().mockResolvedValue([{ heading: 'H', paragraphs: ['p'] }]),
      translateNarrative: vi.fn(),
    };
    state.findKundliByUserId.mockResolvedValue({ status: 'ready', chartData: { planets: [] } });
    state.summarizeTimingWindows.mockResolvedValue(['A window worth watching.']);
    const row = makeReportRow({ id: 'tl1', reportKey: 'true_love', status: 'ready' });

    await regenerateReportContent(row);

    expect(state.overwriteReadyReportContent).toHaveBeenCalledWith(
      'tl1',
      expect.objectContaining({
        content: expect.objectContaining({
          windowSummaries: { field: 'windows', summaries: ['A window worth watching.'] },
        }),
      }),
    );
  });

  it('skips (no overwrite, no throw) when no generator is registered for the report key', async () => {
    const row = makeReportRow({ id: 'r2', reportKey: 'wealth', status: 'ready' });
    await expect(regenerateReportContent(row)).resolves.toBe('skipped');
    expect(state.overwriteReadyReportContent).not.toHaveBeenCalled();
  });

  it('skips (no overwrite, no throw) when the birth chart is not ready', async () => {
    state.REPORT_GENERATORS.marriage = {
      key: 'marriage',
      computeScores: vi.fn().mockReturnValue({}),
      generateNarrative: vi.fn(),
      translateNarrative: vi.fn(),
    };
    state.findKundliByUserId.mockResolvedValue(undefined);
    const row = makeReportRow({ id: 'r3', reportKey: 'marriage', status: 'ready' });

    await expect(regenerateReportContent(row)).resolves.toBe('skipped');
    expect(state.overwriteReadyReportContent).not.toHaveBeenCalled();
  });

  it('propagates a narrative-generation failure rather than overwriting with broken content', async () => {
    state.REPORT_GENERATORS.marriage = {
      key: 'marriage',
      computeScores: vi.fn().mockReturnValue({}),
      generateNarrative: vi.fn().mockRejectedValue(new Error('LLM exploded')),
      translateNarrative: vi.fn(),
    };
    state.findKundliByUserId.mockResolvedValue({ status: 'ready', chartData: { planets: [] } });
    const row = makeReportRow({ id: 'r4', reportKey: 'marriage', status: 'ready' });

    await expect(regenerateReportContent(row)).rejects.toThrow('LLM exploded');
    expect(state.overwriteReadyReportContent).not.toHaveBeenCalled();
  });
});
