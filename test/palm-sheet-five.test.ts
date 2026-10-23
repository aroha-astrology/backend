import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { buildContactSheet, sheetPointToFront } from '../src/lib/palm/image-prep.js';
import { buildOmnirushObservePrompt } from '../src/lib/llm/palm/observe-omnirush.js';

// Five photos since 2026-10-23: the four close-ups sit in a 2 x 2 grid beside the front view so
// the fingertip and thumb prints keep enough pixels, and the scan prompt tells the model which
// panel to read prints and mount height from.

const photo = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#c89b7b' } })
    .jpeg()
    .toBuffer();

describe('buildContactSheet with four close-ups', () => {
  it('lays them out two wide, each cell half the front width and half its height', async () => {
    const front = await photo(1200, 1600);
    const others = await Promise.all([1, 2, 3, 4].map(() => photo(900, 1200)));
    const sheet = await buildContactSheet(
      { label: 'FRONT', bytes: front },
      others.map((bytes, i) => ({ label: `P${i}`, bytes })),
    );
    expect(sheet.width).toBe(sheet.frontWidth * 2);
    // Points on panel A still map back; points in the grid are dropped.
    expect(sheetPointToFront([0.25, 0.5], sheet)).toEqual([0.5, 0.5]);
    expect(sheetPointToFront([0.75, 0.5], sheet)).toBeNull();
  });

  it('keeps the single column for up to three close-ups', async () => {
    const sheet = await buildContactSheet({ label: 'FRONT', bytes: await photo(1200, 1600) }, [
      { label: 'SIDE', bytes: await photo(900, 1200) },
      { label: 'FINGERTIPS', bytes: await photo(900, 1200) },
    ]);
    expect(sheet.width).toBe(Math.round(sheet.frontWidth * 1.5));
  });
});

describe('scan prompt reading rules', () => {
  const base = { hand: 'right' as const, trace: true };

  it('reads prints only from the close-ups and mount height from the low-angle panel', () => {
    const prompt = buildOmnirushObservePrompt({
      ...base,
      otherPanels: [
        'side edge (little-finger side)',
        'four fingertips (pad side, close up)',
        'thumb tip (pad side, close up)',
        'low-angle view across the palm from the wrist, showing how raised each mount is',
      ],
    });
    expect(prompt).toContain(
      'Read "fingerprints" ONLY from the fingertip and thumb close-up panels',
    );
    expect(prompt).toContain('mainly from the low-angle panel');
  });

  it('a three-photo capture gets the print rule but no low-angle rule', () => {
    const prompt = buildOmnirushObservePrompt({
      ...base,
      otherPanels: ['side edge (little-finger side)', 'four fingertips (pad side, close up)'],
    });
    expect(prompt).toContain('close-up panels');
    expect(prompt).not.toContain('low-angle panel');
  });
});
