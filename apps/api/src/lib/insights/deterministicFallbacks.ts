import type { GroundTruthData } from '@/lib/ai/groundTruth';

/**
 * Build non-AI content for a feature surface from deterministic astro-engine
 * data. Used when NIM is exhausted or as the immediate "skeleton" shown while
 * a lite job processes. Rows written with source='deterministic' and
 * expires_at = now() + 1h so they auto-retry.
 */
export function buildDeterministicFallback(
  featureKey: string,
  gt: GroundTruthData,
): Record<string, string> {
  const d = gt.currentDasha;
  const asc = gt.ascendantTraits;
  const career = gt.careerIndicators;
  const health = gt.healthIndicators;
  const marriage = gt.marriageIndicators;
  const lucky = gt.luckyFactors;
  const yogas = gt.detectedYogas.slice(0, 3);
  const doshas = gt.detectedDoshas.filter(x => x.present);

  switch (featureKey) {
    case 'dasha_widget':
      return {
        dasha_current: `Your current planetary period is ${d.mahadasha} Mahadasha (${d.mahaStart}–${d.mahaEnd}), with ${d.antardasha} Antardasha active from ${d.antarStart} to ${d.antarEnd}. This ${d.mahadasha} period shapes your core experiences across career, relationships, and inner growth. Each sub-period brings specific activations — your current ${d.antardasha} sub-period refines these themes with precision.`,
        dasha_next_period: `The ${d.antardasha} Antardasha ends ${d.antarEnd} and transitions to the next sub-cycle within ${d.mahadasha} Mahadasha. Full AI analysis of what this transition delivers is being prepared.`,
      };

    case 'summary_lite':
      return {
        executive_summary: `Your ${asc.rulingPlanet}-ruled ${gt.quickAnalysis?.lagnaLord?.sign ?? asc.quality} ascendant gives you a ${asc.nature.slice(0, 2).join(', ')} nature. ${yogas.length > 0 ? `${yogas.length} significant yoga${yogas.length > 1 ? 's' : ''} detected: ${yogas.map(y => y.name).join(', ')}.` : ''} Your chart carries ${asc.element} element energy. Detailed analysis is being prepared.`,
        key_strengths: `Core strengths from your chart: ${gt.personalityKeywords.slice(0, 5).join(', ')}. ${gt.shadbalaRanking[0] ? `${gt.shadbalaRanking[0]} is your strongest planet.` : ''} Full strength analysis is loading.`,
      };

    case 'personality_lite':
      return {
        personality: `Your ${asc.rulingPlanet}-ruled ascendant in ${gt.quickAnalysis?.lagnaLord?.sign ?? '—'} gives you a ${asc.quality}, ${asc.element} nature. Key traits: ${(asc.nature ?? []).slice(0, 4).join(', ')}. ${gt.personalityKeywords.slice(0, 3).join(', ')} define your outward expression.`,
        nature_temperament: `${asc.element} element dominance shapes your emotional world. You are naturally ${(asc.nature ?? []).slice(0, 3).join(', ')}. Full temperament analysis is loading.`,
      };

    case 'career_lite':
      return {
        career: `Career indicators in your chart point toward: ${career.professions.slice(0, 4).join(', ')}. ${career.businessVsService} ${career.peakPeriods ? `Peak career period: ${career.peakPeriods}.` : ''} Detailed analysis loading.`,
        wealth: `Wealth patterns are shaped by your 2nd and 11th house lords. Full wealth analysis is loading.`,
      };

    case 'marriage_lite':
      return {
        marriage: `Your 7th house is in ${marriage.partnerSign ?? '—'}, indicating partnership themes. Timing window: ${marriage.timing ?? 'being calculated'}. Full relationship analysis is loading.`,
        partner_profile: `Ideal partner traits from your 7th house and Venus placement are being analysed. Full profile loading.`,
      };

    case 'health_lite':
      return {
        health_constitution: `Your ${health.constitution} constitution (${asc.element} element) shapes your natural vitality. Dietary guideline: ${health.dietaryElement ?? asc.element + ' element — specific guidance loading'}. Full health analysis is loading.`,
        health_vulnerabilities: `Systems to watch based on your chart: ${health.vulnerableSystems.slice(0, 3).join(', ')}. Full vulnerability analysis loading.`,
      };

    case 'spiritual_lite':
      return {
        spiritual_path: `Your ${asc.element} element and Ketu placement indicate spiritual inclinations. ${doshas.length > 0 ? `Dosha patterns present: ${doshas.map(d => d.name).join(', ')}.` : ''} Full path analysis loading.`,
        dharma: `Life dharma from your 9th house and nodal axis is being calculated. Full dharma reading loading.`,
      };

    case 'past_life_lite':
      return {
        who_you_were: 'Your past-life story is being read from your chart. The thread your soul is carrying forward will appear here in a moment.',
        what_you_mastered: 'A gift travels with you across lifetimes. We are tracing it now.',
        what_you_left_unfinished: 'There is one quiet thread that didn\'t get to close before. We are finding it.',
        how_it_shows_up_now: 'Soon this will mirror back the way that old story shows up in your present life.',
        keep_with_you: 'A practice to settle that old thread will be offered here once your reading is complete.',
        why_we_see_this: '',
      };

    case 'remedies_lite':
      return {
        mantra_remedies: gt.remedies.mantras.length > 0
          ? `Primary mantra: ${gt.remedies.mantras[0].mantra} — chant for ${gt.remedies.mantras[0].planet} on ${gt.remedies.mantras[0].day}. Full remedy plan loading.`
          : 'Mantra recommendations are being prepared based on your planetary analysis.',
        gemstone_remedies: gt.remedies.gemstones.length > 0
          ? `Primary stone: ${gt.remedies.gemstones[0].stone} for ${gt.remedies.gemstones[0].planet} — wear in ${gt.remedies.gemstones[0].metal} on ${gt.remedies.gemstones[0].finger}. Full gemstone guide loading.`
          : 'Gemstone recommendations are being calculated.',
      };

    case 'yearly_lite':
      return {
        status: 'Annual predictions are being prepared based on your dasha timeline and current transits.',
      };

    case 'life_journey':
      return {
        dasha_current: `You are in ${d.mahadasha} Mahadasha (${d.mahaStart}–${d.mahaEnd}). Current sub-period: ${d.antardasha} Antardasha. This phase defines a significant chapter in your life arc. Detailed analysis loading.`,
        dasha_5yr_forecast: `Your dasha timeline for the next 5 years is being computed. ${d.mahadasha} Mahadasha continues through ${d.mahaEnd}. Full year-by-year forecast loading.`,
        dasha_life_timeline: `Your life chapters are defined by successive Mahadasha periods. Detailed timeline with themes and key events loading.`,
      };

    case 'couple_lite':
      return {
        marriage: `Relationship compatibility analysis is loading. Your 7th house lord is ${marriage.sevenThLord ?? 'being calculated'}. Full compatibility analysis loading.`,
        partner_profile: `Partner profile based on 7th house and Venus is loading.`,
        relationship_challenges: `Relationship dynamics and growth areas are being analysed.`,
      };

    case 'guna_chakra':
      return {
        summary: 'Your personality reading is being prepared from the strengths in your chart. The radar to the right is ready — the written interpretation will appear here in a moment.',
        strengths: '• Building your reading\n• Pulling your strongest traits\n• Almost there',
        challenges: '• Reading is loading\n• Specific challenges will appear shortly',
        do: '• Open your kundli to see the full chart\n• Note which dimension feels most true to you\n• Save this page — your reading auto-updates\n• Come back in a minute',
        dont: '• Don\'t refresh repeatedly\n• Don\'t close the tab — it generates in the background\n• Don\'t worry if a low score surprises you — context follows',
      };

    default:
      return {
        status: `Personalised ${featureKey.replace(/_/g, ' ')} analysis is being prepared. Check back shortly.`,
      };
  }
}
