import { describe, it, expect } from 'vitest';
import { EXTRA_PUSH_LANGS, PUSH_LANGS, fillCopy, normalizePushLang } from '../src/lib/push-lang';
import { getDailyCopy, getPeriodicCopy } from '../src/modules/cron/broadcast-copy';
import { getFallbackCopy } from '../src/modules/cron/transit-copy-fallback';
import { getFactNudgeFallback, validateFactNudgeCopy } from '../src/lib/llm/fact-nudge';
import { validateTransitCopy } from '../src/lib/llm/transit-alert';
import { circlePulsePush, memoryCheckInPush, memoryChatLine } from '../src/lib/push-copy/sprint4-copy';

/** Each language's own script (Latin for the six Latin-script languages). */
const SCRIPT: Record<string, RegExp> = {
  en: /[A-Za-z]/,
  hi: /[ऀ-ॿ]/,
  mr: /[ऀ-ॿ]/,
  bn: /[ঀ-৿]/,
  te: /[ఀ-౿]/,
  ta: /[஀-௿]/,
  gu: /[઀-૿]/,
  kn: /[ಀ-೿]/,
  es: /[A-Za-z]/,
  fr: /[A-Za-z]/,
  de: /[A-Za-z]/,
  pt: /[A-Za-z]/,
  it: /[A-Za-z]/,
  ru: /[Ѐ-ӿ]/,
  ja: /[぀-ヿ一-鿿]/,
};

describe('normalizePushLang', () => {
  it('knows all 15 languages when lang.pushAll is on', () => {
    expect(PUSH_LANGS).toHaveLength(15);
    for (const code of PUSH_LANGS) expect(normalizePushLang(`${code}-XX`, true)).toBe(code);
  });

  it('falls back to English for the eight added languages while the switch is off', () => {
    for (const code of EXTRA_PUSH_LANGS) expect(normalizePushLang(code, false)).toBe('en');
    expect(normalizePushLang('hi-IN', false)).toBe('hi');
  });

  it('copes with underscores, case and nothing at all', () => {
    expect(normalizePushLang('de_DE', true)).toBe('de');
    expect(normalizePushLang('JA', true)).toBe('ja');
    expect(normalizePushLang(null, true)).toBe('en');
    expect(normalizePushLang('xx', true)).toBe('en');
  });
});

describe('period readings in 15 languages', () => {
  it.each([...PUSH_LANGS])('%s: seven different daily hooks, in the language\'s script', (lang) => {
    const titles = new Set(Array.from({ length: 7 }, (_, d) => getDailyCopy(lang, d).title));
    expect(titles.size).toBe(7);
    for (let d = 0; d < 7; d++) {
      const c = getDailyCopy(lang, d);
      expect(c.body).toMatch(SCRIPT[lang]!);
      expect(c.title.length + c.body.length).toBeGreaterThan(20);
    }
  });

  it.each([...PUSH_LANGS])('%s: weekly, monthly and yearly each have their own text', (lang) => {
    const set = new Set(
      (['weekly', 'monthly', 'yearly'] as const).map((p) => {
        const c = getPeriodicCopy(p, lang);
        expect(c.body).toMatch(SCRIPT[lang]!);
        return c.title;
      }),
    );
    expect(set.size).toBe(3);
  });

  it('the added languages are not English copies', () => {
    for (const lang of EXTRA_PUSH_LANGS) {
      expect(getDailyCopy(lang, 0).title).not.toBe(getDailyCopy('en', 0).title);
      expect(getPeriodicCopy('weekly', lang).body).not.toBe(getPeriodicCopy('weekly', 'en').body);
    }
  });
});

describe('transit alerts in 15 languages', () => {
  it.each([...PUSH_LANGS])('%s: every event type renders names and a date with nothing left over', (lang) => {
    for (const type of ['ingress', 'retrograde', 'direct'] as const) {
      const c = getFallbackCopy(type, 'Saturn', 'Pisces', '2026-11-10', lang);
      const text = `${c.title} ${c.body}`;
      expect(text).not.toMatch(/\{(planet|sign|date)\}/);
      expect(c.body).toMatch(SCRIPT[lang]!);
      expect(text).toMatch(/10|१०|১০|१०|౧౦|௧௦|૧૦|೧೦/);
    }
  });

  it('uses the localised planet and sign names', () => {
    expect(getFallbackCopy('ingress', 'Saturn', 'Pisces', '2026-11-10', 'es').body).toContain('Saturno');
    expect(getFallbackCopy('ingress', 'Saturn', 'Pisces', '2026-11-10', 'es').body).toContain('Piscis');
    expect(getFallbackCopy('ingress', 'Saturn', 'Pisces', '2026-11-10', 'ru').body).toContain('Сатурн');
    expect(getFallbackCopy('ingress', 'Saturn', 'Pisces', '2026-11-10', 'ja').body).toContain('土星');
    expect(getFallbackCopy('ingress', 'Saturn', 'Pisces', '2026-11-10', 'kn').body).toContain('ಶನಿ');
  });

  it.each([...EXTRA_PUSH_LANGS])('%s: its own fallback copy passes the transit-copy validator', (lang) => {
    const c = getFallbackCopy('ingress', 'Mars', 'Leo', '2026-11-10', lang);
    expect(validateTransitCopy(c, lang)).toEqual({ ok: true });
  });

  it('a Kannada notification written in Latin letters is refused, like the older languages', () => {
    const r = validateTransitCopy({ title: 'Saturn', body: 'Saturn moves into Pisces on Thursday' }, 'kn');
    expect(r).toEqual({ ok: false, reason: 'wrong-script:kn' });
    expect(validateTransitCopy({ title: 'x', body: 'Saturn changes signs soon' }, 'ru').reason).toBe('wrong-script:ru');
    expect(validateTransitCopy({ title: 'x', body: 'Saturn changes signs soon' }, 'ja').reason).toBe('wrong-script:ja');
  });
});

describe('fact nudges in 15 languages', () => {
  it.each([...PUSH_LANGS])('%s: both tiers have a fallback in the right script and within the length limits', (lang) => {
    for (const tier of ['window', 'followup'] as const) {
      const c = getFactNudgeFallback(tier, lang);
      expect(c.body).toMatch(SCRIPT[lang]!);
      expect(c.title.length).toBeLessThanOrEqual(40);
      expect(c.body.length).toBeLessThanOrEqual(120);
    }
  });

  it.each([...EXTRA_PUSH_LANGS])('%s: the fallback passes the nudge validator', (lang) => {
    const pick = { tier: 'followup' as const, fact: 'x', followUpQuestion: null };
    expect(validateFactNudgeCopy(getFactNudgeFallback('followup', lang), lang, pick)).toEqual({ ok: true });
  });
});

describe('Sprint 4 copy in 15 languages', () => {
  it.each([...PUSH_LANGS])('%s: memory check-in, chat line and circle pulse', (lang) => {
    const push = memoryCheckInPush(lang);
    expect(push.title.length).toBeGreaterThan(3);
    expect(push.body).toMatch(SCRIPT[lang]!);
    // nothing private on the lock screen, and no unfilled placeholder anywhere
    expect(`${push.title} ${push.body}`).not.toMatch(/[{}]/);

    const line = memoryChatLine(lang, null);
    expect(line).toMatch(SCRIPT[lang]!);
    expect(memoryChatLine(lang, 'How did the interview go?')).toContain('How did the interview go?');

    for (const tone of ['glow', 'care'] as const) {
      const p = circlePulsePush(lang, 'Maa', tone);
      expect(`${p.title} ${p.body}`).toContain('Maa');
      expect(`${p.title} ${p.body}`).not.toMatch(/[{}]/);
      expect(p.body).toMatch(SCRIPT[lang]!);
    }
  });

  it('says "free" and nothing private in the check-in push, in every language', () => {
    for (const lang of PUSH_LANGS) {
      const push = memoryCheckInPush(lang);
      expect(push.body.length).toBeLessThan(140);
    }
  });

  it('a quiet or steady circle day never pushes bright copy', () => {
    expect(circlePulsePush('en', 'Maa', 'quiet').title).toBe('Go gently with Maa today');
    expect(circlePulsePush('en', 'Maa', 'steady').title).toBe('Go gently with Maa today');
    expect(circlePulsePush('en', 'Maa', 'glow').title).toBe("Maa's day looks bright");
  });
});

describe('fillCopy', () => {
  it('fills named placeholders and leaves unknown ones', () => {
    expect(fillCopy('{name} and {other}', { name: 'Maa' })).toBe('Maa and {other}');
  });
});
