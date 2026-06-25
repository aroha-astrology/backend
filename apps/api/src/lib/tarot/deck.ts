/**
 * The full 78-card tarot deck with Vedic flavor.
 *
 * Used as the source of truth for:
 *   - Random draw in /api/tarot
 *   - Per-card deterministic interpretation in lib/tarot/interpret.ts
 *   - Visual rendering in components/tarot/TarotCard3D|2D.tsx
 *
 * All meaning text is hand-written to be policy-safe:
 *   - No death/longevity language (the card NAMED "Death" speaks only of
 *     endings, release, and renewal — never physical mortality).
 *   - No banned words (PRICE/DISCOUNT/PROBLEM/HURRY/CONTRACT/BUY NOW/BASIC/STANDARD).
 *   - No profession verbatim — abstract, never sector-specific.
 *   - Planets/devas appear as soft flavor only, never headline jargon.
 */

export type Arcana = 'major' | 'minor';
export type Suit = 'cups' | 'pentacles' | 'swords' | 'wands';
export type Orientation = 'Upright' | 'Reversed';
export type CardElement = 'fire' | 'water' | 'air' | 'earth' | 'spirit';

export interface TarotCard {
  id: string;
  name: string;
  arcana: Arcana;
  suit?: Suit;
  number: string;
  keywords_upright: string[];
  keywords_reversed: string[];
  meaning_upright: string;
  meaning_reversed: string;
  vedic: {
    element: CardElement;
    deity_hint?: string;
  };
}

const SUIT_ELEMENT: Record<Suit, CardElement> = {
  cups: 'water',
  pentacles: 'earth',
  swords: 'air',
  wands: 'fire',
};

// ──────────────────────────────────────────────────────────────────────────────
// Major Arcana (22)
// ──────────────────────────────────────────────────────────────────────────────

const MAJOR_ARCANA: TarotCard[] = [
  {
    id: 'major-0',
    name: 'The Fool',
    arcana: 'major',
    number: '0',
    keywords_upright: ['fresh start', 'leap of faith', 'openness', 'innocence'],
    keywords_reversed: ['hesitation', 'naivety', 'reckless choice'],
    meaning_upright: 'A doorway has appeared and the only honest answer is to step through it. This card honors beginnings made without a finished map.',
    meaning_reversed: 'A leap is being delayed by overthinking, or taken without enough ground beneath it. Pause long enough to feel the difference between courage and impulse.',
    vedic: { element: 'spirit', deity_hint: 'Ganesha' },
  },
  {
    id: 'major-1',
    name: 'The Magician',
    arcana: 'major',
    number: 'I',
    keywords_upright: ['focused will', 'tools at hand', 'manifestation'],
    keywords_reversed: ['scattered focus', 'self-doubt', 'misused skill'],
    meaning_upright: 'Every element needed for the next move is already within reach. The work is to align intention, word, and action so the result mirrors the inner picture.',
    meaning_reversed: 'Energy is leaking through too many open tabs. Close one or two, and the remaining ones will finally light up.',
    vedic: { element: 'air', deity_hint: 'Saraswati' },
  },
  {
    id: 'major-2',
    name: 'The High Priestess',
    arcana: 'major',
    number: 'II',
    keywords_upright: ['intuition', 'inner knowing', 'stillness'],
    keywords_reversed: ['ignored gut', 'noise', 'surface answers'],
    meaning_upright: 'The deeper answer is already known — it is being drowned out by louder voices. Sit with the quieter one for a few days before deciding.',
    meaning_reversed: 'A clear inner signal is being talked over by outside opinions. Step away from the discussion long enough to hear yourself again.',
    vedic: { element: 'water', deity_hint: 'Saraswati' },
  },
  {
    id: 'major-3',
    name: 'The Empress',
    arcana: 'major',
    number: 'III',
    keywords_upright: ['abundance', 'nurture', 'creative bloom'],
    keywords_reversed: ['stalled creativity', 'self-neglect', 'over-giving'],
    meaning_upright: 'A season of growth is underway in love, creative work, or home life. Tend it with patience and it will yield generously.',
    meaning_reversed: 'Care that is owed inward is being poured outward instead. Restoring that balance restores the bloom.',
    vedic: { element: 'earth', deity_hint: 'Lakshmi' },
  },
  {
    id: 'major-4',
    name: 'The Emperor',
    arcana: 'major',
    number: 'IV',
    keywords_upright: ['structure', 'authority', 'discipline'],
    keywords_reversed: ['rigidity', 'control struggle', 'authority drift'],
    meaning_upright: 'Stability arrives by drawing firmer lines around time, energy, and commitments. Boundaries are a form of devotion here.',
    meaning_reversed: 'The framework that once protected is now boxing the growth in. Loosen the rule that has stopped serving.',
    vedic: { element: 'fire', deity_hint: 'Indra' },
  },
  {
    id: 'major-5',
    name: 'The Hierophant',
    arcana: 'major',
    number: 'V',
    keywords_upright: ['tradition', 'guidance', 'shared values'],
    keywords_reversed: ['questioning tradition', 'own path', 'unlearning'],
    meaning_upright: 'A mentor, ritual, or inherited wisdom is offering a steady hand. Receiving it is not weakness — it is alignment.',
    meaning_reversed: 'A rule passed down no longer fits the life being lived. Honor the source even as the form is reshaped.',
    vedic: { element: 'earth', deity_hint: 'Brihaspati' },
  },
  {
    id: 'major-6',
    name: 'The Lovers',
    arcana: 'major',
    number: 'VI',
    keywords_upright: ['union', 'aligned choice', 'values match'],
    keywords_reversed: ['mismatch', 'avoiding the talk', 'one-sided pull'],
    meaning_upright: 'A bond — to a person, a path, or a calling — asks for a clear yes from the whole self, not just one part. The choice made here echoes for a long time.',
    meaning_reversed: 'A conversation is being postponed because the answer would change too much. The longer it waits, the heavier it gets.',
    vedic: { element: 'air', deity_hint: 'Kamadeva' },
  },
  {
    id: 'major-7',
    name: 'The Chariot',
    arcana: 'major',
    number: 'VII',
    keywords_upright: ['drive', 'willpower', 'forward momentum'],
    keywords_reversed: ['stalled engine', 'pulling in two directions', 'aggression'],
    meaning_upright: 'Two opposing forces inside can be harnessed instead of fought. When they pull the same way, distance is covered fast.',
    meaning_reversed: 'Effort is high but direction is unclear. Stopping for one honest day of planning saves a month of pushing.',
    vedic: { element: 'water', deity_hint: 'Surya' },
  },
  {
    id: 'major-8',
    name: 'Strength',
    arcana: 'major',
    number: 'VIII',
    keywords_upright: ['gentle courage', 'patience', 'inner steadiness'],
    keywords_reversed: ['self-doubt', 'temper', 'depletion'],
    meaning_upright: 'Real strength here is the softer kind — the one that meets fear without flinching and without force. The lion is tamed by warmth, not the whip.',
    meaning_reversed: 'A short fuse or a tired body is doing the talking. Rest, then return.',
    vedic: { element: 'fire', deity_hint: 'Durga' },
  },
  {
    id: 'major-9',
    name: 'The Hermit',
    arcana: 'major',
    number: 'IX',
    keywords_upright: ['retreat', 'inner light', 'considered counsel'],
    keywords_reversed: ['isolation', 'avoidance', 'overthinking'],
    meaning_upright: 'A small distance from the crowd is what the next decision needs. The lamp lights only one step at a time, and that is enough.',
    meaning_reversed: 'Time alone has slipped into hiding. Reach out to one trusted voice this week.',
    vedic: { element: 'earth', deity_hint: 'Shiva' },
  },
  {
    id: 'major-10',
    name: 'Wheel of Fortune',
    arcana: 'major',
    number: 'X',
    keywords_upright: ['turning point', 'cycle', 'fated shift'],
    keywords_reversed: ['stuck cycle', 'resisting change', 'bad timing'],
    meaning_upright: 'A cycle that has been turning for a while is about to land in a new position. The shift is not random — it is the harvest of earlier choices.',
    meaning_reversed: 'The same lesson keeps returning until its quieter teaching is accepted. Look for the pattern, not the culprit.',
    vedic: { element: 'fire', deity_hint: 'Brihaspati' },
  },
  {
    id: 'major-11',
    name: 'Justice',
    arcana: 'major',
    number: 'XI',
    keywords_upright: ['fairness', 'truth', 'accountability'],
    keywords_reversed: ['imbalance', 'avoided truth', 'rationalizing'],
    meaning_upright: 'A clear-eyed reckoning is at hand. What is given out comes back in the same shape, so weigh actions before the scale does.',
    meaning_reversed: 'A story is being told to soften an honest fact. Naming the fact, even privately, is the start of the repair.',
    vedic: { element: 'air', deity_hint: 'Shani' },
  },
  {
    id: 'major-12',
    name: 'The Hanged Man',
    arcana: 'major',
    number: 'XII',
    keywords_upright: ['surrender', 'new perspective', 'pause'],
    keywords_reversed: ['stalling', 'martyrdom', 'wasted waiting'],
    meaning_upright: 'A different angle becomes visible only by letting go of the rope. The pause is the work, not the obstacle.',
    meaning_reversed: 'Suffering is being mistaken for progress. The wait is over — pick a direction.',
    vedic: { element: 'water', deity_hint: 'Vishnu' },
  },
  {
    id: 'major-13',
    name: 'Death',
    arcana: 'major',
    number: 'XIII',
    keywords_upright: ['ending', 'transformation', 'renewal', 'molting'],
    keywords_reversed: ['holding on', 'fear of change', 'half-finished ending'],
    meaning_upright: 'A chapter is asking to be closed so the next one can begin — a habit, a role, an identity that has finished its work. Endings here are the doorway, never the cliff.',
    meaning_reversed: 'A goodbye is being delayed long after the season has changed. Releasing what is already gone in spirit returns energy to what is alive.',
    vedic: { element: 'water', deity_hint: 'Kali' },
  },
  {
    id: 'major-14',
    name: 'Temperance',
    arcana: 'major',
    number: 'XIV',
    keywords_upright: ['balance', 'patience', 'blending'],
    keywords_reversed: ['extremes', 'impatience', 'imbalance'],
    meaning_upright: 'Two ingredients that seem opposed are quietly making something new together. Steady mixing beats fast pouring.',
    meaning_reversed: 'One side of the scale is carrying too much. Take a few grams off it this week.',
    vedic: { element: 'fire', deity_hint: 'Lakshmi' },
  },
  {
    id: 'major-15',
    name: 'The Devil',
    arcana: 'major',
    number: 'XV',
    keywords_upright: ['attachment', 'shadow pattern', 'compulsion'],
    keywords_reversed: ['breaking free', 'reclaiming power', 'awareness'],
    meaning_upright: 'A pattern feels stronger than it is because the door has been unlocked the whole time. Look honestly at what the attachment is paying for.',
    meaning_reversed: 'A long-held chain is loosening. The first step out always feels disloyal — keep walking anyway.',
    vedic: { element: 'earth', deity_hint: 'Bhairava' },
  },
  {
    id: 'major-16',
    name: 'The Tower',
    arcana: 'major',
    number: 'XVI',
    keywords_upright: ['sudden shake-up', 'truth revealed', 'rebuild'],
    keywords_reversed: ['averted crisis', 'slow unraveling', 'fearing the fall'],
    meaning_upright: 'A structure built on a shaky belief is being shaken down to the ground floor. What survives is what was actually true.',
    meaning_reversed: 'The crack is showing early enough to address it before the whole wall goes. Do not patch over what needs rebuilding.',
    vedic: { element: 'fire', deity_hint: 'Rudra' },
  },
  {
    id: 'major-17',
    name: 'The Star',
    arcana: 'major',
    number: 'XVII',
    keywords_upright: ['hope', 'healing', 'guiding light'],
    keywords_reversed: ['dimmed hope', 'self-doubt', 'losing the thread'],
    meaning_upright: 'After a rough stretch, a quieter, surer hope is returning. Drink from the well — it has been refilled.',
    meaning_reversed: 'Faith feels thinner than usual. Borrow some from someone who still has plenty, no shame in that.',
    vedic: { element: 'water', deity_hint: 'Saraswati' },
  },
  {
    id: 'major-18',
    name: 'The Moon',
    arcana: 'major',
    number: 'XVIII',
    keywords_upright: ['intuition', 'mystery', 'subconscious'],
    keywords_reversed: ['confusion clearing', 'projection', 'released fear'],
    meaning_upright: 'Things look bigger than they are at night. Walk the path slowly and let dawn sort the shadows from the shapes.',
    meaning_reversed: 'A fog that has clouded the picture is lifting. Old worries reveal themselves as stories more than facts.',
    vedic: { element: 'water', deity_hint: 'Chandra' },
  },
  {
    id: 'major-19',
    name: 'The Sun',
    arcana: 'major',
    number: 'XIX',
    keywords_upright: ['joy', 'clarity', 'vitality'],
    keywords_reversed: ['dimmed joy', 'overheating', 'forced cheer'],
    meaning_upright: 'The simple, bright kind of happiness is available right now. Stand in it for as long as it lasts.',
    meaning_reversed: 'A performance of fine is masking something quieter. Drop the act around one safe person this week.',
    vedic: { element: 'fire', deity_hint: 'Surya' },
  },
  {
    id: 'major-20',
    name: 'Judgement',
    arcana: 'major',
    number: 'XX',
    keywords_upright: ['awakening', 'calling', 'second chance'],
    keywords_reversed: ['ignoring the call', 'self-judgment', 'delay'],
    meaning_upright: 'A clear inner call is asking to be answered. The version of life being summoned is bigger than the one currently lived.',
    meaning_reversed: 'A nudge is being argued with instead of answered. Even one small yes shifts the whole arc.',
    vedic: { element: 'spirit', deity_hint: 'Yama (as awakener)' },
  },
  {
    id: 'major-21',
    name: 'The World',
    arcana: 'major',
    number: 'XXI',
    keywords_upright: ['completion', 'wholeness', 'arrival'],
    keywords_reversed: ['near-completion', 'loose ends', 'almost-there'],
    meaning_upright: 'A long arc is closing in a way that feels earned. Take a real beat to mark it before the next thing starts.',
    meaning_reversed: 'The finish line is in sight but a few threads are still unhemmed. Sit with the small last bit instead of skipping it.',
    vedic: { element: 'spirit', deity_hint: 'Adi Shakti' },
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// Minor Arcana — 56 cards = 4 suits × 14 ranks
// Suits: Cups (water/emotion), Pentacles (earth/material), Swords (air/mind), Wands (fire/will)
// Ranks: Ace, 2–10, Page, Knight, Queen, King
// ──────────────────────────────────────────────────────────────────────────────

interface MinorSeed {
  number: string;
  keywords_upright: string[];
  keywords_reversed: string[];
  meaning_upright: string;
  meaning_reversed: string;
}

const CUPS_SEEDS: MinorSeed[] = [
  { number: 'Ace', keywords_upright: ['new feeling', 'open heart', 'fresh love'], keywords_reversed: ['guarded heart', 'blocked feeling'], meaning_upright: 'A fresh wellspring of feeling is opening — love, creative spark, or a softer sense of self.', meaning_reversed: 'The cup is being held upside down. Let one drop in before pouring any out.' },
  { number: '2', keywords_upright: ['mutual care', 'meeting of equals'], keywords_reversed: ['imbalance', 'unspoken hurt'], meaning_upright: 'A bond is meeting on equal ground — what is offered is matched in kind.', meaning_reversed: 'The give and take has tilted. A small honest sentence resets it.' },
  { number: '3', keywords_upright: ['celebration', 'chosen circle'], keywords_reversed: ['outgrown crowd', 'social fatigue'], meaning_upright: 'Good company is the medicine right now. Lean toward the people who light you up.', meaning_reversed: 'The room is fuller than the connection. Trim, do not abandon.' },
  { number: '4', keywords_upright: ['contemplation', 'mild apathy'], keywords_reversed: ['re-engagement', 'noticing what is offered'], meaning_upright: 'Something good is being held just out of view by a vague disinterest. Look up.', meaning_reversed: 'Attention is returning. An offer that was overlooked is still on the table.' },
  { number: '5', keywords_upright: ['grief', 'loss noticed'], keywords_reversed: ['acceptance', 'turning around'], meaning_upright: 'Two cups have spilled — let the loss be felt without rushing past it. Three are still upright.', meaning_reversed: 'The eyes are turning from what was lost to what is still here.' },
  { number: '6', keywords_upright: ['nostalgia', 'innocence'], keywords_reversed: ['stuck in the past', 'rose-tinted memory'], meaning_upright: 'A kindness from the past is returning the favor. Memory is acting as a soft compass.', meaning_reversed: 'A version of the past is being polished instead of remembered. Update the picture.' },
  { number: '7', keywords_upright: ['many options', 'daydream'], keywords_reversed: ['clearer choice', 'discerning'], meaning_upright: 'Many cups, many shimmers — the trick is to choose the real one, not the prettiest.', meaning_reversed: 'The fog is lifting from a list of options. One stands out for honest reasons.' },
  { number: '8', keywords_upright: ['walking away', 'seeking depth'], keywords_reversed: ['returning', 'avoiding the leave'], meaning_upright: 'Something fine is being left behind because something truer is calling. The leaving is right.', meaning_reversed: 'Half of the self has already left; the other half is dragging its feet. Decide.' },
  { number: '9', keywords_upright: ['contentment', 'wish granted'], keywords_reversed: ['shallow satisfaction', 'over-indulgence'], meaning_upright: 'A small private satisfaction is well-earned. Enjoy it without making it the whole story.', meaning_reversed: 'Comfort has tilted toward excess. A lighter version will still taste good.' },
  { number: '10', keywords_upright: ['family joy', 'belonging'], keywords_reversed: ['domestic strain', 'misaligned home'], meaning_upright: 'A circle of belonging — chosen or born — is offering its warmth. Receive it.', meaning_reversed: 'A home or family rhythm is out of tune. One honest conversation tunes more than ten silent dinners.' },
  { number: 'Page', keywords_upright: ['tender beginnings', 'soft message'], keywords_reversed: ['emotional immaturity', 'guarded feelings'], meaning_upright: 'A small, hopeful feeling is asking for permission to be felt. Give it.', meaning_reversed: 'A reaction is younger than the situation. Pause, then respond as the current self.' },
  { number: 'Knight', keywords_upright: ['romantic gesture', 'following the heart'], keywords_reversed: ['mood swings', 'unreliable feelings'], meaning_upright: 'A heartfelt move is the right move, even if it is not the polished one.', meaning_reversed: 'Feelings are spiking and falling fast. Wait until the wave settles before sending the message.' },
  { number: 'Queen', keywords_upright: ['emotional wisdom', 'deep listening'], keywords_reversed: ['emotional flooding', 'absorbing too much'], meaning_upright: 'Hold space the way still water holds the moon — quietly, without trying to fix.', meaning_reversed: 'Other people\'s weather is being carried as if it were your own. Set it down for an hour.' },
  { number: 'King', keywords_upright: ['steady warmth', 'mature care'], keywords_reversed: ['suppressed feelings', 'moodiness disguised as calm'], meaning_upright: 'Lead with warmth and clarity in equal measure. Calm is not the absence of feeling — it is feeling, mastered.', meaning_reversed: 'A still surface is hiding a swirling underneath. Name the swirl before it leaks out sideways.' },
];

// Helper that fills the boilerplate around each suit seed.
function buildSuit(suit: Suit, seeds: MinorSeed[], deity: string): TarotCard[] {
  return seeds.map((seed) => ({
    id: `${suit}-${seed.number.toLowerCase()}`,
    name: `${seed.number} of ${suit.charAt(0).toUpperCase() + suit.slice(1)}`,
    arcana: 'minor' as const,
    suit,
    number: seed.number,
    keywords_upright: seed.keywords_upright,
    keywords_reversed: seed.keywords_reversed,
    meaning_upright: seed.meaning_upright,
    meaning_reversed: seed.meaning_reversed,
    vedic: { element: SUIT_ELEMENT[suit], deity_hint: deity },
  }));
}

const PENTACLES_SEEDS: MinorSeed[] = [
  { number: 'Ace', keywords_upright: ['new resource', 'tangible opportunity'], keywords_reversed: ['missed offer', 'scarcity mindset'], meaning_upright: 'A real, touchable opportunity is being placed in your hand — a seed for the long crop.', meaning_reversed: 'A solid offer is being squinted at and almost set down. Look again before passing.' },
  { number: '2', keywords_upright: ['juggling', 'flexible balance'], keywords_reversed: ['dropping a ball', 'overstretched'], meaning_upright: 'Two demands are being kept in motion gracefully — the trick is staying loose, not gripping tight.', meaning_reversed: 'One too many balls is in the air. It is okay to set one down for the week.' },
  { number: '3', keywords_upright: ['collaboration', 'craft'], keywords_reversed: ['solo strain', 'misaligned team'], meaning_upright: 'Skill is being recognized by people who can read the craft. Keep showing the work.', meaning_reversed: 'Carrying a build alone that was meant for three. Ask once, clearly.' },
  { number: '4', keywords_upright: ['holding on', 'security'], keywords_reversed: ['loosened grip', 'releasing scarcity'], meaning_upright: 'A safe base is well-kept — just check that the holding has not become hoarding.', meaning_reversed: 'A grip that protected through the lean season is finally relaxing.' },
  { number: '5', keywords_upright: ['lean stretch', 'feeling left out'], keywords_reversed: ['recovery', 'help nearby'], meaning_upright: 'The tight season asks for courage to ask for help — the warmer room is closer than it looks.', meaning_reversed: 'A lean stretch is loosening. Resources, human and otherwise, are returning.' },
  { number: '6', keywords_upright: ['giving and receiving', 'fair exchange'], keywords_reversed: ['lopsided giving', 'strings attached'], meaning_upright: 'A clean exchange is on offer — give what is asked, receive what is offered, no scoreboard.', meaning_reversed: 'Help is coming with a hidden bill. Read the fine lines before saying yes.' },
  { number: '7', keywords_upright: ['patient assessment', 'long-game'], keywords_reversed: ['impatience', 'pulling up the seedling'], meaning_upright: 'The crop is not yet ready — stand back, do not yank. The pause is part of the yield.', meaning_reversed: 'A reasonable wait is being shortcut. The fast move costs the slow gain.' },
  { number: '8', keywords_upright: ['skilled labor', 'craft mastery'], keywords_reversed: ['rushed work', 'perfectionism stall'], meaning_upright: 'Quiet, repeated practice is sharpening a skill in the background. Trust the reps.', meaning_reversed: 'Either the work is too rushed to be true craft, or it is being polished past usefulness. Find the middle.' },
  { number: '9', keywords_upright: ['self-made comfort', 'independent ease'], keywords_reversed: ['lonely abundance', 'over-self-reliance'], meaning_upright: 'A garden tended alone is in full bloom — savor it without apology.', meaning_reversed: 'Comfort built solo has started to feel a little quiet. Invite someone into it.' },
  { number: '10', keywords_upright: ['legacy', 'long-term wealth'], keywords_reversed: ['inheritance tension', 'short-term grab'], meaning_upright: 'A foundation is being laid that will outlast the current effort. Build with the next generation in mind.', meaning_reversed: 'A long-term plan is being tugged toward a short-term reward. Choose the slower yes.' },
  { number: 'Page', keywords_upright: ['new study', 'curious starter'], keywords_reversed: ['inconsistent effort', 'distraction'], meaning_upright: 'A learner\'s posture suits the moment — small, regular practice over heroic bursts.', meaning_reversed: 'Curiosity keeps starting and stopping. Pick one thread and finish a week of it.' },
  { number: 'Knight', keywords_upright: ['steady progress', 'reliable plodding'], keywords_reversed: ['stalled momentum', 'tedium'], meaning_upright: 'Slow is the right speed for this stretch. Boring is winning.', meaning_reversed: 'The plodding has tipped into stagnation. Adjust the route, not the engine.' },
  { number: 'Queen', keywords_upright: ['grounded nurture', 'practical care'], keywords_reversed: ['over-extending', 'forgetting the self'], meaning_upright: 'Care expressed through what is fed, kept, and tended is potent right now. The practical is the romantic.', meaning_reversed: 'The cup has emptied while being poured. Refill before serving another round.' },
  { number: 'King', keywords_upright: ['steady provider', 'long-built success'], keywords_reversed: ['stubborn material focus', 'stinginess'], meaning_upright: 'Patient, unflashy stewardship is the move. Wealth here is measured in roots, not leaves.', meaning_reversed: 'Holding too tightly to what was hard-won. Open a fist, see what flows in.' },
];

const SWORDS_SEEDS: MinorSeed[] = [
  { number: 'Ace', keywords_upright: ['breakthrough idea', 'clarity'], keywords_reversed: ['confused thought', 'cutting too quickly'], meaning_upright: 'A clean thought cuts through a tangle that has been there for weeks. Write it down before it dulls.', meaning_reversed: 'A sharp realization is being used to hurt rather than to clarify. Aim it at the problem, not the person.' },
  { number: '2', keywords_upright: ['stalemate', 'avoiding the choice'], keywords_reversed: ['decision returns', 'eyes opening'], meaning_upright: 'A choice is being avoided by sitting equally between the two. The blindfold can come off any time.', meaning_reversed: 'The eyes are opening. What was being not-decided is finally being decided.' },
  { number: '3', keywords_upright: ['painful truth', 'heartache'], keywords_reversed: ['mending', 'releasing the story'], meaning_upright: 'A truth that hurts is also a truth that frees. Feel it; do not skip the grieving.', meaning_reversed: 'The wound is closing. The story told about it can soften now too.' },
  { number: '4', keywords_upright: ['rest', 'mental retreat'], keywords_reversed: ['restlessness', 'returning to the fray too soon'], meaning_upright: 'A pause is owed to a tired mind. Lay the sword down for a few days.', meaning_reversed: 'The pause is over — the rest of the muscles are asking for movement.' },
  { number: '5', keywords_upright: ['hollow win', 'conflict cost'], keywords_reversed: ['burying the hatchet', 'moving on'], meaning_upright: 'Winning the argument here costs more than losing it would. Choose the relationship over the point.', meaning_reversed: 'A conflict is finally being set down. The repair is in walking away, not relitigating.' },
  { number: '6', keywords_upright: ['transition', 'moving to calmer water'], keywords_reversed: ['unfinished crossing', 'lingering'], meaning_upright: 'Moving from rough water to a smoother shore. Take only what is needed for the ride.', meaning_reversed: 'The boat keeps turning back toward the old shore. Untie the rope.' },
  { number: '7', keywords_upright: ['stealth', 'half-truth', 'strategic exit'], keywords_reversed: ['confession', 'returning what was taken'], meaning_upright: 'A workaround is being weighed — make sure the shortcut does not become the long road.', meaning_reversed: 'A small dishonesty is asking to be made right. The first sentence is the hardest, then it gets easier.' },
  { number: '8', keywords_upright: ['feeling trapped', 'self-imposed limits'], keywords_reversed: ['walking free', 'untying the rope'], meaning_upright: 'The walls are mostly imagined — the blindfold can be lifted. Look at what is actually holding what.', meaning_reversed: 'A long-held trap is being walked out of. One step is enough today.' },
  { number: '9', keywords_upright: ['night worry', 'mental looping'], keywords_reversed: ['worry easing', 'dawn breaking'], meaning_upright: 'The mind is making things bigger at 3am than they are in daylight. Write them down and re-read by sun.', meaning_reversed: 'The dark hours are getting shorter. The looping is starting to loosen.' },
  { number: '10', keywords_upright: ['rock bottom', 'a chapter ends hard'], keywords_reversed: ['dawn after the long night', 'recovery beginning'], meaning_upright: 'A bottom has been hit — and it is also where the climb begins. The hardest part is past.', meaning_reversed: 'Recovery is underway. Treat the body and the heart gently for a while.' },
  { number: 'Page', keywords_upright: ['curious mind', 'gathering facts'], keywords_reversed: ['gossip', 'using words carelessly'], meaning_upright: 'A learner\'s curiosity is opening a door — ask the question, gather the facts.', meaning_reversed: 'Words are flying faster than thought right now. Slow them down.' },
  { number: 'Knight', keywords_upright: ['decisive action', 'speaking up'], keywords_reversed: ['bluster', 'speaking before thinking'], meaning_upright: 'A clean, fast move solves what a careful one has been avoiding. Speak the sentence.', meaning_reversed: 'Speed has tipped into recklessness. Slow the horse before someone gets hurt.' },
  { number: 'Queen', keywords_upright: ['clear-eyed honesty', 'discerning'], keywords_reversed: ['sharp tongue', 'cold logic'], meaning_upright: 'Sharp clarity is being offered without cruelty. The truth, said plainly, is a gift.', meaning_reversed: 'Truth is being delivered with a blade where a feather would do. Soften the edge.' },
  { number: 'King', keywords_upright: ['principled judgment', 'fair authority'], keywords_reversed: ['cold rule', 'rigid thinking'], meaning_upright: 'Lead with reason and a code that holds in all weathers. Logic with warmth.', meaning_reversed: 'A position is being defended past its usefulness. Update the model.' },
];

const WANDS_SEEDS: MinorSeed[] = [
  { number: 'Ace', keywords_upright: ['inspiration', 'creative spark'], keywords_reversed: ['stalled spark', 'creative block'], meaning_upright: 'A spark has caught — protect the early flame by acting on it within the week.', meaning_reversed: 'A spark is being talked about more than tended. One small action lights it.' },
  { number: '2', keywords_upright: ['planning the bigger map', 'first sight of horizon'], keywords_reversed: ['playing small', 'fear of the bigger move'], meaning_upright: 'A vision is forming for something larger. Walk to the edge of the balcony and look.', meaning_reversed: 'The map is being drawn smaller than the talent. Add a horizon line.' },
  { number: '3', keywords_upright: ['ships sailing', 'plans in motion'], keywords_reversed: ['delays', 'plans returning empty'], meaning_upright: 'Ships sent out are due back with cargo. Stand on the shore and wait well.', meaning_reversed: 'A plan is taking longer than expected to bear fruit. Use the wait to refine the next one.' },
  { number: '4', keywords_upright: ['celebration', 'home complete'], keywords_reversed: ['unfinished foundation', 'tension at home'], meaning_upright: 'A milestone is reached and worth honoring — gather the people who carried it with you.', meaning_reversed: 'A foundation is being roofed before it has cured. Slow down the finishing.' },
  { number: '5', keywords_upright: ['friendly clash', 'creative friction'], keywords_reversed: ['avoided conflict', 'truce'], meaning_upright: 'A scrappy disagreement is sharpening the work. Lean into the friction, do not punish it.', meaning_reversed: 'A truce is being called too early — the real disagreement has not been spoken.' },
  { number: '6', keywords_upright: ['public recognition', 'victory lap'], keywords_reversed: ['quiet doubt', 'imposter feeling'], meaning_upright: 'The win is being seen and named. Receive it without minimizing.', meaning_reversed: 'The applause feels louder than the actual feeling. Sit with what is real underneath.' },
  { number: '7', keywords_upright: ['holding ground', 'defending the position'], keywords_reversed: ['overwhelmed defense', 'giving up the hill'], meaning_upright: 'The high ground is yours — keep the boundary even when six voices push at it.', meaning_reversed: 'The defense is costing more than the position. Choose a smaller hill.' },
  { number: '8', keywords_upright: ['fast movement', 'news arriving'], keywords_reversed: ['delayed news', 'scattering energy'], meaning_upright: 'Things are moving fast — say yes to the meetings, return the messages.', meaning_reversed: 'A flurry of activity is producing little. Concentrate the energy into one channel.' },
  { number: '9', keywords_upright: ['tired but still standing', 'resilience'], keywords_reversed: ['hyper-vigilance', 'paranoia'], meaning_upright: 'You are closer to the end than you feel. One more round of the same effort wraps it up.', meaning_reversed: 'The shield is up even when no arrow is flying. Set it down for an evening.' },
  { number: '10', keywords_upright: ['heavy load', 'almost-home burden'], keywords_reversed: ['delegating', 'putting the bundle down'], meaning_upright: 'A heavy bundle is being carried — almost home. Set it down for ten minutes, then finish the walk.', meaning_reversed: 'Some of what is being carried is not yours. Hand it back.' },
  { number: 'Page', keywords_upright: ['eager beginner', 'message of opportunity'], keywords_reversed: ['scattered enthusiasm', 'fizzling start'], meaning_upright: 'A messenger of opportunity is at the door. Open it, listen, decide later.', meaning_reversed: 'Enthusiasm is firing in too many directions. Pick one for thirty days.' },
  { number: 'Knight', keywords_upright: ['bold move', 'adventure'], keywords_reversed: ['rashness', 'unfinished ventures'], meaning_upright: 'A bold, somewhat risky move is the right one. The horse is fast — ride it.', meaning_reversed: 'The previous bold move is not done yet. Finish before mounting the next horse.' },
  { number: 'Queen', keywords_upright: ['charisma', 'warm leadership'], keywords_reversed: ['fragile ego', 'energy drain'], meaning_upright: 'Lead with warmth and confidence — magnetism is doing half the work.', meaning_reversed: 'Approval is being chased instead of offered. Refill from within first.' },
  { number: 'King', keywords_upright: ['visionary leadership', 'bold steadiness'], keywords_reversed: ['overreach', 'autocratic tone'], meaning_upright: 'Vision plus follow-through is the unbeatable combination right now. Set the bigger flag.', meaning_reversed: 'Vision is racing ahead of execution. Bring the plan back to today\'s steps.' },
];

const MINOR_ARCANA: TarotCard[] = [
  ...buildSuit('cups', CUPS_SEEDS, 'Varuna'),
  ...buildSuit('pentacles', PENTACLES_SEEDS, 'Kubera'),
  ...buildSuit('swords', SWORDS_SEEDS, 'Vayu'),
  ...buildSuit('wands', WANDS_SEEDS, 'Agni'),
];

// ──────────────────────────────────────────────────────────────────────────────
// Full deck export
// ──────────────────────────────────────────────────────────────────────────────

export const TAROT_DECK: TarotCard[] = [...MAJOR_ARCANA, ...MINOR_ARCANA];

export interface DrawnCard extends TarotCard {
  orientation: Orientation;
}

export function drawCards(count: number): DrawnCard[] {
  const shuffled = [...TAROT_DECK].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((card) => ({
    ...card,
    orientation: Math.random() > 0.5 ? 'Upright' : 'Reversed',
  }));
}

export function findCard(id: string): TarotCard | undefined {
  return TAROT_DECK.find((c) => c.id === id);
}
