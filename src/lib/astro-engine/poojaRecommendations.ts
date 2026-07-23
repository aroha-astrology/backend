// =============================================================================
// Deterministic pooja recommendations, derived from the user's already-
// computed dosha data (kundli.doshaData). Purely traditional/curated data —
// no AI involved in deciding WHICH poojas apply, only in the narrative
// wrapper (see lib/llm/pooja-report.ts) that explains why.
// =============================================================================

export interface PoojaRecommendation {
  name: string;
  deity: string;
  forCondition: string;
  description: string;
}

const GENERAL_POOJAS: PoojaRecommendation[] = [
  {
    name: 'Satyanarayan Pooja',
    deity: 'Lord Vishnu',
    forCondition: 'General wellbeing',
    description:
      'A traditional pooja performed for overall prosperity, harmony, and removing obstacles — suitable for anyone regardless of specific chart afflictions.',
  },
  {
    name: 'Navgraha Shanti Pooja',
    deity: 'The nine planets (Navagraha)',
    forCondition: 'General planetary balance',
    description:
      'Propitiates all nine planetary deities together to support overall balance and ease the impact of any planetary weaknesses.',
  },
];

const CONDITION_POOJAS: Record<string, PoojaRecommendation> = {
  mangal: {
    name: 'Mangal Shanti Pooja',
    deity: 'Lord Hanuman / Mangal (Mars)',
    forCondition: 'Mangal Dosha',
    description:
      'Traditionally performed to pacify Mars and ease the effects associated with Mangal Dosha, particularly ahead of marriage.',
  },
  kaalSarp: {
    name: 'Kaal Sarp Dosha Nivaran Pooja',
    deity: 'Lord Shiva',
    forCondition: 'Kaal Sarp Dosha',
    description:
      'Traditionally performed (often at a Shiva temple such as Trimbakeshwar) to ease the effects associated with Kaal Sarp Dosha.',
  },
  sadeSati: {
    name: 'Shani Shanti Pooja',
    deity: 'Lord Shani (Saturn) / Hanuman',
    forCondition: 'Sade Sati',
    description:
      "Traditionally performed during Sade Sati to seek Saturn's grace and ease the intensity of this transit period.",
  },
  pitra: {
    name: 'Pitra Dosha Nivaran Pooja (Shraadh)',
    deity: 'Ancestors / Lord Vishnu',
    forCondition: 'Pitra Dosha',
    description:
      'Traditionally performed to honor ancestors and ease the effects associated with Pitra Dosha.',
  },
  kemDruma: {
    name: 'Kemdruma Dosha Nivaran Pooja',
    deity: 'Chandra (Moon)',
    forCondition: 'Kemdruma Dosha',
    description:
      'Traditionally performed to strengthen the Moon and ease the effects associated with Kemdruma Dosha.',
  },
  grahan: {
    name: 'Grahan Dosha Nivaran Pooja',
    deity: 'Sun/Moon and Rahu-Ketu',
    forCondition: 'Grahan Dosha',
    description:
      'Traditionally performed to ease the effects associated with Grahan (eclipse) Dosha.',
  },
  guruChandal: {
    name: 'Guru Chandal Dosha Nivaran Pooja',
    deity: 'Lord Brihaspati (Jupiter)',
    forCondition: 'Guru Chandal Dosha',
    description:
      'Traditionally performed to strengthen Jupiter and ease the effects associated with Guru Chandal Dosha.',
  },
};

/**
 * Maps kundli.doshaData (see chat-grounding.ts#doshaFacts for the same shape
 * read elsewhere) to a curated pooja list. Falls back to general poojas when
 * no doshas are present or doshaData is unavailable.
 */
export function getPoojaRecommendations(
  doshas: Record<string, unknown> | null,
): PoojaRecommendation[] {
  if (!doshas) return GENERAL_POOJAS;
  const recs: PoojaRecommendation[] = [];

  const mangal = doshas.mangal as Record<string, unknown> | undefined;
  if (mangal?.present) recs.push(CONDITION_POOJAS.mangal!);

  const kaalSarp = doshas.kaalSarp as Record<string, unknown> | undefined;
  if (kaalSarp?.present) recs.push(CONDITION_POOJAS.kaalSarp!);

  const sadeSati = doshas.sadeSati as Record<string, unknown> | undefined;
  if (sadeSati?.active) recs.push(CONDITION_POOJAS.sadeSati!);

  const pitra = doshas.pitra as Record<string, unknown> | undefined;
  if (pitra?.present) recs.push(CONDITION_POOJAS.pitra!);

  const kemDruma = doshas.kemDruma as Record<string, unknown> | undefined;
  if (kemDruma?.present) recs.push(CONDITION_POOJAS.kemDruma!);

  const grahan = doshas.grahan as Record<string, unknown> | undefined;
  if (grahan?.present) recs.push(CONDITION_POOJAS.grahan!);

  const guruChandal = doshas.guruChandal as Record<string, unknown> | undefined;
  if (guruChandal?.present) recs.push(CONDITION_POOJAS.guruChandal!);

  return recs.length > 0 ? recs : GENERAL_POOJAS;
}
