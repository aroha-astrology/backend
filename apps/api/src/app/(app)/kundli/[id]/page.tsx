'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionPage, FadeIn, StaggerList, StaggerItem, ScrollReveal } from '@/components/ui/motion-primitives';
import { staggerContainer, staggerItem } from '@/lib/motion';
import { useStore } from '@/store/useStore';
import { NorthIndianChart } from '@/components/charts/NorthIndianChart';
import { SouthIndianChart } from '@/components/charts/SouthIndianChart';
import { ChartZoomModal } from '@/components/charts/ChartZoomModal';
import { PillTabs } from '@/components/ui/tabs';
import {
  BIRTH_CHART_TABS,
  resolveBirthChart,
  type BirthChartType,
} from '@/lib/birthChartResolver';
import { FollowUpQuestions, type FollowUpQuestion, type FollowUpAnswer } from '@/components/kundli/FollowUpQuestions';
import { KundliChatButton } from '@/components/kundli/KundliChatButton';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loading, PageLoading } from '@/components/ui/loading';
import { WisdomLoader } from '@/components/ui/wisdom-loader';
import { Modal } from '@/components/ui/modal';
import { Planet3DInline } from '@/components/3d/Planet3DInline';
import { Planet3DHero } from '@/components/3d/Planet3DHero';
import { PlanetOrb2D } from '@/components/3d/PlanetOrb2D';
import { RichText, parseInline } from '@/components/ui/rich-text';
import type { Planet, ChartData, DashaPeriod, DoshaAnalysis, Yoga, LalKitabDebt, LalKitabRemedy, BlindPlanet, DivisionalChart } from '@aroha-astrology/shared';
import { PLANET_ABBREVIATIONS, VIMSHOTTARI_YEARS } from '@aroha-astrology/shared';
import {
  computeGemstoneScoresWithDignity,
  computeMetalScoresWithDignity,
  describeNumbers,
  describeColors,
  describeDays,
  describeDirections,
  type GemstoneScore,
  type MetalScore,
  type FactorDetail,
} from '@/lib/ai/luckyFactors';

// ============================================================
// Types
// ============================================================

interface PredictionAnalysisItem {
  area: string;
  prediction: string;
  confidence?: string;
  planetaryBasis?: string;
  timeline?: string;
}

interface PredictionRemedyItem {
  type: string;
  description: string;
  planet?: string;
  urgency?: string;
  instructions?: string;
}

interface PredictionCurrentPeriod {
  dasha?: string;
  antardasha?: string;
  effects?: string;
  startDate?: string;
  endDate?: string;
}

interface PredictionStructured {
  summary: string[];
  analysis: PredictionAnalysisItem[];
  currentPeriod?: PredictionCurrentPeriod;
  remedies: PredictionRemedyItem[];
  warnings: string[];
  favorablePeriods: string[];
  unfavorablePeriods: string[];
}

interface PredictionSection {
  type: string;
  icon: string;
  title: string;
  content: string[];
  structured: PredictionStructured | null;
}

interface RemedyItem {
  type: string;
  icon: string;
  title: string;
  description: string;
  details: string[];
}

interface DashaTimelineEntry {
  planet: Planet;
  startDate: string;
  endDate: string;
  startYear: number;
  endYear: number;
  isActive: boolean;
  isFuture: boolean;
  isPast: boolean;
  durationYears: number;
  durationMonths: number;
  antardashas: { planet: Planet; startDate: string; endDate: string; startYear: number; endYear: number }[];
}

interface LalKitabData {
  chart: { houses: { house: number; planets: Planet[] }[] };
  debts: LalKitabDebt[];
  totke: LalKitabRemedy[];
  blindPlanets: BlindPlanet[];
}

interface KundliResult {
  id: string;
  profile: {
    name: string;
    dob: string;
    tob: string;
    pob: string;
    gender: string;
  };
  chartData: ChartData;
  lagna: string;
  lagnaLord: string;
  lagnaDegree: number;
  rashi: string;
  sunSign: string;
  nakshatra: string;
  nakshatraPada: number;
  moonSign: string;
  currentDasha: {
    mahadasha: { planet: Planet; startDate: string; endDate: string };
    antardasha: { planet: Planet; startDate: string; endDate: string };
    pratyantardasha: { planet: Planet; startDate: string; endDate: string };
    yearsRemaining: number;
    totalYears: number;
  };
  dashaTimeline: DashaTimelineEntry[];
  predictions: PredictionSection[];
  remedies: RemedyItem[];
  lalkitab: LalKitabData;
  doshas: DoshaAnalysis;
  yogas: Yoga[];
  followUpQuestions: FollowUpQuestion[];
  divisionalCharts: Record<string, Array<{ planet: string; sign: string; signIndex: number }>> | null;
}

interface GroundTruthData {
  planetDignities: Record<string, { status: string; description: string }>;
  houseAnalysis: Record<number, { sign: string; lord: string; lordHouse: number; planets: string[]; significance: string }>;
  detectedYogas: Array<{ name: string; type: string; planets: string; meaning: string; strength: string }>;
  detectedDoshas: Array<{ name: string; present: boolean; severity: string; description: string; remedies: string[]; timeline?: string }>;
  careerIndicators: { professions: string[]; businessVsService: string; peakPeriods: string };
  healthIndicators: { constitution: string; vulnerableSystems: string[]; dietaryElement: string };
  marriageIndicators: { partnerSign: string; timing: string; sevenThLord: string };
  luckyFactors: { numbers: number[]; colors: string[]; days: string[]; directions: string[]; gemstone: string; metal: string };
  remedies: {
    mantras: Array<{ planet: string; mantra: string; deity: string; count: string; day: string }>;
    gemstones: Array<{ stone: string; planet: string; finger: string; metal: string; day: string }>;
    fasting: Array<{ day: string; planet: string }>;
    charity: Array<{ item: string; day: string; toWhom: string; planet: string }>;
  };
  personalityKeywords: string[];
  ascendantTraits: { appearance: string[]; nature: string[]; element: string; quality: string; qualityMeaning: string; rulingPlanet: string };

  planetSignifications: Record<string, string[]>;
  planetAspects: Record<string, string[]>;
  planetRemediesNeeded: string[];
  ashtakavargaStrengths: Record<string, string>;
  shadbalaRanking: string[];
  shadbalaDetails?: Array<{ planet: string; total: number; required: number; ratio: number; isStrong: boolean }>;
  currentDasha: { mahadasha: string; antardasha: string; pratyantardasha: string; mahaStart: string; mahaEnd: string; antarStart: string; antarEnd: string };
  planetFullData: Record<string, { color: string; number: number; day: string; direction: string; metal: string; grain: string; bodyPart: string; element: string; favorableTime: string; season: string }>;
  dashaTimeline: Array<{ planet: string; start: string; end: string; isCurrent: boolean }>;
}

interface PersonalizedPrediction {
  period: string;
  ruling_dasha: string;
  activated_houses: string;
  prediction: {
    overall: string;
    career: string;
    relationships: string;
    health: string;
    finance: string;
    spiritual: string;
    lucky_time: string;
    lucky_color: string;
    avoid: string;
    remedy: string;
  };
}

// ============================================================
// Constants
// ============================================================

const TAB_LIST = [
  { id: 'overview', label: 'Overview', icon: '🏠' },
  { id: 'planets', label: 'Planets', icon: '🪐' },
  { id: 'houses', label: 'Houses', icon: '🏛️' },
  { id: 'yogas', label: 'Yogas & Doshas', icon: '🔮' },
  { id: 'dasha', label: 'Dasha Timeline', icon: '📅' },
  { id: 'strength', label: 'Strength', icon: '💪' },
  { id: 'career', label: 'Career & Wealth', icon: '💼' },
  { id: 'relationships', label: 'Relationships', icon: '💍' },
  { id: 'health', label: 'Health', icon: '❤️' },
  { id: 'remedies', label: 'Remedies', icon: '✨' },
  { id: 'vargas', label: 'Divisional Charts', icon: '📊' },
  { id: 'predictions', label: 'Predictions', icon: '🔭' },
] as const;

type TabId = (typeof TAB_LIST)[number]['id'];

const PLANET_COLORS: Record<string, string> = {
  Sun: 'text-orange-400',
  Moon: 'text-indigo-200',
  Mars: 'text-red-400',
  Mercury: 'text-blue-400',
  Jupiter: 'text-yellow-400',
  Venus: 'text-pink-400',
  Saturn: 'text-purple-400',
  Rahu: 'text-violet-400',
  Ketu: 'text-stone-400',
};

const PLANET_BG: Record<string, string> = {
  Sun: 'bg-orange-500/15 border-orange-500/30',
  Moon: 'bg-indigo-300/15 border-indigo-300/30',
  Mars: 'bg-red-500/15 border-red-500/30',
  Mercury: 'bg-blue-500/15 border-blue-500/30',
  Jupiter: 'bg-yellow-500/15 border-yellow-500/30',
  Venus: 'bg-pink-500/15 border-pink-500/30',
  Saturn: 'bg-purple-500/15 border-purple-500/30',
  Rahu: 'bg-violet-500/15 border-violet-500/30',
  Ketu: 'bg-stone-500/15 border-stone-500/30',
};

const DASHA_NATURE: Record<string, { nature: 'benefic' | 'malefic' | 'neutral'; colorClass: string; bgClass: string }> = {
  Jupiter: { nature: 'benefic', colorClass: 'text-emerald-400', bgClass: 'bg-emerald-500/10 border-emerald-500/30 shadow-emerald-500/5' },
  Venus:   { nature: 'benefic', colorClass: 'text-emerald-400', bgClass: 'bg-emerald-500/10 border-emerald-500/30 shadow-emerald-500/5' },
  Moon:    { nature: 'benefic', colorClass: 'text-emerald-400', bgClass: 'bg-emerald-500/10 border-emerald-500/30 shadow-emerald-500/5' },
  Sun:     { nature: 'neutral', colorClass: 'text-orange-400', bgClass: 'bg-orange-500/10 border-orange-500/30 shadow-orange-500/5' },
  Mars:    { nature: 'malefic', colorClass: 'text-red-400', bgClass: 'bg-red-500/10 border-red-500/30 shadow-red-500/5' },
  Saturn:  { nature: 'malefic', colorClass: 'text-purple-400', bgClass: 'bg-purple-500/10 border-purple-500/30 shadow-purple-500/5' },
  Rahu:    { nature: 'malefic', colorClass: 'text-purple-400', bgClass: 'bg-purple-500/10 border-purple-500/30 shadow-purple-500/5' },
  Ketu:    { nature: 'malefic', colorClass: 'text-red-400', bgClass: 'bg-red-500/10 border-red-500/30 shadow-red-500/5' },
  Mercury: { nature: 'neutral', colorClass: 'text-blue-400', bgClass: 'bg-blue-500/10 border-blue-500/30 shadow-blue-500/5' },
};

const PLANET_THEMES: Record<string, string> = {
  Sun: 'A period where your sense of identity comes to the forefront — leadership opportunities, recognition, and dealings with authority or your father figure become prominent. Your energy and confidence are stronger than usual, and your actions carry more weight.',
  Moon: 'A period ruled by emotions, intuition, and your inner life. Travel, public connections, and matters related to your mother or home come into focus. Your mood and mental peace set the tone — this period rewards emotional honesty over pure logic.',
  Mars: 'A high-energy period calling for courage and decisive action. Property, physical work, sibling relationships, and competitive situations all become more prominent. Your drive is strong — channel it into purposeful effort to avoid unnecessary friction.',
  Mercury: 'A period that rewards quick thinking, communication, and learning. Business, writing, education, and trade all flourish. Your mind is sharp and adaptable — great for forming new connections, studying, or any work that runs on ideas and conversation.',
  Jupiter: 'One of the most expansive periods in the cycle — wisdom, abundance, children, and spiritual growth all open up. Opportunities seem to arrive with ease. The key is not to over-expand, and to give back as generously as you receive.',
  Venus: 'A period that highlights relationships, beauty, comfort, and creative pleasure. Love, partnerships, artistic pursuits, and material comforts come to the fore. Invest in the people and experiences that make life feel rich.',
  Saturn: 'A serious, long-term period that tests patience and rewards discipline. Career restructuring, hard work, and karmic lessons are central. It can feel slow and demanding — but the gains made here are among the most lasting and real of your lifetime.',
  Rahu: 'A period of intensity and ambition, often pulling you toward the unfamiliar — foreign connections, technology, and unconventional paths. Progress comes through bold breaks from tradition, but watch for obsession or restlessness clouding your judgment.',
  Ketu: 'A period that turns your attention inward — toward spirituality, detachment, and letting go of what no longer serves you. Material ambitions may feel hollow; deep reflection, healing, and past-life patterns become the real work of this time.',
};

type PredictionPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

const PREDICTION_PERIODS: { id: PredictionPeriod; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
];

const PREDICTION_AREA_META: Record<string, { icon: string; label: string; color: string }> = {
  overall: { icon: '🌟', label: 'Overall', color: 'border-primary/30 bg-primary/5' },
  career: { icon: '💼', label: 'Career', color: 'border-primary/30 bg-primary/5' },
  relationships: { icon: '💍', label: 'Relationships', color: 'border-accent/30 bg-accent/5' },
  health: { icon: '❤️', label: 'Health', color: 'border-success/30 bg-success/5' },
  finance: { icon: '💰', label: 'Finance', color: 'border-warning/30 bg-warning/5' },
  spiritual: { icon: '🕉️', label: 'Spiritual', color: 'border-primary/30 bg-primary/5' },
};

// ============================================================
// Helper functions
// ============================================================

function getPlanetTheme(planet: string): string {
  return PLANET_THEMES[planet] ?? 'A period of transformation, inner shifts, and unexpected change — outcomes depend on how you respond to what arises.';
}

const HOUSE_LABELS: Record<number, string> = {
  1: 'Identity & Appearance', 2: 'Money & Family', 3: 'Communication & Courage',
  4: 'Home & Happiness', 5: 'Creativity & Children', 6: 'Health & Daily Work',
  7: 'Relationships & Partnership', 8: 'Change & Hidden Depths', 9: 'Fortune & Wisdom',
  10: 'Career & Status', 11: 'Income & Social Circle', 12: 'Rest, Release & Spirituality',
};

const SIGN_QUALITY: Record<string, string> = {
  Aries: 'direct, pioneering, and action-first', Taurus: 'steady, patient, and comfort-seeking',
  Gemini: 'curious, adaptable, and communicative', Cancer: 'emotionally deep, nurturing, and intuitive',
  Leo: 'confident, warm, and expressive', Virgo: 'precise, analytical, and service-minded',
  Libra: 'balanced, diplomatic, and relationship-focused', Scorpio: 'intense, perceptive, and transformative',
  Sagittarius: 'optimistic, expansive, and philosophically driven', Capricorn: 'ambitious, disciplined, and long-view focused',
  Aquarius: 'independent, innovative, and unconventional', Pisces: 'sensitive, imaginative, and spiritually inclined',
};

const LORD_HOUSE_NOTE: Record<number, string> = {
  1: 'its ruler is strongly connected to your identity and physical vitality',
  2: 'its ruler links this area to money, family, and accumulated resources',
  3: 'its ruler connects this area to effort, initiative, and communication',
  4: 'its ruler ties this area to your emotional roots and sense of home',
  5: 'its ruler connects this area to creativity, luck, and past-life merit',
  6: 'its ruler links this area to challenges, service, and health management',
  7: 'its ruler connects this area to partnerships and what others bring into your life',
  8: 'its ruler ties this area to sudden change, transformation, and hidden matters',
  9: 'its ruler connects this area to fortune, higher guidance, and long-range opportunity',
  10: 'its ruler links this area to career outcomes and public standing',
  11: 'its ruler connects this area to income, gains, and your social network',
  12: 'its ruler ties this area to release, spiritual growth, or foreign influences',
};

const YOGA_JARGON: Array<[RegExp, string]> = [
  [/\bkendra(?:\s+houses?)?\b/gi, 'key life-foundation areas (career, home, relationships, public role)'],
  [/\btrikona(?:\s+houses?)?\b/gi, 'fortune areas (self, wealth, dharma)'],
  [/\bdusthana(?:s)?\b/gi, 'challenging life areas'],
  [/\bnative\b/gi, 'you'], [/\bbestows\b/gi, 'gives you'],
  [/\bdebilitated\b/gi, 'weakened by placement'], [/\bexalted\b/gi, 'at its strongest'],
  [/\blagna\b/gi, 'your rising sign'], [/\baspect(?:s|ed)?\b/gi, 'long-distance influence'],
  [/\bconjunct(?:ion)?\b/gi, 'together in the same sign'],
];

function cleanYogaMeaning(s: string): string {
  let out = s;
  for (const [re, rep] of YOGA_JARGON) out = out.replace(re, rep);
  return out;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatDateShort(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function computeDuration(startDate: string, endDate: string): { years: number; months: number } {
  try {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const totalMonths = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
    return { years: Math.floor(totalMonths / 12), months: totalMonths % 12 };
  } catch {
    return { years: 0, months: 0 };
  }
}

function dignityBadgeVariant(status: string): 'success' | 'error' | 'warning' | 'default' | 'accent' | 'outline' {
  switch (status) {
    case 'Exalted': case 'Mooltrikona': return 'success';
    case 'Own Sign': case 'Friendly': return 'accent';
    case 'Debilitated': return 'error';
    case 'Enemy Sign': return 'warning';
    default: return 'outline';
  }
}

function dignityDotColor(status: string): string {
  switch (status) {
    case 'Exalted': case 'Mooltrikona': return 'bg-emerald-400';
    case 'Own Sign': case 'Friendly': return 'bg-blue-400';
    case 'Debilitated': return 'bg-red-400';
    case 'Enemy Sign': return 'bg-amber-400';
    default: return 'bg-slate-400';
  }
}

function getAgeFromDob(dob: string): number {
  try {
    const birth = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
    return age;
  } catch {
    return 0;
  }
}

function getWesternSign(dob: string): string {
  try {
    const d = new Date(dob);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const signs = [
      { sign: 'Capricorn', end: [1, 19] }, { sign: 'Aquarius', end: [2, 18] },
      { sign: 'Pisces', end: [3, 20] }, { sign: 'Aries', end: [4, 19] },
      { sign: 'Taurus', end: [5, 20] }, { sign: 'Gemini', end: [6, 20] },
      { sign: 'Cancer', end: [7, 22] }, { sign: 'Leo', end: [8, 22] },
      { sign: 'Virgo', end: [9, 22] }, { sign: 'Libra', end: [10, 22] },
      { sign: 'Scorpio', end: [11, 21] }, { sign: 'Sagittarius', end: [12, 21] },
    ];
    for (const { sign, end } of signs) {
      if (month < end[0] || (month === end[0] && day <= end[1])) return sign;
    }
    return 'Capricorn';
  } catch {
    return 'Unknown';
  }
}

/** localStorage cache key for personalized predictions */
function predCacheKey(chartId: string, period: string): string {
  return `jyotish_pred_${chartId}_${period}`;
}

/** Get cached prediction if still valid (daily=same day, weekly=same week, monthly=same month, yearly=same year) */
function getCachedPrediction(chartId: string, period: PredictionPeriod): PersonalizedPrediction | null {
  try {
    const raw = localStorage.getItem(predCacheKey(chartId, period));
    if (!raw) return null;
    const cached = JSON.parse(raw) as { data: PersonalizedPrediction; timestamp: string };
    const cachedDate = new Date(cached.timestamp);
    const now = new Date();
    switch (period) {
      case 'daily':
        if (cachedDate.toDateString() === now.toDateString()) return cached.data;
        break;
      case 'weekly': {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        if (cachedDate >= weekStart) return cached.data;
        break;
      }
      case 'monthly':
        if (cachedDate.getMonth() === now.getMonth() && cachedDate.getFullYear() === now.getFullYear()) return cached.data;
        break;
      case 'yearly':
        if (cachedDate.getFullYear() === now.getFullYear()) return cached.data;
        break;
    }
    return null;
  } catch {
    return null;
  }
}

function setCachedPrediction(chartId: string, period: PredictionPeriod, data: PersonalizedPrediction): void {
  try {
    localStorage.setItem(predCacheKey(chartId, period), JSON.stringify({ data, timestamp: new Date().toISOString() }));
  } catch {
    // localStorage full or unavailable
  }
}

/** Recover JSON object embedded in a string that may have prose / markdown fences around it. */
function recoverEmbeddedJSON(s: string): Record<string, unknown> | null {
  const tryParse = (str: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(str);
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const inFence = tryParse(fence[1].trim());
    if (inFence) return inFence;
  }
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return tryParse(s.slice(first, last + 1));
  }
  return null;
}

function asStringArray(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return [];
}

function asStringOrJoin(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').join(' ');
  return '';
}

/**
 * Normalize a prediction's stored `content` into a `PredictionStructured` if possible.
 * Handles three cases:
 *  1. Properly parsed JSON object — fields read directly.
 *  2. The `summary` field contains the raw model output (prose + ```json fenced JSON) because the
 *     server's older parser fell back to dumping the whole text. We recover the embedded JSON.
 *  3. AI returned `summary` as an array instead of a string — we accept both.
 */
function buildStructuredPrediction(c: Record<string, unknown>): PredictionStructured | null {
  // If summary is a long string with embedded JSON, recover it and use that as the source.
  let src: Record<string, unknown> = c;
  const sumRaw = c.summary;
  if (typeof sumRaw === 'string' && sumRaw.length > 200 && (sumRaw.includes('```json') || sumRaw.trimStart().startsWith('{') || sumRaw.includes('"detailedAnalysis"'))) {
    const recovered = recoverEmbeddedJSON(sumRaw);
    if (recovered) src = recovered;
  }

  const summary = asStringArray(src.summary);
  const analysisRaw = Array.isArray(src.detailedAnalysis) ? src.detailedAnalysis : [];
  const analysis: PredictionAnalysisItem[] = analysisRaw
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
    .map((a) => ({
      area: typeof a.area === 'string' ? a.area : '',
      prediction: asStringOrJoin(a.prediction),
      confidence: typeof a.confidence === 'string' ? a.confidence : undefined,
      planetaryBasis: typeof a.planetaryBasis === 'string' ? a.planetaryBasis : undefined,
      timeline: typeof a.timeline === 'string' ? a.timeline : undefined,
    }))
    .filter((a) => a.prediction);

  const cpRaw = src.currentPeriod;
  const currentPeriod: PredictionCurrentPeriod | undefined =
    cpRaw && typeof cpRaw === 'object'
      ? {
          dasha: typeof (cpRaw as Record<string, unknown>).dasha === 'string' ? ((cpRaw as Record<string, unknown>).dasha as string) : undefined,
          antardasha: typeof (cpRaw as Record<string, unknown>).antardasha === 'string' ? ((cpRaw as Record<string, unknown>).antardasha as string) : undefined,
          effects: typeof (cpRaw as Record<string, unknown>).effects === 'string' ? ((cpRaw as Record<string, unknown>).effects as string) : undefined,
          startDate: typeof (cpRaw as Record<string, unknown>).startDate === 'string' ? ((cpRaw as Record<string, unknown>).startDate as string) : undefined,
          endDate: typeof (cpRaw as Record<string, unknown>).endDate === 'string' ? ((cpRaw as Record<string, unknown>).endDate as string) : undefined,
        }
      : undefined;

  const remediesRaw = Array.isArray(src.remedies) ? src.remedies : [];
  const remedies: PredictionRemedyItem[] = remediesRaw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      type: typeof r.type === 'string' ? r.type : 'remedy',
      description: typeof r.description === 'string' ? r.description : '',
      planet: typeof r.planet === 'string' ? r.planet : undefined,
      urgency: typeof r.urgency === 'string' ? r.urgency : undefined,
      instructions: typeof r.instructions === 'string' ? r.instructions : undefined,
    }))
    .filter((r) => r.description || r.instructions);

  const warnings = asStringArray(src.warnings);
  const favorablePeriods = asStringArray(src.favorablePeriods);
  const unfavorablePeriods = asStringArray(src.unfavorablePeriods);

  const hasAny =
    summary.length > 0 ||
    analysis.length > 0 ||
    !!currentPeriod ||
    remedies.length > 0 ||
    warnings.length > 0 ||
    favorablePeriods.length > 0 ||
    unfavorablePeriods.length > 0;

  if (!hasAny) return null;
  return { summary, analysis, currentPeriod, remedies, warnings, favorablePeriods, unfavorablePeriods };
}

// ============================================================
// Section divider component
// ============================================================

function SectionDivider({ className }: { className?: string }) {
  return <div className={`h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent my-4 ${className ?? ''}`} />;
}

// ============================================================
// Prediction structured view
// ============================================================

const CONFIDENCE_STYLE: Record<string, { label: string; cls: string; dot: string }> = {
  high:   { label: 'High',   cls: 'text-success bg-success/10 border-success/30', dot: 'bg-success' },
  medium: { label: 'Medium', cls: 'text-warning bg-warning/10 border-warning/30', dot: 'bg-warning' },
  low:    { label: 'Low',    cls: 'text-danger bg-danger/10 border-danger/30',    dot: 'bg-danger' },
};

const URGENCY_STYLE: Record<string, string> = {
  high:   'text-danger bg-danger/10 border-danger/30',
  medium: 'text-warning bg-warning/10 border-warning/30',
  low:    'text-primary bg-primary/10 border-primary/30',
};

const REMEDY_TYPE_ICON: Record<string, string> = {
  mantra: '📿', gemstone: '💎', charity: '🎁', fasting: '🍽️', puja: '🙏', yantra: '🪔', rudraksha: '📿',
};

function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-semibold tracking-[0.2em] uppercase text-text-muted">
      {children}
    </span>
  );
}

// ============================================================
// Toggle switch (no library — single inline component)
// ============================================================

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <span className="text-[11px] text-text-secondary leading-tight">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40 ${
          checked ? 'bg-primary' : 'bg-surface-2 border border-border'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-md transition-all duration-200 ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </button>
    </label>
  );
}

// ============================================================
// Confidence ↔ percentage helpers (used by Marriage panel)
// ============================================================

function confidenceToPercent(c?: string): number {
  switch ((c ?? '').toLowerCase()) {
    case 'high':   return 82;
    case 'medium': return 58;
    case 'low':    return 32;
    default:       return 50;
  }
}

function pctTier(pct: number): { label: string; cls: string; bar: string } {
  if (pct >= 75) return { label: 'Strong',   cls: 'text-success bg-success/10 border-success/30', bar: 'bg-success' };
  if (pct >= 55) return { label: 'Likely',   cls: 'text-primary bg-primary/10 border-primary/30', bar: 'bg-primary' };
  if (pct >= 40) return { label: 'Moderate', cls: 'text-warning bg-warning/10 border-warning/30', bar: 'bg-warning' };
  return { label: 'Weak', cls: 'text-danger bg-danger/10 border-danger/30', bar: 'bg-danger' };
}

function spouseTerms(gender: string | undefined): { spouse: string; pronoun: string } {
  const g = (gender ?? '').toLowerCase();
  if (g === 'male' || g === 'm') return { spouse: 'wife', pronoun: 'she' };
  if (g === 'female' || g === 'f') return { spouse: 'husband', pronoun: 'he' };
  return { spouse: 'spouse', pronoun: 'they' };
}

// ============================================================
// Marriage panel — gender-aware, with explicit percentages
// ============================================================

function MarriagePanel({ structured, gender }: { structured: PredictionStructured; gender: string }) {
  const { spouse } = spouseTerms(gender);
  const overall =
    structured.analysis.length > 0
      ? Math.round(structured.analysis.reduce((sum, a) => sum + confidenceToPercent(a.confidence), 0) / structured.analysis.length)
      : 50;
  const overallTier = pctTier(overall);

  return (
    <div className="space-y-3.5">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <MicroLabel>Marriage Outlook</MicroLabel>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${overallTier.cls}`}>
            {overallTier.label} · {overall}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-2/50 overflow-hidden">
          <div className={`h-full ${overallTier.bar} transition-all`} style={{ width: `${overall}%` }} />
        </div>
        <p className="text-[11px] leading-relaxed text-text-secondary">
          References to your <strong className="text-text">{spouse}</strong> use {gender ? `your stated gender (${gender})` : 'a neutral term'}.
          Likelihood blends planetary support, dasha periods and yoga effects detected in your chart.
        </p>
      </div>

      {structured.summary.length > 0 && (
        <div className="space-y-1.5">
          <MicroLabel>Summary</MicroLabel>
          <RichText asBullets>{structured.summary.join('\n\n')}</RichText>
        </div>
      )}

      {structured.analysis.length > 0 && (
        <div className="space-y-1.5">
          <MicroLabel>Likelihood by area</MicroLabel>
          <div className="space-y-2">
            {structured.analysis.map((a, i) => {
              const pct = confidenceToPercent(a.confidence);
              const tier = pctTier(pct);
              return (
                <div key={i} className="rounded-lg border border-border bg-surface-2/30 p-2.5 space-y-1.5">
                  <div className="flex items-start gap-2 flex-wrap">
                    {a.area && <h5 className="text-[12px] font-semibold text-text leading-snug">{a.area}</h5>}
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${tier.cls} ml-auto`}>
                      {tier.label} · {pct}%
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-surface-2/50 overflow-hidden">
                    <div className={`h-full ${tier.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs leading-relaxed text-text-secondary">{parseInline(a.prediction)}</p>
                  {(a.timeline || a.planetaryBasis) && (
                    <div className="flex items-start gap-2 flex-wrap pt-0.5">
                      {a.timeline && <span className="text-[10px] text-accent/80">⏳ {parseInline(a.timeline)}</span>}
                      {a.planetaryBasis && (
                        <span className="text-[10px] italic text-text-muted">{parseInline(a.planetaryBasis)}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {structured.favorablePeriods.length > 0 && (
        <div className="rounded-lg border border-success/20 bg-success/5 p-2.5 space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="text-success text-xs">✦</span>
            <MicroLabel>Favourable Windows</MicroLabel>
          </div>
          <ul className="space-y-0.5 pl-1">
            {structured.favorablePeriods.map((p, i) => (
              <li key={i} className="text-[11px] leading-relaxed text-text-muted">• {p}</li>
            ))}
          </ul>
        </div>
      )}

      {structured.warnings.length > 0 && (
        <div className="rounded-lg border border-warning/20 bg-warning/5 p-2.5 space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="text-warning text-xs">⚠</span>
            <MicroLabel>Be cautious</MicroLabel>
          </div>
          <ul className="space-y-0.5 pl-1">
            {structured.warnings.map((w, i) => (
              <li key={i} className="text-xs leading-relaxed text-text-muted">• {w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PredictionStructuredView({ structured }: { structured: PredictionStructured }) {
  const cp = structured.currentPeriod;
  const cpDateRange =
    cp?.startDate && cp?.endDate
      ? `${formatDate(cp.startDate)} → ${formatDate(cp.endDate)}`
      : cp?.startDate
        ? `from ${formatDate(cp.startDate)}`
        : cp?.endDate
          ? `until ${formatDate(cp.endDate)}`
          : '';

  return (
    <div className="space-y-3.5">
      {structured.summary.length > 0 && (
        <div className="space-y-1.5">
          <MicroLabel>Summary</MicroLabel>
          <RichText asBullets>{structured.summary.join('\n\n')}</RichText>
        </div>
      )}

      {structured.analysis.length > 0 && (
        <div className="space-y-1.5">
          <MicroLabel>Detailed Analysis</MicroLabel>
          <div className="space-y-2">
            {structured.analysis.map((a, i) => {
              const conf = a.confidence ? CONFIDENCE_STYLE[a.confidence.toLowerCase()] : undefined;
              return (
                <div
                  key={i}
                  className="rounded-lg border border-border bg-surface-2/30 p-2.5 space-y-1.5"
                >
                  <div className="flex items-start gap-2 flex-wrap">
                    {a.area && (
                      <h5 className="text-[12px] font-semibold text-text leading-snug">{a.area}</h5>
                    )}
                    {conf && (
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border inline-flex items-center gap-1 ${conf.cls}`}>
                        <span className={`w-1 h-1 rounded-full ${conf.dot}`} />
                        {conf.label}
                      </span>
                    )}
                    {a.timeline && (
                      <span className="text-[9px] font-medium text-text-muted ml-auto">
                        {a.timeline}
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-text-secondary">{parseInline(a.prediction)}</p>
                  {a.planetaryBasis && (
                    <p className="text-[10px] leading-relaxed text-text-muted italic border-l-2 border-primary/30 pl-2">
                      {parseInline(a.planetaryBasis)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {cp && (cp.dasha || cp.antardasha || cp.effects || cpDateRange) && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <MicroLabel>Current Period</MicroLabel>
            {(cp.dasha || cp.antardasha) && (
              <span className="text-[11px] font-semibold text-accent">
                {[cp.dasha, cp.antardasha].filter(Boolean).join(' → ')}
              </span>
            )}
            {cpDateRange && (
              <span className="text-[10px] text-text-muted ml-auto">{cpDateRange}</span>
            )}
          </div>
          {cp.effects && (
            <p className="text-xs leading-relaxed text-text-secondary">{parseInline(cp.effects)}</p>
          )}
        </div>
      )}

      {structured.remedies.length > 0 && (
        <div className="space-y-1.5">
          <MicroLabel>Remedies</MicroLabel>
          <ul className="space-y-1.5">
            {structured.remedies.map((r, i) => {
              const icon = REMEDY_TYPE_ICON[r.type.toLowerCase()] ?? '✨';
              const urgency = r.urgency ? URGENCY_STYLE[r.urgency.toLowerCase()] : undefined;
              return (
                <li
                  key={i}
                  className="rounded-lg border border-border bg-surface-2/30 p-2.5 flex gap-2.5"
                >
                  <div className="text-base leading-none mt-0.5">{icon}</div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                        {r.type}
                      </span>
                      {r.planet && r.planet !== 'None' && (
                        <span className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border border-border bg-surface-2/40 ${PLANET_COLORS[r.planet] ?? 'text-text-secondary'}`}>
                          <PlanetOrb2D planet={r.planet} size={12} pulse={false} />
                          {r.planet}
                        </span>
                      )}
                      {urgency && (
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${urgency} ml-auto`}>
                          {r.urgency}
                        </span>
                      )}
                    </div>
                    {r.description && (
                      <p className="text-xs leading-relaxed text-text-secondary">{parseInline(r.description)}</p>
                    )}
                    {r.instructions && (
                      <p className="text-[11px] leading-relaxed text-text-muted">
                        <span className="text-text-muted">How: </span>{parseInline(r.instructions)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {structured.warnings.length > 0 && (
        <div className="rounded-lg border border-warning/20 bg-warning/5 p-2.5 space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="text-warning text-xs">⚠</span>
            <MicroLabel>Be cautious</MicroLabel>
          </div>
          <ul className="space-y-0.5 pl-1">
            {structured.warnings.map((w, i) => (
              <li key={i} className="text-xs leading-relaxed text-text-muted">• {w}</li>
            ))}
          </ul>
        </div>
      )}

      {(structured.favorablePeriods.length > 0 || structured.unfavorablePeriods.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {structured.favorablePeriods.length > 0 && (
            <div className="rounded-lg border border-success/20 bg-success/5 p-2.5 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-success text-xs">✦</span>
                <MicroLabel>Favorable</MicroLabel>
              </div>
              <ul className="space-y-0.5 pl-1">
                {structured.favorablePeriods.map((p, i) => (
                  <li key={i} className="text-[11px] leading-relaxed text-text-muted">• {p}</li>
                ))}
              </ul>
            </div>
          )}
          {structured.unfavorablePeriods.length > 0 && (
            <div className="rounded-lg border border-danger/20 bg-danger/5 p-2.5 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-danger text-xs">✦</span>
                <MicroLabel>Unfavorable</MicroLabel>
              </div>
              <ul className="space-y-0.5 pl-1">
                {structured.unfavorablePeriods.map((p, i) => (
                  <li key={i} className="text-[11px] leading-relaxed text-text-muted">• {p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main Page Component
// ============================================================

export default function KundliViewerPage() {
  const params = useParams();
  const kundliId = params.id as string;
  const chartStyle = useStore((s) => s.chartStyle);
  const setChartStyle = useStore((s) => s.setChartStyle);
  const reduceMotion = useStore((s) => s.reduceMotion);
  const setReduceMotion = useStore((s) => s.setReduceMotion);
  const user = useStore((s) => s.user);

  const [data, setData] = useState<KundliResult | null>(null);
  const [insights, setInsights] = useState<GroundTruthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [generatingPredictions, setGeneratingPredictions] = useState(false);
  const [predsDone, setPredsDone] = useState(0);
  const [predsTotal, setPredsTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [detailedView, setDetailedView] = useState(true);
  const [feedbacks, setFeedbacks] = useState<Record<string, 'up' | 'down'>>({});
  const [speakingSection, setSpeakingSection] = useState<string | null>(null);
  const [selectedVarga, setSelectedVarga] = useState<DivisionalChart>('D1');
  const [showFollowUp, setShowFollowUp] = useState(false);

  // Lucky-factor modal state
  const [openLuckyFactor, setOpenLuckyFactor] = useState<
    'numbers' | 'colors' | 'days' | 'directions' | 'gemstone' | 'metal' | null
  >(null);

  // Quick-stats modal (Yogas / Doshas / Strongest / Weakest)
  const [openStat, setOpenStat] = useState<'yogas' | 'doshas' | 'strongest' | 'weakest' | null>(null);

  // Ask Astrologer modal
  const [askModal, setAskModal] = useState<{
    sectionType: string;
    sectionTitle: string;
    sectionContent: string;
    qas: Array<{ q: string; a: string }>;
    loading: boolean;
    input: string;
    error: string | null;
  } | null>(null);

  const askQuestionLimit = 2;

  const openAskModal = (section: PredictionSection) => {
    const content = section.structured
      ? [...(section.structured.summary ?? []), ...(section.structured.analysis ?? []).map((a) => a.prediction)].join(' ')
      : section.content.join(' ');
    setAskModal({ sectionType: section.type, sectionTitle: section.title, sectionContent: content, qas: [], loading: false, input: '', error: null });
  };

  const submitAskQuestion = async () => {
    if (!askModal || !askModal.input.trim() || askModal.loading || askModal.qas.length >= askQuestionLimit) return;
    const question = askModal.input.trim();
    setAskModal((m) => m ? { ...m, loading: true, error: null } : m);
    try {
      const res = await fetch(`/api/kundli/${kundliId}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, sectionType: askModal.sectionType, sectionContent: askModal.sectionContent }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to get answer');
      setAskModal((m) => m ? { ...m, qas: [...m.qas, { q: question, a: json.data.answer }], input: '', loading: false } : m);
    } catch (err) {
      setAskModal((m) => m ? { ...m, loading: false, error: err instanceof Error ? err.message : 'Something went wrong' } : m);
    }
  };

  // Yogas & Doshas accordion state
  const [expandedYogaCats, setExpandedYogaCats] = useState<Set<string>>(new Set());
  const [expandedYogaItems, setExpandedYogaItems] = useState<Set<string>>(new Set());
  const [expandedDoshaItems, setExpandedDoshaItems] = useState<Set<string>>(new Set());
  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) => (key: string) =>
    setter((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  // Marriage prediction is gated — shown automatically when we know the user's marital status
  // (collected during onboarding), or manually toggled when status is unknown.
  const [marriageRevealed, setMarriageRevealed] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (user?.marital_status) {
      // Status known from onboarding — always reveal
      setMarriageRevealed(true);
      return;
    }
    const stored = localStorage.getItem(`jyotish_marriage_revealed_${kundliId}`);
    if (stored === '1') setMarriageRevealed(true);
  }, [kundliId, user?.marital_status]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (user?.marital_status) return; // don't overwrite localStorage state for known users
    localStorage.setItem(`jyotish_marriage_revealed_${kundliId}`, marriageRevealed ? '1' : '0');
  }, [kundliId, marriageRevealed, user?.marital_status]);

  // Personalized predictions state
  const [predPeriod, setPredPeriod] = useState<PredictionPeriod>('daily');
  const [predCache, setPredCache] = useState<Record<string, PersonalizedPrediction>>({});
  const [predLoading, setPredLoading] = useState(false);
  const [predError, setPredError] = useState<string | null>(null);

  // Chart zoom modal state
  const [zoomModalOpen, setZoomModalOpen] = useState(false);

  // Birth chart type: Lagna (D1) / Navamsa (D9) / Moon Sign
  const [birthChartType, setBirthChartType] = useState<BirthChartType>('lagna');

  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const tabScrollRef = useRef<HTMLDivElement | null>(null);
  const predGenStartedRef = useRef<string | null>(null); // guard: chartId that already started generation

  // ---- Fetch kundli data ----
  useEffect(() => {
    async function fetchKundli() {
      try {
        const res = await fetch(`/api/kundli/${kundliId}`);
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Failed to load Kundli');
        }

        const { chart, profile, predictions, remedies, followUpQuestions, lalKitabChart } =
          json.data as {
            chart: {
              id: string;
              chartData: ChartData;
              divisionalCharts: Record<string, Array<{ planet: string; sign: string; signIndex: number }>> | null;
              dashaData: {
                vimshottari: {
                  mahadashas: DashaPeriod[];
                  currentMahadasha: DashaPeriod;
                  currentAntardasha: DashaPeriod;
                  currentPratyantardasha?: DashaPeriod;
                };
              };
              yogaData: Yoga[];
              doshaData: DoshaAnalysis;
            };
            profile: { name: string; dob: string; tob: string; pob: string; gender: string };
            predictions: Array<{ type: string; harsh_mode: boolean; content: Record<string, unknown>; language: string }>;
            remedies: Array<{ type: string; planet: string; house: number; content: Record<string, unknown> }>;
            followUpQuestions: Array<{ id: string; question: string; options: { options: string[]; why: string } | null; answer: string | null; dasha_period: string }>;
            lalKitabChart: Record<string, unknown> | null;
          };

        const chartData = chart.chartData as ChartData;
        const dashaData = chart.dashaData;
        const yogaData = (chart.yogaData ?? []) as Yoga[];
        const doshaData = chart.doshaData as DoshaAnalysis;

        // Trigger prediction generation for any missing types
        const ALL_PRED_TYPES = ['personality', 'career', 'health', 'marriage', 'wealth', 'children', 'education'] as const;
        const existingTypes = new Set(predictions.map((p) => p.type));
        const missingTypes = ALL_PRED_TYPES.filter((t) => !existingTypes.has(t));

        let finalPredictions = [...predictions];
        if (missingTypes.length > 0 && predGenStartedRef.current !== kundliId) {
          predGenStartedRef.current = kundliId;
          setGeneratingPredictions(true);
          setPredsTotal(ALL_PRED_TYPES.length);
          let doneCount = ALL_PRED_TYPES.length - missingTypes.length;
          setPredsDone(doneCount);

          // Sequential — Ollama processes one at a time; parallel floods the queue
          for (const type of missingTypes) {
            try {
              const res = await fetch('/api/predictions/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chartId: kundliId, type, harshMode: false, language: 'en' }),
              });
              const json = await res.json();
              if (json.success) {
                finalPredictions = [
                  ...finalPredictions,
                  { type, harsh_mode: false, content: json.data?.content ?? {}, language: 'en' },
                ];
              }
            } catch {
              // Skip failed prediction, continue with next
            } finally {
              doneCount++;
              setPredsDone(doneCount);
            }
          }

          setGeneratingPredictions(false);
        }

        // Build full dasha timeline
        const now = new Date();
        const allDashas: DashaTimelineEntry[] = (dashaData.vimshottari.mahadashas ?? []).map((md: DashaPeriod) => {
          const startMs = new Date(md.startDate).getTime();
          const endMs = new Date(md.endDate).getTime();
          const dur = computeDuration(String(md.startDate), String(md.endDate));
          return {
            planet: md.planet,
            startDate: String(md.startDate),
            endDate: String(md.endDate),
            startYear: new Date(md.startDate).getFullYear(),
            endYear: new Date(md.endDate).getFullYear(),
            isActive: md.isActive || (startMs <= now.getTime() && endMs >= now.getTime()),
            isFuture: startMs > now.getTime(),
            isPast: endMs < now.getTime(),
            durationYears: dur.years,
            durationMonths: dur.months,
            antardashas: (md.subPeriods ?? []).map((ad: DashaPeriod) => ({
              planet: ad.planet,
              startDate: String(ad.startDate),
              endDate: String(ad.endDate),
              startYear: new Date(ad.startDate).getFullYear(),
              endYear: new Date(ad.endDate).getFullYear(),
            })),
          };
        });

        // Current dasha info
        const currentMD = dashaData.vimshottari.currentMahadasha;
        const currentAD = dashaData.vimshottari.currentAntardasha;
        const currentPD = dashaData.vimshottari.currentPratyantardasha;
        const endMs = new Date(currentMD.endDate).getTime();
        const yearsRemaining = Math.max(0, (endMs - now.getTime()) / (365.25 * 24 * 3600 * 1000));
        const totalYears = VIMSHOTTARI_YEARS[currentMD.planet] ?? 0;

        // Moon position
        const moonPos = chartData.planets.find((p) => p.planet === 'Moon');
        const sunPos = chartData.planets.find((p) => p.planet === 'Sun');
        const lagnaLord = chartData.houses.find((h) => h.house === 1)?.lord ?? 'Sun';

        // Transform predictions
        const PRED_META: Record<string, { icon: string; title: string }> = {
          personality: { icon: '👤', title: 'Personality' },
          career: { icon: '💼', title: 'Career' },
          health: { icon: '❤️', title: 'Health' },
          marriage: { icon: '💍', title: 'Marriage' },
          wealth: { icon: '💰', title: 'Wealth' },
          children: { icon: '👶', title: 'Children' },
          education: { icon: '📚', title: 'Education' },
        };

        const seenPredTypes = new Set<string>();
        const predSections: PredictionSection[] = finalPredictions
          .filter((p) => PRED_META[p.type] && !seenPredTypes.has(p.type) && (seenPredTypes.add(p.type), true))
          .map((p) => {
            const meta = PRED_META[p.type];
            const structured = buildStructuredPrediction(p.content);
            const texts: string[] = [];
            if (structured) {
              texts.push(...structured.summary);
              for (const a of structured.analysis) texts.push(a.prediction);
            } else {
              // Last-resort fallback — surface any long string we can find.
              for (const v of Object.values(p.content)) {
                if (typeof v === 'string' && v.length > 30) texts.push(v);
              }
            }
            return { type: p.type, icon: meta.icon, title: meta.title, content: texts, structured };
          });

        // Transform remedies
        const REMEDY_META: Record<string, { icon: string; title: string }> = {
          gemstone: { icon: '💎', title: 'Gemstone' },
          mantra: { icon: '📿', title: 'Mantra' },
          puja: { icon: '🙏', title: 'Puja' },
          fasting: { icon: '🍽️', title: 'Fasting' },
          charity: { icon: '🎁', title: 'Charity' },
          yantra: { icon: '🪔', title: 'Yantra' },
          rudraksha: { icon: '📿', title: 'Rudraksha' },
        };

        const remedyItems: RemedyItem[] = remedies.map((r) => {
          const meta = REMEDY_META[r.type] ?? { icon: '✨', title: r.type };
          const c = r.content;
          const desc = typeof c.description === 'string' ? c.description : `${r.planet} in house ${r.house}`;
          let details: string[] = [];
          if (typeof c.instructions === 'string') details = [c.instructions];
          else if (Array.isArray(c.instructions)) details = (c.instructions as unknown[]).map(String);
          return { type: r.type, icon: meta.icon, title: meta.title, description: desc, details };
        });

        // Follow-up questions
        const fqList: FollowUpQuestion[] = followUpQuestions
          .filter((q) => q.answer === null)
          .map((q) => ({
            id: q.id,
            text: q.question,
            options: Array.isArray(q.options?.options) ? q.options!.options : [],
            whyWeAsk: q.options?.why ?? '',
          }));

        // Lal Kitab
        const lkChart = lalKitabChart as Record<string, unknown> | null;
        const lalkitab: LalKitabData = {
          chart: (lkChart?.teva as LalKitabData['chart']) ?? { houses: [] },
          debts: (lkChart?.debts as LalKitabDebt[]) ?? [],
          totke: (lkChart?.remedies as LalKitabRemedy[]) ?? [],
          blindPlanets: (lkChart?.blind_planets as BlindPlanet[]) ?? [],
        };

        setData({
          id: chart.id,
          profile,
          chartData,
          lagna: chartData.ascendant.sign,
          lagnaLord: lagnaLord as string,
          lagnaDegree: chartData.ascendant.degree,
          rashi: moonPos?.sign ?? chartData.ascendant.sign,
          sunSign: sunPos?.sign ?? '',
          nakshatra: moonPos?.nakshatra ?? chartData.ascendant.nakshatra,
          nakshatraPada: moonPos?.nakshatraPada ?? chartData.ascendant.nakshatraPada,
          moonSign: moonPos?.sign ?? '',
          currentDasha: {
            mahadasha: {
              planet: currentMD.planet,
              startDate: String(currentMD.startDate),
              endDate: String(currentMD.endDate),
            },
            antardasha: {
              planet: currentAD.planet,
              startDate: String(currentAD.startDate),
              endDate: String(currentAD.endDate),
            },
            pratyantardasha: currentPD
              ? { planet: currentPD.planet, startDate: String(currentPD.startDate), endDate: String(currentPD.endDate) }
              : { planet: currentAD.planet, startDate: '', endDate: '' },
            yearsRemaining,
            totalYears,
          },
          dashaTimeline: allDashas,
          predictions: predSections,
          remedies: remedyItems,
          lalkitab,
          doshas: doshaData,
          yogas: yogaData,
          followUpQuestions: fqList,
          divisionalCharts: (chart.divisionalCharts as Record<string, Array<{ planet: string; sign: string; signIndex: number }>> | null) ?? null,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        setLoading(false);
      }
    }
    if (kundliId) fetchKundli();
  }, [kundliId]);

  // ---- Fetch ground truth insights ----
  useEffect(() => {
    async function fetchInsights() {
      try {
        const res = await fetch(`/api/kundli/${kundliId}/insights`);
        const json = await res.json();
        if (res.ok && json.success) {
          setInsights(json.data as GroundTruthData);
        }
      } catch {
        // Non-critical
      } finally {
        setInsightsLoading(false);
      }
    }
    if (kundliId) fetchInsights();
  }, [kundliId]);

  // ---- Fetch personalized prediction ----
  const fetchPersonalizedPrediction = useCallback(async (period: PredictionPeriod) => {
    if (!kundliId) return;

    // Check memory cache first
    if (predCache[period]) return;

    // Check localStorage cache
    const cached = getCachedPrediction(kundliId, period);
    if (cached) {
      setPredCache((prev) => ({ ...prev, [period]: cached }));
      return;
    }

    setPredLoading(true);
    setPredError(null);
    try {
      const res = await fetch('/api/predictions/personalized', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartId: kundliId, period }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to generate prediction');
      }
      const pred = json.data as PersonalizedPrediction;
      setPredCache((prev) => ({ ...prev, [period]: pred }));
      setCachedPrediction(kundliId, period, pred);
    } catch (err) {
      setPredError(err instanceof Error ? err.message : 'Failed to load prediction');
    } finally {
      setPredLoading(false);
    }
  }, [kundliId, predCache]);

  // Auto-fetch when prediction tab/period changes
  useEffect(() => {
    if (activeTab === 'predictions' && data) {
      fetchPersonalizedPrediction(predPeriod);
    }
  }, [activeTab, predPeriod, data, fetchPersonalizedPrediction]);

  // ---- Handlers ----
  const handleReadAloud = useCallback(
    (sectionType: string, text: string) => {
      if (speakingSection === sectionType) {
        window.speechSynthesis.cancel();
        setSpeakingSection(null);
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.onend = () => setSpeakingSection(null);
      utterance.onerror = () => setSpeakingSection(null);
      speechRef.current = utterance;
      setSpeakingSection(sectionType);
      window.speechSynthesis.speak(utterance);
    },
    [speakingSection],
  );

  const handleFeedback = useCallback((sectionType: string, vote: 'up' | 'down') => {
    setFeedbacks((prev) => ({ ...prev, [sectionType]: vote }));
    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kundliId, sectionType, vote }),
    }).catch(() => {});
  }, [kundliId]);

  const handleFollowUpComplete = useCallback(
    async (answers: FollowUpAnswer[]) => {
      setShowFollowUp(false);
      try {
        await fetch(`/api/kundli/${kundliId}/follow-up`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers }),
        });
      } catch {
        // Silently fail
      }
    },
    [kundliId],
  );

  // ---- Computed values ----
  const dashaProgress = useMemo(() => {
    if (!data || data.currentDasha.totalYears <= 0) return 0;
    return ((data.currentDasha.totalYears - data.currentDasha.yearsRemaining) / data.currentDasha.totalYears) * 100;
  }, [data]);

  const presentDoshas = useMemo(() => {
    if (!data) return [];
    return [
      ...(data.doshas.mangal.present ? [`Mangal (${data.doshas.mangal.severity})`] : []),
      ...(data.doshas.sadeSati.active ? [`Sade Sati (${data.doshas.sadeSati.phase})`] : []),
      ...(data.doshas.kaalSarp.present ? [`Kaal Sarp`] : []),
      ...(data.doshas.pitra.present ? ['Pitra Dosha'] : []),
      ...(data.doshas.kemDruma.present ? ['Kemdrum Dosha'] : []),
      ...(data.doshas.grahan.present ? [`Grahan (${data.doshas.grahan.type})`] : []),
      ...(data.doshas.guruChandal.present ? ['Guru Chandal'] : []),
    ];
  }, [data]);

  const pastDashas = useMemo(() => data?.dashaTimeline.filter((d) => d.isPast) ?? [], [data]);
  const currentDashaEntry = useMemo(() => data?.dashaTimeline.find((d) => d.isActive), [data]);
  const futureDashas = useMemo(() => data?.dashaTimeline.filter((d) => d.isFuture) ?? [], [data]);

  const strongestPlanet = useMemo(() => {
    if (!insights?.shadbalaRanking?.length) return null;
    return insights.shadbalaRanking[0];
  }, [insights]);

  const weakestPlanet = useMemo(() => {
    if (!insights?.shadbalaRanking?.length) return null;
    return insights.shadbalaRanking[insights.shadbalaRanking.length - 1];
  }, [insights]);

  const yogaCount = useMemo(() => {
    if (insights?.detectedYogas?.length) return insights.detectedYogas.length;
    return data?.yogas.filter((y) => y.present).length ?? 0;
  }, [insights, data]);

  const doshaCount = useMemo(() => presentDoshas.length, [presentDoshas]);

  // ---- Loading state ----
  if (loading) {
    return <Loading size="lg" />;
  }

  // ---- Error state ----
  if (error || !data) {
    return (
      <div className="flex min-h-[calc(100dvh-164px)] items-center justify-center bg-bg">
        <Card className="max-w-sm text-center">
          <CardContent>
            <p className="text-4xl">⚠️</p>
            <p className="mt-3 text-base font-semibold text-text">Failed to Load Kundli</p>
            <p className="mt-1.5 text-xs text-text-secondary">{error}</p>
            <Button onClick={() => window.location.reload()} className="mt-4">Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============================================================
  // Tab Content Renderers
  // ============================================================

  const renderOverviewTab = () => {
    const resolvedChart = resolveBirthChart(birthChartType, data.chartData, data.divisionalCharts);
    return (
    <div className="space-y-4">
      {/* Birth Chart - smaller, centered */}
      <FadeIn>
        <div className="rounded-xl border border-border p-3 sm:p-4 bg-surface">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h3 className="text-sm font-bold text-text font-[family-name:var(--font-serif)]">
              Birth Chart ({resolvedChart.title})
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Animation toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Toggle animations">
                <span className="text-[10px] text-text-muted">Motion</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!reduceMotion}
                  onClick={() => setReduceMotion(!reduceMotion)}
                  className={`relative h-4 w-7 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                    !reduceMotion ? 'bg-primary' : 'bg-surface-2 border border-border'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-md transition-all duration-200 ${
                      !reduceMotion ? 'left-[14px]' : 'left-0.5'
                    }`}
                  />
                </button>
              </label>

              {/* Style switch */}
              <div className="flex overflow-hidden rounded-full border border-white/10">
                {(['north', 'south'] as const).map((style) => (
                  <button
                    key={style}
                    onClick={() => setChartStyle(style)}
                    className={`px-2.5 py-1 text-[11px] font-medium transition-all ${
                      chartStyle === style
                        ? 'bg-accent text-bg font-bold'
                        : 'text-text-secondary hover:text-text'
                    }`}
                  >
                    {style === 'north' ? 'North' : 'South'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Chart type tabs: Lagna / Navamsa / Moon */}
          <div className="mb-3">
            <PillTabs
              layoutId="kundliPageChartType"
              tabs={BIRTH_CHART_TABS.map((t) => ({ key: t.key, label: t.label }))}
              active={birthChartType}
              onChange={(k) => setBirthChartType(k as BirthChartType)}
            />
          </div>

          <div className="flex justify-center">
            {resolvedChart.ready && resolvedChart.data ? (
              <button
                onClick={() => setZoomModalOpen(true)}
                className="w-full max-w-[400px] cursor-pointer hover:opacity-80 transition-opacity"
                title="Click to zoom"
              >
                {chartStyle === 'north'
                  ? <NorthIndianChart chartData={resolvedChart.data} ascendantHouse={resolvedChart.ascHouse} title={resolvedChart.title} />
                  : <SouthIndianChart chartData={resolvedChart.data} ascendantHouse={resolvedChart.ascHouse} title={resolvedChart.title} />}
              </button>
            ) : (
              <div className="w-full max-w-[400px] aspect-square rounded-2xl border border-border bg-surface-2 flex flex-col items-center justify-center gap-2 text-text-muted">
                <span className="text-[10px] uppercase tracking-[0.18em] text-accent/80">{resolvedChart.title}</span>
                <span className="text-[11px]">Drawing chart…</span>
              </div>
            )}
          </div>
        </div>
      </FadeIn>

      {/* 2-column grid: Lucky Factors + Personality */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {/* Lucky Factors */}
        {insights && (
          <ScrollReveal>
            <div className="rounded-xl border border-border p-3 bg-surface">
              <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">Lucky Factors</h3>
              <div className="grid grid-cols-2 gap-2.5">
                {([
                  { key: 'numbers',    label: 'Numbers',    value: insights.luckyFactors.numbers.join(', '), icon: '🔢' },
                  { key: 'colors',     label: 'Colors',     value: insights.luckyFactors.colors.join(', '),  icon: '🎨' },
                  { key: 'days',       label: 'Days',       value: insights.luckyFactors.days.join(', '),    icon: '📅' },
                  { key: 'directions', label: 'Directions', value: insights.luckyFactors.directions.join(', '), icon: '🧭' },
                  { key: 'gemstone',   label: 'Gemstone',   value: insights.luckyFactors.gemstone,           icon: '💎' },
                  { key: 'metal',      label: 'Metal',      value: insights.luckyFactors.metal,              icon: '⚙️' },
                ] as const).map(({ key, label, value, icon }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setOpenLuckyFactor(key)}
                    className="group text-left rounded-lg border border-border bg-surface-2/30 p-2.5 transition-colors hover:bg-surface-2/50 hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs mb-0.5">{icon}</div>
                      <span className="text-[10px] text-text-muted group-hover:text-primary transition-colors">Tap for why →</span>
                    </div>
                    <div className="text-[10px] text-text-secondary">{label}</div>
                    <div className="text-[11px] font-semibold mt-0.5 text-accent">{value}</div>
                  </button>
                ))}
              </div>
            </div>
          </ScrollReveal>
        )}

        {/* Personality Profile */}
        {insights && (
          <ScrollReveal>
            <div className="rounded-xl border border-border p-3 bg-surface">
              <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">Personality Profile</h3>
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {insights.personalityKeywords.map((kw) => (
                  <span key={kw} className="rounded-full border border-primary/30 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {kw}
                  </span>
                ))}
              </div>
              {detailedView && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-text">Ascendant Traits ({data.lagna})</p>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px] text-text-secondary">
                    <div><span className="text-text-muted">Element:</span> {insights.ascendantTraits.element}</div>
                    <div><span className="text-text-muted">Nature:</span> {insights.ascendantTraits.qualityMeaning}</div>
                    <div><span className="text-text-muted">Ruler:</span> {insights.ascendantTraits.rulingPlanet}</div>
                  </div>
                  {insights.ascendantTraits.appearance.length > 0 && (
                    <div className="mt-1.5">
                      <p className="text-[10px] font-medium mb-0.5 text-text-muted">Physical Characteristics</p>
                      <ul className="text-[11px] space-y-0.5 text-text-secondary">
                        {insights.ascendantTraits.appearance.map((a) => (
                          <li key={a} className="flex items-start gap-1.5">
                            <span className="text-accent/50 mt-0.5">-</span> {a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollReveal>
        )}
      </div>

      {/* Summary predictions */}
      <StaggerList className="space-y-2.5">
        {data.predictions.slice(0, 3).map((section) => (
          <StaggerItem key={section.type}>
            <div className="rounded-xl border border-border p-3 bg-surface">
              <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">{section.icon} {section.title}</h3>
              <RichText asBullets>{section.content.slice(0, 2).join('\n\n')}</RichText>
            </div>
          </StaggerItem>
        ))}
      </StaggerList>
    </div>
  );
  };

  const renderPlanetsTab = () => (
    <div className="space-y-3">
      {/* Clean table view */}
      <FadeIn>
        <div className="rounded-xl border border-border overflow-hidden bg-surface">
          <h3 className="text-sm font-bold text-text px-3 pt-3 pb-2.5 border-b border-border font-[family-name:var(--font-serif)]">Planetary Positions</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-text-muted">Planet</th>
                  <th className="text-left py-2 px-3 font-medium text-text-muted">Sign</th>
                  <th className="text-left py-2 px-3 font-medium text-text-muted">Degree</th>
                  <th className="text-left py-2 px-3 font-medium text-text-muted">House</th>
                  <th className="text-left py-2 px-3 font-medium text-text-muted">Nakshatra</th>
                  <th className="text-left py-2 px-3 font-medium text-text-muted">Pada</th>
                  <th className="text-left py-2 px-3 font-medium text-text-muted">Dignity</th>
                </tr>
              </thead>
              <motion.tbody variants={staggerContainer} initial="initial" animate="animate">
                {data.chartData.planets.map((p, idx) => {
                  const dignity = insights?.planetDignities[p.planet];
                  return (
                    <motion.tr
                      key={p.planet}
                      variants={staggerItem}
                      className={`border-b border-border ${idx % 2 === 0 ? '' : 'bg-surface-2/30'}`}
                    >
                      <td className="py-2 px-3">
                        <span className={`inline-flex items-center gap-1.5 font-semibold ${PLANET_COLORS[p.planet] ?? 'text-text'}`}>
                          <PlanetOrb2D planet={p.planet} size={16} />
                          {p.planet}
                        </span>
                        {p.isRetrograde && <span className="ml-1 text-[9px] text-warning">(R)</span>}
                      </td>
                      <td className="py-2 px-3 text-text">{p.sign}</td>
                      <td className="py-2 px-3 text-text-secondary">{p.signDegree?.toFixed(1)}°</td>
                      <td className="py-2 px-3 text-text-secondary">H{p.house}</td>
                      <td className="py-2 px-3 text-text-secondary">{p.nakshatra}</td>
                      <td className="py-2 px-3 text-text-secondary">{p.nakshatraPada}</td>
                      <td className="py-2 px-3">
                        {dignity && (
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${dignityDotColor(dignity.status)}`} />
                            <span className="text-[10px] text-text-secondary">{dignity.status}</span>
                          </div>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </motion.tbody>
            </table>
          </div>
        </div>
      </FadeIn>

      {/* Detailed planet cards (when detailedView is on) */}
      {detailedView && (
        <StaggerList className="space-y-2.5">
          {data.chartData.planets.map((p) => {
            const dignity = insights?.planetDignities[p.planet];
            const aspects = insights?.planetAspects[p.planet];
            const fullData = insights?.planetFullData[p.planet];
            if (!dignity && !aspects && !fullData) return null;
            return (
              <StaggerItem key={`detail-${p.planet}`}>
                <div className="rounded-xl border border-border p-3 bg-surface">
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${PLANET_BG[p.planet] ?? 'bg-surface border-border'}`}>
                      <Planet3DInline planet={p.planet} size={28} />
                    </div>
                    <div>
                      <span className={`text-xs font-bold ${PLANET_COLORS[p.planet] ?? 'text-text'}`}>{p.planet}</span>
                      {dignity && <Badge variant={dignityBadgeVariant(dignity.status)} className="ml-2 text-[9px]">{dignity.status}</Badge>}
                    </div>
                  </div>
                  {dignity?.description && (
                    <p className="text-[11px] mb-1.5 text-text-muted">{dignity.description}</p>
                  )}
                  {aspects && aspects.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap mb-1.5">
                      <span className="text-[10px] text-text-muted">Aspected by:</span>
                      {aspects.map((a) => (
                        <span key={a} className="rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] text-text-secondary">{a}</span>
                      ))}
                    </div>
                  )}
                  {fullData && (
                    <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[10px] text-text-muted">
                      <div>Color: {fullData.color}</div>
                      <div>Number: {fullData.number}</div>
                      <div>Day: {fullData.day}</div>
                      <div>Direction: {fullData.direction}</div>
                      <div>Metal: {fullData.metal}</div>
                      <div>Grain: {fullData.grain}</div>
                    </div>
                  )}
                </div>
              </StaggerItem>
            );
          })}
        </StaggerList>
      )}
    </div>
  );

  const renderHousesTab = () => (
    <StaggerList className="space-y-2.5">
      {(insights ? Object.entries(insights.houseAnalysis) : data.chartData.houses.map((h) => [String(h.house), { sign: h.sign, lord: h.lord as string, lordHouse: 0, planets: h.planets as string[], significance: '' }] as const)).map(([houseNum, analysis]) => {
        const h = typeof analysis === 'object' ? analysis : { sign: '', lord: '', lordHouse: 0, planets: [] as string[], significance: '' };
        const num = Number(houseNum);
        const label = HOUSE_LABELS[num] ?? '';
        const signQuality = SIGN_QUALITY[h.sign] ?? '';
        const lordNote = h.lordHouse > 0 ? LORD_HOUSE_NOTE[h.lordHouse] : '';
        return (
          <StaggerItem key={houseNum}>
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              {/* Header row */}
              <div className="flex items-start gap-2.5 p-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold text-xs bg-primary/10 border border-primary/20 text-primary">
                  H{houseNum}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-text">{label || h.sign}</span>
                    {label && <span className="text-[11px] text-text-muted">· {h.sign}</span>}
                    <span className="text-[10px] text-text-muted">Lord: {h.lord}</span>
                    {h.lordHouse > 0 && <span className="text-[10px] text-text-muted">(in H{h.lordHouse})</span>}
                  </div>
                  {h.planets.length > 0 && (
                    <div className="mt-1.5 flex gap-1 flex-wrap">
                      {h.planets.map((p: string) => (
                        <span key={p} className={`inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[9px] font-medium ${PLANET_COLORS[p] ?? 'text-text-muted'}`}>
                          <PlanetOrb2D planet={p} size={10} pulse={false} />
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {/* Plain-language explanation */}
              {h.significance && (
                <div className="border-t border-border px-3 py-2.5 bg-surface-2/30 space-y-2">
                  <p className="text-[11px] leading-relaxed text-text-muted">{h.significance}</p>
                  {(signQuality || lordNote) && (
                    <p className="text-[11px] leading-relaxed text-text">
                      {signQuality && (
                        <><span className="font-medium">{h.sign}</span> here makes your approach to this area {signQuality}.</>
                      )}
                      {signQuality && lordNote && ' '}
                      {lordNote && (
                        <>With {h.lord} ruling from the {h.lordHouse}{h.lordHouse === 1 ? 'st' : h.lordHouse === 2 ? 'nd' : h.lordHouse === 3 ? 'rd' : 'th'} house, {lordNote}.</>
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
          </StaggerItem>
        );
      })}
    </StaggerList>
  );

  const renderYogasTab = () => {
    const STRENGTH_RANK: Record<string, number> = { Strong: 0, Medium: 1, Weak: 2 };
    const CAT_ORDER = ['mahapurusha', 'raja', 'dhana', 'benefic', 'lunar', 'solar'];
    const CAT_META: Record<string, { label: string; blurb: string; icon: string }> = {
      mahapurusha: { icon: '👑', label: 'Great-Personality Yogas', blurb: 'Five rare configurations that define you through courage, wisdom, charm, discipline, or intellect — depending on which planet forms it.' },
      raja:        { icon: '⚜️', label: 'Power & Status Yogas',    blurb: 'Combinations that bring authority, leadership, and high social standing over time.' },
      dhana:       { icon: '💰', label: 'Wealth Yogas',            blurb: 'Combinations that support steady financial growth and material prosperity.' },
      benefic:     { icon: '✨', label: 'Beneficial Yogas',        blurb: 'General supportive patterns that bring positive outcomes across life areas.' },
      lunar:       { icon: '🌙', label: 'Mind & Emotion Yogas',    blurb: 'Moon-based patterns shaping your emotional world, instincts, and relationships.' },
      solar:       { icon: '☀️', label: 'Identity & Vitality Yogas', blurb: 'Sun-based patterns shaping your confidence, drive, and public presence.' },
    };

    const toggleCat  = toggleSet(setExpandedYogaCats);
    const toggleItem = toggleSet(setExpandedYogaItems);
    const toggleDosha = toggleSet(setExpandedDoshaItems);

    const renderInsightYogas = () => {
      if (!insights || insights.detectedYogas.length === 0) return null;
      const sorted = [...insights.detectedYogas].sort(
        (a, b) => (STRENGTH_RANK[a.strength] ?? 3) - (STRENGTH_RANK[b.strength] ?? 3)
      );
      const grouped = new Map<string, typeof sorted>();
      for (const y of sorted) {
        const cat = (y.type || 'benefic').toLowerCase();
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat)!.push(y);
      }
      const orderedKeys = [
        ...CAT_ORDER.filter((k) => grouped.has(k)),
        ...[...grouped.keys()].filter((k) => !CAT_ORDER.includes(k)),
      ];

      return (
        <div className="space-y-2">
          {orderedKeys.map((cat) => {
            const items = grouped.get(cat)!;
            const meta = CAT_META[cat] ?? { icon: '🔮', label: cat.charAt(0).toUpperCase() + cat.slice(1) + ' Yogas', blurb: '' };
            const isOpen = expandedYogaCats.has(cat);
            const strongCount = items.filter((y) => y.strength === 'Strong').length;
            return (
              <div key={cat} className="rounded-xl border border-border bg-surface overflow-hidden">
                <button
                  onClick={() => toggleCat(cat)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-surface-2/40 transition-colors"
                >
                  <span className="text-base shrink-0">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-text">{meta.label}</span>
                      <span className="rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[9px] font-semibold">{items.length}</span>
                      {strongCount > 0 && (
                        <span className="rounded-full bg-success/10 text-success px-1.5 py-0.5 text-[9px] font-semibold">{strongCount} Strong</span>
                      )}
                    </div>
                    {!isOpen && <p className="text-[10px] text-text-muted mt-0.5 leading-relaxed line-clamp-1">{meta.blurb}</p>}
                  </div>
                  <span className={`text-text-muted text-xs shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>›</span>
                </button>
                {isOpen && (
                  <div className="border-t border-border">
                    <p className="px-3 py-2 text-[10px] text-text-muted leading-relaxed bg-surface-2/30">{meta.blurb}</p>
                    <div className="divide-y divide-border">
                      {items.map((yoga) => {
                        const itemOpen = expandedYogaItems.has(yoga.name);
                        return (
                          <div key={yoga.name}>
                            <button
                              onClick={() => toggleItem(yoga.name)}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-2/30 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-semibold text-text">{yoga.name}</span>
                                  <Badge variant={yoga.strength === 'Strong' ? 'success' : yoga.strength === 'Medium' ? 'accent' : 'outline'}>{yoga.strength}</Badge>
                                </div>
                                {yoga.planets && <p className="text-[10px] text-text-muted mt-0.5">Involves: {yoga.planets}</p>}
                                {!itemOpen && <p className="text-[10px] text-text-muted mt-0.5 line-clamp-1">{cleanYogaMeaning(yoga.meaning)}</p>}
                              </div>
                              <span className={`text-text-muted text-xs shrink-0 transition-transform duration-200 ${itemOpen ? 'rotate-90' : ''}`}>›</span>
                            </button>
                            {itemOpen && (
                              <div className="px-3 pb-3 pt-1 bg-surface-2/20">
                                <p className="text-[11px] leading-relaxed text-text-muted">{cleanYogaMeaning(yoga.meaning)}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    };

    const renderFallbackYogas = () => {
      const present = data.yogas.filter((y) => y.present);
      if (present.length === 0) return <p className="text-xs text-text-muted">No significant yogas detected.</p>;
      return (
        <div className="space-y-2">
          {present.map((yoga) => {
            const itemOpen = expandedYogaItems.has(yoga.name);
            return (
              <div key={yoga.name} className="rounded-xl border border-border bg-surface overflow-hidden">
                <button
                  onClick={() => toggleItem(yoga.name)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-2/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-text">{yoga.name}</span>
                      <Badge variant="accent">{yoga.strength}%</Badge>
                    </div>
                  </div>
                  <span className={`text-text-muted text-xs shrink-0 transition-transform duration-200 ${itemOpen ? 'rotate-90' : ''}`}>›</span>
                </button>
                {itemOpen && (
                  <div className="px-3 pb-3 pt-1 border-t border-border bg-surface-2/20">
                    <p className="text-[11px] leading-relaxed text-text-muted">{yoga.description}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    };

    const renderDoshas = () => {
      if (insights && insights.detectedDoshas.length > 0) {
        return (
          <div className="space-y-2">
            {insights.detectedDoshas.map((dosha) => {
              const isOpen = expandedDoshaItems.has(dosha.name);
              return (
                <div key={dosha.name} className={`rounded-xl border bg-surface overflow-hidden ${dosha.present ? 'border-danger/30' : 'border-border'}`}>
                  <button
                    onClick={() => toggleDosha(dosha.name)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-surface-2/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-text">{dosha.name}</span>
                        <Badge variant={dosha.present ? (dosha.severity === 'severe' ? 'error' : 'warning') : 'success'}>
                          {dosha.present ? dosha.severity.charAt(0).toUpperCase() + dosha.severity.slice(1) : 'Not Present'}
                        </Badge>
                      </div>
                      {dosha.timeline && <p className="text-[10px] text-warning mt-0.5">Active period: {dosha.timeline}</p>}
                      {!isOpen && <p className="text-[10px] text-text-muted mt-0.5 line-clamp-1">{dosha.description}</p>}
                    </div>
                    <span className={`text-text-muted text-xs shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>›</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-border px-3 py-3 bg-surface-2/20 space-y-2">
                      <p className="text-[11px] leading-relaxed text-text-muted">{dosha.description}</p>
                      {dosha.present && dosha.remedies.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-text-muted mb-1">Suggested remedies:</p>
                          <ul className="text-[11px] space-y-0.5 text-text-muted">
                            {dosha.remedies.map((r, i) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <span className="text-accent mt-0.5 shrink-0">·</span> {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      }
      if (presentDoshas.length > 0) {
        return (
          <div className="flex flex-wrap gap-1.5">
            {presentDoshas.map((d) => <Badge key={d} variant="error">{d}</Badge>)}
          </div>
        );
      }
      return <p className="text-xs text-text-muted">No significant doshas detected.</p>;
    };

    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">Detected Yogas</h3>
          {insights && insights.detectedYogas.length > 0 ? renderInsightYogas() : renderFallbackYogas()}
        </div>
        <SectionDivider />
        <div>
          <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">Dosha Analysis</h3>
          {renderDoshas()}
        </div>
      </div>
    );
  };

  const renderDashaTimeline = () => {
    const age = getAgeFromDob(data.profile.dob);

    return (
      <div className="space-y-4">
        {/* Color legend — what the dasha row tints mean */}
        <FadeIn>
          <div className="rounded-lg border border-border bg-surface-2/30 p-2.5">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-text-muted">
                Color guide
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-[10px] text-success/90">Benefic — Jupiter, Venus, Moon</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-orange-400" />
                <span className="text-[10px] text-orange-300/90">Neutral — Sun</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-[10px] text-blue-300/90">Neutral — Mercury</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-[10px] text-red-300/90">Malefic — Mars, Ketu</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-400" />
                <span className="text-[10px] text-purple-300/90">Malefic — Saturn, Rahu</span>
              </span>
            </div>
            <p className="text-[10px] text-text-muted mt-1.5 leading-relaxed">
              Tints reflect each planet&apos;s natural disposition. Functional outcome in your specific chart can differ —
              cross-reference with the planet&apos;s house and dignity.
            </p>
          </div>
        </FadeIn>

        {/* Current Dasha Highlight */}
        <FadeIn>
          <div className="rounded-xl border p-4 bg-surface" style={{ borderColor: 'var(--accent-glow)' }}>
            <div className="flex items-center gap-1.5 mb-3">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent">CURRENT PERIOD</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Mahadasha */}
              <div className={`rounded-lg border p-3 ${DASHA_NATURE[data.currentDasha.mahadasha.planet]?.bgClass ?? 'bg-surface border-border'}`}>
                <div className="text-[10px] mb-0.5 text-text-muted">Mahadasha</div>
                <div className={`flex items-center gap-2 text-base font-bold ${DASHA_NATURE[data.currentDasha.mahadasha.planet]?.colorClass ?? 'text-text'}`}>
                  <Planet3DInline planet={data.currentDasha.mahadasha.planet} size={28} />
                  {data.currentDasha.mahadasha.planet}
                </div>
                <div className="text-[11px] mt-0.5 text-text-secondary">
                  {formatDateShort(data.currentDasha.mahadasha.startDate)} - {formatDateShort(data.currentDasha.mahadasha.endDate)}
                </div>
                <div className="text-[11px] mt-0.5 text-accent/80">{data.currentDasha.yearsRemaining.toFixed(1)}y remaining</div>
                <div className="mt-1.5 h-1 rounded-full overflow-hidden bg-black/30">
                  <div className="h-full rounded-full transition-all bg-accent" style={{ width: `${dashaProgress}%` }} />
                </div>
              </div>
              {/* Antardasha */}
              <div className={`rounded-lg border p-3 ${DASHA_NATURE[data.currentDasha.antardasha.planet]?.bgClass ?? 'bg-surface border-border'}`}>
                <div className="text-[10px] mb-0.5 text-text-muted">Antardasha</div>
                <div className={`flex items-center gap-2 text-base font-bold ${DASHA_NATURE[data.currentDasha.antardasha.planet]?.colorClass ?? 'text-text'}`}>
                  <Planet3DInline planet={data.currentDasha.antardasha.planet} size={28} />
                  {data.currentDasha.antardasha.planet}
                </div>
                <div className="text-[11px] mt-0.5 text-text-secondary">
                  {formatDateShort(data.currentDasha.antardasha.startDate)} - {formatDateShort(data.currentDasha.antardasha.endDate)}
                </div>
              </div>
              {/* Pratyantardasha */}
              <div className={`rounded-lg border p-3 ${DASHA_NATURE[data.currentDasha.pratyantardasha.planet]?.bgClass ?? 'bg-surface border-border'}`}>
                <div className="text-[10px] mb-0.5 text-text-muted">Pratyantardasha</div>
                <div className={`flex items-center gap-2 text-base font-bold ${DASHA_NATURE[data.currentDasha.pratyantardasha.planet]?.colorClass ?? 'text-text'}`}>
                  <Planet3DInline planet={data.currentDasha.pratyantardasha.planet} size={28} />
                  {data.currentDasha.pratyantardasha.planet}
                </div>
                {data.currentDasha.pratyantardasha.startDate && (
                  <div className="text-[11px] mt-0.5 text-text-secondary">
                    {formatDateShort(data.currentDasha.pratyantardasha.startDate)} - {formatDateShort(data.currentDasha.pratyantardasha.endDate)}
                  </div>
                )}
              </div>
            </div>
            {/* Interpretation */}
            <div className="mt-3 rounded-lg p-2.5 bg-accent/5 border border-accent/12">
              <p className="text-[11px] font-semibold mb-0.5 text-accent">What this means for you NOW</p>
              <p className="text-[11px] leading-relaxed text-text-secondary">
                You are currently under <strong className="text-text">{data.currentDasha.mahadasha.planet} Mahadasha</strong> with <strong className="text-text">{data.currentDasha.antardasha.planet} Antardasha</strong>.
                This is a period of {getPlanetTheme(data.currentDasha.mahadasha.planet).toLowerCase()}.
                The sub-period adds influence of {getPlanetTheme(data.currentDasha.antardasha.planet).toLowerCase()}.
              </p>
            </div>
          </div>
        </FadeIn>

        {/* PAST Dashas */}
        {pastDashas.length > 0 && (
          <ScrollReveal>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider mb-2.5 text-text-muted font-[family-name:var(--font-serif)]">
                Past (Age 0 to {age})
              </h3>
              <div className="relative space-y-0">
                <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-white/[0.06]" />
                {pastDashas.map((dasha) => {
                  const nature = DASHA_NATURE[dasha.planet] ?? DASHA_NATURE.Mercury;
                  return (
                    <div key={`past-${dasha.planet}-${dasha.startYear}`} className="relative pl-12 pb-3">
                      <div className={`absolute left-3 top-1 h-3.5 w-3.5 rounded-full border-2 ${nature.bgClass}`} />
                      <div className={`rounded-lg border p-2.5 ${nature.bgClass} opacity-70`}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-text">
                            <PlanetOrb2D planet={dasha.planet} size={16} />
                            {dasha.planet} Mahadasha
                          </span>
                          <span className="text-[11px] text-text-secondary">
                            {dasha.startYear} - {dasha.endYear}
                          </span>
                          <span className="text-[9px] text-text-muted">
                            ({dasha.durationYears}y {dasha.durationMonths}m)
                          </span>
                        </div>
                        {detailedView && (
                          <p className="text-[11px] mt-0.5 text-text-muted">{getPlanetTheme(dasha.planet)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollReveal>
        )}

        {/* PRESENT Dasha */}
        {currentDashaEntry && (
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5 text-accent font-[family-name:var(--font-serif)]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              Present
            </h3>
            <div className="relative pl-12">
              <div className="absolute left-3 top-1 h-3.5 w-3.5 rounded-full animate-pulse border-2 border-accent bg-accent" />
              <div className="rounded-lg p-3 shadow-lg border-2 border-accent/40 bg-accent/[0.03]" style={{ boxShadow: '0 8px 24px rgba(226,179,64,0.08)' }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Planet3DInline planet={currentDashaEntry.planet} size={32} />
                  <span className="text-sm font-bold text-accent">
                    {currentDashaEntry.planet} Mahadasha
                  </span>
                  <Badge variant="default">Active</Badge>
                  <span className="text-[11px] text-text-secondary">
                    {currentDashaEntry.startYear} - {currentDashaEntry.endYear}
                  </span>
                </div>
                <p className="text-[11px] mt-0.5 text-text-muted">{getPlanetTheme(currentDashaEntry.planet)}</p>
                {currentDashaEntry.antardashas.length > 0 && detailedView && (
                  <div className="mt-2.5 pt-2.5 border-t border-accent/12">
                    <p className="text-[10px] font-semibold mb-1.5 text-text-muted">Antardasha Periods:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {currentDashaEntry.antardashas.map((ad, i) => {
                        const adNature = DASHA_NATURE[ad.planet] ?? DASHA_NATURE.Mercury;
                        const isCurrentAD = data.currentDasha.antardasha.planet === ad.planet;
                        return (
                          <div key={i} className={`rounded-md border p-1.5 text-[11px] ${isCurrentAD ? 'border-accent/30 bg-accent/[0.08]' : adNature.bgClass}`}>
                            <span className={`inline-flex items-center gap-1 font-semibold ${isCurrentAD ? 'text-accent' : adNature.colorClass}`}>
                              <PlanetOrb2D planet={ad.planet} size={12} pulse={false} />
                              {ad.planet}
                            </span>
                            <span className="ml-1 text-text-muted">
                              {formatDateShort(ad.startDate)} - {formatDateShort(ad.endDate)}
                            </span>
                            {isCurrentAD && <Badge variant="default" className="ml-1 text-[7px] py-0">NOW</Badge>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* FUTURE Dashas */}
        {futureDashas.length > 0 && (
          <ScrollReveal>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider mb-2.5 text-text-muted font-[family-name:var(--font-serif)]">
                Future (Next 10-20 Years)
              </h3>
              <div className="relative space-y-0">
                <div className="absolute left-5 top-0 bottom-0 w-0.5 border-dashed border-white/[0.05]" />
                {futureDashas.map((dasha) => {
                  const nature = DASHA_NATURE[dasha.planet] ?? DASHA_NATURE.Mercury;
                  return (
                    <div key={`future-${dasha.planet}-${dasha.startYear}`} className="relative pl-12 pb-3">
                      <div className={`absolute left-3 top-1 h-3.5 w-3.5 rounded-full border-2 border-dashed ${nature.bgClass}`} />
                      <div className={`rounded-lg border p-2.5 ${nature.bgClass}`}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-text">
                            <PlanetOrb2D planet={dasha.planet} size={16} />
                            {dasha.planet} Mahadasha
                          </span>
                          <span className="text-[11px] text-text-secondary">
                            {dasha.startYear} - {dasha.endYear}
                          </span>
                          <span className="text-[9px] text-text-muted">
                            ({dasha.durationYears}y {dasha.durationMonths}m)
                          </span>
                        </div>
                        <p className="text-[11px] mt-0.5 text-text-muted">
                          <strong className="text-text/80">{dasha.startYear}-{dasha.endYear}:</strong> {getPlanetTheme(dasha.planet)}
                        </p>
                        {detailedView && dasha.antardashas.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {dasha.antardashas.slice(0, 6).map((ad, i) => (
                              <span key={i} className="text-[9px] rounded px-1.5 py-0.5 bg-black/30 text-text-muted">
                                {PLANET_ABBREVIATIONS[ad.planet]} {ad.startYear}-{ad.endYear}
                              </span>
                            ))}
                            {dasha.antardashas.length > 6 && <span className="text-[9px] text-text-secondary/30">+{dasha.antardashas.length - 6} more</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollReveal>
        )}
      </div>
    );
  };

  const renderStrengthTab = () => (
    <div className="space-y-4">
      {/* Shadbala Ranking */}
      {insights && insights.shadbalaRanking.length > 0 && (
        <FadeIn>
          <div className="rounded-xl border border-border p-3 bg-surface">
            <h3 className="text-sm font-bold text-text mb-0.5 font-[family-name:var(--font-serif)]">Shadbala (Six-fold Strength) Ranking</h3>
            <p className="text-[10px] mb-3 text-text-muted">Planets ranked from strongest to weakest.</p>
            <div className="space-y-2">
              {insights.shadbalaRanking.map((planet, i) => {
                const maxBar = 100;
                const barWidth = maxBar - (i * (maxBar / insights.shadbalaRanking.length));
                const dignity = insights.planetDignities[planet];
                return (
                  <div key={planet} className="flex items-center gap-2.5">
                    <span className="w-5 text-right text-[11px] font-bold text-text-muted">#{i + 1}</span>
                    <span className={`w-20 inline-flex items-center gap-1.5 text-xs font-semibold ${PLANET_COLORS[planet] ?? 'text-text'}`}>
                      <PlanetOrb2D planet={planet} size={14} />
                      {planet}
                    </span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden bg-surface-2/40">
                      <div
                        className={`h-full rounded-full transition-all ${i < 3 ? 'bg-success/70' : i < 6 ? 'bg-primary/50' : 'bg-danger/40'}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    {dignity && detailedView && (
                      <div className="flex items-center gap-1 shrink-0">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dignityDotColor(dignity.status)}`} />
                        <span className="text-[9px] text-text-secondary">{dignity.status}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </FadeIn>
      )}

      {/* Ashtakavarga */}
      {insights && Object.keys(insights.ashtakavargaStrengths).length > 0 && (
        <ScrollReveal>
          <div className="rounded-xl border border-border p-3 bg-surface">
            <h3 className="text-sm font-bold text-text mb-0.5 font-[family-name:var(--font-serif)]">Ashtakavarga (Sign Strength)</h3>
            <p className="text-[10px] mb-3 text-text-muted">Benefic points accumulated in each sign.</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              {Object.entries(insights.ashtakavargaStrengths).map(([sign, strength]) => (
                <div key={sign} className="rounded-lg border p-1.5 text-center" style={{
                  borderColor: strength === 'Strong' ? 'rgba(52,211,153,0.2)' : strength === 'Weak' ? 'rgba(239,68,68,0.2)' : 'var(--border)',
                  backgroundColor: strength === 'Strong' ? 'rgba(52,211,153,0.03)' : strength === 'Weak' ? 'rgba(239,68,68,0.03)' : 'rgba(0,0,0,0.02)',
                }}>
                  <div className="text-[11px] font-semibold text-text">{sign}</div>
                  <div className="text-[9px] mt-0.5" style={{
                    color: strength === 'Strong' ? '#34d399' : strength === 'Weak' ? '#ef4444' : 'var(--text-secondary)',
                  }}>{strength}</div>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>
      )}

      {/* Weak planets */}
      {insights && insights.planetRemediesNeeded.length > 0 && (
        <ScrollReveal>
          <div className="rounded-xl border border-primary/20 p-3 bg-surface">
            <h3 className="text-sm font-bold text-text mb-2.5 font-[family-name:var(--font-serif)]">Planets Needing Strengthening</h3>
            <div className="flex flex-wrap gap-1.5">
              {insights.planetRemediesNeeded.map((planet) => (
                <div key={planet} className={`rounded-lg border p-1.5 px-2.5 ${PLANET_BG[planet] ?? 'bg-surface border-border'}`}>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${PLANET_COLORS[planet] ?? 'text-text'}`}>
                    <PlanetOrb2D planet={planet} size={14} />
                    {planet}
                  </span>
                  {insights.planetDignities[planet] && (
                    <span className="text-[11px] ml-1 text-text-muted">({insights.planetDignities[planet].status})</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>
      )}
    </div>
  );

  const renderCareerTab = () => (
    <div className="space-y-4">
      {insights ? (
        <>
          <FadeIn>
            <div className="rounded-xl border border-border p-3 bg-surface">
              <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">Career Indicators</h3>
              <div className="space-y-2.5">
                <div>
                  <p className="text-[10px] mb-1.5 text-text-muted">Suitable Professions</p>
                  <div className="flex flex-wrap gap-1">
                    {insights.careerIndicators.professions.map((p) => (
                      <span key={p} className="rounded-full border border-primary/30 px-2 py-0.5 text-[10px] font-medium text-primary">{p}</span>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg p-2.5 bg-accent/[0.03] border border-accent/10">
                  <p className="text-[11px] font-semibold mb-0.5 text-accent">Business vs. Service</p>
                  <p className="text-[11px] text-text-secondary">{insights.careerIndicators.businessVsService}</p>
                </div>
                <div>
                  <p className="text-[10px] mb-0.5 text-text-muted">Peak Career Period</p>
                  <p className="text-[11px] text-text-secondary">{insights.careerIndicators.peakPeriods}</p>
                </div>
              </div>
            </div>
          </FadeIn>

          {insights.houseAnalysis[10] && (
            <ScrollReveal>
              <div className="rounded-xl border border-border p-3 bg-surface">
                <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">10th House (Karma Bhava)</h3>
                <div className="text-xs space-y-0.5 text-text-secondary">
                  <p>Sign: <strong className="text-text">{insights.houseAnalysis[10].sign}</strong></p>
                  <p>Lord: <strong className="text-text">{insights.houseAnalysis[10].lord}</strong> (in House {insights.houseAnalysis[10].lordHouse})</p>
                  {insights.houseAnalysis[10].planets.length > 0 && (
                    <p>Planets: <strong className="text-text">{insights.houseAnalysis[10].planets.join(', ')}</strong></p>
                  )}
                </div>
              </div>
            </ScrollReveal>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-border p-4 bg-surface">
          {insightsLoading ? <Loading section="career" /> : <p className="text-xs text-text-secondary">Career insights unavailable.</p>}
        </div>
      )}

      {(() => {
        const careerPred = data.predictions.find((p) => p.type === 'career');
        if (!careerPred) return null;
        return (
          <ScrollReveal>
            <div className="rounded-xl border border-border p-3 bg-surface">
              <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">AI Career Analysis</h3>
              {careerPred.structured ? (
                <PredictionStructuredView structured={careerPred.structured} />
              ) : (
                <RichText asBullets>{careerPred.content.join('\n\n')}</RichText>
              )}
            </div>
          </ScrollReveal>
        );
      })()}

      {(() => {
        const wealthPred = data.predictions.find((p) => p.type === 'wealth');
        if (!wealthPred) return null;
        return (
          <ScrollReveal>
            <div className="rounded-xl border border-border p-3 bg-surface">
              <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">Wealth Analysis</h3>
              {wealthPred.structured ? (
                <PredictionStructuredView structured={wealthPred.structured} />
              ) : (
                <RichText asBullets>{wealthPred.content.join('\n\n')}</RichText>
              )}
            </div>
          </ScrollReveal>
        );
      })()}
    </div>
  );

  const renderRelationshipsTab = () => (
    <div className="space-y-4">
      {insights && (
        <FadeIn>
          <div className="rounded-xl border border-border p-3 bg-surface">
            <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">Marriage Indicators</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                { label: 'Partner Sign (7th House)', value: insights.marriageIndicators.partnerSign || 'N/A' },
                { label: '7th Lord', value: insights.marriageIndicators.sevenThLord || 'N/A' },
                { label: 'Marriage Timing', value: insights.marriageIndicators.timing || 'N/A' },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-border bg-surface-2/30 p-2.5">
                  <div className="text-[10px] text-text-muted">{label}</div>
                  <div className="text-xs font-bold text-text mt-0.5">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      )}

      {insights && insights.houseAnalysis[7] && detailedView && (
        <ScrollReveal>
          <div className="rounded-xl border border-border p-3 bg-surface">
            <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">7th House (Kalatra Bhava)</h3>
            <div className="text-xs space-y-0.5 text-text-secondary">
              <p>Sign: <strong className="text-text">{insights.houseAnalysis[7].sign}</strong></p>
              <p>Lord: <strong className="text-text">{insights.houseAnalysis[7].lord}</strong> (in House {insights.houseAnalysis[7].lordHouse})</p>
              {insights.houseAnalysis[7].planets.length > 0 && (
                <p>Planets: <strong className="text-text">{insights.houseAnalysis[7].planets.join(', ')}</strong></p>
              )}
              <p className="text-[11px] mt-1.5 text-text-muted">{insights.houseAnalysis[7].significance}</p>
            </div>
          </div>
        </ScrollReveal>
      )}

      {(() => {
        const marriagePred = data.predictions.find((p) => p.type === 'marriage');
        if (!marriagePred) return null;
        return (
          <ScrollReveal>
            <div className="rounded-xl border border-border p-3 bg-surface">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="text-sm font-bold text-text font-[family-name:var(--font-serif)]">
                  AI Marriage & Relationship Analysis
                </h3>
                {!user?.marital_status && (
                  <ToggleSwitch
                    checked={marriageRevealed}
                    onChange={setMarriageRevealed}
                    label="I am not married — show predictions"
                  />
                )}
              </div>
              <div className="border-b border-border my-2.5" />
              {!marriageRevealed ? (
                <div className="py-4 text-center space-y-1.5">
                  <div className="text-2xl">🔒</div>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Marriage predictions are hidden by default.
                  </p>
                  <p className="text-[11px] text-text-muted leading-relaxed">
                    Toggle the switch above if you&apos;re currently single and would like a forecast on timing,
                    partner traits, and compatibility windows.
                  </p>
                </div>
              ) : marriagePred.structured ? (
                <MarriagePanel structured={marriagePred.structured} gender={data.profile.gender} />
              ) : (
                marriagePred.content.map((para, idx) => (
                  <p key={idx} className="text-xs leading-relaxed mb-1.5 text-text-secondary">{para}</p>
                ))
              )}
            </div>
          </ScrollReveal>
        );
      })()}
    </div>
  );

  const renderHealthTab = () => (
    <div className="space-y-4">
      {insights ? (
        <>
          <FadeIn>
            <div className="rounded-xl border border-border p-3 bg-surface">
              <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">Health Constitution</h3>
              <div className="space-y-2.5">
                <div className="rounded-lg p-2.5 bg-accent/[0.03] border border-accent/10">
                  <p className="text-xs font-semibold text-text">{insights.healthIndicators.constitution}</p>
                </div>
                {insights.healthIndicators.vulnerableSystems.length > 0 && (
                  <div>
                    <p className="text-[10px] mb-1.5 text-text-muted">Vulnerable Areas</p>
                    <div className="flex flex-wrap gap-1">
                      {insights.healthIndicators.vulnerableSystems.map((sys) => (
                        <Badge key={sys} variant="warning">{sys}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {detailedView && (
                  <div>
                    <p className="text-[10px] mb-0.5 text-text-muted">Dietary Recommendation</p>
                    <p className="text-[11px] text-text-secondary">{insights.healthIndicators.dietaryElement}</p>
                  </div>
                )}
              </div>
            </div>
          </FadeIn>

          {insights.houseAnalysis[6] && detailedView && (
            <ScrollReveal>
              <div className="rounded-xl border border-border p-3 bg-surface">
                <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">6th House (Roga Bhava)</h3>
                <div className="text-xs space-y-0.5 text-text-secondary">
                  <p>Sign: <strong className="text-text">{insights.houseAnalysis[6].sign}</strong></p>
                  <p>Lord: <strong className="text-text">{insights.houseAnalysis[6].lord}</strong> (in House {insights.houseAnalysis[6].lordHouse})</p>
                  {insights.houseAnalysis[6].planets.length > 0 && (
                    <p>Planets: <strong className="text-text">{insights.houseAnalysis[6].planets.join(', ')}</strong></p>
                  )}
                </div>
              </div>
            </ScrollReveal>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-border p-4 bg-surface">
          {insightsLoading ? <Loading section="health" /> : <p className="text-xs text-text-secondary">Health insights unavailable.</p>}
        </div>
      )}

      {data.predictions.find((p) => p.type === 'health') && (
        <ScrollReveal>
          <div className="rounded-xl border border-border p-3 bg-surface">
            <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">AI Health Analysis</h3>
            <RichText asBullets>{data.predictions.find((p) => p.type === 'health')!.content.join('\n\n')}</RichText>
          </div>
        </ScrollReveal>
      )}
    </div>
  );

  const renderRemediesTab = () => (
    <div className="space-y-4">
      {/* AI remedies */}
      {data.remedies.length > 0 && (
        <FadeIn>
          <div className="rounded-xl border border-border p-3 bg-surface">
            <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">Personalized Remedies</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {data.remedies.map((r, idx) => (
                <div key={idx} className="rounded-lg border border-border bg-surface-2/30 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-base">{r.icon}</span>
                    <span className="text-xs font-semibold text-text">{r.title}</span>
                  </div>
                  <p className="text-[11px] mb-1.5 text-text-secondary">{r.description}</p>
                  {r.details.length > 0 && (
                    <ul className="text-[11px] space-y-0.5 text-text-muted">
                      {r.details.map((d, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-accent mt-0.5">-</span> {d}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      )}

      {/* Ground truth remedies */}
      {insights && detailedView && (
        <>
          {/* Mantras */}
          <ScrollReveal>
            <div className="rounded-xl border border-border p-3 bg-surface">
              <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">Mantras</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1.5 px-2 text-text-muted">Planet</th>
                      <th className="text-left py-1.5 px-2 text-text-muted">Mantra</th>
                      <th className="text-left py-1.5 px-2 text-text-muted">Deity</th>
                      <th className="text-left py-1.5 px-2 text-text-muted">Count</th>
                      <th className="text-left py-1.5 px-2 text-text-muted">Day</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insights.remedies.mantras
                      .filter((m) => insights.planetRemediesNeeded.includes(m.planet) || insights.planetRemediesNeeded.length === 0)
                      .slice(0, insights.planetRemediesNeeded.length > 0 ? undefined : 5)
                      .map((m) => (
                        <tr key={m.planet} className="border-b border-border">
                          <td className={`py-1.5 px-2 font-semibold ${PLANET_COLORS[m.planet] ?? 'text-text'}`}>{m.planet}</td>
                          <td className="py-1.5 px-2 font-mono text-[9px] text-text-secondary max-w-[200px]">{m.mantra}</td>
                          <td className="py-1.5 px-2 text-text-secondary">{m.deity}</td>
                          <td className="py-1.5 px-2 text-text-secondary">{m.count}</td>
                          <td className="py-1.5 px-2 text-text-secondary">{m.day}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </ScrollReveal>

          {/* Gemstones */}
          <ScrollReveal>
            <div className="rounded-xl border border-border p-3 bg-surface">
              <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">Gemstones</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {insights.remedies.gemstones
                  .filter((g) => insights.planetRemediesNeeded.includes(g.planet) || g.planet === insights.ascendantTraits.rulingPlanet)
                  .map((g) => (
                    <div key={g.planet} className={`rounded-lg border p-2.5 ${PLANET_BG[g.planet] ?? 'bg-surface border-border'}`}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`font-semibold text-xs ${PLANET_COLORS[g.planet] ?? 'text-text'}`}>{g.stone}</span>
                      </div>
                      <div className="text-[11px] space-y-0.5 text-text-secondary">
                        <div>Planet: {g.planet}</div>
                        <div>Finger: {g.finger}</div>
                        <div>Metal: {g.metal}</div>
                        <div>Day to wear: {g.day}</div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </ScrollReveal>

          {/* Fasting & Charity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <ScrollReveal>
              <div className="rounded-xl border border-border p-3 bg-surface">
                <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">Fasting</h3>
                <div className="space-y-1.5">
                  {insights.remedies.fasting
                    .filter((f) => insights.planetRemediesNeeded.includes(f.planet))
                    .map((f) => (
                      <div key={f.planet} className="flex items-center gap-1.5 text-xs">
                        <span className={`font-semibold ${PLANET_COLORS[f.planet] ?? 'text-text'}`}>{f.planet}</span>
                        <span className="text-text-secondary">- Fast on {f.day}</span>
                      </div>
                    ))}
                  {insights.planetRemediesNeeded.length === 0 && <p className="text-[11px] text-text-secondary">No specific fasting needed.</p>}
                </div>
              </div>
            </ScrollReveal>
            <ScrollReveal>
              <div className="rounded-xl border border-border p-3 bg-surface">
                <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">Charity</h3>
                <div className="space-y-1.5">
                  {insights.remedies.charity
                    .filter((c) => insights.planetRemediesNeeded.includes(c.planet))
                    .map((c) => (
                      <div key={c.planet} className="text-[11px] text-text-secondary">
                        <span className={`font-semibold ${PLANET_COLORS[c.planet] ?? 'text-text'}`}>{c.planet}</span>: Donate {c.item} to {c.toWhom} on {c.day}
                      </div>
                    ))}
                  {insights.planetRemediesNeeded.length === 0 && <p className="text-[11px] text-text-secondary">No specific charity recommendations.</p>}
                </div>
              </div>
            </ScrollReveal>
          </div>

          {/* Planet Reference Table */}
          <ScrollReveal>
            <div className="rounded-xl border border-border p-3 bg-surface">
              <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">Planet Reference Table</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[9px]">
                  <thead>
                    <tr className="border-b border-border">
                      {['Planet', 'Color', 'No.', 'Day', 'Direction', 'Metal', 'Grain'].map((h) => (
                        <th key={h} className="text-left py-1 px-1.5 text-text-muted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(insights.planetFullData).map(([planet, d]) => (
                      <tr key={planet} className="border-b border-border">
                        <td className={`py-1 px-1.5 font-semibold ${PLANET_COLORS[planet] ?? 'text-text'}`}>{planet}</td>
                        <td className="py-1 px-1.5 text-text-secondary">{d.color}</td>
                        <td className="py-1 px-1.5 text-text-secondary">{d.number}</td>
                        <td className="py-1 px-1.5 text-text-secondary">{d.day}</td>
                        <td className="py-1 px-1.5 text-text-secondary">{d.direction}</td>
                        <td className="py-1 px-1.5 text-text-secondary">{d.metal}</td>
                        <td className="py-1 px-1.5 text-text-secondary">{d.grain}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </ScrollReveal>
        </>
      )}

      {/* Lal Kitab */}
      {data.lalkitab.totke.length > 0 && (
        <ScrollReveal>
          <div className="rounded-xl border border-border p-3 bg-surface">
            <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">Lal Kitab Totke (Remedies)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {data.lalkitab.totke.map((t, i) => (
                <div key={i} className="rounded-lg border border-border bg-surface-2/30 p-2.5">
                  <div className="flex gap-1.5 mb-1.5">
                    <Badge variant="accent">H{t.house}</Badge>
                    <span className={`text-xs font-semibold ${PLANET_COLORS[t.planet] ?? 'text-text'}`}>{t.planet}</span>
                  </div>
                  {t.totke.map((tk, j) => (
                    <p key={j} className="text-[11px] mb-0.5 text-text-secondary">- {tk}</p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>
      )}
    </div>
  );

  // ---- Divisional Charts (Vargas) Tab ----

  const VARGA_INFO: Record<DivisionalChart, { name: string; purpose: string; group: 'primary' | 'standard' | 'advanced' }> = {
    D1:   { name: 'Rashi / Lagna', purpose: 'General well-being, physical body, overall life', group: 'primary' },
    D2:   { name: 'Hora', purpose: 'Wealth and prosperity', group: 'standard' },
    D3:   { name: 'Drekkana', purpose: 'Siblings, courage, initiative', group: 'standard' },
    D4:   { name: 'Chaturthamsa', purpose: 'Fortune, fixed assets, residence', group: 'standard' },
    D5:   { name: 'Panchamsa', purpose: 'Awards, recognitions, fame', group: 'standard' },
    D6:   { name: 'Shashtamsa', purpose: 'Health, litigation, obstacles', group: 'standard' },
    D7:   { name: 'Saptamamsa', purpose: 'Children, progeny', group: 'standard' },
    D8:   { name: 'Ashtamsa', purpose: 'Sudden unexpected events, troubles', group: 'standard' },
    D9:   { name: 'Navamsa', purpose: 'Marriage, spouse, dharma, overall planetary strength', group: 'primary' },
    D10:  { name: 'Dasamamsa', purpose: 'Profession, career, fame', group: 'primary' },
    D11:  { name: 'Rudramsa', purpose: 'Death, destruction, sudden changes', group: 'standard' },
    D12:  { name: 'Dwadasamsa', purpose: 'Parents, grandparents, lineage', group: 'standard' },
    D14:  { name: 'Chaturdamsa', purpose: 'Death of family members, deeper karmic analysis', group: 'standard' },
    D16:  { name: 'Shodasamsa', purpose: 'Vehicles, pleasures, comforts', group: 'standard' },
    D20:  { name: 'Vimshamsha', purpose: 'Spiritual pursuits, worship, religion', group: 'standard' },
    D21:  { name: 'Ekavimsamsa', purpose: 'Extended spiritual analysis', group: 'standard' },
    D24:  { name: 'Siddhamsa', purpose: 'Education, learning, knowledge', group: 'standard' },
    D27:  { name: 'Nakshatramsa', purpose: 'Physical strength, weaknesses, stamina', group: 'standard' },
    D30:  { name: 'Trimsamsa', purpose: 'Misfortunes, obstacles, sins, diseases', group: 'standard' },
    D40:  { name: 'Khavedamsa', purpose: 'Auspicious/inauspicious effects, paternal heritage', group: 'standard' },
    D45:  { name: 'Akshavedamsa', purpose: 'General well-being, character, noble deeds', group: 'standard' },
    D60:  { name: 'Shastyamsa', purpose: 'Past life karma, deep analysis', group: 'standard' },
    D81:  { name: 'Navanavamsa', purpose: 'Hidden fortune analysis', group: 'advanced' },
    D108: { name: 'Ashtottaramsa', purpose: 'Final fate of life', group: 'advanced' },
  };

  const ALL_VARGAS: DivisionalChart[] = [
    'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10',
    'D11', 'D12', 'D14', 'D16', 'D20', 'D21', 'D24', 'D27', 'D30',
    'D40', 'D45', 'D60', 'D81', 'D108',
  ];

  const renderVargasTab = () => {
    const divCharts = data.divisionalCharts;
    const info = VARGA_INFO[selectedVarga];
    const chartEntries = divCharts?.[selectedVarga] ?? null;

    const d1Entries = divCharts?.['D1'] ?? null;
    const d1SignMap: Record<string, number> = {};
    if (d1Entries) {
      for (const e of d1Entries) {
        d1SignMap[e.planet] = e.signIndex;
      }
    }

    return (
      <div className="space-y-3">
        {/* Link to dedicated vargas analysis page */}
        <FadeIn>
          <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2">
            <p className="text-[12px] text-text-secondary">Generate Yogi Baba&#39;s interpretation of each chart</p>
            <a href="/vargas" className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors no-underline whitespace-nowrap ml-3">
              Open Full Analysis →
            </a>
          </div>
        </FadeIn>

        {/* Varga selector */}
        <FadeIn>
          <div className="rounded-xl border border-border p-3 bg-surface">
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5 text-text-muted">Primary Charts</p>
            <div className="flex gap-1.5 mb-2.5">
              {ALL_VARGAS.filter((v) => VARGA_INFO[v].group === 'primary').map((v) => (
                <button
                  key={v}
                  onClick={() => setSelectedVarga(v)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                    selectedVarga === v
                      ? 'bg-primary text-white'
                      : 'bg-surface-2/40 text-text-secondary'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5 text-text-muted">Standard 16 Charts</p>
            <div className="flex gap-1.5 flex-wrap mb-2.5">
              {ALL_VARGAS.filter((v) => VARGA_INFO[v].group === 'standard').map((v) => (
                <button
                  key={v}
                  onClick={() => setSelectedVarga(v)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                    selectedVarga === v
                      ? 'bg-primary text-white'
                      : 'bg-surface-2/40 text-text-secondary'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5 text-text-muted">Advanced Charts</p>
            <div className="flex gap-1.5">
              {ALL_VARGAS.filter((v) => VARGA_INFO[v].group === 'advanced').map((v) => (
                <button
                  key={v}
                  onClick={() => setSelectedVarga(v)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                    selectedVarga === v
                      ? 'bg-primary text-white'
                      : 'bg-surface-2/40 text-text-secondary'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </FadeIn>

        {/* Selected chart */}
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedVarga}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl border border-border p-3 bg-surface"
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="rounded-full px-2 py-0.5 text-xs font-bold bg-primary/15 text-primary border border-primary/20">{selectedVarga}</span>
              <h3 className="text-sm font-bold text-text font-[family-name:var(--font-serif)]">{info.name}</h3>
            </div>
            <p className="text-xs italic mb-2.5 text-text-secondary">{info.purpose}</p>
            {chartEntries ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-1.5 px-2 text-left font-medium text-text-muted">Planet</th>
                      <th className="py-1.5 px-2 text-left font-medium text-text-muted">Sign</th>
                      <th className="py-1.5 px-2 text-left font-medium text-text-muted">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartEntries.map((entry) => {
                      const isVargottama = selectedVarga !== 'D1' && d1SignMap[entry.planet] === entry.signIndex;
                      return (
                        <tr key={entry.planet} className="border-b border-border">
                          <td className={`py-1.5 px-2 font-medium ${PLANET_COLORS[entry.planet] ?? 'text-text'}`}>
                            {entry.planet}
                          </td>
                          <td className="py-1.5 px-2 text-text">{entry.sign}</td>
                          <td className="py-1.5 px-2">
                            {isVargottama && (
                              <span className="rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-accent/15 text-accent border border-accent/20">Vargottama</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-6 text-text-secondary">
                <p className="text-xs">This chart requires advanced calculation.</p>
                <p className="text-[11px] mt-0.5 text-text-muted">Generate from the insights API to view {selectedVarga} data.</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Vargottama summary */}
        {selectedVarga !== 'D1' && chartEntries && (
          <ScrollReveal>
            <div className="rounded-xl border border-border p-3 bg-surface">
              <h3 className="text-xs font-bold text-text mb-1.5 font-[family-name:var(--font-serif)]">Vargottama Planets in {selectedVarga}</h3>
              {(() => {
                const vargottamaPlanets = chartEntries.filter(
                  (e) => d1SignMap[e.planet] === e.signIndex
                );
                if (vargottamaPlanets.length === 0) {
                  return <p className="text-[11px] text-text-secondary">No planets are Vargottama in this chart.</p>;
                }
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {vargottamaPlanets.map((e) => (
                      <span key={e.planet} className="rounded-full px-1.5 py-0.5 text-[11px] font-medium bg-accent/15 text-accent border border-accent/20">
                        {e.planet} in {e.sign}
                      </span>
                    ))}
                    <p className="w-full text-[11px] mt-1.5 text-text-secondary">
                      Vargottama planets (same sign in D1 and {selectedVarga}) are considered very strong and auspicious.
                    </p>
                  </div>
                );
              })()}
            </div>
          </ScrollReveal>
        )}
      </div>
    );
  };

  // ============================================================
  // Predictions Tab - REDESIGNED with sub-tabs
  // ============================================================

  const renderPredictionsTab = () => {
    const currentMDPlanet = data.currentDasha.mahadasha.planet;
    const currentADPlanet = data.currentDasha.antardasha.planet;
    const mdHouse = data.chartData.planets.find((p) => p.planet === currentMDPlanet)?.house ?? '?';
    const adHouse = data.chartData.planets.find((p) => p.planet === currentADPlanet)?.house ?? '?';
    const currentPred = predCache[predPeriod] ?? null;

    return (
      <div className="space-y-4">
        {/* Dasha Context Banner */}
        <FadeIn>
          <div className="rounded-xl p-3 bg-accent/[0.04] border border-accent/15">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent">Dasha Context</span>
            </div>
            <p className="text-xs text-text font-medium">
              Current: {currentMDPlanet} Mahadasha → {currentADPlanet} Antardasha
              <span className="font-normal ml-1.5 text-text-secondary">| Houses {mdHouse} & {adHouse} activated</span>
            </p>
          </div>
        </FadeIn>

        {/* Period Sub-tabs */}
        <div className="flex rounded-full p-0.5 bg-surface-2/40 border border-border">
          {PREDICTION_PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPredPeriod(p.id)}
              className="flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all relative"
              style={{ color: predPeriod === p.id ? 'var(--bg)' : 'var(--text-secondary)' }}
            >
              {predPeriod === p.id && (
                <motion.div
                  layoutId="pred-period-indicator"
                  className="absolute inset-0 rounded-full bg-accent"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">{p.label}</span>
            </button>
          ))}
        </div>

        {/* Personalized Prediction Content */}
        {predLoading && (
          <div className="rounded-xl border border-border p-6 flex items-center justify-center bg-surface">
            <WisdomLoader section="dasha" />
          </div>
        )}

        {predError && !predLoading && (
          <div className="rounded-xl border border-red-500/20 p-3 text-center bg-surface">
            <p className="text-xs text-red-400 mb-1.5">{predError}</p>
            <Button size="sm" onClick={() => { setPredCache((prev) => { const n = {...prev}; delete n[predPeriod]; return n; }); fetchPersonalizedPrediction(predPeriod); }}>
              Retry
            </Button>
          </div>
        )}

        {currentPred && !predLoading && (
          <>
            {/* Life Area Prediction Cards */}
            <StaggerList className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {Object.entries(PREDICTION_AREA_META).map(([key, meta]) => {
                const text = currentPred.prediction[key as keyof typeof currentPred.prediction];
                if (!text) return null;
                return (
                  <StaggerItem key={key}>
                    <div className="rounded-xl border border-border p-3 bg-surface">
                      <div className="flex items-center gap-1.5 mb-1.5 pb-1.5 border-b border-border">
                        <span className="text-sm">{meta.icon}</span>
                        <h4 className="text-xs font-bold text-text">{meta.label}</h4>
                      </div>
                      <p className="text-xs leading-relaxed text-text-secondary">{text}</p>
                    </div>
                  </StaggerItem>
                );
              })}
            </StaggerList>

            {/* Lucky Factors Row */}
            <div className="rounded-xl border border-accent/12 p-3 bg-surface">
              <h4 className="text-xs font-bold text-text mb-2.5 pb-1.5 border-b border-border">Lucky Factors</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {currentPred.prediction.lucky_time && (
                  <div className="rounded-lg border border-border bg-surface-2/30 p-2.5">
                    <div className="text-[10px] text-text-muted">Lucky Time</div>
                    <div className="text-[11px] font-semibold mt-0.5 text-accent">{currentPred.prediction.lucky_time}</div>
                  </div>
                )}
                {currentPred.prediction.lucky_color && (
                  <div className="rounded-lg border border-border bg-surface-2/30 p-2.5">
                    <div className="text-[10px] text-text-muted">Lucky Color</div>
                    <div className="text-[11px] font-semibold mt-0.5 text-accent">{currentPred.prediction.lucky_color}</div>
                  </div>
                )}
                {currentPred.activated_houses && (
                  <div className="rounded-lg border border-border bg-surface-2/30 p-2.5">
                    <div className="text-[10px] text-text-muted">Active Houses</div>
                    <div className="text-[11px] font-semibold mt-0.5 text-accent">{currentPred.activated_houses}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Avoid / Remedy */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {currentPred.prediction.avoid && (
                <div className="rounded-xl border border-red-500/15 p-3 bg-surface">
                  <h4 className="text-xs font-bold mb-1.5 pb-1.5 text-danger border-b border-danger/10">Caution</h4>
                  <p className="text-xs leading-relaxed text-text-secondary">{currentPred.prediction.avoid}</p>
                </div>
              )}
              {currentPred.prediction.remedy && (
                <div className="rounded-xl border border-success/15 p-3 bg-surface">
                  <h4 className="text-xs font-bold mb-1.5 pb-1.5 text-success border-b border-success/10">Remedy</h4>
                  <p className="text-xs leading-relaxed text-text-secondary">{currentPred.prediction.remedy}</p>
                </div>
              )}
            </div>
          </>
        )}

        <SectionDivider />

        {/* AI predictions */}
        <h3 className="text-sm font-bold text-text pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">Detailed Life Area Analysis</h3>
        <StaggerList className="space-y-3">
          {data.predictions.map((section) => {
            const border = 'border-border';
            const grad   = 'from-primary/10 to-primary/0';
            const iconBg = 'bg-primary/10 text-primary';
            return (
              <StaggerItem key={section.type}>
                <div className={`rounded-xl border bg-surface overflow-hidden ${border}`}>
                  {/* Gradient header band */}
                  <div className={`bg-gradient-to-r ${grad} px-3 pt-3 pb-2.5`}>
                    <div className="flex items-center gap-2.5">
                      <span className={`text-lg w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
                        {section.icon}
                      </span>
                      <div>
                        <h3 className="text-sm font-bold text-text font-[family-name:var(--font-serif)] leading-tight">
                          {section.title}
                        </h3>
                        <p className="text-[10px] text-text-muted tracking-wide uppercase mt-0.5">
                          Vedic Analysis
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="px-3 py-3">
                    {section.structured ? (
                      <PredictionStructuredView structured={section.structured} />
                    ) : (
                      <RichText asBullets>{section.content.join('\n\n')}</RichText>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center gap-1.5 px-3 py-2 border-t border-border">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleReadAloud(section.type, section.content.join('. '))}
                    >
                      {speakingSection === section.type ? '⏹ Stop' : '▶ Read Aloud'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openAskModal(section)}
                      className="text-primary"
                    >
                      🔮 Ask
                    </Button>
                    <div className="ml-auto flex items-center gap-1">
                      <span className="text-[11px] mr-0.5 text-text-secondary">Accurate?</span>
                      <Button
                        variant={feedbacks[section.type] === 'up' ? 'outline' : 'ghost'}
                        size="sm"
                        onClick={() => handleFeedback(section.type, 'up')}
                        className={feedbacks[section.type] === 'up' ? 'border-success/50 text-success' : ''}
                      >
                        👍
                      </Button>
                      <Button
                        variant={feedbacks[section.type] === 'down' ? 'outline' : 'ghost'}
                        size="sm"
                        onClick={() => handleFeedback(section.type, 'down')}
                        className={feedbacks[section.type] === 'down' ? 'border-error/50 text-error' : ''}
                      >
                        👎
                      </Button>
                    </div>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerList>
      </div>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview': return renderOverviewTab();
      case 'planets': return renderPlanetsTab();
      case 'houses': return renderHousesTab();
      case 'yogas': return renderYogasTab();
      case 'dasha': return renderDashaTimeline();
      case 'strength': return renderStrengthTab();
      case 'career': return renderCareerTab();
      case 'relationships': return renderRelationshipsTab();
      case 'health': return renderHealthTab();
      case 'remedies': return renderRemediesTab();
      case 'vargas': return renderVargasTab();
      case 'predictions': return renderPredictionsTab();
      default: return renderOverviewTab();
    }
  };

  // ============================================================
  // Main Render
  // ============================================================

  return (
    <MotionPage className="min-h-screen pb-20 bg-bg">
      {/* Floating chat button */}
      <KundliChatButton chartId={kundliId} />

      {/* ---- Hero Header (Redesigned 2-column) ---- */}
      <div className="border-b border-border bg-surface/50">
        <div className="max-w-4xl mx-auto px-3 pt-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-start">
            {/* Left: Name + Details */}
            <FadeIn>
              <div>
                <div className="flex items-start justify-between gap-2.5">
                  <div>
                    <h1 className="text-xl font-extrabold text-text tracking-tight font-[family-name:var(--font-serif)]">{data.profile.name}</h1>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-secondary">
                      <span>{data.profile.dob}</span>
                      <span>{data.profile.tob}</span>
                      <span>{data.profile.pob}</span>
                      {data.profile.gender && <span className="capitalize">{data.profile.gender}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                  </div>
                </div>

                {/* Astro badges - small outlined pills */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {[
                    { label: 'ASC', value: data.lagna },
                    { label: 'Moon', value: data.rashi },
                    { label: 'Sun', value: data.sunSign },
                    { label: 'Nak', value: `${data.nakshatra} P${data.nakshatraPada}` },
                  ].map(({ label, value }) => (
                    <span key={label} className="rounded-full border border-primary/25 px-2 py-0.5 text-[11px] text-primary">
                      <span className="text-primary/60 mr-0.5 text-[9px]">{label}</span>
                      <span className="font-semibold text-text">{value}</span>
                    </span>
                  ))}
                </div>
              </div>
            </FadeIn>

            {/* Right: Current Dasha card */}
            <FadeIn delay={0.1}>
              <div className="rounded-xl p-3 min-w-[220px] bg-accent/[0.04] border border-accent/20">
                <div className="text-[9px] font-bold uppercase tracking-wider mb-1.5 text-accent/70">Current Dasha</div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-text-secondary">Mahadasha</span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-text">
                      <Planet3DInline planet={data.currentDasha.mahadasha.planet} size={22} />
                      {data.currentDasha.mahadasha.planet}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-text-secondary">Antardasha</span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-text">
                      <Planet3DInline planet={data.currentDasha.antardasha.planet} size={22} />
                      {data.currentDasha.antardasha.planet}
                    </span>
                  </div>
                  <div className="mt-1.5 pt-1.5 border-t border-accent/10">
                    <div className="text-[9px] text-text-muted">
                      {formatDateShort(data.currentDasha.mahadasha.startDate)} - {formatDateShort(data.currentDasha.mahadasha.endDate)}
                    </div>
                    <div className="mt-0.5 h-1 rounded-full overflow-hidden bg-surface-2">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${dashaProgress}%` }} />
                    </div>
                    <div className="text-[9px] mt-0.5 text-primary">{data.currentDasha.yearsRemaining.toFixed(1)}y remaining</div>
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>

          {/* Quick Stats Row — each card is clickable for details */}
          <FadeIn delay={0.15}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
              <button
                type="button"
                onClick={() => setOpenStat('yogas')}
                className="group rounded-lg border border-border bg-surface/60 p-2.5 text-center transition-colors hover:bg-surface hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <div className="text-lg font-bold text-accent">{yogaCount}</div>
                <div className="text-[10px] mt-0.5 text-text-secondary">Yogas</div>
                <div className="text-[8px] mt-0.5 text-text-muted group-hover:text-primary transition-colors">Tap to view →</div>
              </button>
              <button
                type="button"
                onClick={() => setOpenStat('doshas')}
                className="group rounded-lg border border-border bg-surface/60 p-2.5 text-center transition-colors hover:bg-surface hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <div className="text-lg font-bold" style={{ color: doshaCount > 0 ? '#ef4444' : '#34d399' }}>{doshaCount}</div>
                <div className="text-[10px] mt-0.5 text-text-secondary">Doshas</div>
                <div className="text-[8px] mt-0.5 text-text-muted group-hover:text-primary transition-colors">Tap to view →</div>
              </button>
              <button
                type="button"
                onClick={() => setOpenStat('strongest')}
                className="group rounded-lg border border-border bg-surface/60 p-2.5 text-center transition-colors hover:bg-surface hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <div className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-text">
                  {strongestPlanet ? (
                    <>
                      <PlanetOrb2D planet={strongestPlanet} size={14} />
                      {strongestPlanet}
                    </>
                  ) : (
                    '--'
                  )}
                </div>
                <div className="text-[10px] mt-0.5 text-text-secondary">Strongest</div>
                <div className="text-[8px] mt-0.5 text-text-muted group-hover:text-primary transition-colors">Tap to view →</div>
              </button>
              <button
                type="button"
                onClick={() => setOpenStat('weakest')}
                className="group rounded-lg border border-border bg-surface/60 p-2.5 text-center transition-colors hover:bg-surface hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <div className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-text">
                  {weakestPlanet ? (
                    <>
                      <PlanetOrb2D planet={weakestPlanet} size={14} />
                      {weakestPlanet}
                    </>
                  ) : (
                    '--'
                  )}
                </div>
                <div className="text-[10px] mt-0.5 text-text-secondary">Weakest</div>
                <div className="text-[8px] mt-0.5 text-text-muted group-hover:text-primary transition-colors">Tap to view →</div>
              </button>
            </div>
          </FadeIn>
        </div>
      </div>

      {/* ---- Prediction Generation Progress Banner ---- */}
      <AnimatePresence>
        {generatingPredictions && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="sticky top-0 z-30 px-3 py-2 bg-surface/95 backdrop-blur-md border-b border-border"
          >
            <div className="max-w-4xl mx-auto flex items-center gap-3">
              <span className="text-[11px] text-text-muted shrink-0">
                ✨ Generating predictions ({predsDone}/{predsTotal})
              </span>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-surface-2">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={{ width: `${((predsTotal > 0 ? (predsDone - 1) : 0) / (predsTotal || 1)) * 100}%` }}
                  animate={{ width: `${(predsDone / (predsTotal || 1)) * 100}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>
              <span className="text-[10px] text-text-muted shrink-0">
                {predsDone}/{predsTotal} done
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Toggle + Tab Navigation (sticky) ---- */}
      <div className="sticky top-0 z-20 backdrop-blur-md bg-bg/95 border-b border-border">
        <div className="max-w-4xl mx-auto px-3 py-1.5 flex items-center justify-between gap-3">
          {/* Toggle */}
          <div className="flex items-center gap-1.5">
            <span className={`text-[11px] font-medium ${detailedView ? 'text-primary' : 'text-text-muted'}`}>
              Detailed View
            </span>
            <button
              onClick={() => setDetailedView(!detailedView)}
              className="relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200"
              style={{ backgroundColor: detailedView ? 'var(--primary)' : 'var(--surface-2)' }}
              role="switch"
              aria-checked={detailedView}
            >
              <span
                className="inline-block h-4 w-4 rounded-full bg-white shadow-lg transition-transform duration-200"
                style={{ transform: detailedView ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
            <span className={`text-[11px] font-medium ${!detailedView ? 'text-primary' : 'text-text-muted'}`}>
              Interpretation Only
            </span>
          </div>
        </div>

        {/* Tab Navigation - scrollable, clean underline style */}
        <div className="max-w-4xl mx-auto px-2">
          <div
            ref={tabScrollRef}
            className="flex overflow-x-auto gap-0.5 pb-0 scrollbar-none glass-1 rounded-xl px-1"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {TAB_LIST.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="shrink-0 px-2.5 py-2 text-[11px] font-medium transition-all whitespace-nowrap relative"
                style={{ color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)' }}
              >
                <span className="mr-0.5 opacity-70">{tab.icon}</span>
                {tab.label}
                {/* Underline indicator */}
                {activeTab === tab.id && (
                  <motion.span
                    layoutId="tab-underline"
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---- Tab Content ---- */}
      <div className="max-w-4xl mx-auto px-3 pt-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {renderTabContent()}
          </motion.div>
        </AnimatePresence>

        {/* Follow-up Questions */}
        {/* {data.followUpQuestions && data.followUpQuestions.length > 0 && (
          <ScrollReveal>
            <div className="mt-4 rounded-xl border border-border p-3 bg-surface">
              <h3 className="text-sm font-bold text-text mb-2.5 pb-1.5 border-b border-border font-[family-name:var(--font-serif)]">Refine Your Predictions</h3>
              {!showFollowUp ? (
                <div className="text-center py-1.5">
                  <p className="text-xs mb-3 text-text-secondary">Answer a few questions to improve accuracy.</p>
                  <Button onClick={() => setShowFollowUp(true)}>
                    Answer {data.followUpQuestions.length} Questions
                  </Button>
                </div>
              ) : (
                <FollowUpQuestions questions={data.followUpQuestions} onComplete={handleFollowUpComplete} />
              )}
            </div>
          </ScrollReveal>
        )} */}

        <p className="text-center text-[10px] py-4 text-text-muted">
          Predictions use Vedic astrology calculations + AI interpretation. Use as guidance only. Consult a qualified astrologer for critical decisions.
        </p>
      </div>

      {/* Lucky factor detail modal */}
      <LuckyFactorModal
        open={openLuckyFactor}
        onClose={() => setOpenLuckyFactor(null)}
        insights={insights}
        chartData={data.chartData}
      />

      {/* Ask Astrologer modal */}
      {askModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setAskModal(null)}>
          <div
            className="w-full sm:max-w-lg bg-surface border border-border rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-surface-2/40">
              <span className="text-base">🔮</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-text">Ask about {askModal.sectionTitle}</div>
                <div className="text-[10px] text-text-muted">
                  {askQuestionLimit - askModal.qas.length} question{askQuestionLimit - askModal.qas.length !== 1 ? 's' : ''} remaining
                </div>
              </div>
              <button onClick={() => setAskModal(null)} className="text-text-muted hover:text-text transition-colors text-lg leading-none">×</button>
            </div>

            {/* Q&A list */}
            <div className="px-4 py-3 space-y-3 max-h-[40vh] overflow-y-auto">
              {askModal.qas.length === 0 && !askModal.loading && (
                <p className="text-[11px] text-text-muted text-center py-2">Ask anything about this prediction — Yogi Baba will answer based on your chart.</p>
              )}
              {askModal.qas.map((qa, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex gap-2">
                    <span className="text-[10px] font-semibold text-primary shrink-0 mt-0.5">You</span>
                    <p className="text-[11px] text-text leading-relaxed">{qa.q}</p>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[10px] font-semibold text-accent shrink-0 mt-0.5">Yogi Baba</span>
                    <p className="text-[11px] text-text-muted leading-relaxed whitespace-pre-line">{qa.a}</p>
                  </div>
                </div>
              ))}
              {askModal.loading && (
                <div className="flex gap-2 items-center">
                  <span className="text-[10px] font-semibold text-accent shrink-0">Yogi Baba</span>
                  <span className="text-[11px] text-text-muted animate-pulse">Consulting the stars…</span>
                </div>
              )}
              {askModal.error && <p className="text-[11px] text-danger">{askModal.error}</p>}
            </div>

            {/* Input */}
            {askModal.qas.length < askQuestionLimit ? (
              <div className="px-4 pb-4 pt-2 border-t border-border">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={askModal.input}
                    onChange={(e) => setAskModal((m) => m ? { ...m, input: e.target.value } : m)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAskQuestion(); } }}
                    placeholder="Type your question…"
                    disabled={askModal.loading}
                    className="flex-1 rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-xs text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
                  />
                  <Button
                    size="sm"
                    onClick={submitAskQuestion}
                    disabled={askModal.loading || !askModal.input.trim()}
                  >
                    Ask
                  </Button>
                </div>
              </div>
            ) : (
              <div className="px-4 pb-4 pt-2 border-t border-border">
                <p className="text-[11px] text-text-muted text-center">You&apos;ve used both questions for this section.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick-stats detail modal */}
      <QuickStatModal
        open={openStat}
        onClose={() => setOpenStat(null)}
        insights={insights}
        yogas={data.yogas}
        presentDoshas={presentDoshas}
        doshas={data.doshas}
      />

      {/* Chart zoom modal */}
      {(() => {
        const zoomed = resolveBirthChart(birthChartType, data.chartData, data.divisionalCharts);
        return (
          <ChartZoomModal
            isOpen={zoomModalOpen}
            onClose={() => setZoomModalOpen(false)}
            title={`${zoomed.title} (${chartStyle === 'north' ? 'North' : 'South'} Indian)`}
          >
            <div className="w-full max-w-[500px]">
              {zoomed.ready && zoomed.data ? (
                chartStyle === 'north'
                  ? <NorthIndianChart chartData={zoomed.data} ascendantHouse={zoomed.ascHouse} title={zoomed.title} instant />
                  : <SouthIndianChart chartData={zoomed.data} ascendantHouse={zoomed.ascHouse} title={zoomed.title} />
              ) : null}
            </div>
          </ChartZoomModal>
        );
      })()}
    </MotionPage>
  );
}

// ============================================================
// Lucky Factor Modal — explains why each factor was chosen
// ============================================================

interface LuckyFactorModalProps {
  open: 'numbers' | 'colors' | 'days' | 'directions' | 'gemstone' | 'metal' | null;
  onClose: () => void;
  insights: GroundTruthData | null;
  chartData: ChartData;
}

function LuckyFactorModal({ open, onClose, insights, chartData }: LuckyFactorModalProps) {
  const isOpen = open !== null && insights !== null;

  const titleMap: Record<NonNullable<LuckyFactorModalProps['open']>, string> = {
    numbers: '🔢 Lucky Numbers',
    colors: '🎨 Lucky Colours',
    days: '📅 Lucky Days',
    directions: '🧭 Lucky Directions',
    gemstone: '💎 Gemstones — Suitability',
    metal: '⚙️ Lucky Metal',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={open ? titleMap[open] : ''} className="max-w-xl">
      {open && insights && (
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          {open === 'gemstone' ? (
            <GemstonePanel insights={insights} chartData={chartData} />
          ) : open === 'metal' ? (
            <MetalPanel insights={insights} chartData={chartData} />
          ) : (
            <FactorDetailPanel detail={resolveDetail(open, insights)} />
          )}
        </div>
      )}
    </Modal>
  );
}

function resolveDetail(
  key: Exclude<NonNullable<LuckyFactorModalProps['open']>, 'gemstone' | 'metal'>,
  insights: GroundTruthData,
): FactorDetail {
  switch (key) {
    case 'numbers':    return describeNumbers(insights.luckyFactors.numbers);
    case 'colors':     return describeColors(insights.luckyFactors.colors);
    case 'days':       return describeDays(insights.luckyFactors.days);
    case 'directions': return describeDirections(insights.luckyFactors.directions);
  }
}

function FactorDetailPanel({ detail }: { detail: FactorDetail }) {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-text-secondary">{detail.intro}</p>
      <div className="space-y-1.5">
        <div className="text-[10px] font-semibold tracking-[0.2em] uppercase text-primary">Benefits</div>
        <ul className="space-y-1.5">
          {detail.benefits.map((b, i) => (
            <li key={i} className="text-xs leading-relaxed text-text-secondary flex gap-2">
              <span className="text-accent mt-0.5">✦</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
      {detail.notes && (
        <div className="rounded-lg border border-warning/15 bg-warning/5 p-2.5">
          <p className="text-[11px] leading-relaxed text-text-muted">{detail.notes}</p>
        </div>
      )}
    </div>
  );
}

function GemstonePanel({ insights, chartData }: { insights: GroundTruthData; chartData: ChartData }) {
  const dignities: Partial<Record<Planet, 'Exalted' | 'Mooltrikona' | 'Own Sign' | 'Friendly' | 'Neutral' | 'Enemy Sign' | 'Debilitated'>> = {};
  for (const [planet, info] of Object.entries(insights.planetDignities)) {
    const status = info.status as 'Exalted' | 'Mooltrikona' | 'Own Sign' | 'Friendly' | 'Neutral' | 'Enemy Sign' | 'Debilitated';
    dignities[planet as Planet] = status;
  }
  const scores = computeGemstoneScoresWithDignity(chartData, dignities);
  const top = scores.find((s) => s.recommended) ?? scores[0];

  return (
    <div className="space-y-3.5">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
        <div className="text-[10px] font-semibold tracking-[0.2em] uppercase text-primary">Top Match</div>
        <div className="text-sm font-semibold text-text">{top.stone.englishName} ({top.stone.hindiName})</div>
        <div className="text-[11px] text-text-secondary">
          {top.score}% suitability · ruled by {top.planet}
        </div>
      </div>

      <p className="text-xs leading-relaxed text-text-secondary">
        Suitability blends three things: how each planet behaves for your <strong className="text-text">{chartData.ascendant.sign}</strong> ascendant
        (functional benefic / yogakaraka / malefic), the planet&apos;s actual condition in your chart (dignity, house),
        and classical wear-cautions. Higher score = safer to wear without consultation.
      </p>

      <div className="space-y-2">
        <div className="text-[10px] font-semibold tracking-[0.2em] uppercase text-primary">All 9 Stones — Ranked</div>
        {scores.map((s) => (
          <GemstoneRow key={s.planet} score={s} />
        ))}
      </div>

      <div className="rounded-lg border border-warning/15 bg-warning/5 p-2.5">
        <p className="text-[11px] leading-relaxed text-text-muted">
          ⚠ Always test a gemstone for 3–7 days unbound before binding it permanently in a ring or pendant.
          For Blue Sapphire (Neelam) and Hessonite (Gomed), consult a qualified astrologer in person.
        </p>
      </div>
    </div>
  );
}

function GemstoneRow({ score }: { score: GemstoneScore }) {
  const tier =
    score.score >= 80 ? { label: 'Excellent', cls: 'text-success bg-success/10 border-success/30', bar: 'bg-success' } :
    score.score >= 65 ? { label: 'Good',      cls: 'text-primary bg-primary/10 border-primary/30', bar: 'bg-primary' } :
    score.score >= 50 ? { label: 'Mild',      cls: 'text-warning bg-warning/10 border-warning/30', bar: 'bg-warning' } :
    score.score >= 35 ? { label: 'Caution',   cls: 'text-warning bg-warning/10 border-warning/30', bar: 'bg-warning' } :
                        { label: 'Avoid',     cls: 'text-danger bg-danger/10 border-danger/30',    bar: 'bg-danger' };

  return (
    <div className={`rounded-lg border ${score.recommended ? 'border-primary/40 bg-primary/[0.04]' : 'border-border bg-surface-2/30'} p-2.5 space-y-1.5`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-text">{score.stone.englishName}</span>
        <span className="text-[10px] text-text-muted">({score.stone.hindiName} · {score.planet})</span>
        {score.recommended && (
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border border-primary/40 bg-primary/10 text-primary uppercase tracking-wider">
            Recommended
          </span>
        )}
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${tier.cls} ml-auto`}>
          {tier.label} · {score.score}%
        </span>
      </div>

      <div className="h-1 rounded-full bg-surface-2/50 overflow-hidden">
        <div className={`h-full ${tier.bar}`} style={{ width: `${score.score}%` }} />
      </div>

      <div className="text-[10px] text-text-muted leading-relaxed">
        {score.reasons.join(' · ')}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
        <div><span className="text-[9px] text-text-muted">Finger</span><div className="text-[10px] text-text-secondary">{score.stone.finger}</div></div>
        <div><span className="text-[9px] text-text-muted">Metal</span><div className="text-[10px] text-text-secondary">{score.stone.metal}</div></div>
        <div><span className="text-[9px] text-text-muted">Day</span><div className="text-[10px] text-text-secondary">{score.stone.day}</div></div>
        <div><span className="text-[9px] text-text-muted">Weight</span><div className="text-[10px] text-text-secondary">{score.stone.carats}</div></div>
      </div>

      <ul className="space-y-0.5 pt-0.5">
        {score.stone.benefits.map((b, i) => (
          <li key={i} className="text-[10px] leading-relaxed text-text-secondary flex gap-1.5">
            <span className="text-accent mt-0.5">·</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {score.score < 50 && (
        <p className="text-[10px] leading-relaxed text-danger italic border-l-2 border-danger/40 pl-2 mt-1">
          {score.stone.caution}
        </p>
      )}
    </div>
  );
}

function MetalPanel({ insights, chartData }: { insights: GroundTruthData; chartData: ChartData }) {
  const dignities: Partial<Record<Planet, 'Exalted' | 'Mooltrikona' | 'Own Sign' | 'Friendly' | 'Neutral' | 'Enemy Sign' | 'Debilitated'>> = {};
  for (const [planet, info] of Object.entries(insights.planetDignities)) {
    dignities[planet as Planet] = info.status as 'Exalted' | 'Mooltrikona' | 'Own Sign' | 'Friendly' | 'Neutral' | 'Enemy Sign' | 'Debilitated';
  }
  const all = computeMetalScoresWithDignity(chartData, dignities);
  const top5 = all.slice(0, 5);
  const top = top5[0];

  return (
    <div className="space-y-3.5">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
        <div className="text-[10px] font-semibold tracking-[0.2em] uppercase text-primary">Top Match</div>
        <div className="text-sm font-semibold text-text">{top.metal.metal}{top.metal.altNames ? ` · ${top.metal.altNames}` : ''}</div>
        <div className="text-[11px] text-text-secondary">
          {top.score}% suitability · ruled by {top.planet}
        </div>
      </div>

      <p className="text-xs leading-relaxed text-text-secondary">
        Metals carry the same planetary vibration as their gemstones. Suitability blends how each planet behaves for your{' '}
        <strong className="text-text">{chartData.ascendant.sign}</strong> ascendant with the planet&apos;s actual condition in your chart.
      </p>

      <div className="space-y-2">
        <div className="text-[10px] font-semibold tracking-[0.2em] uppercase text-primary">Top 5 Metals — Ranked</div>
        {top5.map((s) => (
          <MetalRow key={s.planet} score={s} />
        ))}
      </div>

      <p className="text-[10px] text-text-muted text-center pt-1">
        Showing the top 5 of all 9 — lower-ranked metals are usually advised against for this ascendant.
      </p>
    </div>
  );
}

function MetalRow({ score }: { score: MetalScore }) {
  const tier =
    score.score >= 80 ? { label: 'Excellent', cls: 'text-success bg-success/10 border-success/30', bar: 'bg-success' } :
    score.score >= 65 ? { label: 'Good',      cls: 'text-primary bg-primary/10 border-primary/30', bar: 'bg-primary' } :
    score.score >= 50 ? { label: 'Mild',      cls: 'text-warning bg-warning/10 border-warning/30', bar: 'bg-warning' } :
    score.score >= 35 ? { label: 'Caution',   cls: 'text-warning bg-warning/10 border-warning/30', bar: 'bg-warning' } :
                        { label: 'Avoid',     cls: 'text-danger bg-danger/10 border-danger/30',    bar: 'bg-danger' };

  return (
    <div className={`rounded-lg border ${score.recommended ? 'border-primary/40 bg-primary/[0.04]' : 'border-border bg-surface-2/30'} p-2.5 space-y-1.5`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-text">{score.metal.metal}</span>
        <span className="text-[10px] text-text-muted">({score.planet})</span>
        {score.recommended && (
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border border-primary/40 bg-primary/10 text-primary uppercase tracking-wider">
            Recommended
          </span>
        )}
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${tier.cls} ml-auto`}>
          {tier.label} · {score.score}%
        </span>
      </div>

      <div className="h-1 rounded-full bg-surface-2/50 overflow-hidden">
        <div className={`h-full ${tier.bar}`} style={{ width: `${score.score}%` }} />
      </div>

      <div className="text-[10px] text-text-muted leading-relaxed">
        {score.reasons.join(' · ')}
      </div>

      {score.metal.altNames && (
        <div className="text-[10px] text-text-muted">
          Also known as: {score.metal.altNames}
        </div>
      )}

      <ul className="space-y-0.5 pt-0.5">
        {score.metal.benefits.map((b, i) => (
          <li key={i} className="text-[10px] leading-relaxed text-text-secondary flex gap-1.5">
            <span className="text-accent mt-0.5">·</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {score.metal.notes && (
        <p className="text-[10px] leading-relaxed text-text-muted italic border-l-2 border-amber-500/40 pl-2">
          {score.metal.notes}
        </p>
      )}
    </div>
  );
}

// ============================================================
// Quick-stats Modal — Yogas / Doshas / Strongest / Weakest detail
// ============================================================

interface QuickStatModalProps {
  open: 'yogas' | 'doshas' | 'strongest' | 'weakest' | null;
  onClose: () => void;
  insights: GroundTruthData | null;
  yogas: Yoga[];
  presentDoshas: string[];
  doshas: DoshaAnalysis;
}

const PLANET_NATURE_BLURB: Record<string, string> = {
  Sun: 'Authority, soul, father, government, leadership',
  Moon: 'Mind, mother, emotions, public, comforts',
  Mars: 'Energy, courage, siblings, property, action',
  Mercury: 'Intellect, speech, communication, business',
  Jupiter: 'Wisdom, wealth, children, dharma, expansion',
  Venus: 'Love, marriage, luxury, arts, vehicles',
  Saturn: 'Discipline, karma, resilience, hard work',
  Rahu: 'Sudden change, foreign, technology, ambition',
  Ketu: 'Detachment, spirituality, past karma, moksha',
};

function QuickStatModal({ open, onClose, insights, yogas, presentDoshas, doshas }: QuickStatModalProps) {
  const isOpen = open !== null;
  const titleMap: Record<NonNullable<QuickStatModalProps['open']>, string> = {
    yogas: '✨ Yogas — auspicious combinations',
    doshas: '⚠ Doshas — afflictions in the chart',
    strongest: '💪 Strongest planet',
    weakest: '🍃 Weakest planet',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={open ? titleMap[open] : ''} className="max-w-xl">
      {open && (
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          {open === 'yogas' && <YogasPanel yogas={yogas} insights={insights} />}
          {open === 'doshas' && <DoshasPanel doshas={doshas} presentDoshas={presentDoshas} />}
          {(open === 'strongest' || open === 'weakest') && (
            <ShadbalaPanel mode={open} insights={insights} />
          )}
        </div>
      )}
    </Modal>
  );
}

function YogasPanel({ yogas, insights }: { yogas: Yoga[]; insights: GroundTruthData | null }) {
  const present = yogas.filter((y) => y.present);
  const detected = insights?.detectedYogas ?? [];
  const useDetected = present.length === 0 && detected.length > 0;

  if (present.length === 0 && detected.length === 0) {
    return <p className="text-xs text-text-secondary">No yogas detected for this chart.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs leading-relaxed text-text-secondary">
        Yogas are special planetary combinations that produce specific outcomes. Each is a classical formula
        that activates when its prerequisites are met in your chart.
      </p>
      <div className="space-y-1.5">
        {useDetected
          ? detected.map((y, i) => (
              <div key={`${y.name}-${i}`} className="rounded-lg border border-success/15 bg-success/5 p-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] font-semibold text-success">{y.name}</span>
                  {y.planets && <span className="text-[10px] text-text-muted">{y.planets}</span>}
                  {y.strength && <span className="text-[9px] text-text-muted ml-auto">{y.strength}</span>}
                </div>
                {y.meaning && <p className="text-[11px] leading-relaxed text-text-secondary mt-1">{cleanYogaMeaning(y.meaning)}</p>}
              </div>
            ))
          : present.map((y, i) => (
              <div key={`${y.name}-${i}`} className="rounded-lg border border-success/15 bg-success/5 p-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] font-semibold text-success">{y.name}</span>
                  {Array.isArray(y.planets) && y.planets.length > 0 && (
                    <span className="text-[10px] text-text-muted">{y.planets.join(', ')}</span>
                  )}
                  {typeof y.strength === 'number' && (
                    <span className="text-[9px] text-text-muted ml-auto">{y.strength}%</span>
                  )}
                </div>
                {y.description && <p className="text-[11px] leading-relaxed text-text-secondary mt-1">{cleanYogaMeaning(String(y.description))}</p>}
              </div>
            ))}
      </div>
    </div>
  );
}

// Canned descriptions / remedies — the dosha types only carry severity/flags,
// so we keep human-readable explanations centralised here.
const DOSHA_INFO: Record<string, { description: string; remedies: string[] }> = {
  mangal: {
    description: 'Mars in the 1st, 4th, 7th, 8th or 12th house — affects marital harmony, can produce friction in close relationships.',
    remedies: ['Marry another Manglik or after age 28', 'Chant Hanuman Chalisa on Tuesdays', 'Donate red items (lentils, coral) on Tuesdays', 'Recite Mangal Beej Mantra ॐ क्रां क्रीं क्रौं सः भौमाय नमः'],
  },
  kaalSarp: {
    description: 'All planets between Rahu and Ketu — can delay material success and trigger sudden reversals.',
    remedies: ['Naga Pratishtha puja at Trimbakeshwar / Kalahasti', 'Chant Maha Mrityunjaya mantra 108×', 'Offer milk to Shiva linga on Mondays', 'Wear Hessonite (Gomed) only after consultation'],
  },
  sadeSati: {
    description: 'Saturn transiting 12th, 1st, or 2nd from natal Moon — a 7.5-year karmic phase that re-orders priorities.',
    remedies: ['Recite Shani Chalisa on Saturdays', 'Donate black sesame / iron / mustard oil to elders or workers', 'Light a mustard-oil lamp under a peepal tree', 'Avoid risky speculation; lean into discipline and service'],
  },
  pitra: {
    description: 'Ancestral karma indicators — can show up as repeated obstacles in family lineage and progeny.',
    remedies: ['Tarpana / Pind-daan during Pitru Paksha', 'Feed brahmins or the poor on amavasya', 'Recite Pitra Stotra on new-moon days'],
  },
  kemDruma: {
    description: 'Moon isolated with no planets in adjacent houses — affects mental peace and the support network.',
    remedies: ['Strengthen the Moon — wear Pearl after consultation', 'Donate white items (rice, milk, silver) on Mondays', 'Practise meditation / japa to stabilise the mind'],
  },
  grahan: {
    description: 'Sun/Moon conjunct Rahu/Ketu — can cloud judgment and affect parents.',
    remedies: ['Surya Namaskar daily for Surya-Grahan dosha', 'Chandra mantra ॐ श्रां श्रीं श्रौं सः चन्द्राय नमः for Chandra-Grahan', 'Donate during a solar/lunar eclipse'],
  },
  guruChandal: {
    description: 'Jupiter conjunct Rahu — distorts wisdom and ethics if unmitigated; can produce unconventional teachers.',
    remedies: ['Chant Guru mantra ॐ ग्रां ग्रीं ग्रौं सः गुरवे नमः on Thursdays', 'Donate yellow items / yellow gram', 'Avoid alcohol and meat on Thursdays'],
  },
};

function DoshasPanel({ doshas, presentDoshas }: { doshas: DoshaAnalysis; presentDoshas: string[] }) {
  if (presentDoshas.length === 0) {
    return (
      <div className="rounded-lg border border-success/20 bg-success/5 p-3 space-y-1">
        <p className="text-xs leading-relaxed text-success">No major doshas active in this chart.</p>
        <p className="text-[11px] leading-relaxed text-text-muted">
          A clean chart on the dosha front means you can focus on strengthening yogas and lucky factors.
        </p>
      </div>
    );
  }

  type DoshaCard = { name: string; severity: string; description: string; remedies?: string[]; planet?: string; dualPlanet?: [string, string] };
  const cards: DoshaCard[] = [];

  if (doshas.mangal?.present) {
    cards.push({
      name: 'Mangal Dosha (Manglik)',
      severity: doshas.mangal.severity ?? 'moderate',
      description: DOSHA_INFO.mangal.description,
      remedies: DOSHA_INFO.mangal.remedies,
      planet: 'Mars',
    });
  }
  if (doshas.kaalSarp?.present) {
    cards.push({
      name: `Kaal Sarpa Dosha${doshas.kaalSarp.type ? ` (${doshas.kaalSarp.type})` : ''}`,
      severity: doshas.kaalSarp.severity ?? 'severe',
      description: DOSHA_INFO.kaalSarp.description,
      remedies: DOSHA_INFO.kaalSarp.remedies,
      dualPlanet: ['Rahu', 'Ketu'],
    });
  }
  if (doshas.sadeSati?.active) {
    cards.push({
      name: `Saturn Sade Sati${doshas.sadeSati.phase ? ` (${doshas.sadeSati.phase})` : ''}`,
      severity: doshas.sadeSati.severity ?? 'moderate',
      description: DOSHA_INFO.sadeSati.description,
      remedies: DOSHA_INFO.sadeSati.remedies,
      planet: 'Saturn',
    });
  }
  if (doshas.pitra?.present) {
    cards.push({
      name: 'Pitra Dosha',
      severity: doshas.pitra.severity ?? 'moderate',
      description: DOSHA_INFO.pitra.description,
      remedies: DOSHA_INFO.pitra.remedies,
      planet: 'Sun',
    });
  }
  if (doshas.kemDruma?.present) {
    cards.push({
      name: 'Kemdrum Dosha',
      severity: doshas.kemDruma.severity ?? 'moderate',
      description: DOSHA_INFO.kemDruma.description,
      remedies: DOSHA_INFO.kemDruma.remedies,
      planet: 'Moon',
    });
  }
  if (doshas.grahan?.present) {
    cards.push({
      name: `Grahan Dosha${doshas.grahan.type && doshas.grahan.type !== 'none' ? ` (${doshas.grahan.type.replace('_', ' ')})` : ''}`,
      severity: doshas.grahan.severity ?? 'moderate',
      description: DOSHA_INFO.grahan.description,
      remedies: DOSHA_INFO.grahan.remedies,
      planet: 'Rahu',
    });
  }
  if (doshas.guruChandal?.present) {
    cards.push({
      name: 'Guru Chandal Yoga',
      severity: doshas.guruChandal.severity ?? 'moderate',
      description: DOSHA_INFO.guruChandal.description,
      remedies: DOSHA_INFO.guruChandal.remedies,
      planet: 'Jupiter',
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs leading-relaxed text-text-secondary">
        Doshas mark areas requiring attention. Most have well-established remedies — addressing them can
        meaningfully improve outcomes during sensitive dasha periods.
      </p>
      {cards.map((c, i) => {
        const sev =
          c.severity === 'severe' || c.severity === 'high'
            ? { cls: 'border-danger/25 bg-danger/5',   tag: 'text-danger bg-danger/15 border-danger/30' }
          : c.severity === 'mild' || c.severity === 'low'
            ? { cls: 'border-warning/15 bg-warning/5', tag: 'text-warning bg-warning/15 border-warning/30' }
          : { cls: 'border-warning/20 bg-warning/5',   tag: 'text-warning bg-warning/15 border-warning/30' };
        return (
          <div key={i} className={`rounded-lg border p-2.5 space-y-1.5 ${sev.cls}`}>
            <div className="flex items-center gap-2.5 flex-wrap">
              {c.dualPlanet ? (
                <span className="flex items-center -space-x-2 flex-shrink-0">
                  <Planet3DInline planet={c.dualPlanet[0]} size={36} />
                  <Planet3DInline planet={c.dualPlanet[1]} size={36} />
                </span>
              ) : c.planet ? (
                <Planet3DInline planet={c.planet} size={42} />
              ) : null}
              <span className="text-[12px] font-semibold text-text">{c.name}</span>
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border uppercase tracking-wider ml-auto ${sev.tag}`}>
                {c.severity}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-text-secondary">{c.description}</p>
            {c.remedies && c.remedies.length > 0 && (
              <div>
                <div className="text-[9px] font-semibold tracking-[0.2em] uppercase text-text-muted pt-0.5">Remedies</div>
                <ul className="space-y-0.5 pl-1 mt-0.5">
                  {c.remedies.map((r, ri) => (
                    <li key={ri} className="text-[10px] leading-relaxed text-text-secondary">• {r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ShadbalaPanel({ mode, insights }: { mode: 'strongest' | 'weakest'; insights: GroundTruthData | null }) {
  if (!insights || insights.shadbalaRanking.length === 0) {
    return (
      <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 space-y-1.5">
        <p className="text-xs leading-relaxed text-text-muted">
          Shadbala data is still computing for this chart, or hasn&apos;t been generated yet.
        </p>
        <p className="text-[11px] leading-relaxed text-text-muted">
          Shadbala is a six-fold strength score (positional, directional, temporal, motional, natural, aspectual)
          rendered in Virupas. The strongest planet drives major outcomes; the weakest needs remedial support.
        </p>
      </div>
    );
  }

  const ranking = insights.shadbalaRanking;
  const details = insights.shadbalaDetails ?? [];
  const focusPlanet = mode === 'strongest' ? ranking[0] : ranking[ranking.length - 1];
  const focusDetail = details.find((d) => d.planet === focusPlanet);

  return (
    <div className="space-y-3">
      <div className={`rounded-lg border p-3 space-y-1.5 ${mode === 'strongest' ? 'border-success/25 bg-success/5' : 'border-danger/20 bg-danger/5'}`}>
        <div className="flex items-center gap-2.5 flex-wrap">
          <Planet3DInline planet={focusPlanet} size={44} />
          <div>
            <div className="text-sm font-semibold text-text">{focusPlanet}</div>
            <div className={`text-[10px] ${mode === 'strongest' ? 'text-success' : 'text-danger'}`}>
              {mode === 'strongest' ? 'Highest Shadbala — your chart’s engine' : 'Lowest Shadbala — needs strengthening'}
            </div>
          </div>
          {focusDetail && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ml-auto ${focusDetail.isStrong ? 'text-success bg-success/10 border-success/30' : 'text-warning bg-warning/10 border-warning/30'}`}>
              {(focusDetail.ratio * 100).toFixed(0)}% of required
            </span>
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-text-secondary">
          {PLANET_NATURE_BLURB[focusPlanet] ?? 'Significant influence in this chart.'}
        </p>
        {focusDetail && (
          <div className="text-[10px] text-text-muted">
            {focusDetail.total.toFixed(1)} virupas vs {focusDetail.required.toFixed(0)} required
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface-2/30 p-2.5 space-y-1">
        <div className="text-[10px] font-semibold tracking-[0.2em] uppercase text-primary">What this means</div>
        <p className="text-[11px] leading-relaxed text-text-secondary">
          {mode === 'strongest'
            ? `${focusPlanet} carries the most six-fold strength in your chart, so its themes (${(PLANET_NATURE_BLURB[focusPlanet] ?? '').toLowerCase()}) tend to come naturally and produce results during its dasha periods.`
            : `${focusPlanet} is under-strength on the six measures, so the themes it governs (${(PLANET_NATURE_BLURB[focusPlanet] ?? '').toLowerCase()}) may need conscious effort or remedies — especially during its dasha or antardasha.`}
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="text-[10px] font-semibold tracking-[0.2em] uppercase text-primary">Full ranking</div>
        {ranking.map((p, i) => {
          const det = details.find((d) => d.planet === p);
          const ratioPct = det ? Math.round(det.ratio * 100) : null;
          const strong = det?.isStrong ?? false;
          return (
            <div key={p} className={`rounded-lg border p-2 ${p === focusPlanet ? (mode === 'strongest' ? 'border-success/30 bg-success/[0.06]' : 'border-danger/25 bg-danger/[0.05]') : 'border-border bg-surface-2/30'}`}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-muted w-3">{i + 1}</span>
                <PlanetOrb2D planet={p} size={18} />
                <span className="text-[12px] font-semibold text-text">{p}</span>
                {ratioPct !== null && (
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ml-auto ${strong ? 'text-success bg-success/10 border-success/30' : 'text-warning bg-warning/10 border-warning/30'}`}>
                    {ratioPct}%
                  </span>
                )}
              </div>
              {ratioPct !== null && (
                <div className="h-1 rounded-full bg-surface-2/50 overflow-hidden mt-1">
                  <div className={`h-full ${strong ? 'bg-success' : 'bg-warning'}`} style={{ width: `${Math.min(100, ratioPct)}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
