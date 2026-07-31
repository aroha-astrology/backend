import { describe, expect, it } from 'vitest';
import {
  assignSectionIds,
  REPORT_SECTION_IDS,
  type SectionWithId,
} from '../src/config/report-sections.js';

describe('assignSectionIds', () => {
  it('zips canonical ids onto sections by position when the count matches', () => {
    const sections: SectionWithId[] = [
      { heading: 'A', paragraphs: ['1'] },
      { heading: 'B', paragraphs: ['2'] },
    ];
    const result = assignSectionIds('baby_name', sections);
    expect(result.map((s) => s.id)).toEqual(['suggested_names', 'naming_themes_blessings']);
    // Original heading/paragraphs are preserved, not overwritten.
    expect(result[0]!.heading).toBe('A');
  });

  it('returns sections unchanged when the count does not match the expected sequence', () => {
    const sections = [{ heading: 'Only one', paragraphs: ['1'] }];
    const result = assignSectionIds('baby_name', sections); // expects 2, given 1
    expect(result).toEqual(sections);
    expect(result[0]!.id).toBeUndefined();
  });

  it('returns sections unchanged for a report key with no registered id sequence', () => {
    const sections = [{ heading: 'A', paragraphs: ['1'] }];
    const result = assignSectionIds('not_a_real_report_key', sections);
    expect(result).toEqual(sections);
  });

  it('every registered report key has a non-empty, duplicate-free id list', () => {
    for (const [key, ids] of Object.entries(REPORT_SECTION_IDS)) {
      expect(ids.length, `${key} should have at least one section id`).toBeGreaterThan(0);
      expect(new Set(ids).size, `${key} should have no duplicate section ids`).toBe(ids.length);
    }
  });

  it('does not mutate the input array', () => {
    const sections = [
      { heading: 'A', paragraphs: ['1'] },
      { heading: 'B', paragraphs: ['2'] },
    ];
    assignSectionIds('baby_name', sections);
    expect(sections[0]!.id).toBeUndefined();
  });
});
