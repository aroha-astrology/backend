import { describe, it, expect } from 'vitest';
import { computeIsNewReport, NEW_REPORT_WINDOW_MS } from '../src/config/reports';

describe('computeIsNewReport', () => {
  const now = new Date('2026-09-04T00:00:00Z');

  it('is true when enabled and enabledAt is within the window', () => {
    const enabledAt = new Date('2026-09-01T00:00:00Z');
    expect(computeIsNewReport(true, enabledAt, now)).toBe(true);
  });

  it('is false once enabledAt is older than the window', () => {
    const enabledAt = new Date(now.getTime() - NEW_REPORT_WINDOW_MS - 1000);
    expect(computeIsNewReport(true, enabledAt, now)).toBe(false);
  });

  it('is false when enabledAt is null (no override row, or never explicitly enabled)', () => {
    expect(computeIsNewReport(true, null, now)).toBe(false);
  });

  it('is false when the report is currently disabled, even with a recent enabledAt', () => {
    const enabledAt = new Date(now.getTime() - 1000);
    expect(computeIsNewReport(false, enabledAt, now)).toBe(false);
  });

  it('is false exactly at the window boundary (exclusive)', () => {
    const enabledAt = new Date(now.getTime() - NEW_REPORT_WINDOW_MS);
    expect(computeIsNewReport(true, enabledAt, now)).toBe(false);
  });
});
