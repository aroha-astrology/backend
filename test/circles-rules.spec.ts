import { describe, it, expect } from 'vitest';
import {
  firstNameOf,
  generateInviteCode,
  identityText,
  INVITE_CODE_PATTERN,
  pulseScore,
  pulseTone,
} from '../src/modules/circles/circles-rules';
import { notablePulse, pulseCopy } from '../src/modules/cron/circle-pulse.service';

describe('pulseScore', () => {
  it('is half the Bonds compatibility and half the Moon of the day', () => {
    expect(pulseScore(80, 'excellent', 'excellent')).toBe(90);
    expect(pulseScore(80, 'poor', 'poor')).toBe(49);
    expect(pulseScore(0, 'poor', 'poor')).toBe(9);
    expect(pulseScore(100, 'excellent', 'excellent')).toBe(100);
  });

  it('averages the two people\'s days', () => {
    expect(pulseScore(60, 'excellent', 'poor')).toBe(Math.round(30 + 29.5));
  });

  it('stays inside 0-100 even for a wild compatibility', () => {
    expect(pulseScore(250, 'excellent', 'excellent')).toBe(100);
    expect(pulseScore(-40, 'poor', 'poor')).toBe(9);
  });

  it('a better Moon for either person never lowers the pulse', () => {
    const order = ['poor', 'average', 'good', 'excellent'] as const;
    let last = -1;
    for (const q of order) {
      const s = pulseScore(55, q, 'average');
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
  });
});

describe('pulseTone', () => {
  it('bands the score', () => {
    expect(pulseTone(100)).toBe('glow');
    expect(pulseTone(70)).toBe('glow');
    expect(pulseTone(69)).toBe('steady');
    expect(pulseTone(52)).toBe('steady');
    expect(pulseTone(51)).toBe('quiet');
    expect(pulseTone(38)).toBe('quiet');
    expect(pulseTone(37)).toBe('care');
    expect(pulseTone(0)).toBe('care');
  });
});

describe('identityText', () => {
  const base = { dateOfBirth: '1990-04-12', timeOfBirth: '06:30', lat: 28.6139, lon: 77.209 };

  it('is the date, time and place to two decimals, and ignores the name', () => {
    expect(identityText(base)).toBe('1990-04-12|06:30|28.61,77.21');
  });

  it('the same person typed with a slightly different place coordinate is one identity', () => {
    expect(identityText({ ...base, lat: 28.6141, lon: 77.2089 })).toBe(identityText(base));
  });

  it('another birth time or place is another identity', () => {
    expect(identityText({ ...base, timeOfBirth: '06:31' })).not.toBe(identityText(base));
    expect(identityText({ ...base, lat: 19.07, lon: 72.87 })).not.toBe(identityText(base));
  });

  it('copes with a missing time or place, and is null without a date', () => {
    expect(identityText({ dateOfBirth: '1990-04-12', timeOfBirth: null, lat: null, lon: null })).toBe('1990-04-12||');
    expect(identityText({ dateOfBirth: null, timeOfBirth: '06:30', lat: 1, lon: 1 })).toBeNull();
  });
});

describe('generateInviteCode', () => {
  it('is 10 unambiguous characters', () => {
    for (let i = 0; i < 200; i++) expect(generateInviteCode()).toMatch(INVITE_CODE_PATTERN);
  });

  it('does not repeat in a thousand tries', () => {
    const seen = new Set(Array.from({ length: 1000 }, () => generateInviteCode()));
    expect(seen.size).toBe(1000);
  });

  it('the pattern rejects look-alike characters and wrong lengths', () => {
    expect(INVITE_CODE_PATTERN.test('0OIL1abcde')).toBe(false);
    expect(INVITE_CODE_PATTERN.test('ABCDEFGHJ')).toBe(false);
    expect(INVITE_CODE_PATTERN.test('ABCDEFGHJKM')).toBe(false);
  });
});

describe('firstNameOf', () => {
  it('shows only the first word', () => {
    expect(firstNameOf('Asha Kumari Verma')).toBe('Asha');
    expect(firstNameOf('  Ravi ')).toBe('Ravi');
    expect(firstNameOf(null)).toBe('');
  });
});

describe('notablePulse', () => {
  it('picks the brightest day at 70 or more', () => {
    expect(notablePulse([{ score: 55 }, { score: 82 }, { score: 20 }])).toEqual({ score: 82 });
  });

  it('otherwise the tenderest day under 38', () => {
    expect(notablePulse([{ score: 55 }, { score: 30 }, { score: 45 }])).toEqual({ score: 30 });
  });

  it('is silent when nothing stands out', () => {
    expect(notablePulse([{ score: 55 }, { score: 45 }])).toBeNull();
    expect(notablePulse([])).toBeNull();
  });
});

describe('pulseCopy', () => {
  it('names the person and never predicts what they feel', () => {
    for (const tone of ['glow', 'care'] as const) {
      const { title, body } = pulseCopy('Maa', tone);
      expect(title).toContain('Maa');
      expect(`${title} ${body}`).not.toMatch(/\b(feels?|will|angry|sad)\b/i);
    }
  });
});
