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

  it('strips a Bengali-numeral list marker ("২।") instead of flushing it as a bare fake sentence', () => {
    // Reproduces the recurrence reported after the danda fix shipped: Gemini
    // wrote a Bengali numbered list using native digits ("২।" = "2."), not
    // ASCII ones. The digit-guard used to be ASCII-only (\d), so it failed to
    // recognize "২" as a list-marker-in-progress and flushed "২।" on its own
    // — rendering literally in the chat bubble and burning a word-budget slot
    // on a fake one-word "sentence," which could cut the real item text that
    // should follow it.
    const { units, leftover } = drain(
      'বিবাহের সম্ভাবনা যথেষ্ট বেশি। ২। শনির প্রভাব থাকতে পারে। বাকি',
    );
    expect(units).toEqual(['বিবাহের সম্ভাবনা যথেষ্ট বেশি।', 'শনির প্রভাব থাকতে পারে।']);
    expect(units.some((u) => u === '২।' || u.startsWith('২।'))).toBe(false);
    expect(leftover).toBe('বাকি');
  });

  it('still guards against mistaking a bare native-digit list marker ("২।") for a real sentence end', () => {
    const next = extractNextUnit('২। প্রথম পয়েন্ট চলছে');
    expect(next).toBeNull();
  });

  it('same fix also covers Devanagari numerals (Hindi/Marathi "२।") — not Bengali-specific', () => {
    const { units, leftover } = drain(
      'विवाह की संभावना अधिक है। २। शनि का प्रभाव हो सकता है। बाकी',
    );
    expect(units).toEqual(['विवाह की संभावना अधिक है।', 'शनि का प्रभाव हो सकता है।']);
    expect(units.some((u) => u === '२।' || u.startsWith('२।'))).toBe(false);
    expect(leftover).toBe('बाकी');
  });

  it('same fix also covers Gujarati numerals ("૨।")', () => {
    const { units, leftover } = drain('લગ્નની શક્યતા વધારે છે। ૨। શનિની અસર હોઈ શકે છે। બાકી');
    expect(units).toEqual(['લગ્નની શક્યતા વધારે છે।', 'શનિની અસર હોઈ શકે છે।']);
    expect(units.some((u) => u === '૨।' || u.startsWith('૨।'))).toBe(false);
    expect(leftover).toBe('બાકી');
  });
});
