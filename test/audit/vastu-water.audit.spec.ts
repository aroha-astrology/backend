import { describe, it, expect } from 'vitest';
import {
  VASTU_RULES,
  VASTU_RULE_SET,
  evaluateRoomPlacement,
} from '../../src/modules/vastu/vastu.rules.js';

// =============================================================================
// Audit item VS-ROOM (water), register BS-52.116-117 and the owner's decision
// of 2026-10-09: follow the Brihat Samhita as rule set v2.
// =============================================================================
// Brihat Samhita 52.117 (tr. Chidambaram Iyer, v. 119): "If there be any piece of
// water in the east, south-east, south, south-west, west, north-west, north and
// north-east, there will respectively be [the death of sons, injury from fire,
// troubles from enemies, quarrels among women, unchastity among women, poverty,
// increase of wealth and increase of sons]." So water is good in the north and
// the north-east and harmful in the other six directions. Rule set v1 rated the
// east and north-west "acceptable" and left the west unrated.
// =============================================================================

const water = (dir: string) => evaluateRoomPlacement({ water_tank: [dir] }).roomScores[0]!;

describe('[VS-ROOM] water follows the Brihat Samhita in rule set v2', () => {
  it('the rule set is a new id: old paid readings keep the id they were sold under', () => {
    expect(VASTU_RULE_SET.id).toBe('aroha-traditional-v2');
    expect(VASTU_RULE_SET.version).toBe('2.0');
  });

  it.each(['N', 'NE'])('water in the %s is ideal', (dir) => {
    expect(water(dir).status).toBe('ideal');
    expect(water(dir).score).toBe(100);
  });

  it.each(['E', 'SE', 'S', 'SW', 'W', 'NW'])('water in the %s is harmful', (dir) => {
    expect(water(dir).status).toBe('harmful');
    expect(water(dir).score).toBe(15);
  });

  it('no direction is merely acceptable for water', () => {
    expect(VASTU_RULES.find((r) => r.room === 'water_tank')!.acceptableDirections).toEqual([]);
  });

  it('the other ten room rules are untouched', () => {
    expect(VASTU_RULES.filter((r) => r.room !== 'water_tank')).toHaveLength(13);
    const kitchen = VASTU_RULES.find((r) => r.room === 'kitchen')!;
    expect(kitchen.idealDirections).toEqual(['SE']);
  });
});
