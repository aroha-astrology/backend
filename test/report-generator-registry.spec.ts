import { describe, expect, it } from 'vitest';

describe('report generator registration', () => {
  it('registers kundli_milan via the generators barrel import', async () => {
    await import('../src/modules/reports/generators/index.js');
    const { REPORT_GENERATORS } = await import('../src/modules/reports/report-generator.types.js');
    expect(REPORT_GENERATORS.kundli_milan).toBeDefined();
    expect(REPORT_GENERATORS.kundli_milan?.key).toBe('kundli_milan');
  });

  it('leaves every other catalogue key unregistered (next task fills these in)', async () => {
    await import('../src/modules/reports/generators/index.js');
    const { REPORT_GENERATORS } = await import('../src/modules/reports/report-generator.types.js');
    const { REPORT_CATALOGUE } = await import('../src/config/reports.js');

    for (const def of REPORT_CATALOGUE) {
      if (def.key === 'kundli_milan') continue;
      expect(REPORT_GENERATORS[def.key]).toBeUndefined();
    }
  });
});
