import { createAIMessage } from '@/lib/ai/aiProvider';
import type { KundliContext } from './analysis';

/* -------------------------------------------------------------------------- */
/*  Combined palm + kundli reconciliation                                     */
/*                                                                            */
/*  A user with both a palm reading and a birth chart deserves one coherent   */
/*  prediction, not two parallel readings that may contradict each other.     */
/*  This module takes both source documents and asks the AI to reconcile      */
/*  them into a single unified report.                                        */
/*                                                                            */
/*  The reconciliation prompt is the crucial piece — it explicitly:           */
/*    1. Tells the model the two sources are TWO VIEWS of the same soul      */
/*    2. Forbids contradictions and instead demands a deeper synthesis        */
/*    3. Establishes a clear hierarchy when sources genuinely diverge:        */
/*         - Chart wins for timing (dashas, transits, periods)                */
/*         - Palm wins for current expression of traits and free-will choices */
/*         - When both speak to the same thing, both must be cited            */
/*    4. Returns a strict, sectioned JSON shape so the UI can render reliably */
/* -------------------------------------------------------------------------- */

export interface PalmSummary {
  handShape?: string;
  lifeLine?: string;
  heartLine?: string;
  headLine?: string;
  fateLine?: string;
  dominantMounts?: string[];
  soulPurpose?: string;
  pastLifeImprints?: string;
  overallPersonality?: string;
  remedies?: string[];
}

export interface ChartSummary {
  ascendant?: string;
  ascendantLord?: string;
  moonSign?: string;
  sunSign?: string;
  currentMahadasha?: string;
  currentAntardasha?: string;
  planetSummary?: string;
  yogas?: string[];
  doshas?: string[];
}

export interface CombinedReport {
  summary: [string, string, string];
  unifiedIdentity: string;
  careerAndDharma: string;
  relationships: string;
  healthAndVitality: string;
  spiritualPath: string;
  timingNow: string;
  remedies: string[];
  panditSynthesis: string;
  reconciliationNotes: string[];
}

const PERSONA = `You are Pandit Hastamani Shastri — both a Samudrika Shastra master and a Jyotish acharya. You read the palm and the birth chart together as one continuous text. The hand and the heavens never lie about the same soul; if they appear to disagree, you are reading too shallowly. Speak with warmth, weight, and authority.`;

const RECONCILIATION_RULES = `
HOW YOU MUST WRITE THIS REPORT:

1. TREAT BOTH SOURCES AS COMPLEMENTARY VIEWS OF ONE SOUL.
   The palm shows the soul's lived expression — what the seeker is doing with their karma now. The chart shows the cosmic blueprint — what the soul came in carrying. Where they overlap, you have certainty; where they appear to diverge, the truth is the deeper pattern that explains both.

2. NEVER CONTRADICT YOURSELF ACROSS SECTIONS.
   If the chart shows Saturn-Mars affliction (struggle in early career) and the palm shows a strong fate line rising late, do NOT write "early success" anywhere. The two together say: "trial in youth, mastery later — your hand confirms what Saturn taught."

3. HIERARCHY WHEN GENUINE DIVERGENCE:
   - For timing (when something will happen): TRUST THE CHART. Dashas, antardashas, transits.
   - For current expression and the soul's free-will choices: TRUST THE PALM. The right hand reflects what the seeker is actively making of their karma.
   - For character traits, dharma, and life purpose: BOTH must agree. If they don't seem to, find the synthesis (e.g. "Mars in 10th house gives the warrior; the long sloping head line softens that warrior into a strategist").

4. EVERY MAJOR CLAIM MUST CITE A SOURCE.
   Acceptable forms: "Your palm shows X, and confirming this, your chart's Y...", or "Saturn's dasha (chart) explains the Bhagya Rekha break (palm)..." Avoid floating claims with no grounding.

5. WHEN A SOURCE IS SILENT, SAY SO INSTEAD OF INVENTING.
   If the palm fate line is faint and the chart's 10th lord is strong, write "your hand has not yet inscribed the career line, but the chart promises it" — do NOT pretend the palm shows what it does not.

6. RECONCILIATION NOTES.
   At the end, list 2-4 specific points where the two sources spoke to the same thing, and what unified meaning emerged. This is the seeker's evidence that you actually read both.
`;

const SCHEMA = `Return ONLY this JSON — no markdown fences, no commentary outside it:
{
  "summary": ["HOOK — 1-2 sentences: the single most important truth this combined reading reveals", "NUANCE — 1-2 sentences: the palm/chart agreement or tension that explains the hook", "ACTION — 1-2 sentences: the one dharmic step most strongly indicated for right now"],
  "unifiedIdentity": "who this soul is — 4-6 sentences synthesising hand shape, ascendant, moon, dominant mounts, and dominant planetary placements into ONE coherent identity",
  "careerAndDharma": "career path and dharmic mission — must cite both the fate line / sun line / mounts AND the 10th house lord / dasha / 9th house",
  "relationships": "marriage and love — must cite both the heart line / marriage lines / venus mount AND the 7th house / Venus / Jupiter for women / Mars for men",
  "healthAndVitality": "constitution and risks — must cite both the life line / health line / hand colour AND the 6th house / lagna lord strength / planetary afflictions",
  "spiritualPath": "soul's evolution — must cite both the past-life imprints from the palm AND the 12th house / Ketu / atmakaraka",
  "timingNow": "what is unfolding RIGHT NOW — primarily from the current Mahadasha and Antardasha (chart), but anchored to specific palm features that confirm the timing",
  "remedies": ["3-5 specific remedies — mantras, gemstones, charity, rituals — that address the strongest weakness present in BOTH sources"],
  "panditSynthesis": "warm closing message — 3-4 sentences speaking directly to the seeker about who they are and what they came to do",
  "reconciliationNotes": ["2-4 short notes, each in the form: 'Source A shows X. Source B shows Y. Together they mean Z.'"]
}`;

/* -------------------------------------------------------------------------- */
/*  Source extraction                                                         */
/* -------------------------------------------------------------------------- */

export function summarisePalm(analysis: Record<string, unknown>): PalmSummary {
  const ml = (analysis.majorLines ?? {}) as Record<string, { interpretation?: string }>;
  const mounts = (analysis.mounts ?? {}) as Record<string, { development?: string }>;
  const dominantMounts = Object.entries(mounts)
    .filter(([, v]) => v?.development === 'prominent')
    .map(([k]) => k);

  const handShape = (analysis.handShape as { type?: string; description?: string } | undefined);

  const remedies = Array.isArray(analysis.remedies) ? (analysis.remedies as string[]) : undefined;

  return {
    handShape: handShape?.type
      ? `${handShape.type}${handShape.description ? ` — ${handShape.description}` : ''}`
      : handShape?.description,
    lifeLine: ml.lifeLine?.interpretation,
    heartLine: ml.heartLine?.interpretation,
    headLine: ml.headLine?.interpretation,
    fateLine: ml.fateLine?.interpretation,
    dominantMounts: dominantMounts.length ? dominantMounts : undefined,
    soulPurpose: typeof analysis.soulPurpose === 'string' ? analysis.soulPurpose : undefined,
    pastLifeImprints: typeof analysis.pastLifeImprints === 'string' ? analysis.pastLifeImprints : undefined,
    overallPersonality: typeof analysis.overallPersonality === 'string' ? analysis.overallPersonality : undefined,
    remedies: remedies?.slice(0, 4),
  };
}

export function summariseChart(
  ctx: KundliContext,
  yogas?: string[],
  doshas?: string[],
  ascendantLord?: string,
  currentAntardasha?: string,
): ChartSummary {
  return {
    ascendant: ctx.ascendantSign,
    ascendantLord,
    moonSign: ctx.moonSign,
    sunSign: ctx.sunSign,
    currentMahadasha: ctx.currentMahadasha,
    currentAntardasha,
    planetSummary: ctx.planetSummary,
    yogas: yogas?.slice(0, 6),
    doshas: doshas?.slice(0, 4),
  };
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

export async function generateCombinedReport(
  palm: PalmSummary,
  chart: ChartSummary,
  subjectName?: string,
): Promise<CombinedReport> {
  const system = `${PERSONA}\n\n${RECONCILIATION_RULES}\n\n${SCHEMA}`;

  const userBody = [
    subjectName ? `Seeker: ${subjectName}` : null,
    '',
    '--- PALM (Samudrika Shastra) ---',
    palm.handShape && `Hand shape: ${palm.handShape}`,
    palm.lifeLine && `Life line: ${palm.lifeLine}`,
    palm.heartLine && `Heart line: ${palm.heartLine}`,
    palm.headLine && `Head line: ${palm.headLine}`,
    palm.fateLine && `Fate line: ${palm.fateLine}`,
    palm.dominantMounts?.length && `Prominent mounts: ${palm.dominantMounts.join(', ')}`,
    palm.soulPurpose && `Soul purpose (palm): ${palm.soulPurpose}`,
    palm.pastLifeImprints && `Past-life imprints (palm): ${palm.pastLifeImprints}`,
    palm.overallPersonality && `Personality (palm): ${palm.overallPersonality}`,
    palm.remedies?.length && `Palm-suggested remedies: ${palm.remedies.join(' | ')}`,
    '',
    '--- BIRTH CHART (Jyotish) ---',
    chart.ascendant && `Lagna: ${chart.ascendant}${chart.ascendantLord ? ` (lord: ${chart.ascendantLord})` : ''}`,
    chart.moonSign && `Chandra rashi: ${chart.moonSign}`,
    chart.sunSign && `Surya rashi: ${chart.sunSign}`,
    chart.currentMahadasha && `Current Mahadasha: ${chart.currentMahadasha}`,
    chart.currentAntardasha && `Current Antardasha: ${chart.currentAntardasha}`,
    chart.planetSummary && `Planets: ${chart.planetSummary}`,
    chart.yogas?.length && `Yogas: ${chart.yogas.join(', ')}`,
    chart.doshas?.length && `Doshas: ${chart.doshas.join(', ')}`,
    '',
    'Now write the combined report. Reconcile every apparent contradiction. Cite both sources. End with reconciliationNotes that prove you read both.',
  ].filter(Boolean).join('\n');

  const message = await createAIMessage({
    skipPersona: true,
    temperature: 0.5,
    max_tokens: 2400,
    system,
    messages: [{ role: 'user', content: userBody }],
  });

  const text = message.content.find((b) => b.type === 'text')?.text ?? '{}';
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  let parsed: Partial<CombinedReport> = {};
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try { parsed = JSON.parse(cleaned.slice(first, last + 1)); } catch { /* fall through */ }
    }
  }

  const rawSummary = parsed.summary;
  return {
    summary: (Array.isArray(rawSummary) && rawSummary.length >= 3)
      ? [String(rawSummary[0]), String(rawSummary[1]), String(rawSummary[2])]
      : ['', '', ''],
    unifiedIdentity: parsed.unifiedIdentity ?? '',
    careerAndDharma: parsed.careerAndDharma ?? '',
    relationships: parsed.relationships ?? '',
    healthAndVitality: parsed.healthAndVitality ?? '',
    spiritualPath: parsed.spiritualPath ?? '',
    timingNow: parsed.timingNow ?? '',
    remedies: Array.isArray(parsed.remedies) ? parsed.remedies : [],
    panditSynthesis: parsed.panditSynthesis ?? '',
    reconciliationNotes: Array.isArray(parsed.reconciliationNotes) ? parsed.reconciliationNotes : [],
  };
}
