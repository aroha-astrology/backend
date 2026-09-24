import type { WhyFactor } from './types.js';

/**
 * English one-liners for WhyFactors, for the chat model to read (it answers in
 * the user's language). The app renders the same factors from its own
 * translation keys — this is only the model-facing copy, so it doesn't need
 * to match those strings word for word.
 */
const ORDINAL = [
  '',
  '1st',
  '2nd',
  '3rd',
  '4th',
  '5th',
  '6th',
  '7th',
  '8th',
  '9th',
  '10th',
  '11th',
  '12th',
];

const TEMPLATES: Record<string, (p: Record<string, string | number>) => string> = {
  'why.dasha.mahadasha': (p) => `Running ${p.planet} Mahadasha (until ${p.until}).`,
  'why.dasha.mahadashaLinked': (p) =>
    `Running ${p.planet} Mahadasha (until ${p.until}); ${p.planet} is tied to the ${ORDINAL[Number(p.house)]} house.`,
  'why.dasha.mahadashaKaraka': (p) =>
    `Running ${p.planet} Mahadasha (until ${p.until}); ${p.planet} is the natural significator of this area.`,
  'why.dasha.antardasha': (p) => `${p.planet} Antardasha (until ${p.until}).`,
  'why.dasha.antardashaLinked': (p) =>
    `${p.planet} Antardasha (until ${p.until}); ${p.planet} is tied to the ${ORDINAL[Number(p.house)]} house.`,
  'why.dasha.antardashaKaraka': (p) =>
    `${p.planet} Antardasha (until ${p.until}); ${p.planet} is the natural significator of this area.`,
  'why.lordship': (p) =>
    `The ${ORDINAL[Number(p.house)]} lord, ${p.planet}, sits in the ${ORDINAL[Number(p.placed)]} house.`,
  'why.occupant': (p) => `Natal ${p.planet} sits in the ${ORDINAL[Number(p.house)]} house.`,
  'why.transit': (p) =>
    `${p.planet} is transiting ${p.sign}, the ${ORDINAL[Number(p.house)]} house from the natal Moon.`,
  'why.transitRetro': (p) =>
    `${p.planet} is retrograde in ${p.sign}, the ${ORDINAL[Number(p.house)]} house from the natal Moon.`,
  'why.moonToday': (p) =>
    `Today's Moon is in ${p.sign}, the ${ORDINAL[Number(p.house)]} from the natal Moon.`,
  'why.tara': (p) => `Today's nakshatra is tara ${p.tara} from the birth star.`,
};

const EFFECT = { 1: 'supports', 0: 'neutral', [-1]: 'strains' } as const;

export function whyFactorEnglish(f: WhyFactor): string {
  const render = TEMPLATES[f.textKey];
  const text = render ? render(f.params ?? {}) : f.textKey;
  return `${text} (${EFFECT[f.effect]})`;
}
