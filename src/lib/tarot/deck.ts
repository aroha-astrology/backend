// =============================================================================
// Standard 78-card tarot deck (Rider-Waite-Smith tradition, public-domain
// traditional meanings) + a cryptographically-random 3-card "Past / Present /
// Future" draw. The draw is 100% deterministic ONCE PERFORMED — it happens
// exactly once, at report-generation time, and the result (which cards, which
// orientation, which position) is persisted forever in prime_reports.analysis,
// same as every other report's one-time-generate-then-cache pattern. The AI
// layer (lib/llm/tarot-report.ts) only interprets an already-fixed draw; it
// never chooses or invents which cards came up.
// =============================================================================

import { randomInt } from 'node:crypto';

export type TarotArcana = 'major' | 'minor';
export type TarotPosition = 'past' | 'present' | 'future';

export interface TarotCard {
  name: string;
  arcana: TarotArcana;
  uprightMeaning: string;
  reversedMeaning: string;
}

export const TAROT_DECK: TarotCard[] = [
  // --- Major Arcana (22) ---
  {
    name: 'The Fool',
    arcana: 'major',
    uprightMeaning: 'new beginnings, spontaneity, a leap of faith',
    reversedMeaning: 'recklessness, hesitation, poor judgment',
  },
  {
    name: 'The Magician',
    arcana: 'major',
    uprightMeaning: 'manifestation, resourcefulness, having the tools you need',
    reversedMeaning: 'manipulation, untapped talent, poor planning',
  },
  {
    name: 'The High Priestess',
    arcana: 'major',
    uprightMeaning: 'intuition, inner knowing, hidden knowledge',
    reversedMeaning: 'ignoring intuition, secrets withheld',
  },
  {
    name: 'The Empress',
    arcana: 'major',
    uprightMeaning: 'abundance, nurturing, creativity, fertility',
    reversedMeaning: 'creative block, dependence, neglect',
  },
  {
    name: 'The Emperor',
    arcana: 'major',
    uprightMeaning: 'structure, authority, stability',
    reversedMeaning: 'rigidity, domination, lack of discipline',
  },
  {
    name: 'The Hierophant',
    arcana: 'major',
    uprightMeaning: 'tradition, guidance, established institutions',
    reversedMeaning: 'rebellion against convention, unconventional paths',
  },
  {
    name: 'The Lovers',
    arcana: 'major',
    uprightMeaning: 'connection, choice, alignment of values',
    reversedMeaning: 'misalignment, indecision, disharmony',
  },
  {
    name: 'The Chariot',
    arcana: 'major',
    uprightMeaning: 'willpower, determination, victory through control',
    reversedMeaning: 'lack of direction, aggression, scattered energy',
  },
  {
    name: 'Strength',
    arcana: 'major',
    uprightMeaning: 'courage, patience, inner strength over force',
    reversedMeaning: 'self-doubt, low energy, insecurity',
  },
  {
    name: 'The Hermit',
    arcana: 'major',
    uprightMeaning: 'introspection, solitude, inner guidance',
    reversedMeaning: 'isolation, withdrawal, loneliness',
  },
  {
    name: 'Wheel of Fortune',
    arcana: 'major',
    uprightMeaning: 'change, cycles, turning points',
    reversedMeaning: 'resistance to change, bad luck, feeling stuck',
  },
  {
    name: 'Justice',
    arcana: 'major',
    uprightMeaning: 'fairness, truth, cause and effect',
    reversedMeaning: 'unfairness, avoiding accountability',
  },
  {
    name: 'The Hanged Man',
    arcana: 'major',
    uprightMeaning: 'pause, new perspective, surrender',
    reversedMeaning: 'stalling, resistance, martyrdom',
  },
  {
    name: 'Death',
    arcana: 'major',
    uprightMeaning: 'endings, transformation, letting go',
    reversedMeaning: 'resistance to change, fear of endings',
  },
  {
    name: 'Temperance',
    arcana: 'major',
    uprightMeaning: 'balance, moderation, patience',
    reversedMeaning: 'excess, imbalance, lack of long-term vision',
  },
  {
    name: 'The Devil',
    arcana: 'major',
    uprightMeaning: 'attachment, restriction, unhealthy patterns',
    reversedMeaning: 'breaking free, releasing limiting beliefs',
  },
  {
    name: 'The Tower',
    arcana: 'major',
    uprightMeaning: "sudden upheaval, revelation, breaking down what's false",
    reversedMeaning: 'avoiding disaster, delayed change',
  },
  {
    name: 'The Star',
    arcana: 'major',
    uprightMeaning: 'hope, renewal, inspiration',
    reversedMeaning: 'despair, disconnection, lack of faith',
  },
  {
    name: 'The Moon',
    arcana: 'major',
    uprightMeaning: 'illusion, intuition, uncertainty',
    reversedMeaning: 'releasing fear, clarity emerging',
  },
  {
    name: 'The Sun',
    arcana: 'major',
    uprightMeaning: 'joy, success, vitality',
    reversedMeaning: 'temporary sadness, lack of clarity about success',
  },
  {
    name: 'Judgement',
    arcana: 'major',
    uprightMeaning: 'reflection, reckoning, awakening',
    reversedMeaning: 'self-doubt, ignoring the call, harsh self-judgment',
  },
  {
    name: 'The World',
    arcana: 'major',
    uprightMeaning: 'completion, fulfillment, wholeness',
    reversedMeaning: 'incompletion, delay, lack of closure',
  },

  // --- Wands (fire: passion, creativity, action) ---
  {
    name: 'Ace of Wands',
    arcana: 'minor',
    uprightMeaning: 'new inspiration, creative spark',
    reversedMeaning: 'delays, lack of motivation',
  },
  {
    name: 'Two of Wands',
    arcana: 'minor',
    uprightMeaning: 'planning, future vision',
    reversedMeaning: 'fear of the unknown, playing it too safe',
  },
  {
    name: 'Three of Wands',
    arcana: 'minor',
    uprightMeaning: 'expansion, foresight, waiting for progress',
    reversedMeaning: 'delays, lack of foresight',
  },
  {
    name: 'Four of Wands',
    arcana: 'minor',
    uprightMeaning: 'celebration, harmony, homecoming',
    reversedMeaning: 'instability, lack of support',
  },
  {
    name: 'Five of Wands',
    arcana: 'minor',
    uprightMeaning: 'conflict, competition, tension',
    reversedMeaning: 'avoiding conflict, resolving disputes',
  },
  {
    name: 'Six of Wands',
    arcana: 'minor',
    uprightMeaning: 'victory, recognition, success',
    reversedMeaning: 'setback, lack of recognition',
  },
  {
    name: 'Seven of Wands',
    arcana: 'minor',
    uprightMeaning: 'defending your position, perseverance',
    reversedMeaning: 'giving up, feeling overwhelmed',
  },
  {
    name: 'Eight of Wands',
    arcana: 'minor',
    uprightMeaning: 'fast movement, swift action, alignment',
    reversedMeaning: 'delays, frustration',
  },
  {
    name: 'Nine of Wands',
    arcana: 'minor',
    uprightMeaning: 'resilience, persistence, last stretch',
    reversedMeaning: 'exhaustion, giving up close to the finish',
  },
  {
    name: 'Ten of Wands',
    arcana: 'minor',
    uprightMeaning: 'burden, responsibility, hard work',
    reversedMeaning: 'releasing burdens, delegating',
  },
  {
    name: 'Page of Wands',
    arcana: 'minor',
    uprightMeaning: 'exploration, enthusiasm, a new idea',
    reversedMeaning: 'lack of direction, procrastination',
  },
  {
    name: 'Knight of Wands',
    arcana: 'minor',
    uprightMeaning: 'energy, passion, adventure',
    reversedMeaning: 'impulsiveness, recklessness',
  },
  {
    name: 'Queen of Wands',
    arcana: 'minor',
    uprightMeaning: 'confidence, warmth, determination',
    reversedMeaning: 'insecurity, jealousy',
  },
  {
    name: 'King of Wands',
    arcana: 'minor',
    uprightMeaning: 'visionary leadership, boldness',
    reversedMeaning: 'impulsiveness, high expectations',
  },

  // --- Cups (water: emotion, relationships, intuition) ---
  {
    name: 'Ace of Cups',
    arcana: 'minor',
    uprightMeaning: 'new emotional beginning, love, compassion',
    reversedMeaning: 'emotional blockage, unrequited love',
  },
  {
    name: 'Two of Cups',
    arcana: 'minor',
    uprightMeaning: 'partnership, mutual attraction, union',
    reversedMeaning: 'imbalance, disconnection',
  },
  {
    name: 'Three of Cups',
    arcana: 'minor',
    uprightMeaning: 'friendship, celebration, community',
    reversedMeaning: 'overindulgence, gossip',
  },
  {
    name: 'Four of Cups',
    arcana: 'minor',
    uprightMeaning: 'contemplation, apathy, a missed opportunity',
    reversedMeaning: 'renewed interest, awareness',
  },
  {
    name: 'Five of Cups',
    arcana: 'minor',
    uprightMeaning: 'loss, regret, grief',
    reversedMeaning: 'acceptance, moving on',
  },
  {
    name: 'Six of Cups',
    arcana: 'minor',
    uprightMeaning: 'nostalgia, reunion, childhood memories',
    reversedMeaning: 'living in the past, stuck in nostalgia',
  },
  {
    name: 'Seven of Cups',
    arcana: 'minor',
    uprightMeaning: 'choices, illusion, wishful thinking',
    reversedMeaning: 'clarity, making a decision',
  },
  {
    name: 'Eight of Cups',
    arcana: 'minor',
    uprightMeaning: 'walking away, seeking deeper meaning',
    reversedMeaning: 'fear of change, staying too long',
  },
  {
    name: 'Nine of Cups',
    arcana: 'minor',
    uprightMeaning: 'contentment, satisfaction, a wish fulfilled',
    reversedMeaning: 'overindulgence, dissatisfaction',
  },
  {
    name: 'Ten of Cups',
    arcana: 'minor',
    uprightMeaning: 'harmony, emotional fulfillment, family bliss',
    reversedMeaning: 'disconnection, unrealistic expectations',
  },
  {
    name: 'Page of Cups',
    arcana: 'minor',
    uprightMeaning: 'emotional openness, a creative message',
    reversedMeaning: 'emotional immaturity, moodiness',
  },
  {
    name: 'Knight of Cups',
    arcana: 'minor',
    uprightMeaning: 'romance, charm, following the heart',
    reversedMeaning: 'unrealistic expectations, moodiness',
  },
  {
    name: 'Queen of Cups',
    arcana: 'minor',
    uprightMeaning: 'compassion, emotional security, intuition',
    reversedMeaning: 'emotional insecurity, martyrdom',
  },
  {
    name: 'King of Cups',
    arcana: 'minor',
    uprightMeaning: 'emotional balance, wisdom, generosity',
    reversedMeaning: 'emotional manipulation, moodiness',
  },

  // --- Swords (air: intellect, conflict, communication) ---
  {
    name: 'Ace of Swords',
    arcana: 'minor',
    uprightMeaning: 'clarity, breakthrough, a new idea',
    reversedMeaning: 'confusion, miscommunication',
  },
  {
    name: 'Two of Swords',
    arcana: 'minor',
    uprightMeaning: 'a difficult choice, indecision, stalemate',
    reversedMeaning: 'indecision resolved, information revealed',
  },
  {
    name: 'Three of Swords',
    arcana: 'minor',
    uprightMeaning: 'heartbreak, grief, painful truth',
    reversedMeaning: 'healing, releasing pain',
  },
  {
    name: 'Four of Swords',
    arcana: 'minor',
    uprightMeaning: 'rest, recovery, contemplation',
    reversedMeaning: 'restlessness, burnout',
  },
  {
    name: 'Five of Swords',
    arcana: 'minor',
    uprightMeaning: 'conflict, winning at all costs, tension',
    reversedMeaning: 'reconciliation, moving past conflict',
  },
  {
    name: 'Six of Swords',
    arcana: 'minor',
    uprightMeaning: 'transition, moving forward, leaving difficulty behind',
    reversedMeaning: 'resistance to change, unresolved issues',
  },
  {
    name: 'Seven of Swords',
    arcana: 'minor',
    uprightMeaning: 'deception, strategy, acting alone',
    reversedMeaning: 'coming clean, facing consequences',
  },
  {
    name: 'Eight of Swords',
    arcana: 'minor',
    uprightMeaning: 'feeling trapped, restriction, self-imposed limits',
    reversedMeaning: 'releasing limiting beliefs, freedom',
  },
  {
    name: 'Nine of Swords',
    arcana: 'minor',
    uprightMeaning: 'anxiety, worry, sleepless nights',
    reversedMeaning: 'releasing worry, finding relief',
  },
  {
    name: 'Ten of Swords',
    arcana: 'minor',
    uprightMeaning: 'a painful ending, rock bottom, betrayal',
    reversedMeaning: 'recovery, a difficult chapter closing',
  },
  {
    name: 'Page of Swords',
    arcana: 'minor',
    uprightMeaning: 'curiosity, new ideas, vigilance',
    reversedMeaning: 'gossip, all talk no action',
  },
  {
    name: 'Knight of Swords',
    arcana: 'minor',
    uprightMeaning: 'fast action, ambition, directness',
    reversedMeaning: 'recklessness, impulsiveness',
  },
  {
    name: 'Queen of Swords',
    arcana: 'minor',
    uprightMeaning: 'clarity, independence, direct communication',
    reversedMeaning: 'coldness, bitterness',
  },
  {
    name: 'King of Swords',
    arcana: 'minor',
    uprightMeaning: 'intellectual clarity, authority, truth',
    reversedMeaning: 'manipulation, abuse of power',
  },

  // --- Pentacles (earth: material, career, finance) ---
  {
    name: 'Ace of Pentacles',
    arcana: 'minor',
    uprightMeaning: 'a new opportunity, prosperity, manifestation',
    reversedMeaning: 'a missed opportunity, poor planning',
  },
  {
    name: 'Two of Pentacles',
    arcana: 'minor',
    uprightMeaning: 'balance, adaptability, juggling priorities',
    reversedMeaning: 'overwhelm, disorganization',
  },
  {
    name: 'Three of Pentacles',
    arcana: 'minor',
    uprightMeaning: 'teamwork, collaboration, skill',
    reversedMeaning: 'lack of teamwork, misalignment',
  },
  {
    name: 'Four of Pentacles',
    arcana: 'minor',
    uprightMeaning: 'security, saving, control',
    reversedMeaning: 'over-attachment to material things',
  },
  {
    name: 'Five of Pentacles',
    arcana: 'minor',
    uprightMeaning: 'hardship, financial loss, isolation',
    reversedMeaning: 'recovery, support arriving',
  },
  {
    name: 'Six of Pentacles',
    arcana: 'minor',
    uprightMeaning: 'generosity, giving and receiving, charity',
    reversedMeaning: 'strings attached, imbalance',
  },
  {
    name: 'Seven of Pentacles',
    arcana: 'minor',
    uprightMeaning: 'patience, long-term investment, assessment',
    reversedMeaning: 'impatience, lack of reward',
  },
  {
    name: 'Eight of Pentacles',
    arcana: 'minor',
    uprightMeaning: 'mastery, diligence, skill-building',
    reversedMeaning: 'perfectionism, lack of focus',
  },
  {
    name: 'Nine of Pentacles',
    arcana: 'minor',
    uprightMeaning: 'abundance, self-sufficiency, luxury',
    reversedMeaning: 'overwork, a financial setback',
  },
  {
    name: 'Ten of Pentacles',
    arcana: 'minor',
    uprightMeaning: 'legacy, long-term success, family wealth',
    reversedMeaning: 'financial loss, family disputes',
  },
  {
    name: 'Page of Pentacles',
    arcana: 'minor',
    uprightMeaning: 'a new opportunity, studiousness, manifestation',
    reversedMeaning: 'lack of progress, procrastination',
  },
  {
    name: 'Knight of Pentacles',
    arcana: 'minor',
    uprightMeaning: 'hard work, reliability, routine',
    reversedMeaning: 'laziness, stagnation',
  },
  {
    name: 'Queen of Pentacles',
    arcana: 'minor',
    uprightMeaning: 'nurturing, practical abundance, groundedness',
    reversedMeaning: 'financial insecurity, neglecting self-care',
  },
  {
    name: 'King of Pentacles',
    arcana: 'minor',
    uprightMeaning: 'financial security, discipline, abundance',
    reversedMeaning: 'greed, poor financial decisions',
  },
];

export interface DrawnTarotCard {
  card: TarotCard;
  reversed: boolean;
  position: TarotPosition;
}

const POSITIONS: TarotPosition[] = ['past', 'present', 'future'];

/** Fisher-Yates shuffle using node:crypto's randomInt for unbiased, non-deterministic order. */
function shuffledDeck(): TarotCard[] {
  const deck = [...TAROT_DECK];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

/**
 * Draws exactly 3 distinct cards (no repeats — a single shuffled deck slice)
 * and assigns each an independent random upright/reversed orientation and a
 * fixed position (past/present/future). Called exactly ONCE per report
 * generation — the caller persists the result forever, so calling this twice
 * would produce two different readings (by design; that's why it's called
 * only at initial generation time, never on a cached read).
 */
export function drawThreeCardSpread(): DrawnTarotCard[] {
  const shuffled = shuffledDeck();
  return POSITIONS.map((position, i) => ({
    card: shuffled[i]!,
    reversed: randomInt(2) === 1,
    position,
  }));
}
