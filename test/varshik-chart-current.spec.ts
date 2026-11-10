// The Varshik purchase waits for the chart rebuilt from the birth details as they stand now.
import { describe, expect, it } from 'vitest';
import { varshikChartProblem } from '../src/modules/reports/varshik-purchase.js';

describe('varshikChartProblem', () => {
  it('passes a ready chart built from the current details', () => {
    expect(varshikChartProblem({ status: 'ready', birthHash: 'h1' }, 'h1')).toBeNull();
  });

  it('waits while the saved chart is from older details (time just filled in or confirmed)', () => {
    expect(varshikChartProblem({ status: 'ready', birthHash: 'old' }, 'new')).toBe('CHART_UPDATING');
  });

  it('waits while the chart is still being built', () => {
    expect(varshikChartProblem({ status: 'generating', birthHash: 'h1' }, 'h1')).toBe('CHART_UPDATING');
    expect(varshikChartProblem({ status: 'pending', birthHash: null }, 'h1')).toBe('CHART_UPDATING');
  });

  it('waits when no chart was ever saved', () => {
    expect(varshikChartProblem(undefined, 'h1')).toBe('CHART_UPDATING');
    expect(varshikChartProblem(null, 'h1')).toBe('CHART_UPDATING');
  });

  it('refuses outright when no chart can be cast from the details', () => {
    expect(varshikChartProblem({ status: 'ready', birthHash: 'h1' }, null)).toBe('BIRTH_DETAILS_MISSING');
  });
});
