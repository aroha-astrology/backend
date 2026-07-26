import { describe, expect, it } from 'vitest';

describe('report generator registration', () => {
  it('registers kundli_milan via the generators barrel import', async () => {
    await import('../src/modules/reports/generators/index.js');
    const { REPORT_GENERATORS } = await import('../src/modules/reports/report-generator.types.js');
    expect(REPORT_GENERATORS.kundli_milan).toBeDefined();
    expect(REPORT_GENERATORS.kundli_milan?.key).toBe('kundli_milan');
  });

  it('registers all 11 catalogue keys via the generators barrel import', async () => {
    await import('../src/modules/reports/generators/index.js');
    const { REPORT_GENERATORS } = await import('../src/modules/reports/report-generator.types.js');
    const { REPORT_CATALOGUE } = await import('../src/config/reports.js');

    expect(Object.keys(REPORT_GENERATORS)).toHaveLength(11);
    for (const def of REPORT_CATALOGUE) {
      expect(REPORT_GENERATORS[def.key]).toBeDefined();
      expect(REPORT_GENERATORS[def.key]?.key).toBe(def.key);
    }
  });

  it('every registered generator implements computeScores/generateNarrative/translateNarrative', async () => {
    await import('../src/modules/reports/generators/index.js');
    const { REPORT_GENERATORS } = await import('../src/modules/reports/report-generator.types.js');

    for (const generator of Object.values(REPORT_GENERATORS)) {
      expect(typeof generator?.computeScores).toBe('function');
      expect(typeof generator?.generateNarrative).toBe('function');
      expect(typeof generator?.translateNarrative).toBe('function');
    }
  });
});
