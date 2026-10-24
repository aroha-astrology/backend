import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PASS_TIERS } from '../src/modules/pass/pass.config.js';

// The Platinum Pass free report (money.platinumReport): one report a Pass period, Platinum only.

const w = vi.hoisted(() => ({
  on: true,
  tier: 'platinum' as 'silver' | 'gold' | 'platinum' | null,
  periodStart: new Date('2026-10-10T00:00:00Z'),
  takenAt: null as Date | null,
}));

vi.mock('../src/modules/features/features.service.js', () => ({
  isFeatureOn: async (_u: string, key: string) => w.on && key === 'money.platinumReport',
}));

vi.mock('../src/lib/entitlements.js', async () => {
  const { PASS_TIERS: tiers } = await import('../src/modules/pass/pass.config.js');
  return {
    passEntitlement: async () => {
      const t = tiers.find((x) => x.tier === w.tier);
      return t ? { tier: t.tier, freeReportsPerPeriod: t.freeReportsPerPeriod } : null;
    },
    passPeriodStart: async () => w.periodStart,
  };
});

vi.mock('../src/modules/pass/pass.repo.js', () => ({
  // The same rule as the SQL: free when never taken or taken before this period began.
  claimPassFreeReport: async (_u: string, periodStart: Date, at: Date) => {
    if (w.takenAt && w.takenAt >= periodStart) return false;
    w.takenAt = at;
    return true;
  },
  releasePassFreeReport: async (_u: string, at: Date) => {
    if (w.takenAt?.getTime() !== at.getTime()) return false;
    w.takenAt = null;
    return true;
  },
}));

const { takePassFreeReport, givePassFreeReportBack, passFreeReportAvailable, isPassFreeReportKey } =
  await import('../src/modules/pass/pass-free-report.js');

const now = new Date('2026-10-24T06:00:00.123Z');

beforeEach(() => {
  w.on = true;
  w.tier = 'platinum';
  w.takenAt = null;
});

describe('Platinum free report', () => {
  it('only Platinum gives one', () => {
    expect(PASS_TIERS.map((t) => [t.tier, t.freeReportsPerPeriod])).toEqual([
      ['silver', 0],
      ['gold', 0],
      ['platinum', 1],
    ]);
  });

  it('Platinum takes it once a period; a second purchase pays', async () => {
    const key = await takePassFreeReport('u1', now);
    expect(key).toBe('pass_free_report:2026-10-24T06:00:00.123Z');
    expect(isPassFreeReportKey(key)).toBe(true);
    expect(await takePassFreeReport('u1', now)).toBeNull();
  });

  it('the next period gives a new one', async () => {
    await takePassFreeReport('u1', now);
    w.periodStart = new Date('2026-11-09T00:00:00Z');
    expect(await takePassFreeReport('u1', new Date('2026-11-10T00:00:00Z'))).not.toBeNull();
    w.periodStart = new Date('2026-10-10T00:00:00Z');
  });

  it('a failed report gives it back, so it can be used again', async () => {
    const key = (await takePassFreeReport('u1', now))!;
    await givePassFreeReportBack('u1', key);
    expect(await passFreeReportAvailable({ id: 'u1', passFreeReportAt: w.takenAt })).toBe(true);
    expect(await takePassFreeReport('u1', now)).not.toBeNull();
  });

  it('none with the switch off, on Gold, or without a Pass', async () => {
    w.on = false;
    expect(await takePassFreeReport('u1', now)).toBeNull();
    w.on = true;
    w.tier = 'gold';
    expect(await takePassFreeReport('u1', now)).toBeNull();
    w.tier = null;
    expect(await takePassFreeReport('u1', now)).toBeNull();
    expect(await passFreeReportAvailable({ id: 'u1', passFreeReportAt: null })).toBe(false);
  });

  it('availability follows the claim time against the period start', async () => {
    expect(await passFreeReportAvailable({ id: 'u1', passFreeReportAt: null })).toBe(true);
    expect(
      await passFreeReportAvailable({ id: 'u1', passFreeReportAt: new Date('2026-10-12T00:00:00Z') }),
    ).toBe(false);
    expect(
      await passFreeReportAvailable({ id: 'u1', passFreeReportAt: new Date('2026-10-01T00:00:00Z') }),
    ).toBe(true);
  });
});
