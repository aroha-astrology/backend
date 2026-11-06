import { describe, it, expect, beforeAll } from 'vitest';
import {
  aiTellHits, checkProse, deathHits, fearHits, gentleHits, isSentenceFixable, scoreNumberHits, sentencesOf,
} from '../src/lib/llm/reports/report-text-checks.js';
import {
  buildFactIndex, checkVarshikSection, claimHitsForSentence, crossSectionOpeningHits, dropFlaggedSentences,
  leakedLabelHits, personaHitsForSection, polarityHitsForSection,
} from '../src/lib/llm/reports/verify-claims.js';
import { buildVarshikFactsForReader } from '../src/modules/reports/generators/varshik-2027.generator.js';
import { dayMonth, type VarshikFacts } from '../src/lib/astro-engine/reports/varshik-facts.js';

// Real facts for a made-up reader: single, a student, no children (the persona rules read these).
let facts: VarshikFacts;
beforeAll(async () => {
  facts = await buildVarshikFactsForReader({
    name: 'Test',
    birthDate: '1990-01-12',
    birthTime: '06:15',
    place: { lat: 28.61, lon: 77.21, tz: 'Asia/Kolkata' },
    answers: { relationship: 'single', occupation: 'student', children: 'none', mainDecision: 'study' },
    facts: [],
  });
}, 120_000);

const clone = (f: VarshikFacts): VarshikFacts => JSON.parse(JSON.stringify(f)) as VarshikFacts;

describe('report text checks', () => {
  it('sentencesOf splits on sentence boundaries', () => {
    expect(sentencesOf('One. Two! Three?')).toEqual(['One.', 'Two!', 'Three?']);
  });

  it('aiTellHits detects stock words like delve and journey', () => {
    const hits = aiTellHits(['We will delve into your journey.']);
    expect(hits.some((h) => h.rule === 'ai-tell:stock-word' && h.text.includes('delve') && h.text.includes('journey'))).toBe(true);
  });

  it('aiTellHits returns empty for plain short text', () => {
    const hits = aiTellHits(['Plain words with no tells at all. It is short.']);
    expect(hits).toEqual([]);
  });

  it('aiTellHits detects not-but pattern', () => {
    const hits = aiTellHits(['This is not luck, but timing. It is not rest, but preparation.']);
    expect(hits.some((h) => h.rule === 'ai-tell:not-but')).toBe(true);
  });

  it('aiTellHits detects em dashes', () => {
    const hits = aiTellHits(['Wait — then go — now — again.']);
    expect(hits.some((h) => h.rule === 'ai-tell:dashes')).toBe(true);
  });

  it('aiTellHits detects repeated openings in a paragraph', () => {
    const paragraph = Array(8).fill('Your month brings change.');
    const hits = aiTellHits([paragraph.join(' ')]);
    expect(hits.some((h) => h.rule === 'ai-tell:openings')).toBe(true);
  });

  it('fearHits detects disaster sentences', () => {
    const hits = fearHits(['A disaster may come. Rest well.']);
    expect(hits.length).toBe(1);
    expect(hits[0]!.rule).toBe('fear');
    expect(hits[0]!.text).toBe('A disaster may come.');
  });

  it('deathHits detects death sentences', () => {
    const hits = deathHits(['Take care on the road. He may die soon.']);
    expect(hits.length).toBe(1);
    expect(hits[0]!.text).toBe('He may die soon.');
  });

  it('gentleHits and checkProse detect gentle tone', () => {
    const hits = gentleHits(['Unfortunately this is impossible.']);
    expect(hits.length).toBe(1);
    const proseHits = checkProse(['Unfortunately this is impossible.']);
    expect(proseHits.some((h) => h.rule === 'gentle')).toBe(false);
    const proseHitsGentle = checkProse(['Unfortunately this is impossible.'], { gentle: true });
    expect(proseHitsGentle.some((h) => h.rule === 'gentle')).toBe(true);
  });

  it('scoreNumberHits detects score patterns', () => {
    const hits = scoreNumberHits(['Your score is 72/100.', 'About 60% better.']);
    expect(hits.length).toBe(2);
    expect(hits.every((h) => h.rule === 'score-number')).toBe(true);
  });

  it('the zodiac sign Cancer is not the illness', () => {
    expect(deathHits(['The Moon enters Cancer on 5 June, your 12th house.'])).toEqual([]);
    expect(deathHits(['A solar eclipse falls in Cancer.'])).toEqual([]);
    expect(deathHits(['He has cancer.'])).toHaveLength(1);
  });

  it('isSentenceFixable returns correct boolean', () => {
    expect(isSentenceFixable('fear')).toBe(true);
    expect(isSentenceFixable('ai-tell:dashes')).toBe(false);
  });
});

describe('claims against the facts', () => {
  it('A real date passes the claim check', () => {
    const e = facts.skyEvents[0]!;
    const sentence = `Something happens on ${dayMonth(e.date)}.`;
    expect(claimHitsForSentence(sentence, buildFactIndex(facts))).toEqual([]);
  });

  it('A date that is in no fact fails the claim check', () => {
    const known = buildFactIndex(facts).dates;
    // A day in March that no fact has in 2026, 2027 or 2028 (a date with no year may be any of those).
    let bad = 0;
    for (let day = 2; day <= 27 && bad === 0; day++) {
      const dd = String(day).padStart(2, '0');
      if (!['2026', '2027', '2028'].some((y) => known.has(`${y}-03-${dd}`))) bad = day;
    }
    expect(bad).toBeGreaterThan(0);
    const sentence = `The turning point is on ${dayMonth(`2027-03-${String(bad).padStart(2, '0')}`)}.`;
    const hits = claimHitsForSentence(sentence, buildFactIndex(facts));
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]!.rule).toBe('claim');
  });
  it('Year Lord: correct year lord passes', () => {
    const v = facts.varsha[facts.varsha.length - 1]!;
    const sentence = `The Year Lord is ${v.yearLord}.`;
    expect(claimHitsForSentence(sentence, buildFactIndex(facts))).toEqual([]);
  });

  it('Year Lord: incorrect planet fails', () => {
    const existing = new Set(facts.varsha.map(x => x.yearLord));
    let thatPlanet: string | undefined;
    for (const p of ['Sun','Moon','Mars','Mercury','Jupiter','Venus','Saturn']) {
      if (!existing.has(p)) {
        thatPlanet = p;
        break;
      }
    }
    const sentence = `The Year Lord is ${thatPlanet}.`;
    expect(claimHitsForSentence(sentence, buildFactIndex(facts))).toHaveLength(1);
  });

  it('a count of eclipses or retrogrades must match the facts', () => {
    const index = buildFactIndex(facts);
    const n = index.eclipses;
    const words = ['', '', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
    expect(claimHitsForSentence(`The sky holds ${words[n]} eclipses this year.`, index)).toEqual([]);
    expect(claimHitsForSentence(`The sky holds ${words[n === 2 ? 3 : 2]} eclipses this year.`, index).length).toBeGreaterThan(0);
    const real = index.retrogrades.Mercury ?? 0;
    const say = ['', 'once', 'twice', 'three times', 'four times'];
    expect(claimHitsForSentence(`Mercury turns retrograde ${say[real]}.`, index)).toEqual([]);
    expect(claimHitsForSentence(`Mercury turns retrograde ${say[real === 1 ? 2 : 1]}.`, index).length).toBeGreaterThan(0);
  });

  it('A house that does not exist fails', () => {
    const hits = claimHitsForSentence('Mars sits in your 14th house.', buildFactIndex(facts));
    expect(hits.some((h) => h.rule === 'claim')).toBe(true);
  });

  it('A placement that IS in the facts passes', () => {
    const p = facts.birth.planets[0]!;
    let ord: string;
    switch (p.house) {
      case 1: ord = '1st'; break;
      case 2: ord = '2nd'; break;
      case 3: ord = '3rd'; break;
      default: ord = `${p.house}th`; break;
    }
    const sentence = `${p.planet} sits in your ${ord} house.`;
    expect(claimHitsForSentence(sentence, buildFactIndex(facts))).toEqual([]);
  });
});

describe('polarity', () => {
  it('rust tier detects polarity for positive advice', () => {
    const f = clone(facts);
    f.scores.months[0]!.tier = 'rust';
    const hits = polarityHitsForSection('month_01', ['This is the best time to launch your business.'], f);
    expect(hits.some((h) => h.rule === 'polarity')).toBe(true);
  });

  it('dark_green tier detects polarity for negative advice', () => {
    const f = clone(facts);
    f.scores.months[0]!.tier = 'dark_green';
    const hits = polarityHitsForSection('month_01', ['Hold off on every plan this month.'], f);
    expect(hits.some((h) => h.rule === 'polarity')).toBe(true);
  });

  it('amber tier does not detect polarity for either sentence', () => {
    const f = clone(facts);
    f.scores.months[0]!.tier = 'amber';
    const hits1 = polarityHitsForSection('month_01', ['This is the best time to launch your business.'], f);
    expect(hits1.some((h) => h.rule === 'polarity')).toBe(false);
    const hits2 = polarityHitsForSection('month_01', ['Hold off on every plan this month.'], f);
    expect(hits2.some((h) => h.rule === 'polarity')).toBe(false);
  });
});

describe('persona', () => {
  it('single relationship detects persona hit for husband, married does not', () => {
    const hits1 = personaHitsForSection(['Talk to your husband tonight.'], { relationship: 'single' });
    expect(hits1.some((h) => h.rule === 'persona')).toBe(true);
    const hits2 = personaHitsForSection(['Talk to your husband tonight.'], { relationship: 'married' });
    expect(hits2).toEqual([]);
  });

  it('children none detects persona hit, have does not', () => {
    const hits1 = personaHitsForSection(['Your children need you.'], { children: 'none' });
    expect(hits1.some((h) => h.rule === 'persona')).toBe(true);
    const hits2 = personaHitsForSection(['Your children need you.'], { children: 'have' });
    expect(hits2).toEqual([]);
  });

  it('student occupation detects persona hit, working does not', () => {
    const hits1 = personaHitsForSection(['Ask your boss for a raise.'], { occupation: 'student' });
    expect(hits1.some((h) => h.rule === 'persona')).toBe(true);
    const hits2 = personaHitsForSection(['Ask your boss for a raise.'], { occupation: 'working' });
    expect(hits2).toEqual([]);
  });

  it('no answers detects persona hit by default', () => {
    const hits = personaHitsForSection(['Talk to your wife.'], {});
    expect(hits.some((h) => h.rule === 'persona')).toBe(true);
  });
});

describe('labels, dropping and openings', () => {
  it('leakedLabelHits detects tone words', () => {
    const hits1 = leakedLabelHits(['Career carries a weigh tone this year.']);
    expect(hits1.length).toBe(1);
    const hits2 = leakedLabelHits(['It is TIER_HOLD.']);
    expect(hits2.length).toBe(1);
    expect(leakedLabelHits(['Growth carries a steady tone across 2027.'])).toEqual([]);
    const hits3 = leakedLabelHits(['A calm month.']);
    expect(hits3).toEqual([]);
  });

  it('dropFlaggedSentences removes fear sentences', () => {
    const result = dropFlaggedSentences({ paragraphs: ['Good sentence. A disaster may come.'] }, fearHits(['Good sentence. A disaster may come.']));
    expect(result.paragraphs).toEqual(['Good sentence.']);
  });

  it('AI-tell hits are never dropped', () => {
    const result = dropFlaggedSentences({ paragraphs: ['Keep this.'] }, [{ rule: 'ai-tell:dashes', text: 'Keep this.' }]);
    expect(result.paragraphs).toEqual(['Keep this.']);
  });

  it('A paragraph emptied by a drop disappears', () => {
    const result = dropFlaggedSentences({ paragraphs: ['A disaster may come.', 'Fine.'] }, fearHits(['A disaster may come.']));
    expect(result.paragraphs).toEqual(['Fine.']);
  });

  it('crossSectionOpeningHits detects repeated openings in sections', () => {
    const sections = [
      { id: 'month_01', paragraphs: ['The month at a glance is calm.'] },
      { id: 'month_02', paragraphs: ['The month at a glance is calm.'] },
      { id: 'month_03', paragraphs: ['The month at a glance is calm.'] },
    ];
    const map = crossSectionOpeningHits(sections);
    expect(map.has('month_01')).toBe(false);
    expect(map.get('month_02')?.[0]?.rule).toBe('ai-tell:openings');
  });

  it('crossSectionOpeningHits returns empty when first words differ', () => {
    const sections = [
      { id: 'month_01', paragraphs: ['The month at a glance is calm.'] },
      { id: 'month_02', paragraphs: ['This section has different text here.'] },
      { id: 'month_03', paragraphs: ['Another unique opening sentence now.'] },
    ];
    const map = crossSectionOpeningHits(sections);
    expect(map.size).toBe(0);
  });

  it('checkVarshikSection detects gentle rule in what_changes section', () => {
    const hits = checkVarshikSection({ id: 'what_changes', heading: 'x', paragraphs: ['Unfortunately nothing helps.'] }, facts);
    expect(hits.some((h) => h.rule === 'gentle')).toBe(true);
  });

  it('checkVarshikSection does not detect gentle rule in month_01 section', () => {
    const hits = checkVarshikSection({ id: 'month_01', heading: 'x', paragraphs: ['Unfortunately nothing helps.'] }, facts);
    expect(hits.some((h) => h.rule === 'gentle')).toBe(false);
  });
});
