import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core/dialect';

// Coverage for the reports feature's six-way partial-unique-index targeting
// (see the `reports` table's doc comment in src/db/schema.ts): every claim
// must target the correct one of reports_uniq_primary_onetime /
// reports_uniq_primary_monthly / reports_uniq_profile_onetime /
// reports_uniq_profile_monthly (input IS NULL) or reports_uniq_input_hash_primary /
// reports_uniq_input_hash_profile (input IS NOT NULL — kundli_milan/partner/
// answer-bearing reports, keyed on sha256(input) since they have no
// periodMonth dimension) depending on (birthProfileId, periodMonth, input)
// null-ness. Same compiled-SQL-fragment assertion technique as
// test/gemstone-repo-profile.spec.ts, since this repo has no live-Postgres
// integration tests.

const state = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return {
    db: { insert: state.insert, select: state.select, update: state.update },
    sqlClient,
  };
});

import { reports } from '../src/db/schema.js';
import {
  claimReportRow,
  countReadyReportsByKey,
  findReadyReportRows,
  findReportRow,
  findReportRowByInputHash,
  findStaleGeneratingReports,
  hashReportInput,
  markReportFailed,
  markReportReady,
  overwriteReadyReportContent,
  upgradePreviewToPurchased,
} from '../src/modules/reports/reports.repo.js';

const dialect = new PgDialect();
function compile(cond: unknown) {
  return dialect.sqlToQuery(cond as Parameters<typeof dialect.sqlToQuery>[0]);
}

interface FakeInsertChain {
  values: (v: unknown) => FakeInsertChain;
  onConflictDoUpdate?: (config: unknown) => FakeInsertChain;
  returning: () => Promise<unknown[]>;
}

function makeInsertChain(returningResult: unknown[], withConflict = true) {
  const calls: { values?: unknown; onConflictDoUpdate?: any; onConflictCalled: boolean } = {
    onConflictCalled: false,
  };
  const chain: FakeInsertChain = {
    values: vi.fn((v: unknown) => {
      calls.values = v;
      return chain;
    }),
    returning: vi.fn(() => Promise.resolve(returningResult)),
  };
  if (withConflict) {
    chain.onConflictDoUpdate = vi.fn((config: unknown) => {
      calls.onConflictDoUpdate = config;
      calls.onConflictCalled = true;
      return chain;
    });
  }
  return { chain, calls };
}

function makeSelectChain(result: unknown[]) {
  const calls: { where?: unknown; groupBy?: unknown } = {};
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return chain;
    }),
    limit: vi.fn(() => Promise.resolve(result)),
    orderBy: vi.fn(() => Promise.resolve(result)),
    groupBy: vi.fn((expr: unknown) => {
      calls.groupBy = expr;
      return Promise.resolve(result);
    }),
    // findStaleGeneratingReports awaits `.where()` directly (no `.limit()`/`.orderBy()`
    // follow-up) — same bare-`.where()` thenable-chain technique as
    // countSupportTicketsForAdmin's aggregate select in support-repo.spec.ts.
    then: (resolve: (v: unknown[]) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return { chain, calls };
}

function makeUpdateChain() {
  const calls: { set?: unknown; where?: unknown } = {};
  const chain = {
    set: vi.fn((v: unknown) => {
      calls.set = v;
      return chain;
    }),
    where: vi.fn((cond: unknown) => {
      calls.where = cond;
      return Promise.resolve(undefined);
    }),
  };
  return { chain, calls };
}

const baseClaim = {
  userId: 'user-1',
  reportKey: 'marriage',
  input: null,
  pricePaidPaise: 9900,
  isPreview: false,
};

beforeEach(() => {
  state.insert.mockReset();
  state.select.mockReset();
  state.update.mockReset();
});

describe('claimReportRow — partial-index targeting', () => {
  it('targets reports_uniq_primary_onetime (userId, reportKey) when birthProfileId=null, periodMonth=null', async () => {
    const { chain, calls } = makeInsertChain([{ id: 'r1', status: 'generating' }]);
    state.insert.mockReturnValue(chain);

    await claimReportRow({ ...baseClaim, birthProfileId: null, periodMonth: null });

    expect(state.insert).toHaveBeenCalledWith(reports);
    expect(calls.onConflictCalled).toBe(true);
    expect(calls.onConflictDoUpdate.target).toEqual([reports.userId, reports.reportKey]);
    const targetWhere = compile(calls.onConflictDoUpdate.targetWhere);
    expect(targetWhere.sql).toBe(
      '"reports"."birth_profile_id" is null and "reports"."period_month" is null and "reports"."input" is null',
    );
  });

  it('targets reports_uniq_primary_monthly (userId, reportKey, periodMonth) when birthProfileId=null, periodMonth set', async () => {
    const { chain, calls } = makeInsertChain([{ id: 'r2', status: 'generating' }]);
    state.insert.mockReturnValue(chain);

    await claimReportRow({
      ...baseClaim,
      reportKey: 'health_monthly',
      birthProfileId: null,
      periodMonth: '2026-07-01',
    });

    expect(calls.onConflictDoUpdate.target).toEqual([
      reports.userId,
      reports.reportKey,
      reports.periodMonth,
    ]);
    const targetWhere = compile(calls.onConflictDoUpdate.targetWhere);
    expect(targetWhere.sql).toBe(
      '"reports"."birth_profile_id" is null and "reports"."period_month" is not null and "reports"."input" is null',
    );
  });

  it('targets reports_uniq_profile_onetime (userId, birthProfileId, reportKey) when birthProfileId set, periodMonth=null', async () => {
    const { chain, calls } = makeInsertChain([{ id: 'r3', status: 'generating' }]);
    state.insert.mockReturnValue(chain);

    await claimReportRow({ ...baseClaim, birthProfileId: 'profile-a', periodMonth: null });

    expect(calls.onConflictDoUpdate.target).toEqual([
      reports.userId,
      reports.birthProfileId,
      reports.reportKey,
    ]);
    const targetWhere = compile(calls.onConflictDoUpdate.targetWhere);
    expect(targetWhere.sql).toBe(
      '"reports"."birth_profile_id" is not null and "reports"."period_month" is null and "reports"."input" is null',
    );
  });

  it('targets reports_uniq_profile_monthly (userId, birthProfileId, reportKey, periodMonth) when both set', async () => {
    const { chain, calls } = makeInsertChain([{ id: 'r4', status: 'generating' }]);
    state.insert.mockReturnValue(chain);

    await claimReportRow({
      ...baseClaim,
      reportKey: 'health_monthly',
      birthProfileId: 'profile-a',
      periodMonth: '2026-07-01',
    });

    expect(calls.onConflictDoUpdate.target).toEqual([
      reports.userId,
      reports.birthProfileId,
      reports.reportKey,
      reports.periodMonth,
    ]);
    const targetWhere = compile(calls.onConflictDoUpdate.targetWhere);
    expect(targetWhere.sql).toBe(
      '"reports"."birth_profile_id" is not null and "reports"."period_month" is not null and "reports"."input" is null',
    );
  });

  it("(a) targets reports_uniq_input_hash_primary (userId, reportKey, inputHash) for partner `input` on the primary profile — repeat purchases against the SAME partner details collide, different partners still don't", async () => {
    const { chain, calls } = makeInsertChain([{ id: 'km1', status: 'generating' }]);
    state.insert.mockReturnValue(chain);
    const input = { dateOfBirth: '1990-01-01' };

    const row = await claimReportRow({
      ...baseClaim,
      reportKey: 'kundli_milan',
      birthProfileId: null,
      periodMonth: null,
      input,
    });

    expect(row).toEqual({ id: 'km1', status: 'generating' });
    expect(calls.onConflictCalled).toBe(true);
    expect(calls.onConflictDoUpdate.target).toEqual([
      reports.userId,
      reports.reportKey,
      reports.inputHash,
    ]);
    const targetWhere = compile(calls.onConflictDoUpdate.targetWhere);
    expect(targetWhere.sql).toBe(
      '"reports"."birth_profile_id" is null and "reports"."input" is not null',
    );
    expect(calls.values).toMatchObject({ input, inputHash: hashReportInput(input) });
  });

  it('targets reports_uniq_input_hash_profile (userId, birthProfileId, reportKey, inputHash) for partner `input` on an additional profile', async () => {
    const { chain, calls } = makeInsertChain([{ id: 'km2', status: 'generating' }]);
    state.insert.mockReturnValue(chain);
    const input = { dateOfBirth: '1990-01-01' };

    await claimReportRow({
      ...baseClaim,
      reportKey: 'kundli_milan',
      birthProfileId: 'profile-a',
      periodMonth: null,
      input,
    });

    expect(calls.onConflictDoUpdate.target).toEqual([
      reports.userId,
      reports.birthProfileId,
      reports.reportKey,
      reports.inputHash,
    ]);
    const targetWhere = compile(calls.onConflictDoUpdate.targetWhere);
    expect(targetWhere.sql).toBe(
      '"reports"."birth_profile_id" is not null and "reports"."input" is not null',
    );
  });

  it('a DIFFERENT partner (different input) never collides — different inputHash, so it never conflicts against the earlier row', () => {
    expect(hashReportInput({ dateOfBirth: '1990-01-01' })).not.toBe(
      hashReportInput({ dateOfBirth: '1991-02-02' }),
    );
  });

  it('(b)/(c) returns undefined (no row) when the claimable guard fails — an existing ready/live row is left untouched, never duplicated', async () => {
    // Simulates Postgres's real behavior: ON CONFLICT ... WHERE <false> DO UPDATE leaves the
    // conflicting row untouched and RETURNING yields nothing for that statement.
    const { chain } = makeInsertChain([]);
    state.insert.mockReturnValue(chain);

    const row = await claimReportRow({ ...baseClaim, birthProfileId: null, periodMonth: null });
    expect(row).toBeUndefined();
  });

  it('sets the claimable guard to allow reclaiming a failed row but never a ready one', async () => {
    const { chain, calls } = makeInsertChain([{ id: 'r1' }]);
    state.insert.mockReturnValue(chain);

    await claimReportRow({ ...baseClaim, birthProfileId: null, periodMonth: null });

    const setWhere = compile(calls.onConflictDoUpdate.setWhere);
    expect(setWhere.sql).toContain("<> 'generating'");
    expect(setWhere.sql).toContain("<> 'ready'");
  });

  // Preview/purchase flag propagation — see the ClaimReportInput.isPreview doc comment. A real
  // purchase claim always passes isPreview: false, which is what flips a reclaimed preview row
  // (still 'generating' or stale) back to a real purchase entirely through this existing
  // onConflictDoUpdate mechanism, with no extra service-layer code needed for that collision path.
  it('writes isPreview into BOTH the insert values and the onConflictDoUpdate set clause, on a purchase claim (isPreview: false)', async () => {
    const { chain, calls } = makeInsertChain([{ id: 'r1' }]);
    state.insert.mockReturnValue(chain);

    await claimReportRow({
      ...baseClaim,
      birthProfileId: null,
      periodMonth: null,
      isPreview: false,
    });

    expect(calls.values).toMatchObject({ isPreview: false });
    expect(calls.onConflictDoUpdate.set).toMatchObject({ isPreview: false });
  });

  it('writes isPreview into BOTH the insert values and the onConflictDoUpdate set clause, on a preview claim (isPreview: true)', async () => {
    const { chain, calls } = makeInsertChain([{ id: 'r1' }]);
    state.insert.mockReturnValue(chain);

    await claimReportRow({
      ...baseClaim,
      birthProfileId: null,
      periodMonth: null,
      pricePaidPaise: 0,
      isPreview: true,
    });

    expect(calls.values).toMatchObject({ isPreview: true, pricePaidPaise: 0 });
    expect(calls.onConflictDoUpdate.set).toMatchObject({ isPreview: true });
  });
});

describe('findReportRow — scoped lookup excluding partner-input rows', () => {
  it('filters on birth_profile_id IS NULL, period_month IS NULL, and input IS NULL for a one-time primary-profile report', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findReportRow('user-1', null, 'marriage', null);

    const query = compile(calls.where);
    expect(query.sql).toContain('"reports"."birth_profile_id" is null');
    expect(query.sql).toContain('"reports"."period_month" is null');
    expect(query.sql).toContain('"reports"."input" is null');
    expect(query.params).toEqual(['user-1', 'marriage']);
  });

  it('filters on period_month = <value> for a monthly report', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    await findReportRow('user-1', 'profile-a', 'health_monthly', '2026-07-01');

    const query = compile(calls.where);
    expect(query.params).toEqual(['user-1', 'profile-a', 'health_monthly', '2026-07-01']);
  });
});

describe('findReportRowByInputHash — the partner-report counterpart to findReportRow', () => {
  it('filters on userId, birthProfileId, reportKey, and inputHash — no periodMonth or input-is-null filter', async () => {
    const { chain, calls } = makeSelectChain([]);
    state.select.mockReturnValue(chain);
    const hash = hashReportInput({ dateOfBirth: '1990-01-01' });

    await findReportRowByInputHash('user-1', null, 'kundli_milan', hash);

    const query = compile(calls.where);
    expect(query.sql).toContain('"reports"."birth_profile_id" is null');
    expect(query.sql).not.toContain('"reports"."input" is null');
    expect(query.params).toEqual(['user-1', 'kundli_milan', hash]);
  });
});

describe('findStaleGeneratingReports — active sweep for abandoned generating rows', () => {
  it('filters on status = generating and startedAt older than REPORT_STALE_GENERATING_MS', async () => {
    const staleRow = { id: 'stale-1', status: 'generating' };
    const { chain, calls } = makeSelectChain([staleRow]);
    state.select.mockReturnValue(chain);

    const rows = await findStaleGeneratingReports();

    expect(rows).toEqual([staleRow]);
    const query = compile(calls.where);
    expect(query.sql).toContain('"reports"."status"');
    expect(query.sql).toContain('"reports"."started_at" < now() -');
    expect(query.sql).toContain("interval '1 second'");
    expect(query.params).toContain('generating');
    expect(query.params).toContain(300); // REPORT_STALE_GENERATING_MS (5 min) in seconds
  });

  it('returns an empty array when nothing is stale', async () => {
    const { chain } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    const rows = await findStaleGeneratingReports();
    expect(rows).toEqual([]);
  });
});

describe('markReportReady / markReportFailed — claim-fenced updates', () => {
  it('markReportReady only updates the row matching id + generating status + claim token', async () => {
    const { chain, calls } = makeUpdateChain();
    state.update.mockReturnValue(chain);
    const claimedAt = new Date('2026-01-01T00:00:00Z');

    await markReportReady('report-1', claimedAt, { content: { sections: [] }, model: 'gemini' });

    const query = compile(calls.where);
    expect(query.params).toEqual(['report-1', 'generating', claimedAt.toISOString()]);
  });

  it('markReportFailed only updates the row matching id + generating status + claim token', async () => {
    const { chain, calls } = makeUpdateChain();
    state.update.mockReturnValue(chain);
    const claimedAt = new Date('2026-01-01T00:00:00Z');

    await markReportFailed('report-1', claimedAt, 'boom');

    const query = compile(calls.where);
    expect(query.params).toEqual(['report-1', 'generating', claimedAt.toISOString()]);
  });
});

describe('overwriteReadyReportContent — bulk content-refresh admin path', () => {
  it('only updates the row matching id + status=ready (not claim-fenced, unlike markReportReady)', async () => {
    const { chain, calls } = makeUpdateChain();
    state.update.mockReturnValue(chain);

    await overwriteReadyReportContent('report-1', { content: { sections: [] }, model: 'gemini' });

    expect(calls.set).toMatchObject({
      content: { sections: [] },
      model: 'gemini',
      translations: {},
    });
    const query = compile(calls.where);
    expect(query.params).toEqual(['report-1', 'ready']);
  });
});

describe('findReadyReportRows — enumerates every ready report for a bulk admin pass', () => {
  it('filters on status = ready', async () => {
    const readyRow = { id: 'r1', status: 'ready' };
    const { chain, calls } = makeSelectChain([readyRow]);
    state.select.mockReturnValue(chain);

    const rows = await findReadyReportRows();

    expect(rows).toEqual([readyRow]);
    const query = compile(calls.where);
    expect(query.sql).toBe('"reports"."status" = $1');
    expect(query.params).toEqual(['ready']);
  });
});

describe('upgradePreviewToPurchased — the ready-preview collision path', () => {
  it('sets isPreview:false and the real price, scoped only by id', async () => {
    const { chain, calls } = makeUpdateChain();
    state.update.mockReturnValue(chain);

    await upgradePreviewToPurchased('report-1', 9900);

    expect(calls.set).toMatchObject({ isPreview: false, pricePaidPaise: 9900 });
    const query = compile(calls.where);
    expect(query.sql).toBe('"reports"."id" = $1');
    expect(query.params).toEqual(['report-1']);
  });
});

describe('countReadyReportsByKey — public social-proof stats', () => {
  it('filters to status=ready AND is_preview=false, grouped by report_key', async () => {
    const rows = [
      { reportKey: 'marriage', count: 12 },
      { reportKey: 'wealth', count: 3 },
    ];
    const { chain, calls } = makeSelectChain(rows);
    state.select.mockReturnValue(chain);

    const result = await countReadyReportsByKey();

    expect(result).toEqual(rows);
    const query = compile(calls.where);
    expect(query.sql).toContain('"reports"."status" = $1');
    expect(query.sql).toContain('"reports"."is_preview" = $2');
    expect(query.params).toEqual(['ready', false]);
    // groupBy is called with the report_key column, not e.g. status or id.
    expect(calls.groupBy).toBe(reports.reportKey);
  });

  it('returns an empty array when there are no ready/non-preview reports at all', async () => {
    const { chain } = makeSelectChain([]);
    state.select.mockReturnValue(chain);

    const result = await countReadyReportsByKey();
    expect(result).toEqual([]);
  });
});
