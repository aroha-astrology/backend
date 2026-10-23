import { describe, it, expect } from 'vitest';
import { FEATURE_REGISTRY } from '../src/config/features';

const SWITCHES = [
  'memory.babaMemory',
  'memory.vault',
  'memory.rectifyChip',
  'chat.personas',
  'community.sameSky',
  'lang.localNames',
  'lang.gitaScripts',
  'lang.pushAll',
];

describe('Sprint 4 switches ship off', () => {
  it.each(SWITCHES)('%s is off by default and tagged new', (key) => {
    const def = FEATURE_REGISTRY.find((f) => f.key === key);
    expect(def, key).toBeDefined();
    expect(def!.defaultEnabled).toBe(false);
    expect(def!.tag).toBe('new');
    expect(def!.key.startsWith(`${def!.group}.`)).toBe(true);
  });

  it('every switch is explained in a sentence the owner can read on the board', () => {
    for (const key of SWITCHES) {
      const def = FEATURE_REGISTRY.find((f) => f.key === key)!;
      expect(def.label.length).toBeGreaterThan(40);
    }
  });
});
