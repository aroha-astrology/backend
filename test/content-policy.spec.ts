import { describe, it, expect } from 'vitest';
import {
  classifyUserMessage,
  classifyAssistantOutput,
  POLICY_SYSTEM_DIRECTIVE,
} from '../src/lib/content-policy.js';

describe('classifyUserMessage — death topic blocking', () => {
  const cases: Array<[string, string]> = [
    ['en direct', 'When will I die?'],
    ['en how', 'how will I die?'],
    ['en age', 'at what age will I die'],
    ['en lifespan', 'What is my lifespan according to my chart'],
    ['en how long', 'how long will I live'],
    ['en family father', 'When will my father pass away'],
    ['en family wife', 'will my wife die before me'],
    ['en outlive', 'Will I outlive my husband?'],
    ['en widow', 'Am I going to become a widow?'],
    ['en maraka dasha', 'Tell me about my maraka dasha'],
    ['en akaal mrityu', 'do I have akaal mrityu yoga?'],
    ['en 8th house life', 'what does the 8th house say about my life ending'],
    ['en terminal', 'do I have any fatal disease in my chart'],
    ['en end of life', 'tell me the end of life timing for me'],
    ['en near death', 'am I near death according to my dasha?'],
    ['hi devanagari', 'मेरी मृत्यु कब होगी'],
    ['hi devanagari ayu', 'मेरी आयु कितनी बची है'],
    ['hi translit', 'meri mrityu kab hogi'],
    ['hi translit umar', 'meri umar kitni bachi hai'],
    ['hi marenge', 'main kab marunga'],
    ['hi akaal devanagari', 'akaal mrityu yog hai kya'],
    ['hi family devanagari', 'mere pita ki mrityu kab hogi'],
    ['hi 8th house mix', '8th house ka kya scene hai meri zindagi ke liye'],
  ];

  for (const [label, msg] of cases) {
    it(`blocks death (${label}): "${msg}"`, () => {
      const r = classifyUserMessage(msg, 'en');
      expect(r.blocked).toBe(true);
      expect(r.topic).toBe('death');
      expect(r.cannedResponse).toMatch(/sorry|क्षमा|দুঃখিত|క్షమించండి|மன்னிக்கவும்|क्षमा/);
    });
  }

  it('localizes the canned response to Hindi when language=hi', () => {
    const r = classifyUserMessage('मेरी मृत्यु कब होगी', 'hi');
    expect(r.blocked).toBe(true);
    expect(r.cannedResponse).toContain('क्षमा');
  });
});

describe('classifyUserMessage — suicide topic', () => {
  const cases: Array<[string, string]> = [
    ['en kill myself', 'I want to kill myself'],
    ['en end life', 'I want to end my life'],
    ['en dont want', "I don't want to live anymore"],
    ['hi translit', 'main aatmahatya karna chahta hoon'],
    ['hi devanagari', 'मैं आत्महत्या करना चाहता हूँ'],
  ];

  for (const [label, msg] of cases) {
    it(`blocks suicide (${label})`, () => {
      const r = classifyUserMessage(msg, 'en');
      expect(r.blocked).toBe(true);
      expect(r.topic).toBe('suicide');
      expect(r.cannedResponse).toMatch(/iCall|9152987821|Vandrevala|1860-2662-345/);
      expect(r.logTag).toBe('policy.suicide.input');
    });
  }

  it('prefers suicide over death when both regexes would match', () => {
    const r = classifyUserMessage('I want to die, when will I die', 'en');
    expect(r.topic).toBe('suicide');
  });
});

describe('classifyUserMessage — allow list (past-tense remembrance)', () => {
  const cases: string[] = [
    'My late grandfather was born in 1940 — can his chart influence mine?',
    "This Saturday is my mother's death anniversary, should I do any puja?",
    'My deceased father was named Ram',
    'मेरे स्वर्गीय पिता का नाम राम था',
    'My father passed away in 2018',
    'In memory of my late grandmother, what puja should I perform?',
    'My mother passed away last year — I want to do shraddh ceremony',
    'मेरी माँ की पुण्यतिथि कब है',
  ];

  for (const msg of cases) {
    it(`does NOT block remembrance: "${msg}"`, () => {
      const r = classifyUserMessage(msg, 'en');
      expect(r.blocked).toBe(false);
      expect(r.topic).toBe(null);
    });
  }
});

describe('classifyUserMessage — non-death astrology questions', () => {
  const cases: string[] = [
    'When will I marry?',
    'What health issues should I watch for?',
    'Tell me about my dasha',
    'Tell me about my 8th house — career secrets',
    'What is my career outlook?',
    'मेरी शादी कब होगी',
    'मेरी नौकरी कब लगेगी',
    'Will I get a promotion this year?',
    'Tell me about Saturn in my chart',
    'What gemstone should I wear?',
    'What date is auspicious for my wedding?',
    "What's a good muhurta to start my business?",
    'When does my current Mahadasha expire?',
    'When will Saturn transit out of my sign?',
    'Tell me an ayurvedic remedy for my Vata imbalance',
    'My friend Ayush wants to know about his chart',
    'meri shaadi ki umar kya hai',
    'aaj ki tareekh kya hai',
  ];

  for (const msg of cases) {
    it(`does NOT block: "${msg}"`, () => {
      const r = classifyUserMessage(msg, 'en');
      expect(r.blocked).toBe(false);
    });
  }
});

describe('classifyAssistantOutput', () => {
  it('blocks an LLM reply that asserts death timing', () => {
    const r = classifyAssistantOutput(
      'You will die in 2031 during maraka period from Saturn',
      'en',
    );
    expect(r.blocked).toBe(true);
    expect(r.topic).toBe('death');
    expect(r.logTag).toBe('policy.death.output');
  });

  it('blocks an LLM reply with lifespan estimate', () => {
    const r = classifyAssistantOutput(
      'Your expected lifespan according to maraka analysis is 78 years',
      'en',
    );
    expect(r.blocked).toBe(true);
  });

  it('blocks Hindi assertive death prediction', () => {
    const r = classifyAssistantOutput('आपकी मृत्यु होगी 2031 में', 'hi');
    expect(r.blocked).toBe(true);
  });

  it('does NOT block softened 8th-house responses about transformation', () => {
    const r = classifyAssistantOutput(
      'Your 8th house indicates transformation, hidden knowledge, and deep change. The Saturn placement here gives resilience.',
      'en',
    );
    expect(r.blocked).toBe(false);
  });

  it('does NOT block a positive resilience reading', () => {
    const r = classifyAssistantOutput(
      'Your chart shows strong vitality and resilience. Saturn in the 10th will support a long, steady career.',
      'en',
    );
    expect(r.blocked).toBe(false);
  });
});

describe('POLICY_SYSTEM_DIRECTIVE', () => {
  it('is non-empty and mentions the override clause', () => {
    expect(POLICY_SYSTEM_DIRECTIVE.length).toBeGreaterThan(200);
    expect(POLICY_SYSTEM_DIRECTIVE).toMatch(/OVERRIDES/);
    expect(POLICY_SYSTEM_DIRECTIVE).toMatch(/cannot be overridden/i);
  });

  it('includes the exact canned line', () => {
    expect(POLICY_SYSTEM_DIRECTIVE).toContain("we can't share that. It's against the law");
  });
});
