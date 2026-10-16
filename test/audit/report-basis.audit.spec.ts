import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { REPORT_CATALOGUE } from '../../src/config/reports.js';
import {
  SAFETY_RULES,
  basisFeatureIds,
  reportBasis,
  safetyOf,
} from '../../src/lib/astro-engine/rules/report-basis.js';
import {
  allProvenanceEntries,
  getProvenance,
} from '../../src/lib/astro-engine/rules/provenance.js';
import { DEFAULT_PROFILE } from '../../src/lib/astro-engine/rules/profile.js';
import { ORIGIN_RULE, reportFactsMessage } from '../../src/lib/llm/reports/report-facts-message.js';

// =============================================================================
// Audit release R4 (Group 4): the provenance and safety block on every report
// =============================================================================
// Every one of the 16 paid reports carries a basis block (calculation_basis, source_profile,
// traditional_rules, modern_rules, aroha_proprietary_rules, unverified_rules,
// safety_classification) read from the provenance registry, and every report's narrative
// call carries the origin rule and the safety rule of its subject. One check over all 16,
// so a report added later without them fails here.
// =============================================================================

const KEYS = REPORT_CATALOGUE.map((r) => r.key);

describe('[R4] every report has a basis block', () => {
  it('there are sixteen report types', () => {
    expect(KEYS).toHaveLength(16);
  });

  it.each(KEYS)('%s: all five fields and registered ids', (key) => {
    const b = reportBasis(key)!;
    expect(b).not.toBeNull();
    expect(b.calculation_basis.length).toBeGreaterThan(40);
    expect(b.source_profile).toBe(DEFAULT_PROFILE.id);
    expect([
      'standard',
      'relationship',
      'financial',
      'health',
      'fertility',
      'belief',
      'newborn',
      'remedy',
    ]).toContain(b.safety_classification);
    for (const id of basisFeatureIds(key)) {
      expect(getProvenance(id).note, `${key}: ${id} is not in the registry`).not.toBe(
        'Feature id not yet registered in provenance registry',
      );
    }
  });

  it.each(KEYS)('%s: each list holds only rules of its own kind', (key) => {
    const b = reportBasis(key)!;
    for (const r of b.traditional_rules) {
      const e = getProvenance(r.id);
      expect(['ANCIENT_CLASSICAL', 'LATER_CLASSICAL'], `${key} ${r.id}`).toContain(e.tag);
      expect(e.sourceIds.length, `${key} ${r.id} has no source id`).toBeGreaterThan(0);
    }
    for (const r of b.modern_rules) expect(getProvenance(r.id).tag).toBe('MODERN_ASTROLOGICAL');
    for (const r of b.aroha_proprietary_rules)
      expect(getProvenance(r.id).tag).toBe('AROHA_PROPRIETARY');
    for (const r of b.unverified_rules) expect(getProvenance(r.id).tag).toBe('UNVERIFIED');
  });

  it('every id in the registry is unique', () => {
    const ids = allProvenanceEntries().map((e) => e.featureId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the subjects that need care are classed so', () => {
    expect(safetyOf('health_monthly')).toBe('health');
    expect(safetyOf('progeny')).toBe('fertility');
    expect(safetyOf('past_life')).toBe('belief');
    expect(safetyOf('baby_name')).toBe('newborn');
    expect(safetyOf('remedies')).toBe('remedy');
    expect(safetyOf('wealth')).toBe('financial');
    expect(safetyOf('marriage')).toBe('relationship');
  });

  it('a modern system is never listed as traditional: KP and Lal Kitab', () => {
    const kp = reportBasis('kp_annual')!;
    expect(kp.traditional_rules.map((r) => r.id)).not.toContain('KP-CLS');
    expect(kp.modern_rules.map((r) => r.id)).toContain('KP-CLS');
    const rem = reportBasis('remedies')!;
    expect(rem.modern_rules.map((r) => r.id)).toContain('LKB-CLS');
  });
});

describe('[R4] the narrative call of every report carries the origin and safety rules', () => {
  it('the origin rule is in every message, with or without a report key', () => {
    expect(reportFactsMessage('x').content as string).toContain(ORIGIN_RULE);
    expect(reportFactsMessage('x', undefined, undefined, 'marriage').content as string).toContain(
      ORIGIN_RULE,
    );
  });

  it('the origin rule forbids calling a rule ancient or classical without the facts saying so', () => {
    expect(ORIGIN_RULE).toMatch(/never call it ancient, classical/);
    expect(ORIGIN_RULE).toMatch(/Kaal Sarp/);
  });

  it.each([
    'health_monthly',
    'progeny',
    'past_life',
    'baby_name',
    'remedies',
    'wealth',
    'marriage',
  ])('%s: its safety rule is inside the message', (key) => {
    const rule = SAFETY_RULES[safetyOf(key)];
    expect(rule.length).toBeGreaterThan(20);
    expect(reportFactsMessage('x', undefined, undefined, key).content as string).toContain(rule);
  });

  it('the health rule says no diagnosis and no prediction of illness or death', () => {
    expect(SAFETY_RULES.health).toMatch(/Never diagnose/);
    expect(SAFETY_RULES.health).toMatch(/death/);
  });

  it('the fertility rule says no prediction of whether or how many children', () => {
    expect(SAFETY_RULES.fertility).toMatch(/can or cannot have children/);
  });

  const FILES: Record<string, string> = {
    baby_name: 'baby-name',
    career_monthly: 'career-monthly',
    finance_monthly: 'finance-monthly',
    health_monthly: 'health-monthly',
    kp_annual: 'kp-annual',
    kundli_milan: 'kundli-milan',
    marriage: 'marriage',
    match_report: 'match-report',
    name_change: 'name-change',
    numerology: 'numerology',
    past_life: 'past-life',
    progeny: 'progeny',
    relationship_monthly: 'relationship-monthly',
    remedies: 'remedies',
    true_love: 'true-love',
    wealth: 'wealth',
  };

  it.each(Object.entries(FILES))('%s: its LLM module passes its own key', (key, file) => {
    const src = readFileSync(
      new URL(`../../src/lib/llm/reports/${file}.ts`, import.meta.url),
      'utf8',
    );
    expect(src, `${file}.ts`).toMatch(
      new RegExp(`reportFactsMessage\\([\\s\\S]*?'${key}'\\s*,?\\s*\\)`),
    );
  });
});
