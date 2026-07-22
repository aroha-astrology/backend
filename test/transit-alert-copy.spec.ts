import { describe, expect, it } from 'vitest';
import {
  houseFromMoonSign,
  validateTransitCopy,
  MAX_BODY_CHARS,
  type LangCode,
} from '../src/lib/llm/transit-alert.js';
import {
  getFallbackCopy,
  PLANET_NAMES,
  SIGN_NAMES,
} from '../src/modules/cron/transit-copy-fallback.js';
import { SUPPORTED_LANGS } from '../src/modules/cron/broadcast-copy.js';

const good = (body: string, title = '🪐 Saturn shifts') => ({ title, body });

describe('houseFromMoonSign', () => {
  it('counts the transit house from the natal Moon', () => {
    // Moon in Aries, Saturn transiting Cancer -> 4th from the Moon.
    expect(houseFromMoonSign('Cancer', 'Aries')).toBe(4);
    // Same sign as the Moon is the 1st, not the 0th.
    expect(houseFromMoonSign('Aries', 'Aries')).toBe(1);
  });

  it('wraps around the zodiac', () => {
    // Moon in Pisces (index 11), transit in Aries (index 0) -> 2nd.
    expect(houseFromMoonSign('Aries', 'Pisces')).toBe(2);
    expect(houseFromMoonSign('Pisces', 'Aries')).toBe(12);
  });

  it('returns null rather than guessing when the chart is unknown', () => {
    expect(houseFromMoonSign('Cancer', null)).toBeNull();
    expect(houseFromMoonSign('Cancer', 'NotASign')).toBeNull();
  });
});

describe('validateTransitCopy', () => {
  it('accepts well-formed copy', () => {
    expect(
      validateTransitCopy(
        good('Saturn parks in your home life Thursday. Do not sign the lease this week.'),
        'en',
      ).ok,
    ).toBe(true);
  });

  it('rejects an over-length body', () => {
    const result = validateTransitCopy(good('x'.repeat(MAX_BODY_CHARS + 1)), 'en');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('body-too-long');
  });

  it('accepts a body sitting exactly on the limit', () => {
    expect(validateTransitCopy(good('x'.repeat(MAX_BODY_CHARS)), 'en').ok).toBe(true);
  });

  it('rejects empty or whitespace-only content', () => {
    expect(validateTransitCopy(good(''), 'en').reason).toBe('empty-body');
    expect(validateTransitCopy(good('   '), 'en').reason).toBe('empty-body');
    expect(validateTransitCopy({ title: '', body: 'fine' }, 'en').reason).toBe('empty-title');
  });

  it('rejects URLs', () => {
    expect(validateTransitCopy(good('Read more at https://example.com today'), 'en').reason).toBe(
      'contains-url',
    );
    expect(validateTransitCopy(good('Go to aroha.com now'), 'en').reason).toBe('contains-url');
  });

  it('rejects unresolved template scaffolding', () => {
    expect(validateTransitCopy(good('{planet} moves into Pisces on Thursday'), 'en').reason).toBe(
      'unresolved-placeholder',
    );
    expect(validateTransitCopy(good('Saturn meets [NAME] this week'), 'en').reason).toBe(
      'unresolved-placeholder',
    );
  });

  it('rejects Latin script when an Indic language was asked for', () => {
    // The failure this repo has actually shipped before: the model quietly
    // answers in English and nobody notices until a user complains.
    const result = validateTransitCopy(good('Saturn moves into Pisces on Thursday'), 'bn');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('wrong-script:bn');
  });

  it('accepts each language written in its own script', () => {
    const samples: Record<LangCode, string> = {
      en: 'Saturn slows your home life down this week.',
      hi: 'शनि इस सप्ताह आपके घर के मामलों को धीमा कर रहे हैं।',
      bn: 'শনি এই সপ্তাহে আপনার ঘরের বিষয়গুলি ধীর করে দিচ্ছে।',
      mr: 'शनि या आठवड्यात तुमच्या घरातील गोष्टी संथ करत आहे.',
      te: 'శని ఈ వారం మీ ఇంటి విషయాలను నెమ్మది చేస్తోంది.',
      ta: 'சனி இந்த வாரம் உங்கள் வீட்டு விஷயங்களை மெதுவாக்குகிறது.',
      gu: 'શનિ આ અઠવાડિયે તમારા ઘરની બાબતોને ધીમી કરે છે.',
    };
    for (const [lang, body] of Object.entries(samples)) {
      const result = validateTransitCopy(good(body, 'x'), lang as LangCode);
      expect(result, `${lang} should validate`).toEqual({ ok: true });
    }
  });

  it('rejects assistant-voice death claims', () => {
    const result = validateTransitCopy(good('Saturn arrives Thursday. You will die soon.'), 'en');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('policy');
  });

  it('rejects interrogative death framings the output filter alone would miss', () => {
    // classifyAssistantOutput matches declaratives only. Chat can afford that
    // because a human reads the reply; an unrecallable broadcast cannot, so
    // validateTransitCopy runs the wider topic filter too.
    const result = validateTransitCopy(
      good('Saturn arrives Thursday. When will you die? Your chart knows.'),
      'en',
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('policy');
  });

  it('does not block ordinary transit copy as a false positive', () => {
    const samples = [
      'Saturn slows your career to a crawl. Do not quit this week — wait it out.',
      'Mars lights up your money house Thursday. Spend it on the boring thing.',
      'Mercury turns back Sunday. Reread the contract you skimmed last month.',
    ];
    for (const body of samples) {
      expect(validateTransitCopy(good(body), 'en'), body).toEqual({ ok: true });
    }
  });
});

describe('getFallbackCopy', () => {
  it('produces copy for every language and event type, within the length limit', () => {
    for (const lang of SUPPORTED_LANGS) {
      for (const eventType of ['ingress', 'retrograde', 'direct'] as const) {
        const copy = getFallbackCopy(eventType, 'Saturn', 'Pisces', '2025-03-29', lang);
        // The fallback is the last line of defence — it must itself pass the
        // same gate the generated copy has to pass.
        expect(validateTransitCopy(copy, lang), `${lang}/${eventType}`).toEqual({ ok: true });
      }
    }
  });

  it('localizes planet and sign names rather than leaving them in English', () => {
    const bn = getFallbackCopy('ingress', 'Saturn', 'Pisces', '2025-03-29', 'bn');
    expect(bn.body).toContain(PLANET_NAMES.bn.Saturn);
    expect(bn.body).toContain(SIGN_NAMES.bn.Pisces);
    expect(bn.body).not.toContain('Saturn');
    expect(bn.body).not.toContain('Pisces');
  });

  it('substitutes every placeholder', () => {
    for (const lang of SUPPORTED_LANGS) {
      const copy = getFallbackCopy('retrograde', 'Mercury', 'Scorpio', '2025-11-10', lang);
      expect(copy.body).not.toMatch(/\{[a-z]+\}/);
      expect(copy.title).not.toMatch(/\{[a-z]+\}/);
    }
  });

  it('renders the event date in the IST calendar day it was given', () => {
    // '2025-03-29' is already an IST date; re-projecting it through a timezone
    // would slide it to the 28th.
    expect(getFallbackCopy('ingress', 'Saturn', 'Pisces', '2025-03-29', 'en').body).toContain('29');
  });
});
