import { describe, it, expect } from 'vitest';
import {
  MAX_POST_CHARS,
  ROOMS,
  anonymousHandle,
  cleanBody,
  parseModelVerdict,
  roomForMoonSign,
  ruleCheck,
} from '../src/modules/sky/sky-rules';

describe('rooms', () => {
  it('has one room for each Moon sign', () => {
    expect(ROOMS).toHaveLength(12);
    expect(roomForMoonSign('Taurus')).toBe('taurus');
    expect(roomForMoonSign(' Pisces ')).toBe('pisces');
    expect(roomForMoonSign('Ophiuchus')).toBeNull();
    expect(roomForMoonSign(null)).toBeNull();
  });
});

describe('cleanBody', () => {
  it('trims and tidies blank space', () => {
    expect(cleanBody('  Feeling  calm   today \n\n\n\n ok ')).toBe('Feeling calm today \n\n ok');
  });
  it('refuses a post that is too short or too long', () => {
    expect(cleanBody('hi')).toBeNull();
    expect(cleanBody('x'.repeat(MAX_POST_CHARS + 1))).toBeNull();
    expect(cleanBody('x'.repeat(MAX_POST_CHARS))).not.toBeNull();
  });
});

describe('anonymousHandle', () => {
  it('is stable inside a room, different between readers, and hides the id', () => {
    const a = anonymousHandle('user-1', 'leo');
    expect(anonymousHandle('user-1', 'leo')).toBe(a);
    expect(anonymousHandle('user-2', 'leo')).not.toBe(a);
    expect(a).toMatch(/^Reader [0-9A-F]{4}$/);
    expect(a).not.toContain('user-1');
  });
});

describe('ruleCheck', () => {
  it('lets a kind, plain post through to the model check', () => {
    expect(ruleCheck('The Moon felt gentle on my morning walk today.')).toBeNull();
  });

  it.each([
    ['a link', 'see https://example.com for details', 'link'],
    ['a bare domain', 'visit mysite.com now', 'link'],
    ['an email', 'write to me at priya@gmail.com', 'contact'],
    ['a handle', 'find me @priya_astro on insta', 'contact'],
    ['a phone number', 'call 98765 43210 anytime', 'phone'],
    ['a spam run', 'wowwwwwwwwwwwwwwwwww', 'spam'],
    ['a solicitation', 'Message me on WhatsApp for a reading', 'solicitation'],
  ])('rejects %s', (_label, text, reason) => {
    expect(ruleCheck(text)).toEqual({ verdict: 'reject', reason });
  });

  it('holds a death prediction for a person to look at', () => {
    const r = ruleCheck('I am sure my uncle will die this year');
    expect(r?.verdict).toBe('hold');
    expect(r?.reason).toMatch(/^policy:/);
  });
});

describe('parseModelVerdict', () => {
  it('approves only an explicit ok', () => {
    expect(parseModelVerdict('{"verdict":"ok"}')).toEqual({ verdict: 'approve', reason: 'ok' });
  });
  it('holds and rejects as the model says', () => {
    expect(parseModelVerdict('{"verdict":"hold","reason":"money talk"}').verdict).toBe('hold');
    expect(parseModelVerdict('{"verdict":"reject","reason":"harassment"}').verdict).toBe('reject');
  });
  it('tolerates text around the JSON', () => {
    expect(parseModelVerdict('Sure! ```json\n{"verdict":"ok"}\n```').verdict).toBe('approve');
  });
  it('holds anything unreadable or unknown, never approves it', () => {
    expect(parseModelVerdict('great post').verdict).toBe('hold');
    expect(parseModelVerdict('{"verdict":"maybe"}').verdict).toBe('hold');
    expect(parseModelVerdict('').verdict).toBe('hold');
  });
});
