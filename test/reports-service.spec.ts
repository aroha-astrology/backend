import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReportRow, UserRow } from '../src/db/schema.js';
import type * as ReportGeneratorTypesModule from '../src/modules/reports/report-generator.types.js';
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
    listReportsForUser: vi.fn(),
    markReportReady: vi.fn(),
    markReportFailed: vi.fn(),
    saveReportTranslation: vi.fn(),
    resolveFeaturesForUser: vi.fn(),
    deductWalletBalance: vi.fn(),
    addWalletBalance: vi.fn(),
    findKundliByUserId: vi.fn(),
    resolveProfileContext: vi.fn(),
    computeMetrology: vi.fn(),
    REPORT_GENERATORS,
  };
});

vi.mock('../src/modules/reports/reports.repo.js', () => ({
  claimReportRow: state.claimReportRow,
  findReportRow: state.findReportRow,
  findReportById: state.findReportById,
  listReportsForUser: state.listReportsForUser,
  markReportReady: state.markReportReady,
  markReportFailed: state.markReportFailed,
  saveReportTranslation: state.saveReportTranslation,
}));

vi.mock('../src/modules/features/features.service.js', () => ({
  resolveFeaturesForUser: state.resolveFeaturesForUser,
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  deductWalletBalance: state.deductWalletBalance,
  addWalletBalance: state.addWalletBalance,
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

const { purchaseReport, getReportCatalogueForUser, getReportForUser } =
  await import('../src/modules/reports/reports.service.js');

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
  state.listReportsForUser.mockReset().mockResolvedValue([]);
  state.markReportReady.mockReset().mockResolvedValue(undefined);
  state.markReportFailed.mockReset().mockResolvedValue(undefined);
  state.saveReportTranslation.mockReset().mockResolvedValue(undefined);
  state.resolveFeaturesForUser.mockReset().mockResolvedValue({});
  state.deductWalletBalance.mockReset().mockResolvedValue(true);
  state.addWalletBalance.mockReset().mockResolvedValue(undefined);
  state.findKundliByUserId.mockReset().mockResolvedValue(undefined);
  state.resolveProfileContext.mockReset().mockResolvedValue({ birthProfileId: null });
  state.computeMetrology.mockReset().mockResolvedValue({ chart: { planets: [] } });
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
    expect(dto).toEqual({ status: 'failed', error: 'boom' });
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
