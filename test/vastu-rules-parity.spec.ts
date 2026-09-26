import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VASTU_RULES, VASTU_RULE_SET } from '../src/modules/vastu/vastu.rules.js';

// The frontend scores the live plan with its own copy of this table and the
// server re-scores the paid report with this one. Both repos test against the
// same snapshot (frontend lib/vastu/__fixtures__/, identical bytes), so a rule
// edited on one side fails CI until the other side and the snapshot follow —
// and a real rule change also needs a new VASTU_RULE_SET id.

const snapshot = JSON.parse(
  readFileSync(
    new URL('./fixtures/vastu-rules.aroha-traditional-v1.json', import.meta.url),
    'utf8',
  ),
) as { ruleSetId: string; rules: unknown[] };

describe('vastu rules table matches the shared snapshot', () => {
  it('rule set id', () => {
    expect(VASTU_RULE_SET.id).toBe(snapshot.ruleSetId);
  });

  it('directions and weights', () => {
    expect(
      VASTU_RULES.map((r) => ({
        room: r.room,
        idealDirections: r.idealDirections,
        acceptableDirections: r.acceptableDirections,
        avoidDirections: r.avoidDirections,
        weight: r.weight,
      })),
    ).toEqual(snapshot.rules);
  });
});
