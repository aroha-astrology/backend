import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PERSONA_BY_LOOK,
  PERSONAS,
  isDefaultVoice,
  lookOf,
  personaById,
  personasForLook,
  resolvePersona,
} from '../src/lib/personas';

describe('guide personas', () => {
  it('has four guides for each look, with the names the owner chose', () => {
    expect(personasForLook('CLASSIC_VEDIC').map((p) => p.name)).toEqual([
      'Yogi Baba',
      'Pandit Vikram',
      'Gauri',
      'Kavitha Ji',
    ]);
    expect(personasForLook('MODERN_COSMIC').map((p) => p.name)).toEqual(['Orion', 'Soren', 'Maya', 'Elena']);
  });

  it('never gives a guide a medical or other professional title', () => {
    for (const p of PERSONAS) {
      expect(p.name).not.toMatch(/\bDr\b|\bDr\./i);
      expect(p.style).not.toMatch(/\bDr\.? /);
    }
    expect(personaById('kavitha-ji')?.name).toBe('Kavitha Ji');
  });

  it('every guide keeps the safety posture: no outcome promises, honest about being an AI when asked', () => {
    for (const p of PERSONAS) {
      expect(p.style).toMatch(/never promise an outcome/);
      expect(p.style).toMatch(/answer honestly/);
      expect(p.voiceStyle).toMatch(/never promise an outcome/);
    }
  });

  it('ids and voices are unique (Yogi Baba keeps the server default voice)', () => {
    const ids = PERSONAS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const voices = PERSONAS.map((p) => p.voiceName).filter(Boolean);
    expect(new Set(voices).size).toBe(voices.length);
    expect(personaById('yogi-baba')?.voiceName).toBeNull();
  });

  it('Cosmic guides open a call with a plain hello, not a religious greeting', () => {
    for (const p of personasForLook('MODERN_COSMIC')) {
      expect(p.voiceStyle).toMatch(/Do not say "Radhe Radhe"/);
    }
  });

  it('a reader who has not picked a look counts as Classic', () => {
    expect(lookOf(null)).toBe('CLASSIC_VEDIC');
    expect(lookOf(undefined)).toBe('CLASSIC_VEDIC');
    expect(lookOf('MODERN_COSMIC')).toBe('MODERN_COSMIC');
  });

  describe('resolvePersona', () => {
    it('returns the look\'s default when the reader has not chosen', () => {
      expect(resolvePersona(null, 'CLASSIC_VEDIC').id).toBe(DEFAULT_PERSONA_BY_LOOK.CLASSIC_VEDIC);
      expect(resolvePersona(null, 'MODERN_COSMIC').id).toBe('orion');
    });

    it('returns the reader\'s pick when it belongs to their look', () => {
      expect(resolvePersona('gauri', 'CLASSIC_VEDIC').id).toBe('gauri');
      expect(resolvePersona('maya', 'MODERN_COSMIC').id).toBe('maya');
    });

    it('falls back to the look\'s default when the look changed after the pick', () => {
      expect(resolvePersona('gauri', 'MODERN_COSMIC').id).toBe('orion');
      expect(resolvePersona('elena', 'CLASSIC_VEDIC').id).toBe('yogi-baba');
    });

    it('ignores an id that does not exist', () => {
      expect(resolvePersona('nobody', 'CLASSIC_VEDIC').id).toBe('yogi-baba');
    });
  });

  it('only Yogi Baba adds nothing to the prompt (today\'s behaviour stays byte for byte)', () => {
    expect(isDefaultVoice(personaById('yogi-baba')!)).toBe(true);
    expect(isDefaultVoice(personaById('orion')!)).toBe(false);
  });
});
