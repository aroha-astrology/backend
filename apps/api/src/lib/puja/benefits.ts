// Maps an `intent_tags` value (from pujas table) to a user-facing benefit title.
// Used on the puja detail page to render the "Puja Benefits" list.

const TAG_BENEFITS: Record<string, { title: string; body: string }> = {
  obstacles: {
    title: 'Removal of Obstacles',
    body:  'Clears blockages that have been delaying breakthroughs in your work, relationships or aspirations.',
  },
  wealth: {
    title: 'Prosperity & Abundance',
    body:  'Activates wealth-bringing planetary energies and supports cash flow, business growth and financial stability.',
  },
  career: {
    title: 'Career Growth & Authority',
    body:  'Strengthens the planets governing recognition, leadership and professional momentum.',
  },
  marriage: {
    title: 'Marital Harmony',
    body:  'Reduces friction in relationships and supports timely marriage when delays are indicated.',
  },
  childbirth: {
    title: 'Blessings for Children',
    body:  'Invokes deities and mantras traditionally invoked for conception and the well-being of children.',
  },
  health: {
    title: 'Physical & Mental Health',
    body:  'Pacifies graha doshas linked to chronic discomfort, anxiety or recurring illness.',
  },
  longevity: {
    title: 'Long Life & Vitality',
    body:  'Strengthens the longevity karaka and offers protection from untimely setbacks.',
  },
  protection: {
    title: 'Protection from Negativity',
    body:  'Shields you from evil eye, malefic transits and harmful intent of others.',
  },
  moksha: {
    title: 'Spiritual Progress',
    body:  'Supports inner clarity, detachment and ultimate liberation as defined in the dharmic tradition.',
  },
  education: {
    title: 'Learning & Wisdom',
    body:  'Awakens intellect, memory and articulation — recommended for students and seekers.',
  },
  home: {
    title: 'Domestic Peace',
    body:  'Harmonises the home environment and dissolves family discord.',
  },
  property: {
    title: 'Property & Stability',
    body:  'Settles disputes over land or property and consecrates new spaces.',
  },
};

export function benefitsForIntents(intents: string[]): { title: string; body: string }[] {
  const seen = new Set<string>();
  const out: { title: string; body: string }[] = [];
  for (const tag of intents) {
    const b = TAG_BENEFITS[tag];
    if (b && !seen.has(b.title)) {
      seen.add(b.title);
      out.push(b);
    }
  }
  return out.slice(0, 5);
}

export const STANDARD_PROCESS_STEPS = [
  {
    title: 'Select Puja',
    description: 'Choose this puja and any package offerings you want to include.',
  },
  {
    title: 'Add Offerings',
    description: 'Enhance your puja experience with optional offerings like Anna Seva, Vastra Seva, Gau Seva, or Deep Seva.',
  },
  {
    title: 'Provide Sankalp Details',
    description: 'Enter the name and gotra of each member you want included in the sankalp — yourself, a couple, or up to 6 family members.',
  },
  {
    title: 'Puja Day Updates',
    description: 'An experienced pandit performs the sacred puja and chants your sankalp during the ritual. You receive live updates.',
  },
  {
    title: 'Puja Video & Aashirwad Box',
    description: 'You receive a personalised puja video and divine Aashirwad box delivered to your home.',
  },
];
