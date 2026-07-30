import { describe, it, expect } from 'vitest';
import { buildFramePath, computeFramesHash } from '../src/lib/palm/storage-paths';

describe('buildFramePath', () => {
  it('builds a deterministic, user-scoped, private-looking path', () => {
    const path = buildFramePath('user-1', 'reading-1', 'primaryFront');
    expect(path).toBe('palm/user-1/reading-1/primaryFront.jpg');
  });

  it('rejects a slot name that is not one of the known capture slots', () => {
    expect(() => buildFramePath('user-1', 'reading-1', '../etc/passwd')).toThrow();
  });
});

describe('computeFramesHash', () => {
  it('is order-independent across the slot map (same frames, different insertion order)', () => {
    const a = computeFramesHash({
      primaryFront: Buffer.from('AAA'),
      primaryPercussion: Buffer.from('BBB'),
    });
    const b = computeFramesHash({
      primaryPercussion: Buffer.from('BBB'),
      primaryFront: Buffer.from('AAA'),
    });
    expect(a).toBe(b);
  });

  it('differs when any single frame differs', () => {
    const a = computeFramesHash({
      primaryFront: Buffer.from('AAA'),
      primaryPercussion: Buffer.from('BBB'),
    });
    const b = computeFramesHash({
      primaryFront: Buffer.from('AAA'),
      primaryPercussion: Buffer.from('CCC'),
    });
    expect(a).not.toBe(b);
  });

  it('differs when the SET of captured slots differs, even if bytes overlap', () => {
    const a = computeFramesHash({ primaryFront: Buffer.from('AAA') });
    const b = computeFramesHash({
      primaryFront: Buffer.from('AAA'),
      primaryPercussion: Buffer.from(''),
    });
    expect(a).not.toBe(b);
  });

  it('produces a hex sha256 digest', () => {
    const hash = computeFramesHash({ primaryFront: Buffer.from('AAA') });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
