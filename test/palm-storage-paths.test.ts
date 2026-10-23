import { describe, it, expect } from 'vitest';
import {
  buildFramePath,
  computeFramesHash,
  PALM_CAPTURE_SLOTS,
  PRIMARY_SLOTS,
  LEGACY_SLOTS,
  REQUIRED_SLOTS,
} from '../src/lib/palm/storage-paths';

describe('PALM_CAPTURE_SLOTS', () => {
  it('captures five photos: front, side, four fingertips, thumb, low-angle mounts (2026-10-23)', () => {
    expect([...PALM_CAPTURE_SLOTS]).toEqual([
      'primaryFront',
      'primaryPercussion',
      'primaryFingertips',
      'primaryThumb',
      'primaryMounts',
    ]);
  });

  it('a scan needs only front, side and fingertips, so a 3-photo capture from an older app finishes', () => {
    expect([...REQUIRED_SLOTS]).toEqual(['primaryFront', 'primaryPercussion', 'primaryFingertips']);
  });

  it('accepts the two new slots for upload', () => {
    expect(buildFramePath('u', 'r', 'primaryThumb')).toBe('palm/u/r/primaryThumb.jpg');
    expect(buildFramePath('u', 'r', 'primaryMounts')).toBe('palm/u/r/primaryMounts.jpg');
  });

  it('PRIMARY_SLOTS equals PALM_CAPTURE_SLOTS', () => {
    expect(PRIMARY_SLOTS).toBe(PALM_CAPTURE_SLOTS);
  });
});

describe('buildFramePath', () => {
  it('builds a deterministic, user-scoped, private-looking path', () => {
    const path = buildFramePath('user-1', 'reading-1', 'primaryFront');
    expect(path).toBe('palm/user-1/reading-1/primaryFront.jpg');
  });

  it('still accepts legacy slot primaryDorsal (backward compat)', () => {
    const path = buildFramePath('user-1', 'reading-1', 'primaryDorsal');
    expect(path).toBe('palm/user-1/reading-1/primaryDorsal.jpg');
  });

  it('still accepts legacy slot secondaryFront', () => {
    const path = buildFramePath('user-1', 'reading-1', 'secondaryFront');
    expect(path).toBe('palm/user-1/reading-1/secondaryFront.jpg');
  });

  it('still accepts legacy slot secondaryPercussion', () => {
    const path = buildFramePath('user-1', 'reading-1', 'secondaryPercussion');
    expect(path).toBe('palm/user-1/reading-1/secondaryPercussion.jpg');
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

describe('LEGACY_SLOTS', () => {
  it('contains exactly the 3 dropped slot names', () => {
    expect([...LEGACY_SLOTS]).toEqual(['primaryDorsal', 'secondaryFront', 'secondaryPercussion']);
  });
});
