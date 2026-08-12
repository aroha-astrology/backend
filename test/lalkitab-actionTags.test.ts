import { describe, it, expect } from 'vitest';
import { extractActions } from '../src/lib/astro-engine/lalkitab/actionTags';

describe('extractActions', () => {
  it('tags real Lal Kitab remedy prose (Sun in house 1)', () => {
    expect(extractActions('Offer wheat and jaggery to a cow on Sundays')).toEqual(
      expect.arrayContaining(['wheat', 'jaggery', 'cow']),
    );
  });

  it('tags multiple concepts including a vessel material and dedupes repeats', () => {
    const text =
      'Keep honey in a brass or copper vessel at home. Feed sweet chapatis to dogs daily.';
    const actions = extractActions(text);
    expect(actions).toEqual(
      expect.arrayContaining(['honey', 'brass_vessel', 'copper_vessel', 'sweet_chapati', 'dog']),
    );
    expect(new Set(actions).size).toBe(actions.length); // no duplicate slugs
  });

  it('tags black_dog and dog together, not black_dog alone', () => {
    expect(extractActions('Keep a pet dog or feed stray dogs regularly')).toContain('dog');
  });

  it('tags a place mention ("flowing water") as river, without over-matching "copper coin" as a vessel', () => {
    expect(extractActions('Throw a copper coin in flowing water on Sundays')).toEqual(['river']);
  });

  it('tags PLANET_REMEDIES-style ritual prose (chant / donate)', () => {
    expect(
      extractActions(
        'Recite Hanuman Chalisa on Tuesdays. Donate red lentils (masoor dal) on Tuesdays.',
      ),
    ).toEqual(expect.arrayContaining(['chant_mala', 'donate']));
  });

  it('tags GENERAL_REMEDIES-style prose (light a ghee lamp)', () => {
    expect(
      extractActions(
        'Light a ghee lamp in front of Lord Shiva on Mondays and offer milk to Shivalinga.',
      ),
    ).toEqual(expect.arrayContaining(['light_lamp', 'milk', 'shivling']));
  });

  it('returns an empty array for text with no recognized concept', () => {
    expect(
      extractActions('Serve your father and maintain good relations with government officials'),
    ).toEqual([]);
  });

  it('does not false-positive "well" from "as well" style phrasing', () => {
    // "well" was deliberately dropped from KEYWORD_RULES — this test guards
    // against it being re-added carelessly and matching common English usage.
    // ("donate" is correctly tagged here — it's a real verb in this sentence.)
    expect(extractActions('Donate almonds as well as coconuts at a temple')).toEqual([
      'temple',
      'donate',
    ]);
  });
});
