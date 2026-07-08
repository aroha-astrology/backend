import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  sendHealthReport: vi.fn(),
  checkDb: vi.fn(),
  checkRedis: vi.fn(),
  checkNim: vi.fn(),
  checkMemoryUsage: vi.fn(),
  checkDiskUsage: vi.fn(),
  checkPm2Process: vi.fn(),
}));

vi.mock('../src/lib/notifications/telegram.js', () => ({
  sendHealthReport: state.sendHealthReport,
}));

vi.mock('../src/modules/health/health.service.js', () => ({
  checkDb: state.checkDb,
}));

vi.mock('../src/modules/health-report/health-report.checks.js', () => ({
  checkRedis: state.checkRedis,
  checkNim: state.checkNim,
  checkMemoryUsage: state.checkMemoryUsage,
  checkDiskUsage: state.checkDiskUsage,
  checkPm2Process: state.checkPm2Process,
}));

const { runHealthReport } = await import('../src/modules/health-report/health-report.service.js');

describe('runHealthReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.checkDb.mockResolvedValue(true);
    state.checkRedis.mockResolvedValue({ status: 'ok', latencyMs: 1 });
    state.checkNim.mockResolvedValue({ status: 'ok', latencyMs: 2 });
    state.checkMemoryUsage.mockResolvedValue({ status: 'ok', latencyMs: 3, message: '50% used' });
    state.checkDiskUsage.mockResolvedValue({ status: 'ok', latencyMs: 4, message: '60% used' });
    state.checkPm2Process.mockResolvedValue({
      status: 'ok',
      latencyMs: 5,
      message: 'Status: online',
    });
  });

  it('runs all checks and sends a successful report', async () => {
    await runHealthReport();
    expect(state.sendHealthReport).toHaveBeenCalledTimes(1);

    const report = state.sendHealthReport.mock.calls[0][0];
    expect(report['Database'].status).toBe('ok');
    expect(report['Redis'].status).toBe('ok');
    expect(report['NVIDIA NIM'].status).toBe('ok');
  });

  it('explicitly asserts the Telegram send fires even when every single check fails', async () => {
    state.checkDb.mockResolvedValue(false);
    state.checkRedis.mockResolvedValue({ status: 'fail', latencyMs: 1, message: 'down' });
    state.checkNim.mockResolvedValue({ status: 'fail', latencyMs: 1, message: 'down' });
    state.checkMemoryUsage.mockResolvedValue({ status: 'fail', latencyMs: 1, message: '99% used' });
    state.checkDiskUsage.mockResolvedValue({ status: 'fail', latencyMs: 1, message: '99% used' });
    state.checkPm2Process.mockResolvedValue({
      status: 'fail',
      latencyMs: 1,
      message: 'Status: offline',
    });

    await runHealthReport();

    expect(state.sendHealthReport).toHaveBeenCalledTimes(1);
    const report = state.sendHealthReport.mock.calls[0][0];
    expect(report['Database'].status).toBe('fail');
    expect(report['Redis'].status).toBe('fail');
    expect(report['NVIDIA NIM'].status).toBe('fail');
    expect(report['Memory Usage'].status).toBe('fail');
    expect(report['Disk Usage'].status).toBe('fail');
    expect(report['PM2 Process (aroha-api)'].status).toBe('fail');
  });
});
