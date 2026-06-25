/**
 * Single source of truth for palm-line visual identity.
 * Used by the capture-screen silhouette guide AND by the post-reading
 * PalmInfographic overlay + line-story cards, so capture promises match output.
 */

export type LineKey = 'heart' | 'head' | 'life' | 'fate' | 'sun' | 'marriage' | 'children' | 'health' | 'travel' | 'mars';

export interface LineStyle {
  color: string;
  glow: string;
  dashed: boolean;
  vedicName: string;
  englishName: string;
  meaning: string;
  emoji: string;
}

export const LINE_STYLES: Record<LineKey, LineStyle> = {
  // Vedic-aesthetic palette (per user reference):
  //   Heart = Red · Head = Blue · Life = Green · Fate = Gold
  heart: {
    color: '#EF4444',
    glow: 'rgba(239,68,68,0.6)',
    dashed: false,
    vedicName: 'Hridaya Rekha',
    englishName: 'Heart Line',
    meaning: 'Love, emotions, relationships',
    emoji: '❤️',
  },
  head: {
    color: '#3B82F6',
    glow: 'rgba(59,130,246,0.6)',
    dashed: false,
    vedicName: 'Mastishka Rekha',
    englishName: 'Head Line',
    meaning: 'Mind, intellect, career direction',
    emoji: '🧠',
  },
  life: {
    color: '#22C55E',
    glow: 'rgba(34,197,94,0.6)',
    dashed: false,
    vedicName: 'Ayushya Rekha',
    englishName: 'Life Line',
    meaning: 'Vitality, energy, big life changes',
    emoji: '🌿',
  },
  fate: {
    color: '#F59E0B',
    glow: 'rgba(245,158,11,0.6)',
    dashed: false,
    vedicName: 'Bhagya Rekha',
    englishName: 'Fate Line',
    meaning: 'Destiny, career path, money',
    emoji: '✨',
  },
  sun: {
    color: '#FCD34D',
    glow: 'rgba(252,211,77,0.55)',
    dashed: false,
    vedicName: 'Surya Rekha',
    englishName: 'Sun Line',
    meaning: 'Fame, recognition, creative success',
    emoji: '☀️',
  },
  marriage: {
    color: '#F472B6',
    glow: 'rgba(244,114,182,0.55)',
    dashed: false,
    vedicName: 'Vivah Rekha',
    englishName: 'Marriage Line',
    meaning: 'Partnerships, marriage timing',
    emoji: '💞',
  },
  children: {
    color: '#A78BFA',
    glow: 'rgba(167,139,250,0.55)',
    dashed: false,
    vedicName: 'Santan Rekha',
    englishName: 'Children Line',
    meaning: 'Children, legacy, lineage',
    emoji: '👶',
  },
  health: {
    color: '#34D399',
    glow: 'rgba(52,211,153,0.55)',
    dashed: false,
    vedicName: 'Arogya Rekha',
    englishName: 'Health Line',
    meaning: 'Health, digestion, vitality',
    emoji: '🌿',
  },
  travel: {
    color: '#22D3EE',
    glow: 'rgba(34,211,238,0.55)',
    dashed: false,
    vedicName: 'Bhraman Rekha',
    englishName: 'Travel Line',
    meaning: 'Journeys, foreign opportunities',
    emoji: '✈️',
  },
  mars: {
    color: '#FB923C',
    glow: 'rgba(251,146,60,0.55)',
    dashed: false,
    vedicName: 'Mangal Rekha',
    englishName: 'Mars Line',
    meaning: 'Courage, resilience, support to Life',
    emoji: '🛡️',
  },
};

export interface InsightChip {
  key: 'children' | 'career' | 'marriage' | 'bigChange' | 'money';
  label: string;
  emoji: string;
  position: 'top' | 'left' | 'right' | 'bottomLeft' | 'bottomRight';
  /** Which results section this chip should scroll to. */
  anchor: string;
}

export const INSIGHT_CHIPS: InsightChip[] = [
  { key: 'children',  label: 'Children',   emoji: '👶', position: 'top',         anchor: 'children-section' },
  { key: 'career',    label: 'Career',     emoji: '💼', position: 'left',        anchor: 'career-section' },
  { key: 'marriage',  label: 'Marriage',   emoji: '💞', position: 'right',       anchor: 'marriage-section' },
  { key: 'bigChange', label: 'Big Change', emoji: '⏳', position: 'bottomLeft',  anchor: 'lucky-periods-section' },
  { key: 'money',     label: 'Money',      emoji: '💵', position: 'bottomRight', anchor: 'money-section' },
];

export const ENTERTAINMENT_DISCLAIMER =
  'These readings are for entertainment purposes only and should not be taken as 100% accurate';
