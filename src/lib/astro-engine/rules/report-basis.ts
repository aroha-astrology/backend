// =============================================================================
// What each paid report is built from, and how it must be spoken about
// =============================================================================
// Audit release R4 (docs/engine-audit, Group 4). Every report carries a "basis" block:
//
//   calculation_basis      one plain sentence on what the facts are made of
//   source_profile         the engine rule profile the facts were computed under
//   traditional_rules      rules with an old text behind them (ancient or later classical),
//                          each with its label and source ids
//   modern_rules           rules of a 20th-century or later system (KP, Lal Kitab, Kaal Sarp ...)
//   aroha_proprietary_rules  Aroha's own scoring, blending and wording
//   unverified_rules       rules whose old text has not been found
//   safety_classification  how the narrative must handle the subject
//
// The lists name provenance registry ids (provenance.ts), so the label of a rule is read from
// the one place that is kept honest and cannot drift from the register.
// =============================================================================

import type { ReportKey } from '../../../config/reports.js';
import { DEFAULT_PROFILE } from './profile.js';
import { getProvenance, type ProvenanceTag } from './provenance.js';

export type SafetyClassification =
  | 'standard'
  | 'relationship'
  | 'financial'
  | 'health'
  | 'fertility'
  | 'belief'
  | 'newborn'
  | 'remedy';

/** The sentence the narrative must follow for each class (added to every report's system message). */
export const SAFETY_RULES: Record<SafetyClassification, string> = {
  standard: '',
  relationship:
    'This is traditional astrology offered for reflection. Never tell the reader whether to marry, stay with or leave a person, and never describe a person as good or bad for them.',
  financial:
    'This is traditional astrology offered for reflection, not financial advice. Never tell the reader to buy, sell, invest in or borrow for anything, and never promise a gain or a loss.',
  health:
    'This is traditional astrology, not medicine. Never diagnose, never name an illness as something the reader has or will have, never predict illness, injury, surgery or death, and never advise starting or stopping a treatment. Speak only of rhythms of energy, rest and care, and point to a doctor for any health concern.',
  fertility:
    'This is traditional astrology, not medicine. Never predict whether the reader can or cannot have children, how many, or their sex, and never suggest a medical cause or treatment. Speak of timing and of themes of family life only as reflection.',
  belief:
    'This is a reflective story drawn from a tradition of belief, not a fact about the reader. Say plainly that it is a way of looking at themes, never that anything happened in a past life, and never ascribe guilt, curse or debt to the reader.',
  newborn:
    'This is for choosing a name for a child. Never describe a child chart as afflicted, flawed or unlucky, never name doshas or dangers for the child, and never give a prediction about the child health or life span.',
  remedy:
    'These are customs and practices from a tradition, offered as choices. Never promise that a remedy, gemstone, mantra or ritual changes an outcome, never present a gemstone as a medicine, and never say that skipping one brings harm.',
};

/** Core of every chart-based report: the shared facts every one of them is built from. */
const CHART_CORE = [
  'VMD-CYC',
  'VMD-DUR',
  'VMD-BAL',
  'VMD-ANT',
  'SHB-UCH',
  'SHB-SAP',
  'SHB-DIG',
  'SHB-KEN',
  'SHB-DRK',
  'SHB-CHE',
  'DIG-EXA',
  'DIG-FRD',
  'ASP-FUL',
  'VCH-D9',
  'VCH-D12',
];

/** The seven doshas the dosha and yoga summary reads. */
const DOSHAS = ['DOH-KEM', 'DOH-KAL', 'DOH-MNG', 'DOH-SAD', 'DOH-PIT', 'DOH-GRH', 'DOH-GCH'];

const MATCHING = ['MT-GAN', 'MT-YON', 'MT-NAD', 'MT-BHK', 'MT-ASH', 'MT-DSH', 'MT-VAS'];

interface Spec {
  features: string[];
  safety: SafetyClassification;
  /** One sentence naming what this report adds to the shared chart facts. */
  adds: string;
}

const SPECS: Record<ReportKey, Spec> = {
  marriage: {
    features: [...CHART_CORE, ...DOSHAS, ...MATCHING, 'MT-RIS', 'RPT-RPT'],
    safety: 'relationship',
    adds: 'the 7th house, Venus, the Navamsa, the doshas and, when a spouse is given, the Ashtakoota match',
  },
  kundli_milan: {
    features: [...CHART_CORE, ...DOSHAS, ...MATCHING, 'MT-RIS', 'RPT-RPT'],
    safety: 'relationship',
    adds: 'the Ashtakoota and Dashakoota match and the Mangal comparison of two charts',
  },
  match_report: {
    features: [...CHART_CORE, ...DOSHAS, ...MATCHING, 'MT-RIS', 'RPT-RPT'],
    safety: 'relationship',
    adds: 'the Ashtakoota and Dashakoota match of two charts, with Aroha risk notes',
  },
  true_love: {
    features: [...CHART_CORE, ...DOSHAS, 'RPT-RPT'],
    safety: 'relationship',
    adds: 'the 5th and 7th houses, Venus and the Moon',
  },
  relationship_monthly: {
    features: [...CHART_CORE, ...DOSHAS, 'RPT-RPT'],
    safety: 'relationship',
    adds: 'the running dasha and the month ahead for relationships',
  },
  wealth: {
    features: [...CHART_CORE, ...DOSHAS, 'RPT-RPT'],
    safety: 'financial',
    adds: 'the 2nd and 11th houses, the dhana yogas and the running dasha',
  },
  finance_monthly: {
    features: [...CHART_CORE, ...DOSHAS, 'RPT-RPT'],
    safety: 'financial',
    adds: 'the running dasha and the month ahead for money',
  },
  career_monthly: {
    features: [...CHART_CORE, ...DOSHAS, 'RPT-RPT'],
    safety: 'standard',
    adds: 'the 10th house and the running dasha for the month ahead',
  },
  health_monthly: {
    features: [...CHART_CORE, ...DOSHAS, 'RPT-HLT', 'RPT-RPT'],
    safety: 'health',
    adds: 'the 1st, 6th and 8th houses and the running dasha, read as rhythms of energy and care',
  },
  progeny: {
    features: [...CHART_CORE, ...DOSHAS, 'RPT-PRG', 'RPT-RPT'],
    safety: 'fertility',
    adds: 'the 5th house, Jupiter and the Saptamsa, read as themes and timing of family life',
  },
  past_life: {
    features: [...CHART_CORE, ...DOSHAS, 'RPT-PL', 'RPT-RPT'],
    safety: 'belief',
    adds: 'the nodes, the 12th house and the Moon, read as a reflective story',
  },
  baby_name: {
    features: [...CHART_CORE, 'PAN-NAK', 'RPT-RPT'],
    safety: 'newborn',
    adds: 'the birth star and its syllables and Aroha name suggestions',
  },
  numerology: {
    features: ['NUM-VED', 'NUM-CHL', 'NUM-PYT', 'NUM-LKY', 'RPT-RPT'],
    safety: 'standard',
    adds: 'name and birth-date numbers (modern numerology systems, not classical Jyotish)',
  },
  name_change: {
    features: ['NUM-VED', 'NUM-CHL', 'NUM-PYT', 'RPT-RPT'],
    safety: 'standard',
    adds: 'name and birth-date numbers and spelling variants (modern numerology systems)',
  },
  remedies: {
    features: [...CHART_CORE, 'GEM-ANC', 'GEM-PRX', 'LKB-CLS', 'LKB-DEB', 'RPT-RPT'],
    safety: 'remedy',
    adds: 'gemstone, mantra and Lal Kitab customs chosen from the chart',
  },
  kp_annual: {
    features: ['KP-CLS', 'KP-SUB', 'KP-249', 'RPT-RPT'],
    safety: 'standard',
    adds: 'the Krishnamurti Paddhati reading of the year (a 20th-century system)',
  },
};

export interface BasisRule {
  id: string;
  name: string;
  /** Provenance label, for example "ANCIENT_CLASSICAL — BPHS-27.2-4". */
  label: string;
}

export interface ReportBasis {
  calculation_basis: string;
  source_profile: string;
  traditional_rules: BasisRule[];
  modern_rules: BasisRule[];
  aroha_proprietary_rules: BasisRule[];
  unverified_rules: BasisRule[];
  safety_classification: SafetyClassification;
}

const bucketOf = (
  tag: ProvenanceTag,
): keyof Pick<
  ReportBasis,
  'traditional_rules' | 'modern_rules' | 'aroha_proprietary_rules' | 'unverified_rules'
> => {
  switch (tag) {
    case 'ANCIENT_CLASSICAL':
    case 'LATER_CLASSICAL':
      return 'traditional_rules';
    case 'MODERN_ASTROLOGICAL':
      return 'modern_rules';
    case 'AROHA_PROPRIETARY':
      return 'aroha_proprietary_rules';
    default:
      return 'unverified_rules';
  }
};

export function safetyOf(reportKey: string): SafetyClassification {
  return SPECS[reportKey as ReportKey]?.safety ?? 'standard';
}

/** The ids behind a report, for tests. */
export function basisFeatureIds(reportKey: ReportKey): string[] {
  return SPECS[reportKey].features;
}

/** The basis block every report carries, built from the provenance registry. */
export function reportBasis(reportKey: string): ReportBasis | null {
  const spec = SPECS[reportKey as ReportKey];
  if (!spec) return null;
  const out: ReportBasis = {
    calculation_basis:
      `Calculated by Aroha from your birth details with the rule profile ${DEFAULT_PROFILE.id}, adding ${spec.adds}. ` +
      'Rules are listed by where they come from: some follow an old text, some a modern system, ' +
      "some are Aroha's own scoring, and for some no old text has been found. " +
      'It is traditional astrology offered for reflection.',
    source_profile: DEFAULT_PROFILE.id,
    traditional_rules: [],
    modern_rules: [],
    aroha_proprietary_rules: [],
    unverified_rules: [],
    safety_classification: spec.safety,
  };
  for (const id of spec.features) {
    const e = getProvenance(id);
    const label = e.sourceIds.length > 0 ? `${e.tag} — ${e.sourceIds.join(', ')}` : e.tag;
    out[bucketOf(e.tag)].push({ id, name: e.featureName, label });
  }
  return out;
}
