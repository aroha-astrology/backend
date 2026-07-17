import { describe, expect, it } from 'vitest';
import { extractNextUnit, stripUnitMarkers } from '../src/lib/swarm/agents/scholar.js';

/** Drains every mid-stream unit `extractNextUnit` can find, then whatever's left in the buffer. */
function drain(text: string): { units: string[]; leftover: string } {
  const units: string[] = [];
  let buf = text;
  while (true) {
    const next = extractNextUnit(buf);
    if (!next) break;
    units.push(stripUnitMarkers(next.unit));
    buf = next.rest;
  }
  return { units, leftover: stripUnitMarkers(buf) };
}

describe('extractNextUnit / stripUnitMarkers — direct-mode streaming boundaries', () => {
  it('still splits plain English sentences at ASCII periods (no regression)', () => {
    const { units, leftover } = drain('First sentence. Second sentence. Third');
    expect(units).toEqual(['First sentence.', 'Second sentence.']);
    expect(leftover).toBe('Third');
  });

  it('recognizes the Bengali/Devanagari danda "।" as a sentence boundary', () => {
    // Two real Bengali sentences, danda-terminated, the way Gemini actually
    // punctuates Bengali/Hindi/Marathi/Gujarati replies. Before the fix,
    // extractNextUnit only knew ASCII ".!?" and never found a boundary here
    // at all, so the whole reply buffered instead of streaming per-sentence.
    const { units, leftover } = drain(
      'বিবাহের সম্ভাবনা যথেষ্ট বেশি। আগামী কয়েক মাসের মধ্যে একটি সম্পর্ক আসতে পারে। বাকি অংশ',
    );
    expect(units).toEqual([
      'বিবাহের সম্ভাবনা যথেষ্ট বেশি।',
      'আগামী কয়েক মাসের মধ্যে একটি সম্পর্ক আসতে পারে।',
    ]);
    expect(leftover).toBe('বাকি অংশ');
  });

  it('strips a numbered-list marker that lands at the start of a Bengali unit instead of leaving it literal', () => {
    // Reproduces the reported bug: a disallowed "1. ..." list item embedded
    // in an otherwise-Bengali reply. With danda recognized, the marker now
    // lands at a clean unit boundary where stripUnitMarkers's anchored regex
    // can actually strip it, instead of surviving as literal "1." text.
    const { units } = drain('প্রথম পয়েন্ট শেষ। 1. বিবাহের সম্ভাবনা যথেষ্ট বেশি। বাকি');
    expect(units).toEqual(['প্রথম পয়েন্ট শেষ।', 'বিবাহের সম্ভাবনা যথেষ্ট বেশি।']);
    expect(units.some((u) => u.includes('1.'))).toBe(false);
  });

  it('still guards against mistaking a bare "1." list marker for a real sentence end', () => {
    const next = extractNextUnit('1. First item continues');
    expect(next).toBeNull();
  });
});
