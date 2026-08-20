import { describe, expect, it } from 'vitest';
import { extractScoresProse, spliceScoresProse } from '../src/lib/llm/report-scores.js';

describe('extractScoresProse / spliceScoresProse — nested string-array leaves', () => {
  const scores = {
    planetRemedies: [
      {
        planet: 'Venus',
        house: 7,
        remedies: ['Feed cows on Friday', 'Wear white on Friday'],
        totke: ['Donate sugar'],
      },
      { planet: 'Jupiter', house: 4, remedies: ['Respect elders'], totke: [] },
    ],
  };
  const paths = ['planetRemedies[].remedies[]', 'planetRemedies[].totke[]'];

  it('extracts every string in each nested array, in stable order', () => {
    const leaves = extractScoresProse(scores, paths);
    expect(leaves.map((l) => l.value)).toEqual([
      'Feed cows on Friday',
      'Wear white on Friday',
      'Respect elders',
      'Donate sugar',
    ]);
    expect(leaves.map((l) => ({ arrayIndex: l.arrayIndex, subIndex: l.subIndex }))).toEqual([
      { arrayIndex: 0, subIndex: 0 },
      { arrayIndex: 0, subIndex: 1 },
      { arrayIndex: 1, subIndex: 0 },
      { arrayIndex: 0, subIndex: 0 },
    ]);
  });

  it('splices translated values back into the exact nested positions, leaving everything else untouched', () => {
    const leaves = extractScoresProse(scores, paths);
    const translated = ['गाय को खिलाएं', 'सफेद पहनें', 'बड़ों का सम्मान करें', 'चीनी दान करें'];
    const result = spliceScoresProse(scores, leaves, translated) as typeof scores;

    expect(result.planetRemedies[0]!.remedies).toEqual(['गाय को खिलाएं', 'सफेद पहनें']);
    expect(result.planetRemedies[1]!.remedies).toEqual(['बड़ों का सम्मान करें']);
    expect(result.planetRemedies[0]!.totke).toEqual(['चीनी दान करें']);
    expect(result.planetRemedies[0]!.planet).toBe('Venus');
    // Original untouched (pure function).
    expect(scores.planetRemedies[0]!.remedies).toEqual([
      'Feed cows on Friday',
      'Wear white on Friday',
    ]);
  });

  it('skips an empty inner array without throwing (Jupiter has no totke above)', () => {
    const leaves = extractScoresProse(scores, ['planetRemedies[].totke[]']);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]!.arrayIndex).toBe(0);
  });
});
